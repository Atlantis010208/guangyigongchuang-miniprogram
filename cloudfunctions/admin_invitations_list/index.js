/**
 * 云函数：admin_invitations_list
 *
 * 职责：后台管理端按邀请人 / 被邀请人 / 时间区间 / 是否发奖筛选邀请记录
 *
 * 鉴权：复用 admin_auth.js requireAdmin（与 admin_users_list 等保持一致）
 *
 * 入参：
 *   - inviterKeyword?: string   匹配 users.nickname / phoneNumber / inviteCode
 *   - invitedKeyword?: string   匹配 users.nickname / phoneNumber
 *   - startAt?: number          ms 时间戳，包含
 *   - endAt?: number            ms 时间戳，包含
 *   - rewardGranted?: boolean
 *   - pageNum?: number          默认 1
 *   - pageSize?: number         默认 20，最大 100
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 注意：现有 invitations 集合已被设计师邀请工单系统占用，会员邀请奖励单独使用 member_invitations 集合
const COLLECTION = 'member_invitations'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num))
}

function resp(success, code, data, errorMessage) {
  const out = { success, code, data: data || null, timestamp: Date.now() }
  if (errorMessage) out.errorMessage = errorMessage
  return out
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * admin_auth 错误码 → 对外错误码（需求 6.2）
 *   - 未提供身份 / 用户不存在 → UNAUTHORIZED
 *   - 账号禁用 / 无管理员权限 → FORBIDDEN
 *   - 其他 → SERVER_ERROR
 */
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
 * 根据关键词在 users 集合查到匹配的 _id 列表（最多 200，用于反向过滤 invitations）
 *
 * @param {'inviter'|'invited'} role 邀请人匹配 nickname/phoneNumber/inviteCode；被邀请人匹配 nickname/phoneNumber
 * @param {string} keyword
 * @returns {Promise<string[]>}
 */
async function lookupUserIds(role, keyword) {
  const safe = escapeRegExp(keyword)
  if (!safe) return []
  const re = db.RegExp({ regexp: safe, options: 'i' })
  const orList = role === 'inviter'
    ? [{ nickname: re }, { phoneNumber: re }, { inviteCode: re }]
    : [{ nickname: re }, { phoneNumber: re }]

  const res = await db.collection('users')
    .where(_.or(orList))
    .field({ _id: true })
    .limit(200)
    .get()

  return (res.data || []).map(u => u._id).filter(Boolean)
}

/**
 * 批量加载 users 摘要：避免 N+1
 */
async function batchLoadUsers(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)))
  if (ids.length === 0) return {}

  const map = {}
  // 单次 in 查询上限按 100 条切片
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    try {
      const res = await db.collection('users')
        .where({ _id: _.in(chunk) })
        .field({
          _id: true,
          _openid: true,
          nickname: true,
          phoneNumber: true,
          avatarUrl: true,
          inviteCode: true
        })
        .limit(100)
        .get()
      for (const u of res.data || []) {
        map[u._id] = u
      }
    } catch (e) {
      console.warn('[admin_invitations_list] 批量加载 users 摘要失败:', e && e.message)
    }
  }
  return map
}

function decorate(record, userMap) {
  const inviter = userMap[record.inviterUserId] || {}
  const invited = userMap[record.invitedUserId] || {}
  return {
    _id: record._id,
    createdAt: Number(record.createdAt) || 0,
    rewardGranted: !!record.rewardGranted,
    rewardDays: Number(record.rewardDays) || 0,
    inviteCode: record.inviteCode || '',
    rewardSnapshot: record.rewardSnapshot || null,
    errorCode: record.errorCode || '',
    errorMessage: record.errorMessage || '',
    inviter: {
      userId: record.inviterUserId || '',
      openid: inviter._openid || record.inviterOpenid || '',
      nickname: inviter.nickname || '',
      phoneNumber: inviter.phoneNumber || '',
      avatarUrl: inviter.avatarUrl || '',
      inviteCode: inviter.inviteCode || record.inviteCode || ''
    },
    invited: {
      userId: record.invitedUserId || '',
      openid: invited._openid || record.invitedOpenid || '',
      nickname: invited.nickname || record.invitedNickname || '',
      phoneNumber: invited.phoneNumber || '',
      avatarUrl: invited.avatarUrl || record.invitedAvatarUrl || ''
    }
  }
}

/**
 * 构造 invitations 查询条件
 */
async function buildWhere(event) {
  const filters = []

  if (event.inviterKeyword) {
    const ids = await lookupUserIds('inviter', String(event.inviterKeyword))
    if (ids.length === 0) return { hit: false, where: {} }
    filters.push({ inviterUserId: _.in(ids) })
  }
  if (event.invitedKeyword) {
    const ids = await lookupUserIds('invited', String(event.invitedKeyword))
    if (ids.length === 0) return { hit: false, where: {} }
    filters.push({ invitedUserId: _.in(ids) })
  }
  if (Number.isFinite(Number(event.startAt))) {
    filters.push({ createdAt: _.gte(Number(event.startAt)) })
  }
  if (Number.isFinite(Number(event.endAt))) {
    filters.push({ createdAt: _.lte(Number(event.endAt)) })
  }
  if (event.rewardGranted === true || event.rewardGranted === false) {
    filters.push({ rewardGranted: event.rewardGranted })
  }

  const where = filters.length === 0
    ? {}
    : filters.length === 1
      ? filters[0]
      : _.and(filters)
  return { hit: true, where }
}

exports.main = async (event) => {
  try {
    const auth = await requireAdmin(db, _)
    if (!auth.ok) {
      console.log('[admin_invitations_list] 鉴权失败:', auth.errorCode)
      // 把 admin_auth 的内部错误码统一映射为需求 6.2 中规定的 UNAUTHORIZED / FORBIDDEN
      const code = mapAuthErrorCode(auth.errorCode)
      return {
        success: false,
        code,
        errorMessage: getErrorMessage(auth.errorCode),
        timestamp: Date.now()
      }
    }

    const pageNum = Math.max(1, Number(event && event.pageNum) || 1)
    const pageSize = clamp(Number(event && event.pageSize) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    const built = await buildWhere(event || {})
    if (!built.hit) {
      // 关键词没匹配到任何 user → 直接返回空
      return resp(true, 'OK', { total: 0, pageNum, pageSize, list: [] })
    }

    const totalRes = await db.collection(COLLECTION).where(built.where).count()
    const total = (totalRes && totalRes.total) || 0

    const listRes = await db.collection(COLLECTION)
      .where(built.where)
      .orderBy('createdAt', 'desc')
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .get()

    const records = (listRes && listRes.data) || []

    // 批量拉 users 摘要
    const userIds = []
    for (const r of records) {
      if (r.inviterUserId) userIds.push(r.inviterUserId)
      if (r.invitedUserId) userIds.push(r.invitedUserId)
    }
    const userMap = await batchLoadUsers(userIds)

    const list = records.map(r => decorate(r, userMap))
    return resp(true, 'OK', { total, pageNum, pageSize, list })
  } catch (err) {
    console.error('[admin_invitations_list] 异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '查询邀请记录失败')
  }
}
