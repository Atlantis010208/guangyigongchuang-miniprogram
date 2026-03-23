/**
 * 云函数：admin_toolkit_whitelist_activate_batch
 * 功能：扫描所有 pending 的工具包白名单记录，主动匹配已注册用户并批量激活
 * 权限：仅管理员
 * 用途：修复历史存量——解决"先注册后导入白名单"导致无法自动激活的问题
 * 
 * 入参：
 *   - dryRun: boolean 试运行模式（只统计不激活，默认 false）
 *   - limit:  number  每次最多处理的白名单记录数（默认 200）
 * 
 * 出参：
 *   - success: boolean
 *   - data: { total, matched, activated, skipped, failed }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 生成订单号
 */
function generateOrderNo() {
  const timestamp = Date.now()
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${timestamp}_${random}`
}

/**
 * 生成手机号匹配列表（与 login / getPhoneNumber 云函数保持一致）
 */
function generatePhoneMatchList(phone) {
  const matchList = []
  if (!phone) return matchList

  const phoneStr = String(phone).trim()

  // 纯手机号（原始存储格式）
  matchList.push(phoneStr)

  // 如果是境外格式（带国家码，如 852XXXXXXXX），同时尝试拆出纯号码
  // 已存储的境外手机号格式为 "国家码+纯号码"，无需额外处理

  return [...new Set(matchList)]
}

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command

  try {
    // 1. 验证管理员权限
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }

    const dryRun = event && event.dryRun === true
    const batchLimit = (event && event.limit) ? Math.min(event.limit, 500) : 200

    console.log(`[批量激活] 开始，dryRun=${dryRun}，limit=${batchLimit}`)

    // 2. 查询所有 pending 的白名单记录
    const whitelistRes = await db.collection('toolkit_whitelist')
      .where({ status: 'pending' })
      .orderBy('createdAt', 'asc')
      .limit(batchLimit)
      .get()

    const pendingList = whitelistRes.data || []
    console.log(`[批量激活] 共找到 ${pendingList.length} 条 pending 记录`)

    if (pendingList.length === 0) {
      return {
        success: true,
        code: 'OK',
        data: { total: 0, matched: 0, activated: 0, skipped: 0, failed: 0 },
        message: '没有待激活的白名单记录'
      }
    }

    // 3. 提取所有手机号，批量查询 users 表
    const phoneList = pendingList.map(w => w.phone).filter(Boolean)

    // 分批查询（每次最多 100 个）
    const phoneToUser = {}
    const batchSize = 100

    for (let i = 0; i < phoneList.length; i += batchSize) {
      const batch = phoneList.slice(i, i + batchSize)

      // 通过 phoneNumber 字段匹配（微信返回的完整手机号）
      const byPhoneRes = await db.collection('users')
        .where({ phoneNumber: _.in(batch), isDelete: _.neq(1) })
        .limit(batchSize)
        .get()

      for (const user of (byPhoneRes.data || [])) {
        if (user.phoneNumber) phoneToUser[user.phoneNumber] = user
        if (user.purePhoneNumber) phoneToUser[user.purePhoneNumber] = user
      }

      // 通过 purePhoneNumber 字段匹配（兼容存储格式不同的用户）
      const byPureRes = await db.collection('users')
        .where({ purePhoneNumber: _.in(batch), isDelete: _.neq(1) })
        .limit(batchSize)
        .get()

      for (const user of (byPureRes.data || [])) {
        if (user.phoneNumber) phoneToUser[user.phoneNumber] = user
        if (user.purePhoneNumber) phoneToUser[user.purePhoneNumber] = user
      }
    }

    console.log(`[批量激活] 匹配到已注册用户数: ${Object.keys(phoneToUser).length}`)

    // 4. 逐条处理
    const now = Date.now()
    let matched = 0
    let activated = 0
    let skipped = 0
    let failed = 0
    const details = []

    for (const whitelist of pendingList) {
      const phoneVariants = generatePhoneMatchList(whitelist.phone)
      let matchedUser = null

      for (const variant of phoneVariants) {
        if (phoneToUser[variant]) {
          matchedUser = phoneToUser[variant]
          break
        }
      }

      if (!matchedUser) {
        // 没有匹配到注册用户，跳过
        details.push({ phone: whitelist.phone, result: 'no_user' })
        continue
      }

      matched++
      const openid = matchedUser._openid
      const userId = matchedUser._id

      if (dryRun) {
        // 试运行：只统计不操作
        details.push({ phone: whitelist.phone, result: 'would_activate', userId })
        activated++
        continue
      }

      try {
        // 4.1 检查是否已有该工具包的订单（幂等性保证）
        const existingOrderRes = await db.collection('orders')
          .where({
            userId: openid,
            category: 'toolkit',
            status: _.in(['paid', 'completed']),
            isDelete: _.neq(1),
            'params.items': _.elemMatch({ id: whitelist.toolkitId })
          })
          .limit(1)
          .get()

        if (existingOrderRes.data && existingOrderRes.data.length > 0) {
          // 已有订单，直接更新白名单状态
          await db.collection('toolkit_whitelist').doc(whitelist._id).update({
            data: {
              status: 'activated',
              activatedAt: now,
              activatedUserId: openid,
              orderId: existingOrderRes.data[0]._id,
              orderNo: existingOrderRes.data[0].orderNo,
              updatedAt: now
            }
          })
          skipped++
          details.push({ phone: whitelist.phone, result: 'existing_order', userId })
          continue
        }

        // 4.2 创建工具包订单
        const orderNo = generateOrderNo()
        const orderDoc = {
          orderNo,
          userId: openid,
          _openid: openid,
          category: 'toolkit',
          status: 'completed',
          totalPrice: 0,
          paidPrice: 0,
          params: {
            items: [{
              id: whitelist.toolkitId,
              toolkitId: whitelist.toolkitId,
              name: whitelist.toolkitName || '灯光设计工具包',
              category: 'toolkit',
              type: 'toolkit',
              price: 0,
              quantity: 1
            }]
          },
          source: 'whitelist_batch',
          whitelistType: 'toolkit',
          whitelistId: whitelist._id,
          whitelistPhone: whitelist.phone,
          paidAt: now,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
          isDelete: 0
        }

        const orderAddRes = await db.collection('orders').add({ data: orderDoc })
        const orderId = orderAddRes._id

        // 4.3 更新白名单状态
        await db.collection('toolkit_whitelist').doc(whitelist._id).update({
          data: {
            status: 'activated',
            activatedAt: now,
            activatedUserId: openid,
            orderId,
            orderNo,
            updatedAt: now
          }
        })

        activated++
        details.push({ phone: whitelist.phone, result: 'activated', userId, orderNo })
        console.log(`[批量激活] 已激活: ${whitelist.phone} → userId: ${userId}, orderNo: ${orderNo}`)

      } catch (itemErr) {
        failed++
        details.push({ phone: whitelist.phone, result: 'error', error: itemErr.message })
        console.error(`[批量激活] 处理失败: ${whitelist.phone}`, itemErr.message)
      }
    }

    const summary = {
      total: pendingList.length,
      matched,
      activated,
      skipped,
      failed,
      noUser: pendingList.length - matched
    }

    console.log('[批量激活] 完成:', summary)

    return {
      success: true,
      code: 'OK',
      dryRun,
      data: summary,
      details: details.slice(0, 50), // 最多返回前 50 条详情
      message: dryRun
        ? `[试运行] 共 ${pendingList.length} 条 pending，可激活 ${activated} 条（已注册用户），${pendingList.length - matched} 条用户未注册`
        : `批量激活完成：成功激活 ${activated} 条，已有订单 ${skipped} 条，用户未注册 ${pendingList.length - matched} 条，失败 ${failed} 条`
    }

  } catch (err) {
    console.error('[批量激活] 执行失败:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
