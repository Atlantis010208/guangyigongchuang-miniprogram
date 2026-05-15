/**
 * 云函数：admin_membership_batch_grant
 *
 * 职责：后台管理端「批量赠送会员」两阶段流程
 *   - preview：解析每行数据 → 校验字段 → 匹配用户 → 返回逐行结果（不写库）
 *   - execute：先 preview，再逐行独立事务执行 grant → 写 membership_batches 集合
 *
 * 入参（event）：
 *   - action: 'preview' | 'execute'
 *   - rows: MembershipBatchRow[]   ≤500
 *
 * MembershipBatchRow:
 *   - row?: number             CSV 行号（前端传入，便于错误定位）
 *   - phoneNumber?: string     与 openid 二选一
 *   - openid?: string
 *   - vipLevel: 'normal' | 'premium'
 *   - days: number             1~3650
 *   - reason: string           ≥5 字符
 *
 * 鉴权：admin_auth.requireAdmin
 *
 * 返回：
 *   - preview：{ success, code, data: { items: MembershipBatchPreviewItem[] }, timestamp }
 *   - execute：{ success, code, data: MembershipBatchExecuteResult, timestamp }
 *
 * 错误码：
 *   - 整体：UNAUTHORIZED / FORBIDDEN / INVALID_INPUT / BATCH_TOO_LARGE / INVALID_ACTION / SERVER_ERROR
 *   - 单行：MISSING_IDENTIFIER / INVALID_LEVEL / INVALID_DAYS / INVALID_REASON / USER_NOT_FOUND / INVALID_DOWNGRADE / DB_ERROR
 */

const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_BATCH = 500
const MAX_FAILED_ITEMS = 100
const MIN_REASON_LENGTH = 5
const MAX_REASON_LENGTH = 200
const MIN_DAYS = 1
const MAX_DAYS = 3650
const VIP_LEVELS = ['normal', 'premium']

function resp(success, code, data, errorMessage) {
  const out = { success, code, data: data || null, timestamp: Date.now() }
  if (errorMessage) out.errorMessage = errorMessage
  return out
}

function mapAuthErrorCode(code) {
  switch (code) {
    case 'MISSING_IDENTITY':
    case 'MISSING_OPENID':
    case 'UNKNOWN_SOURCE':
    case 'USER_NOT_FOUND':
      return 'UNAUTHORIZED'
    case 'USER_DISABLED':
    case 'FORBIDDEN':
    case 'NOT_ADMIN':
      return 'FORBIDDEN'
    default:
      return 'SERVER_ERROR'
  }
}

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'mb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}

/**
 * 单行字段校验（不查库）
 */
function validateRow(r) {
  if (!r.phoneNumber && !r.openid) {
    return { errorCode: 'MISSING_IDENTIFIER', errorMessage: 'phoneNumber 与 openid 至少填一项' }
  }
  if (!VIP_LEVELS.includes(r.vipLevel)) {
    return { errorCode: 'INVALID_LEVEL', errorMessage: 'vipLevel 必须是 normal 或 premium' }
  }
  const daysNum = Number(r.days)
  if (!Number.isInteger(daysNum) || daysNum < MIN_DAYS || daysNum > MAX_DAYS) {
    return { errorCode: 'INVALID_DAYS', errorMessage: `days 必须是 ${MIN_DAYS}~${MAX_DAYS} 的整数` }
  }
  const reason = String(r.reason || '').trim()
  if (reason.length < MIN_REASON_LENGTH) {
    return { errorCode: 'INVALID_REASON', errorMessage: `备注至少 ${MIN_REASON_LENGTH} 个字符` }
  }
  return null
}

/**
 * 批量解析 + 用户匹配（preview 与 execute 共用）
 */
async function buildPreviewItems(rows) {
  // 1. 收集 phoneNumber/openid 用于批量查
  const phones = []
  const openids = []
  rows.forEach(r => {
    if (r.phoneNumber) phones.push(String(r.phoneNumber).trim())
    if (r.openid) openids.push(String(r.openid).trim())
  })
  const uniqPhones = [...new Set(phones)]
  const uniqOpenids = [...new Set(openids)]

  // 2. 批量查询 users
  const userQueries = []
  if (uniqPhones.length > 0) userQueries.push({ phoneNumber: _.in(uniqPhones) })
  if (uniqOpenids.length > 0) userQueries.push({ _openid: _.in(uniqOpenids) })

  let users = []
  if (userQueries.length > 0) {
    const where = userQueries.length === 1
      ? { isDelete: _.neq(1), ...userQueries[0] }
      : { isDelete: _.neq(1), $or: userQueries } // 用 $or 因为 _.in 不能直接合并
    try {
      // 使用 _.or 替代 $or（更安全）
      const finalWhere = userQueries.length === 1
        ? { isDelete: _.neq(1), ...userQueries[0] }
        : _.and([{ isDelete: _.neq(1) }, _.or(userQueries)])
      const usersRes = await db.collection('users')
        .where(finalWhere)
        .limit(1000)
        .get()
      users = usersRes.data
    } catch (e) {
      console.warn('[admin_membership_batch_grant] 批量查 users 失败:', e.message)
    }
  }

  // 3. 构建索引
  const phoneMap = {}
  const openidMap = {}
  users.forEach(u => {
    if (u.phoneNumber) phoneMap[u.phoneNumber] = u
    if (u._openid) openidMap[u._openid] = u
  })

  // 4. 逐行装配
  return rows.map((r, idx) => {
    const rowNum = Number(r.row) || idx + 1
    const phoneNumber = r.phoneNumber ? String(r.phoneNumber).trim() : undefined
    const openid = r.openid ? String(r.openid).trim() : undefined
    const vipLevel = r.vipLevel
    const days = Number(r.days) || 0
    const reason = String(r.reason || '').trim()

    const base = { row: rowNum, phoneNumber, openid, vipLevel, days, reason }

    // 字段校验
    const fieldErr = validateRow({ phoneNumber, openid, vipLevel, days, reason })
    if (fieldErr) return { ...base, valid: false, ...fieldErr }

    // 匹配用户（openid 优先，phoneNumber 次之）
    const user = (openid && openidMap[openid]) || (phoneNumber && phoneMap[phoneNumber])
    if (!user) {
      return { ...base, valid: false, errorCode: 'USER_NOT_FOUND', errorMessage: '未找到对应用户' }
    }

    return {
      ...base,
      matchedUser: {
        _id: user._id,
        nickname: user.nickname || '未设置',
        phoneNumber: user.phoneNumber || '',
        avatarUrl: user.avatarUrl || '',
        currentVipLevel: user.vipLevel || 'none',
        currentExpireAt: Number(user.vipExpireAt) || undefined
      },
      valid: true
    }
  })
}

/**
 * 单行 grant 事务（execute 时调用）
 * 复用 admin_membership_action 的 handleGrant 逻辑
 */
async function grantSingle({ userId, vipLevel, days, reason, adminId, batchId, now }) {
  return await db.runTransaction(async tx => {
    const userDoc = await tx.collection('users').doc(userId).get()
    if (!userDoc || !userDoc.data) {
      throw { code: 'USER_NOT_FOUND', msg: '用户不存在' }
    }
    const user = userDoc.data

    const currentLevel = user.vipLevel || 'none'
    const currentExpire = Number(user.vipExpireAt) || 0
    const isActive = currentLevel !== 'none' && currentExpire > now

    if (isActive && currentLevel === 'premium' && vipLevel === 'normal') {
      throw { code: 'INVALID_DOWNGRADE', msg: '不可降级' }
    }

    const daysMs = Number(days) * ONE_DAY_MS
    const newExpireAt = isActive ? currentExpire + daysMs : now + daysMs

    const updates = {
      vipLevel,
      vipExpireAt: newExpireAt,
      vipUpdatedAt: now,
      vipGrantedBy: adminId,
      vipGrantedAt: now,
      vipGrantReason: reason,
      vipBatchId: batchId,
      vipRevokedBy: _.remove(),
      vipRevokedAt: _.remove(),
      vipRevokeReason: _.remove()
    }
    if ((currentLevel === 'none' || !isActive) && !user.vipStartedAt) {
      updates.vipStartedAt = now
    }

    await tx.collection('users').doc(userId).update({ data: updates })
  })
}

/**
 * preview 处理
 */
async function handlePreview(rows) {
  const items = await buildPreviewItems(rows)
  return resp(true, 'OK', { items })
}

/**
 * execute 处理
 *   1. 先重新 preview（防客户端伪造）
 *   2. 逐行 grantSingle，单行失败不影响整体
 *   3. 写入 membership_batches 批次记录
 */
async function handleExecute(rows, admin) {
  const items = await buildPreviewItems(rows)
  const batchId = generateUUID()
  const adminId = admin._id
  const adminName = admin.nickname || admin.username || adminId
  const now = Date.now()

  const results = []
  for (const item of items) {
    const rowResult = { row: item.row, success: false }

    if (!item.valid || !item.matchedUser) {
      rowResult.errorCode = item.errorCode || 'INVALID_ROW'
      rowResult.errorMessage = item.errorMessage || '该行无效'
      results.push(rowResult)
      continue
    }

    try {
      await grantSingle({
        userId: item.matchedUser._id,
        vipLevel: item.vipLevel,
        days: item.days,
        reason: item.reason,
        adminId,
        batchId,
        now
      })
      rowResult.success = true
      rowResult.userId = item.matchedUser._id
    } catch (err) {
      rowResult.errorCode = (err && err.code) || 'DB_ERROR'
      rowResult.errorMessage = (err && (err.msg || err.message)) || '执行失败'
    }

    results.push(rowResult)
  }

  const successCount = results.filter(r => r.success).length
  const failedCount = results.length - successCount
  const failedItems = results
    .filter(r => !r.success)
    .slice(0, MAX_FAILED_ITEMS)
    .map(r => ({ row: r.row, errorCode: r.errorCode, errorMessage: r.errorMessage }))

  // 写入批次记录
  try {
    await db.collection('membership_batches').add({
      data: {
        _id: batchId,
        operatorId: adminId,
        operatorName: adminName,
        createdAt: now,
        totalCount: results.length,
        successCount,
        failedCount,
        rawSample: JSON.stringify(rows).slice(0, 1000),
        failedItems
      }
    })
  } catch (e) {
    console.error('[admin_membership_batch_grant] 写入 membership_batches 失败:', e.message)
    // 不影响整体返回（batch 记录写入失败是次要错误）
  }

  return resp(true, 'OK', {
    batchId,
    totalCount: results.length,
    successCount,
    failedCount,
    items: results
  })
}

exports.main = async (event) => {
  try {
    // 1. 鉴权
    const auth = await requireAdmin(db, _)
    if (!auth.ok) {
      console.log('[admin_membership_batch_grant] 鉴权失败:', auth.errorCode)
      return resp(false, mapAuthErrorCode(auth.errorCode), null, getErrorMessage(auth.errorCode))
    }

    // 2. 入参校验
    const action = String((event && event.action) || '').trim()
    const rows = Array.isArray(event && event.rows) ? event.rows : null

    if (!rows || rows.length === 0) {
      return resp(false, 'INVALID_INPUT', null, 'rows 不能为空')
    }
    if (rows.length > MAX_BATCH) {
      return resp(false, 'BATCH_TOO_LARGE', null, `单批不能超过 ${MAX_BATCH} 行`)
    }

    // 3. action 路由
    if (action === 'preview') {
      return await handlePreview(rows)
    }
    if (action === 'execute') {
      return await handleExecute(rows, auth.user)
    }
    return resp(false, 'INVALID_ACTION', null, '不支持的 action：' + (action || '(空)'))
  } catch (err) {
    console.error('[admin_membership_batch_grant] 顶层异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '操作失败')
  }
}
