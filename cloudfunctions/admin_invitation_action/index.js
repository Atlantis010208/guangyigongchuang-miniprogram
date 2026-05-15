/**
 * 云函数：admin_invitation_action
 *
 * 职责：后台管理端对邀请记录执行写操作（补发奖励 / 撤销奖励）
 *
 * 入参：
 *   - action: 'grant' | 'revoke'
 *   - invitationId: string             member_invitations 文档 _id
 *   - note?: string                    操作备注（grant 可选 ≤200 字；revoke 必填 ≥5 字 ≤200 字）
 *
 * 鉴权：复用 admin_auth.js requireAdmin（Web 端 customUserId → admin_accounts）
 *
 * 状态机语义：
 *   - 允许双向反复切换：grant: false→true、revoke: true→false
 *   - 但每次切换前必须满足前置状态（不允许重复 grant 或重复 revoke）
 *   - grant 与 revoke 双方向审计字段独立保留，前端通过比较 grantedAt vs revokedAt 判断最近一次操作
 *
 * 返回：
 *   - 成功: { success: true, code: 'OK', data: { action, rewardDays|revokedDays, afterVipExpireAt, afterGalleryTrialExpireAt }, timestamp }
 *   - 失败: { success: false, code, errorMessage, timestamp }
 *
 * 错误码：
 *   - INVALID_ACTION         action 不是 grant/revoke
 *   - INVALID_PARAMS         入参缺失 / 撤销备注 <5 字
 *   - INVITATION_NOT_FOUND   邀请记录不存在
 *   - INVITER_NOT_FOUND      邀请人不存在
 *   - ALREADY_GRANTED        grant 时记录已发奖
 *   - NOT_GRANTED_YET        revoke 时记录未发奖
 *   - CONCURRENT_UPDATE      事务冲突
 *   - DB_ERROR               数据库异常
 *   - UNAUTHORIZED / FORBIDDEN / SERVER_ERROR  鉴权 / 兜底
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COLLECTION = 'member_invitations'
const REWARD_DAYS = 7
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_NOTE_LENGTH = 200
const MIN_REVOKE_NOTE_LENGTH = 5

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
 * handler: 补发奖励
 * 前置：rewardGranted === false
 * 后置：rewardGranted=true, rewardDays=7, 邀请人 vipExpireAt+7d / galleryTrialExpireAt+7d / inviteStats.trialDaysGranted+=7
 */
async function handleGrant({ tx, adminId, invitationId, note, now }) {
  const invDoc = await tx.collection(COLLECTION).doc(invitationId).get()
  if (!invDoc || !invDoc.data) {
    throw { code: 'INVITATION_NOT_FOUND', msg: '邀请记录不存在' }
  }
  const inv = invDoc.data

  // 前置：必须当前未发奖
  if (inv.rewardGranted === true) {
    throw { code: 'ALREADY_GRANTED', msg: '该记录当前为已发奖状态，无需补发' }
  }

  if (!inv.inviterUserId) {
    throw { code: 'INVITER_NOT_FOUND', msg: '邀请人 userId 缺失' }
  }

  const inviterDoc = await tx.collection('users').doc(inv.inviterUserId).get()
  if (!inviterDoc || !inviterDoc.data) {
    throw { code: 'INVITER_NOT_FOUND', msg: '邀请人不存在' }
  }
  const inviter = inviterDoc.data

  // 计算新过期时间（基线 = max(now, currentExpireAt)）
  const baseVip = Math.max(now, Number(inviter.vipExpireAt) || 0)
  const baseGallery = Math.max(now, Number(inviter.galleryTrialExpireAt) || 0)
  const afterVipExpireAt = baseVip + REWARD_DAYS * ONE_DAY_MS
  const afterGalleryTrialExpireAt = baseGallery + REWARD_DAYS * ONE_DAY_MS

  const oldStats = inviter.inviteStats || { invitedCount: 0, trialDaysGranted: 0 }
  const newTrialDays = (Number(oldStats.trialDaysGranted) || 0) + REWARD_DAYS

  await tx.collection('users').doc(inv.inviterUserId).update({
    data: {
      vipExpireAt: afterVipExpireAt,
      galleryTrialExpireAt: afterGalleryTrialExpireAt,
      'inviteStats.trialDaysGranted': newTrialDays,
      updatedAt: now
    }
  })

  await tx.collection(COLLECTION).doc(invitationId).update({
    data: {
      rewardGranted: true,
      rewardDays: REWARD_DAYS,
      grantedBy: adminId,
      grantedAt: now,
      operatorNote: note,
      updatedAt: now
      // 注：不清除 revokedBy / revokedAt 历史值，前端通过比较时间戳判断最近一次操作
    }
  })

  return { rewardDays: REWARD_DAYS, afterVipExpireAt, afterGalleryTrialExpireAt }
}

/**
 * handler: 撤销奖励
 * 前置：rewardGranted === true && rewardDays > 0 && note.trim().length >= 5
 * 后置：rewardGranted=false, rewardDays=0, 邀请人 vipExpireAt-N / galleryTrialExpireAt-N（max(now, ...) 兜底）
 */
async function handleRevoke({ tx, adminId, invitationId, note, now }) {
  // 前置：备注 ≥5 字（与前端 confirmRevoke 校验对齐双重保护）
  if (note.trim().length < MIN_REVOKE_NOTE_LENGTH) {
    throw { code: 'INVALID_PARAMS', msg: '撤销备注至少需要 ' + MIN_REVOKE_NOTE_LENGTH + ' 个字符' }
  }

  const invDoc = await tx.collection(COLLECTION).doc(invitationId).get()
  if (!invDoc || !invDoc.data) {
    throw { code: 'INVITATION_NOT_FOUND', msg: '邀请记录不存在' }
  }
  const inv = invDoc.data

  // 前置：必须当前已发奖
  if (inv.rewardGranted !== true) {
    throw { code: 'NOT_GRANTED_YET', msg: '该记录当前未发奖，无可撤销内容' }
  }
  const revokedDays = Number(inv.rewardDays) || 0
  if (revokedDays <= 0) {
    throw { code: 'NOT_GRANTED_YET', msg: '该记录无奖励天数可撤销' }
  }

  if (!inv.inviterUserId) {
    throw { code: 'INVITER_NOT_FOUND', msg: '邀请人 userId 缺失' }
  }

  const inviterDoc = await tx.collection('users').doc(inv.inviterUserId).get()
  if (!inviterDoc || !inviterDoc.data) {
    throw { code: 'INVITER_NOT_FOUND', msg: '邀请人不存在' }
  }
  const inviter = inviterDoc.data

  // 扣回时兜底（避免负数过期）
  const afterVipExpireAt = Math.max(now, (Number(inviter.vipExpireAt) || 0) - revokedDays * ONE_DAY_MS)
  const afterGalleryTrialExpireAt = Math.max(now, (Number(inviter.galleryTrialExpireAt) || 0) - revokedDays * ONE_DAY_MS)

  const oldStats = inviter.inviteStats || { invitedCount: 0, trialDaysGranted: 0 }
  const newTrialDays = Math.max(0, (Number(oldStats.trialDaysGranted) || 0) - revokedDays)

  await tx.collection('users').doc(inv.inviterUserId).update({
    data: {
      vipExpireAt: afterVipExpireAt,
      galleryTrialExpireAt: afterGalleryTrialExpireAt,
      'inviteStats.trialDaysGranted': newTrialDays,
      updatedAt: now
      // 注：不动 vipLevel（与 applyInviteReward 等级保护语义一致）
    }
  })

  await tx.collection(COLLECTION).doc(invitationId).update({
    data: {
      rewardGranted: false,
      rewardDays: 0,
      revokedBy: adminId,
      revokedAt: now,
      operatorNote: note,
      updatedAt: now
      // 注：保留 grantedBy / grantedAt 历史值
    }
  })

  return { revokedDays, afterVipExpireAt, afterGalleryTrialExpireAt }
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
      console.log('[admin_invitation_action] 鉴权失败:', auth.errorCode)
      const code = mapAuthErrorCode(auth.errorCode)
      return resp(false, code, null, getErrorMessage(auth.errorCode))
    }
    const adminId = auth.user._id

    // 2. action 路由
    const action = String((event && event.action) || '').trim()
    const handler = ACTION_HANDLERS[action]
    if (!handler) {
      return resp(false, 'INVALID_ACTION', null, '不支持的 action：' + action)
    }

    // 3. 共享入参校验
    const invitationId = String((event && event.invitationId) || '').trim()
    if (!invitationId) {
      return resp(false, 'INVALID_PARAMS', null, 'invitationId 必填')
    }
    const note = String((event && event.note) || '').slice(0, MAX_NOTE_LENGTH)

    const now = Date.now()

    try {
      const result = await db.runTransaction(function (tx) {
        return handler({ tx, adminId, invitationId, note, now })
      })
      return resp(true, 'OK', { action: action, ...result })
    } catch (err) {
      // 业务错误（事务内 throw 的对象）
      if (err && err.code) {
        console.warn('[admin_invitation_action]', action, '业务错误:', err.code, err.msg)
        return resp(false, err.code, null, err.msg)
      }
      // 数据库错误
      console.error('[admin_invitation_action]', action, '事务失败:', err)
      const errMsg = String((err && err.message) || '')
      const isConflict = /conflict|concurrent/i.test(errMsg)
      return resp(false, isConflict ? 'CONCURRENT_UPDATE' : 'DB_ERROR', null, errMsg || '事务执行失败')
    }
  } catch (err) {
    console.error('[admin_invitation_action] 顶层异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '操作失败')
  }
}
