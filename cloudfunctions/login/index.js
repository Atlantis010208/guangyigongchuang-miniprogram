/**
 * 云函数 login
 * 功能：用户登录，获取 openid/unionId，创建或更新用户记录
 *       新增：登录时检查白名单并自动激活课程授权
 * 
 * 入参：
 *   - profile: { nickName, avatarUrl } 可选，用户基本信息
 *   - verifyOnly: boolean 可选，仅验证模式（不创建新用户，检查登录是否有效）
 *   - getOpenIdOnly: boolean 可选，仅获取 openid 模式（不创建用户、不查询数据库）
 * 
 * 返回：
 *   - success: boolean
 *   - code: 状态码 (OK/MISSING_OPENID/USER_NOT_FOUND/LOGIN_EXPIRED/LOGIN_FAILED)
 *   - openid: 用户 openid
 *   - unionId: 用户 unionId（如果有）
 *   - user: 用户文档
 *   - loginTime: 登录时间戳
 *   - expireTime: 登录过期时间戳（一天后）
 *   - whitelistActivated: boolean 是否激活了白名单授权
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 登录有效期：1天（毫秒）
const LOGIN_EXPIRE_DURATION = 24 * 60 * 60 * 1000

/**
 * 生成订单号
 * 格式：时间戳_随机字母（与商城订单格式保持一致）
 * 例如：1766027958353_qeuoze
 */
function generateOrderNo() {
  const timestamp = Date.now()
  // 生成 6 位随机字母数字
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${timestamp}_${random}`
}

/**
 * 检查并激活白名单授权
 * 静默执行，不影响主流程
 * 
 * @param {string} phoneNumber 用户手机号
 * @param {string} openid 用户 openid
 * @param {string} userId 用户 _id
 * @returns {object} { activated, whitelistId, orderId }
 */
async function checkAndActivateWhitelist(phoneNumber, openid, userId) {
  const db = cloud.database()
  const _ = db.command
  
  console.log('[白名单检查] 开始检查手机号:', phoneNumber.substring(0, 3) + '****' + phoneNumber.substring(7))
  
  try {
    // 1. 查询白名单中是否有该手机号的待激活记录
    const whitelistRes = await db.collection('course_whitelist')
      .where({
        phone: phoneNumber,
        status: 'pending'
      })
      .limit(10) // 一个手机号可能对应多个课程
      .get()
    
    if (!whitelistRes.data || whitelistRes.data.length === 0) {
      console.log('[白名单检查] 未找到待激活的白名单记录')
      return { activated: false }
    }
    
    console.log('[白名单检查] 找到待激活记录:', whitelistRes.data.length, '条')
    
    const now = Date.now()
    let activatedCount = 0
    
    // 2. 为每条白名单记录创建订单并更新状态
    for (const whitelist of whitelistRes.data) {
      try {
        // 2.1 检查是否已经有该课程的订单（幂等性保证）
        const existingOrderRes = await db.collection('orders')
          .where({
            userId: openid,
            category: 'course',
            status: _.in(['paid', 'completed']),
            isDelete: _.neq(1),
            'params.items': _.elemMatch({
              id: whitelist.courseId
            })
          })
          .limit(1)
          .get()
        
        if (existingOrderRes.data && existingOrderRes.data.length > 0) {
          console.log('[白名单激活] 用户已有该课程订单，跳过:', whitelist.courseId)
          
          // 更新白名单状态为已激活（关联到已有订单）
          await db.collection('course_whitelist').doc(whitelist._id).update({
            data: {
              status: 'activated',
              activatedAt: now,
              activatedUserId: openid,
              orderId: existingOrderRes.data[0]._id,
              orderNo: existingOrderRes.data[0].orderNo,
              updatedAt: now
            }
          })
          activatedCount++
          continue
        }
        
        // 2.2 创建课程订单
        const orderNo = generateOrderNo()
        const orderDoc = {
          orderNo,
          userId: openid,
          _openid: openid,
          category: 'course',
          status: 'completed', // 直接完成，无需支付
          totalPrice: 0,
          paidPrice: 0,
          params: {
            items: [{
              id: whitelist.courseId,
              courseId: whitelist.courseId,
              name: whitelist.courseName || '灯光设计课',
              category: 'course',
              type: 'course',
              price: 0,
              quantity: 1
            }]
          },
          // 白名单订单标记
          source: 'whitelist',
          whitelistId: whitelist._id,
          whitelistPhone: phoneNumber,
          // 时间戳
          paidAt: now,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
          isDelete: 0
        }
        
        const orderAddRes = await db.collection('orders').add({ data: orderDoc })
        const orderId = orderAddRes._id
        
        console.log('[白名单激活] 订单已创建:', orderNo, '课程:', whitelist.courseId)
        
        // 2.3 更新白名单状态
        await db.collection('course_whitelist').doc(whitelist._id).update({
          data: {
            status: 'activated',
            activatedAt: now,
            activatedUserId: openid,
            orderId,
            orderNo,
            updatedAt: now
          }
        })
        
        console.log('[白名单激活] 白名单记录已更新为激活状态')
        activatedCount++
        
      } catch (itemErr) {
        console.error('[白名单激活] 处理单条记录失败:', whitelist._id, itemErr.message)
        // 继续处理下一条，不中断整个流程
      }
    }
    
    return {
      activated: activatedCount > 0,
      activatedCount,
      totalFound: whitelistRes.data.length
    }
    
  } catch (err) {
    console.error('[白名单检查] 执行失败:', err.message)
    // 白名单检查失败不影响主流程
    return { activated: false, error: err.message }
  }
}

exports.main = async (event) => {
  try {
    // 获取微信上下文，包含 openid 和 unionId
    const ctx = cloud.getWXContext()
    const openid = ctx.OPENID || ctx.openid || ''
    const unionId = ctx.UNIONID || ctx.unionid || ''

    if (!openid) {
      return { 
        success: false, 
        code: 'MISSING_OPENID', 
        errorMessage: '无法获取用户身份标识' 
      }
    }

    // 仅获取 openid 模式：不创建用户，但会查询数据库判断用户是否存在
    // 用于登录流程的第一步，获取 openid 后等待用户完成资料填写
    const getOpenIdOnly = event && event.getOpenIdOnly === true
    if (getOpenIdOnly) {
      console.log('仅获取 openid 模式:', { openid, unionId: unionId || '无' })
      
      // 查询用户是否已存在（用于区分新老用户）
      const db = cloud.database()
      const _ = db.command
      let existingUser = null
      let whitelistResult = null
      
      try {
        // 方法1：通过 openid 查询
        const queryRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
        if (queryRes && queryRes.data && queryRes.data.length > 0) {
          existingUser = queryRes.data[0]
          console.log('找到已有用户记录(openid):', existingUser._id)
        }
        
        // ========== 新增：unionId 去重检查 ==========
        // 如果通过 openid 找不到用户，但有 unionId，尝试通过 unionId 查找
        // 这可以防止同一用户在不同环境（开发版/正式版）创建多个账号
        if (!existingUser && unionId) {
          console.log('[unionId去重] 尝试通过 unionId 查找用户:', unionId)
          const unionIdQueryRes = await db.collection('users').where({ 
            unionId: unionId,
            isDelete: _.neq(1)
          }).limit(1).get()
          
          if (unionIdQueryRes && unionIdQueryRes.data && unionIdQueryRes.data.length > 0) {
            existingUser = unionIdQueryRes.data[0]
            console.log('[unionId去重] 找到已有用户记录(unionId):', existingUser._id)
            
            // 更新该用户的 openid（关联新的登录方式）
            // 注意：不覆盖原有的 _openid，而是添加 alternateOpenids 字段
            const alternateOpenids = existingUser.alternateOpenids || []
            if (!alternateOpenids.includes(openid) && existingUser._openid !== openid) {
              alternateOpenids.push(openid)
              await db.collection('users').doc(existingUser._id).update({
                data: {
                  alternateOpenids: alternateOpenids,
                  updatedAt: Date.now()
                }
              })
              console.log('[unionId去重] 已添加备用 openid:', openid)
            }
          }
        }
        // ==========================================
        
        if (existingUser) {
          console.log('找到已有用户记录:', existingUser._id)
          
          // 老用户：更新登录时间
          const now = Date.now()
          const expireTime = now + LOGIN_EXPIRE_DURATION
          await db.collection('users').doc(existingUser._id).update({
            data: {
              lastLoginAt: now,
              loginExpireAt: expireTime,
              updatedAt: now
            }
          })
          
          // 重新获取更新后的用户
          const refreshed = await db.collection('users').doc(existingUser._id).get()
          existingUser = refreshed && refreshed.data ? refreshed.data : existingUser
          
          // ========== 新增：白名单激活检查 ==========
          // 如果用户已有手机号，检查白名单
          // 重要：优先使用 purePhoneNumber（纯手机号），如果没有则从 phoneNumber 中移除国家码
          if (existingUser.phoneNumber || existingUser.purePhoneNumber) {
            let phoneToCheck = existingUser.purePhoneNumber || existingUser.phoneNumber
            // 如果手机号带国家码，移除 +86 前缀
            if (phoneToCheck && phoneToCheck.startsWith('+86')) {
              phoneToCheck = phoneToCheck.replace(/^\+86/, '')
            }
            whitelistResult = await checkAndActivateWhitelist(
              phoneToCheck,
              openid,
              existingUser._id
            )
            if (whitelistResult.activated) {
              console.log('[login] 白名单激活成功:', whitelistResult)
            }
          }
          // ========================================
          
          return {
            success: true,
            code: 'OK',
            openid,
            unionId: unionId || '',
            user: existingUser,
            isNewUser: false,
            loginTime: now,
            expireTime,
            whitelistActivated: whitelistResult ? whitelistResult.activated : false,
            whitelistInfo: whitelistResult
          }
        }
      } catch (e) {
        // 集合不存在或查询失败，视为新用户
        console.log('查询用户失败（可能是新用户）:', e.message)
      }
      
      // 新用户：只返回 openid，不创建记录
      return {
        success: true,
        code: 'OK',
        openid,
        unionId: unionId || '',
        user: null,
        isNewUser: true  // 标记为新用户（待创建）
      }
    }

    // 是否仅验证模式（不创建新用户）
    const verifyOnly = event && event.verifyOnly === true

    // 获取传入的用户资料（可选）
    const profile = event && event.profile ? event.profile : {}
    const nickname = profile.nickName || profile.nickname || ''
    const avatarUrl = profile.avatarUrl || ''

    const db = cloud.database()
    const col = db.collection('users')

    // 尝试查询用户，如果集合不存在则自动创建
    let existingUser = null
    try {
      const queryRes = await col.where({ _openid: openid }).limit(1).get()
      if (queryRes && queryRes.data && queryRes.data.length) {
        existingUser = queryRes.data[0]
      }
    } catch (e) {
      // 集合不存在，尝试创建
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try { 
          await db.createCollection('users') 
          console.log('已自动创建 users 集合')
        } catch (createErr) {
          console.warn('创建 users 集合失败（可能已存在）', createErr)
        }
      } else {
        throw e
      }
    }

    const now = Date.now()
    const loginTime = now
    const expireTime = now + LOGIN_EXPIRE_DURATION

    let user
    let whitelistResult = null

    // 仅验证模式：检查用户是否存在且登录未过期
    if (verifyOnly) {
      if (!existingUser) {
        console.log('验证失败：用户记录不存在', { openid })
        return {
          success: false,
          code: 'USER_NOT_FOUND',
          errorMessage: '用户记录不存在，请重新登录'
        }
      }

      // 检查云端记录的登录是否过期
      if (existingUser.loginExpireAt && now >= existingUser.loginExpireAt) {
        console.log('验证失败：云端登录已过期', { openid, expireAt: existingUser.loginExpireAt })
        return {
          success: false,
          code: 'LOGIN_EXPIRED',
          errorMessage: '登录已过期，请重新登录'
        }
      }

      // 验证通过，更新最后活跃时间并延长有效期
      await col.doc(existingUser._id).update({ 
        data: { 
          lastLoginAt: now,
          loginExpireAt: expireTime,
          updatedAt: now
        } 
      })

      const refreshed = await col.doc(existingUser._id).get()
      user = refreshed && refreshed.data ? refreshed.data : existingUser

      console.log('登录验证成功:', { openid, userId: user._id })
      
      // ========== 新增：白名单激活检查（验证模式也检查）==========
      // 重要：优先使用 purePhoneNumber（纯手机号），如果没有则从 phoneNumber 中移除国家码
      if (user.phoneNumber || user.purePhoneNumber) {
        let phoneToCheck = user.purePhoneNumber || user.phoneNumber
        // 如果手机号带国家码，移除 +86 前缀
        if (phoneToCheck && phoneToCheck.startsWith('+86')) {
          phoneToCheck = phoneToCheck.replace(/^\+86/, '')
        }
        whitelistResult = await checkAndActivateWhitelist(
          phoneToCheck,
          openid,
          user._id
        )
        if (whitelistResult.activated) {
          console.log('[login-verify] 白名单激活成功:', whitelistResult)
        }
      }
      // ========================================

      return {
        success: true,
        code: 'OK',
        openid,
        unionId: unionId || '',
        user,
        loginTime,
        expireTime,
        whitelistActivated: whitelistResult ? whitelistResult.activated : false,
        whitelistInfo: whitelistResult
      }
    }

    // 正常登录模式
    if (existingUser) {
      // 用户已存在，更新登录信息
      const updateData = {
        updatedAt: now,
        lastLoginAt: now,
        loginExpireAt: expireTime
      }
      
      // 仅在未设置时更新 nickname 和 avatarUrl
      if (nickname && !existingUser.nickname) {
        updateData.nickname = nickname
      }
      if (avatarUrl && !existingUser.avatarUrl) {
        updateData.avatarUrl = avatarUrl
      }
      // 更新 unionId（如果之前没有）
      if (unionId && !existingUser.unionId) {
        updateData.unionId = unionId
      }
      // 确保 roles 字段存在
      if (!('roles' in existingUser)) {
        updateData.roles = 1
      }

      await col.doc(existingUser._id).update({ data: updateData })
      
      // 重新获取更新后的用户文档
      const refreshed = await col.doc(existingUser._id).get()
      user = refreshed && refreshed.data ? refreshed.data : existingUser
      // 确保 _id 字段存在
      if (!user._id) {
        user._id = existingUser._id
      }
      
      // ========== 新增：白名单激活检查 ==========
      // 重要：优先使用 purePhoneNumber（纯手机号），如果没有则从 phoneNumber 中移除国家码
      if (user.phoneNumber || user.purePhoneNumber) {
        let phoneToCheck = user.purePhoneNumber || user.phoneNumber
        // 如果手机号带国家码，移除 +86 前缀
        if (phoneToCheck && phoneToCheck.startsWith('+86')) {
          phoneToCheck = phoneToCheck.replace(/^\+86/, '')
        }
        whitelistResult = await checkAndActivateWhitelist(
          phoneToCheck,
          openid,
          user._id
        )
        if (whitelistResult.activated) {
          console.log('[login] 白名单激活成功:', whitelistResult)
        }
      }
      // ========================================
      
    } else {
      // 新用户，创建记录
      // 注意：显式设置 _openid 字段，确保后续查询能找到
      const newUserData = {
        _openid: openid,  // 显式设置 _openid，确保查询时能匹配
        nickname: nickname,
        avatarUrl: avatarUrl,
        phoneNumber: '',
        unionId: unionId,
        roles: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        loginExpireAt: expireTime
      }

      console.log('创建新用户，openid:', openid)

      const addRes = await col.add({ data: newUserData })
      const docId = addRes && addRes._id ? addRes._id : ''
      
      console.log('新用户创建成功，docId:', docId)
      
      if (docId) {
        const docRes = await col.doc(docId).get()
        user = docRes && docRes.data ? { ...docRes.data, _id: docId } : { _id: docId, _openid: openid, ...newUserData }
      } else {
        user = { _openid: openid, ...newUserData }
      }
    }

    console.log('用户登录成功:', { openid, unionId: unionId || '无', userId: user._id || '无' })

    return { 
      success: true, 
      code: 'OK', 
      openid,
      unionId: unionId || '',
      user,
      loginTime,
      expireTime,
      whitelistActivated: whitelistResult ? whitelistResult.activated : false,
      whitelistInfo: whitelistResult
    }
  } catch (err) {
    console.error('登录云函数执行失败:', err)
    return { 
      success: false, 
      code: 'LOGIN_FAILED', 
      errorMessage: err && err.message ? err.message : '登录失败，请重试' 
    }
  }
}
