/**
 * 云函数：admin_membership_list
 *
 * 职责：后台管理端「会员档案」列表查询
 *   - 支持按等级 / 到期范围 / 工具包永久 / 关键字筛选
 *   - 返回头部 5 项统计聚合（总会员/普通/高级/工具包永久/即将到期）
 *   - 装饰审计 admin 昵称（vipGrantedBy / vipRevokedBy → admin_accounts）
 *
 * 入参（event）：
 *   - vipLevel?: 'all' | 'none' | 'normal' | 'premium'  默认 'all'
 *   - expireStartAt?: number   到期日区间起 (ms)
 *   - expireEndAt?: number     到期日区间止 (ms)
 *   - toolkitPerpetual?: 'all' | 'yes' | 'no'  默认 'all'
 *   - keyword?: string         昵称/手机号/openid/邀请码 模糊匹配
 *   - pageNum?: number         默认 1
 *   - pageSize?: number        默认 20，最大 100
 *
 * 鉴权：admin_auth.requireAdmin（仅 admin_accounts 或 users.roles=0）
 *
 * 返回（PaginatedResponse）：
 *   {
 *     success: true, code: 'OK',
 *     data: MemberProfile[],
 *     total: number,
 *     stats: { total, normal, premium, toolkitPerpetual, expiringSoon },
 *     pageNum, pageSize, timestamp
 *   }
 *
 * 错误码：UNAUTHORIZED / FORBIDDEN / SERVER_ERROR
 */

const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20
const SOON_EXPIRE_DAYS = 7

function resp(success, code, payload, errorMessage) {
  const out = { success, code, timestamp: Date.now() }
  if (success) {
    Object.assign(out, payload)
  } else if (errorMessage) {
    out.errorMessage = errorMessage
  }
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

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

/**
 * 构造 users 集合查询条件
 * 用 _.and() 数组组合多个子条件，避免 $or 字段被覆盖
 */
function buildQuery(event, now) {
  const conditions = [{ isDelete: _.neq(1) }]

  // vipLevel 筛选
  if (event.vipLevel === 'none') {
    // 免费用户：vipLevel 不存在 / 'none' / 已过期
    conditions.push(_.or([
      { vipLevel: _.exists(false) },
      { vipLevel: 'none' },
      { vipExpireAt: _.lt(now) }
    ]))
  } else if (event.vipLevel === 'normal' || event.vipLevel === 'premium') {
    // 有效会员：等级匹配 + 未过期
    conditions.push({ vipLevel: event.vipLevel })
    conditions.push({ vipExpireAt: _.gte(now) })
  }
  // 'all' 或未传：不附加 vipLevel 条件

  // 到期日区间筛选
  if (event.expireStartAt) {
    conditions.push({ vipExpireAt: _.gte(Number(event.expireStartAt)) })
  }
  if (event.expireEndAt) {
    conditions.push({ vipExpireAt: _.lte(Number(event.expireEndAt)) })
  }

  // 工具包永久权益
  if (event.toolkitPerpetual === 'yes') {
    conditions.push({ toolkitPerpetual: true })
  } else if (event.toolkitPerpetual === 'no') {
    conditions.push(_.or([
      { toolkitPerpetual: _.exists(false) },
      { toolkitPerpetual: false }
    ]))
  }

  // 关键字模糊匹配（4 字段 OR）
  if (event.keyword) {
    const regex = db.RegExp({ regexp: escapeRegExp(event.keyword), options: 'i' })
    conditions.push(_.or([
      { nickname: regex },
      { phoneNumber: regex },
      { _openid: regex },
      { inviteCode: regex }
    ]))
  }

  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

/**
 * 批量加载 admin 昵称
 */
async function batchLoadAdmins(adminIds) {
  const map = {}
  if (!adminIds || adminIds.length === 0) return map
  const uniqIds = [...new Set(adminIds.filter(Boolean))]
  if (uniqIds.length === 0) return map

  // 分批查询，避免 _.in 数组过大
  const BATCH = 50
  for (let i = 0; i < uniqIds.length; i += BATCH) {
    const slice = uniqIds.slice(i, i + BATCH)
    try {
      const res = await db.collection('admin_accounts')
        .where({ _id: _.in(slice) })
        .field({ _id: true, nickname: true, username: true })
        .get()
      res.data.forEach(a => {
        map[a._id] = { _id: a._id, nickname: a.nickname || a.username || a._id }
      })
    } catch (e) {
      console.warn('[admin_membership_list] 加载 admin_accounts 失败:', e.message)
    }
  }
  return map
}

/**
 * 装饰单个用户文档为 MemberProfile
 */
function decorate(u, adminMap, now) {
  const vipLevel = u.vipLevel || 'none'
  const vipExpireAt = u.vipExpireAt || 0
  const isMember = vipLevel !== 'none' && vipExpireAt > 0
  const expired = isMember && vipExpireAt < now
  const remainingMs = vipExpireAt > now ? vipExpireAt - now : 0
  const remainingDays = remainingMs > 0 ? Math.ceil(remainingMs / ONE_DAY_MS) : 0
  const isExpiringSoon = !expired && remainingDays > 0 && remainingDays <= SOON_EXPIRE_DAYS

  return {
    _id: u._id,
    _openid: u._openid || '',
    nickname: u.nickname || '未设置',
    phoneNumber: u.phoneNumber || '',
    avatarUrl: u.avatarUrl || '',
    email: u.email || '',
    createdAt: Number(u.createdAt) || 0,

    // 会员核心
    vipLevel,
    vipExpireAt: vipExpireAt || undefined,
    vipUpdatedAt: u.vipUpdatedAt || undefined,
    vipStartedAt: u.vipStartedAt || undefined,
    remainingDays,
    isExpiringSoon,
    isExpired: !!expired,

    // 权益与邀请
    toolkitPerpetual: !!u.toolkitPerpetual,
    inviteCode: u.inviteCode || '',
    inviteStats: u.inviteStats || { invitedCount: 0, trialDaysGranted: 0 },

    // 审计
    vipGrantedBy: u.vipGrantedBy || undefined,
    vipGrantedAt: u.vipGrantedAt || undefined,
    vipGrantReason: u.vipGrantReason || undefined,
    grantedByAdmin: u.vipGrantedBy ? (adminMap[u.vipGrantedBy] || { _id: u.vipGrantedBy, nickname: u.vipGrantedBy }) : undefined,
    vipRevokedBy: u.vipRevokedBy || undefined,
    vipRevokedAt: u.vipRevokedAt || undefined,
    vipRevokeReason: u.vipRevokeReason || undefined,
    revokedByAdmin: u.vipRevokedBy ? (adminMap[u.vipRevokedBy] || { _id: u.vipRevokedBy, nickname: u.vipRevokedBy }) : undefined,
    vipBatchId: u.vipBatchId || undefined
  }
}

/**
 * 头部 5 项统计聚合
 * 与列表筛选条件无关，永远展示全局统计
 */
async function loadStats(now) {
  const col = db.collection('users')
  const baseAlive = { isDelete: _.neq(1) }
  const [t, n, p, tk, soon] = await Promise.all([
    col.where({ ...baseAlive, vipLevel: _.in(['normal', 'premium']), vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, vipLevel: 'normal', vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, vipLevel: 'premium', vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, toolkitPerpetual: true }).count(),
    col.where({ ...baseAlive, vipExpireAt: _.gte(now).and(_.lte(now + SOON_EXPIRE_DAYS * ONE_DAY_MS)) }).count()
  ])
  return {
    total: t.total || 0,
    normal: n.total || 0,
    premium: p.total || 0,
    toolkitPerpetual: tk.total || 0,
    expiringSoon: soon.total || 0
  }
}

exports.main = async (event) => {
  try {
    // 1. 鉴权
    const auth = await requireAdmin(db, _)
    if (!auth.ok) {
      console.log('[admin_membership_list] 鉴权失败:', auth.errorCode)
      return resp(false, mapAuthErrorCode(auth.errorCode), null, getErrorMessage(auth.errorCode))
    }

    const now = Date.now()
    const pageNum = clamp(Number(event.pageNum) || 1, 1, 9999)
    const pageSize = clamp(Number(event.pageSize) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    // 2. 构造查询条件
    const where = buildQuery(event || {}, now)

    // 3. 并行查询：列表 + 总数 + 全局统计
    const col = db.collection('users')
    const [countRes, dataRes, stats] = await Promise.all([
      col.where(where).count(),
      col.where(where)
        .orderBy('vipExpireAt', 'desc')
        .orderBy('createdAt', 'desc')
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .get(),
      loadStats(now)
    ])

    // 4. 批量装饰审计 admin 昵称
    const adminIds = []
    dataRes.data.forEach(u => {
      if (u.vipGrantedBy) adminIds.push(u.vipGrantedBy)
      if (u.vipRevokedBy) adminIds.push(u.vipRevokedBy)
    })
    const adminMap = await batchLoadAdmins(adminIds)

    // 5. decorate
    const list = dataRes.data.map(u => decorate(u, adminMap, now))

    return resp(true, 'OK', {
      data: list,
      total: countRes.total || 0,
      stats,
      pageNum,
      pageSize
    })
  } catch (err) {
    console.error('[admin_membership_list] 顶层异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '查询失败')
  }
}
