/**
 * 云函数：admin_membership_stats
 *
 * 职责：后台管理端「会员数据看板」聚合查询
 *   - 会员规模（当前快照）
 *   - 增长指标（区间内 新增/续费/流失）
 *   - SKU 销售（区间内 普通/高级 订单数与金额）
 *   - 邀请试用（区间内 触发奖励数与赠送天数）
 *
 * 入参（event）：
 *   - range: 'today' | 'week' | 'month' | 'quarter' | 'custom'  默认 'month'
 *   - startAt?: number  range='custom' 时必填
 *   - endAt?: number    range='custom' 时必填
 *
 * 鉴权：admin_auth.requireAdmin
 *
 * 返回：CloudResponse<MembershipStats>
 *
 * 错误码：UNAUTHORIZED / FORBIDDEN / INVALID_RANGE / SERVER_ERROR
 *
 * 重要：order 集合实际无 skuCode 字段，使用 params.items.0.targetLevel 做分组
 *       paidAt 字段为 Date 对象（而非 number），需 getTime() 兼容
 */

const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ONE_DAY_MS = 24 * 60 * 60 * 1000

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
 * 解析时间范围
 */
function resolveRange(range, startAtRaw, endAtRaw) {
  const now = Date.now()
  const d = new Date()
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

  switch (range) {
    case 'today':
      return { startAt: startOfToday, endAt: now, label: '本日' }
    case 'week':
      return { startAt: startOfToday - 6 * ONE_DAY_MS, endAt: now, label: '本周' }
    case 'month':
      return { startAt: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), endAt: now, label: '本月' }
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3)
      return { startAt: new Date(d.getFullYear(), q * 3, 1).getTime(), endAt: now, label: '本季度' }
    }
    case 'custom': {
      const startAt = Number(startAtRaw)
      const endAt = Number(endAtRaw)
      if (!startAt || !endAt || startAt > endAt) return null
      return { startAt, endAt, label: '自定义' }
    }
    default:
      return null
  }
}

/**
 * 兼容多种 paidAt / grantedAt 时间字段格式
 */
function toMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'object' && v.$date) return Number(v.$date)
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? 0 : n
}

/**
 * 会员规模（当前快照，与时间范围无关）
 */
async function queryScale(now) {
  const col = db.collection('users')
  const baseAlive = { isDelete: _.neq(1) }
  const [t, n, p, tk] = await Promise.all([
    col.where({ ...baseAlive, vipLevel: _.in(['normal', 'premium']), vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, vipLevel: 'normal', vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, vipLevel: 'premium', vipExpireAt: _.gte(now) }).count(),
    col.where({ ...baseAlive, toolkitPerpetual: true }).count()
  ])
  return {
    total: t.total || 0,
    normal: n.total || 0,
    premium: p.total || 0,
    toolkitPerpetual: tk.total || 0
  }
}

/**
 * 增长指标（区间内）
 *   newAdded：vipStartedAt 落在区间内
 *   renewed：vipUpdatedAt 落在区间内 且 vipStartedAt < startAt（非新增）
 *   churned：vipExpireAt 落在区间内 且 vipExpireAt < now（确实流失）
 */
async function queryGrowth({ startAt, endAt }, now) {
  const col = db.collection('users')
  const baseAlive = { isDelete: _.neq(1) }

  const [addedRes, renewedRes, churnedRes] = await Promise.all([
    col.where({ ...baseAlive, vipStartedAt: _.gte(startAt).and(_.lte(endAt)) }).count(),
    col.where({
      ...baseAlive,
      vipUpdatedAt: _.gte(startAt).and(_.lte(endAt)),
      vipStartedAt: _.lt(startAt)
    }).count(),
    col.where({
      ...baseAlive,
      vipExpireAt: _.gte(startAt).and(_.lte(endAt)).and(_.lt(now))
    }).count()
  ])

  return {
    newAdded: addedRes.total || 0,
    renewed: renewedRes.total || 0,
    churned: churnedRes.total || 0
  }
}

/**
 * SKU 销售（区间内）
 *   - 用 params.items.0.targetLevel 做分组
 *   - 用 params.totalAmount 求和
 *   - paidAt 兼容 Date / number / { $date } 三种
 *
 * 由于 paidAt 在 NoSQL 中可能为 Date 对象，无法用 _.gte()(number) 直接比较；
 * 改为按 createdAt 区间过滤（订单创建即视为销售时点的近似），再在内存按 paidAt 二次过滤
 */
async function querySales({ startAt, endAt }) {
  const col = db.collection('orders')
  // 拉取区间内创建的所有 paid 会员订单（数据量本期较小，<1000 行）
  const res = await col.where({
    isDelete: _.neq(1),
    category: 'membership',
    status: 'paid',
    createdAt: _.gte(startAt).and(_.lte(endAt + ONE_DAY_MS)) // 多覆盖 1 天，避免 paidAt > createdAt 跨日丢失
  }).limit(1000).get()

  let normalCount = 0
  let normalAmount = 0
  let premiumCount = 0
  let premiumAmount = 0

  for (const o of res.data) {
    // 按 paidAt 二次过滤；若无 paidAt 则用 createdAt
    const t = toMs(o.paidAt) || Number(o.createdAt) || 0
    if (t < startAt || t > endAt) continue

    const item = o.params && o.params.items && o.params.items[0]
    const level = item && item.targetLevel
    const amount = (o.params && Number(o.params.totalAmount)) || Number(o.paymentAmount) / 100 || 0

    if (level === 'normal') {
      normalCount += 1
      normalAmount += amount
    } else if (level === 'premium') {
      premiumCount += 1
      premiumAmount += amount
    } else {
      // 兜底：根据 skuId 关键字判断
      const skuId = String(o.skuId || (item && item.skuId) || '').toLowerCase()
      if (skuId.includes('premium')) {
        premiumCount += 1
        premiumAmount += amount
      } else {
        // 默认归为普通
        normalCount += 1
        normalAmount += amount
      }
    }
  }

  const totalCount = normalCount + premiumCount
  const totalAmount = Math.round((normalAmount + premiumAmount) * 100) / 100
  const avgOrderAmount = totalCount > 0
    ? Math.round((totalAmount / totalCount) * 100) / 100
    : 0

  return {
    normalCount,
    normalAmount: Math.round(normalAmount * 100) / 100,
    premiumCount,
    premiumAmount: Math.round(premiumAmount * 100) / 100,
    totalAmount,
    avgOrderAmount
  }
}

/**
 * 邀请试用指标（区间内）
 *   - rewardGranted=true 且 grantedAt 落在区间内
 */
async function queryInvitation({ startAt, endAt }) {
  const col = db.collection('member_invitations')
  const res = await col.where({
    rewardGranted: true,
    grantedAt: _.gte(startAt).and(_.lte(endAt))
  }).limit(1000).get()

  const total = res.data.reduce((s, r) => s + (Number(r.rewardDays) || 0), 0)
  return {
    rewardGrantedCount: res.data.length,
    trialDaysTotal: total
  }
}

exports.main = async (event) => {
  try {
    // 1. 鉴权
    const auth = await requireAdmin(db, _)
    if (!auth.ok) {
      console.log('[admin_membership_stats] 鉴权失败:', auth.errorCode)
      return resp(false, mapAuthErrorCode(auth.errorCode), null, getErrorMessage(auth.errorCode))
    }

    const range = resolveRange(event.range || 'month', event.startAt, event.endAt)
    if (!range) {
      return resp(false, 'INVALID_RANGE', null, '时间范围参数缺失或非法')
    }
    const now = Date.now()

    // 2. 并行 4 组聚合
    const [scale, growth, sales, invitation] = await Promise.all([
      queryScale(now),
      queryGrowth(range, now),
      querySales(range),
      queryInvitation(range)
    ])

    return resp(true, 'OK', { range, scale, growth, sales, invitation })
  } catch (err) {
    console.error('[admin_membership_stats] 顶层异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '查询失败')
  }
}
