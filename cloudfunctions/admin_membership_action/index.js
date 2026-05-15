/**
 * 云函数：admin_membership_action
 *
 * 职责：后台管理端「会员档案」写操作（grant 赠送/延长/升档；revoke 撤销）
 *
 * 入参（event）：
 *   - action: 'grant' | 'revoke'
 *   - userId: string                users._id
 *   - vipLevel?: 'normal' | 'premium'   grant 时必填
 *   - days?: number                 grant 时必填，1~3650
 *   - reason: string                ≥5 字符（grant 与 revoke 都必填）
 *
 * 鉴权：admin_auth.requireAdmin
 *
 * 业务规则：
 *   grant：
 *     - 已激活用户（vipLevel != none && expireAt > now）：在原 vipExpireAt 基础叠加 days
 *     - 已过期 / 免费用户：vipExpireAt = now + days
 *     - 拒绝降级（premium → normal 且当前激活）：返回 INVALID_DOWNGRADE
 *     - 首次开通（vipStartedAt 为空）：补写 vipStartedAt = now
 *     - 写入审计：vipGrantedBy / vipGrantedAt / vipGrantReason
 *     - 清除撤销审计：vipRevokedBy / vipRevokedAt / vipRevokeReason（保持最新态"有效"语义）
 *
 *   revoke：
 *     - 当前未激活：返回 ALREADY_EXPIRED
 *     - 当前激活：vipExpireAt = now（保留 vipLevel 作历史）
 *     - 写入审计：vipRevokedBy / vipRevokedAt / vipRevokeReason
 *
 * 返回：
 *   - 成功：{ success: true, code: 'OK', data: { userId, action, vipLevel?, vipExpireAt?, vipUpdatedAt }, timestamp }
 *   - 失败：{ success: false, code, errorMessage, timestamp }
 *
 * 错误码：
 *   - UNAUTHORIZED / FORBIDDEN
 *   - INVALID_ACTION
 *   - USER_NOT_FOUND
 *   - INVALID_LEVEL / INVALID_DAYS / INVALID_REASON
 *   - INVALID_DOWNGRADE
 *   - ALREADY_EXPIRED
 *   - CONCURRENT_UPDATE / DB_ERROR / SERVER_ERROR
 */

const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ONE_DAY_MS = 24 * 60 * 60 * 1000
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

/**
 * grant 处理器
 * 前置：vipLevel ∈ {normal, premium}, days 整数 1~3650, reason ≥5 字
 * 拒绝：premium → normal 且当前激活（INVALID_DOWNGRADE）
 */
async function handleGrant({ tx, adminId, userId, vipLevel, days, reason, now }) {
  // 1. 校验 vipLevel
  if (!VIP_LEVELS.includes(vipLevel)) {
    throw { code: 'INVALID_LEVEL', msg: 'vipLevel 必须是 normal 或 premium' }
  }
  // 2. 校验 days
  const daysNum = Number(days)
  if (!Number.isInteger(daysNum) || daysNum < MIN_DAYS || daysNum > MAX_DAYS) {
    throw { code: 'INVALID_DAYS', msg: `days 必须是 ${MIN_DAYS}~${MAX_DAYS} 的整数` }
  }

  // 3. 读取目标用户
  const userDoc = await tx.collection('users').doc(userId).get()
  if (!userDoc || !userDoc.data) {
    throw { code: 'USER_NOT_FOUND', msg: '未找到用户' }
  }
  const user = userDoc.data

  const currentLevel = user.vipLevel || 'none'
  const currentExpire = Number(user.vipExpireAt) || 0
  const isActive = currentLevel !== 'none' && currentExpire > now

  // 4. 拒绝降级（仅当当前激活且当前为 premium、目标为 normal 时）
  if (isActive && currentLevel === 'premium' && vipLevel === 'normal') {
    throw { code: 'INVALID_DOWNGRADE', msg: '暂不支持降级操作，请先撤销再重新赠送' }
  }

  // 5. 计算新到期时间
  const daysMs = daysNum * ONE_DAY_MS
  const newExpireAt = isActive ? currentExpire + daysMs : now + daysMs

  // 6. 构造更新内容
  const updates = {
    vipLevel,
    vipExpireAt: newExpireAt,
    vipUpdatedAt: now,
    vipGrantedBy: adminId,
    vipGrantedAt: now,
    vipGrantReason: reason,
    // 清除撤销审计（最新态为"有效赠送"）
    vipRevokedBy: _.remove(),
    vipRevokedAt: _.remove(),
    vipRevokeReason: _.remove()
  }

  // 7. 首次开通补 vipStartedAt
  if ((currentLevel === 'none' || !isActive) && !user.vipStartedAt) {
    updates.vipStartedAt = now
  }

  // 8. 执行更新
  await tx.collection('users').doc(userId).update({ data: updates })

  return {
    userId,
    action: 'grant',
    vipLevel,
    vipExpireAt: newExpireAt,
    vipUpdatedAt: now,
    daysAdded: daysNum,
    isActiveBefore: isActive
  }
}

/**
 * revoke 处理器
 * 前置：reason ≥5 字
 * 拒绝：当前未激活（ALREADY_EXPIRED）
 */
async function handleRevoke({ tx, adminId, userId, reason, now }) {
  const userDoc = await tx.collection('users').doc(userId).get()
  if (!userDoc || !userDoc.data) {
    throw { code: 'USER_NOT_FOUND', msg: '未找到用户' }
  }
  const user = userDoc.data

  const currentLevel = user.vipLevel || 'none'
  const currentExpire = Number(user.vipExpireAt) || 0
  const isActive = currentLevel !== 'none' && currentExpire > now

  if (!isActive) {
    throw { code: 'ALREADY_EXPIRED', msg: '该用户当前非有效会员，无需撤销' }
  }

  await tx.collection('users').doc(userId).update({
    data: {
      vipExpireAt: now,
      vipUpdatedAt: now,
      vipRevokedBy: adminId,
      vipRevokedAt: now,
      vipRevokeReason: reason
      // 注：保留 vipLevel 作历史；保留 vipGrantedBy/At/Reason 作上次开通审计
    }
  })

  return {
    userId,
    action: 'revoke',
    vipLevel: currentLevel,
    vipExpireAt: now,
    vipUpdatedAt: now,
    expiredFromMs: currentExpire
  }
}

const ACTION_HANDLERS = {
  grant: handleGrant,
  revoke: handleRevoke
}

exports.main = async (event) => {
  try {
    // 1. 鉴权
    const auth = await requireAdmin(db, _)
    if (!auth.ok) {
      console.log('[admin_membership_action] 鉴权失败:', auth.errorCode)
      return resp(false, mapAuthErrorCode(auth.errorCode), null, getErrorMessage(auth.errorCode))
    }
    const adminId = auth.user._id

    // 2. action 路由
    const action = String((event && event.action) || '').trim()
    const handler = ACTION_HANDLERS[action]
    if (!handler) {
      return resp(false, 'INVALID_ACTION', null, '不支持的 action：' + (action || '(空)'))
    }

    // 3. 共享入参校验
    const userId = String((event && event.userId) || '').trim()
    if (!userId) {
      return resp(false, 'USER_NOT_FOUND', null, 'userId 必填')
    }

    const reasonRaw = String((event && event.reason) || '')
    const reason = reasonRaw.trim().slice(0, MAX_REASON_LENGTH)
    if (reason.length < MIN_REASON_LENGTH) {
      return resp(false, 'INVALID_REASON', null, `备注至少 ${MIN_REASON_LENGTH} 个字符`)
    }

    // grant 专属入参提前校验（避免事务内 throw 后才发现）
    if (action === 'grant') {
      if (!VIP_LEVELS.includes(event.vipLevel)) {
        return resp(false, 'INVALID_LEVEL', null, 'vipLevel 必须是 normal 或 premium')
      }
      const daysNum = Number(event.days)
      if (!Number.isInteger(daysNum) || daysNum < MIN_DAYS || daysNum > MAX_DAYS) {
        return resp(false, 'INVALID_DAYS', null, `days 必须是 ${MIN_DAYS}~${MAX_DAYS} 的整数`)
      }
    }

    const now = Date.now()

    // 4. 事务执行
    try {
      const result = await db.runTransaction(function (tx) {
        return handler({
          tx,
          adminId,
          userId,
          vipLevel: event.vipLevel,
          days: event.days,
          reason,
          now
        })
      })
      return resp(true, 'OK', result)
    } catch (err) {
      // 业务错误（事务内 throw 的对象）
      if (err && err.code) {
        console.warn('[admin_membership_action]', action, '业务错误:', err.code, err.msg)
        return resp(false, err.code, null, err.msg)
      }
      // 数据库错误
      console.error('[admin_membership_action]', action, '事务失败:', err)
      const errMsg = String((err && err.message) || '')
      const isConflict = /conflict|concurrent/i.test(errMsg)
      return resp(false, isConflict ? 'CONCURRENT_UPDATE' : 'DB_ERROR', null, errMsg || '事务执行失败')
    }
  } catch (err) {
    console.error('[admin_membership_action] 顶层异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '操作失败')
  }
}
