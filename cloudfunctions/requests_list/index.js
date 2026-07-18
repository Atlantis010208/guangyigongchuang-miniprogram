const cloud = require('wx-server-sdk')
const { resolveIdentity } = require('./common/identity')
const { ok, fail, fromError } = require('./common/response')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value, fallback) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function uniqueStrings(values) {
  return values.filter((item, index, arr) => typeof item === 'string' && item && arr.indexOf(item) === index)
}

function identityIds(identity) {
  const user = identity && identity.user ? identity.user : {}
  return uniqueStrings([
    identity && identity.userId,
    identity && identity.webUid,
    identity && identity.openid,
    user._id,
    user.userId,
    user.webUid,
    user.webCustomUserId,
    user._openid,
    user.openid,
  ])
}

function ownerBranches(identity) {
  return identityIds(identity).flatMap((id) => [
    { ownerId: id },
    { userId: id },
    { webUid: id },
    { _openid: id },
    { openid: id },
  ])
}

function normalizeStatus(value) {
  const status = readString(value)
  if (status === 'matched' || status === 'processing' || status === 'completed' || status === 'canceled') return status
  if (status === 'submitted' || status === 'published' || status === 'created') return 'pending'
  return 'pending'
}

function formatDate(value) {
  const timestamp = readNumber(value, 0)
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

function formatArea(value) {
  const text = readString(value)
  if (text) return text
  const num = readNumber(value, 0)
  return num ? `${num}㎡` : ''
}

function formatBudget(item) {
  const budget = readString(item.budget)
  if (budget) return budget

  const min = readNumber(item.budgetMin, 0)
  const max = readNumber(item.budgetMax, 0)
  if (min && max) return `¥${min} - ¥${max}`
  if (min) return `¥${min}+`
  if (max) return `¥${max}`
  return ''
}

function serializeRequest(item) {
  const id = readString(item._id) || readString(item.id) || readString(item.requestId) || readString(item.orderNo)
  const createdAt = readNumber(item.createdAt, 0)

  return {
    id,
    requestId: readString(item.requestId) || id,
    orderNo: readString(item.orderNo),
    title: readString(item.title) || readString(item.orderNo) || id,
    status: normalizeStatus(item.status),
    date: readString(item.date) || formatDate(createdAt),
    createdAt,
    updatedAt: readNumber(item.updatedAt, createdAt),
    spaceType: readString(item.spaceType) || readString(item.houseType) || readString(item.scene),
    area: formatArea(item.area),
    city: readString(item.city) || readString(item.location),
    budget: formatBudget(item),
    budgetMin: readNumber(item.budgetMin, 0),
    budgetMax: readNumber(item.budgetMax, 0),
    description: readString(item.description) || readString(item.remark),
    requirements: Array.isArray(item.requirements) ? item.requirements.filter((value) => typeof value === 'string') : [],
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    designerId: readString(item.designerId),
    projectId: readString(item.projectId),
  }
}

async function requireIdentity() {
  const resolved = await resolveIdentity()
  if (!resolved.ok) {
    return {
      ok: false,
      response: fail(resolved.code || 'UNAUTHENTICATED', resolved.errorMessage || 'Unauthenticated'),
    }
  }

  return { ok: true, identity: resolved.identity }
}

/**
 * 小程序端兼容契约（旧版）。
 * pages/cart 的 fetchRequestsFromDB / reloadRequests 依赖：
 *   { success: true, data: [requests 集合原始文档...], total }
 * 由客户端自行按 category/isDelete 过滤并做字段映射。
 * Web 端继续使用下方新的 { items, list, pagination } 契约，保持不变。
 */
async function legacyRequestsForMiniprogram(event, identity) {
  try {
    const ids = uniqueStrings([event && event.userId, ...identityIds(identity)])
    if (!ids.length) {
      return { success: false, message: '缺少用户ID', data: [] }
    }

    const branches = ids.flatMap((id) => [
      { userId: id },
      { _openid: id },
      { openid: id },
      { ownerId: id },
      { webUid: id },
    ])

    const res = await db.collection('requests')
      .where(_.or(branches))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const data = res.data || []
    console.log('[requests_list] miniprogram legacy ok', { total: data.length })
    return { success: true, data, total: data.length }
  } catch (error) {
    console.error('[requests_list] miniprogram legacy failed:', error)
    return { success: false, message: error && error.message ? error.message : '查询失败', data: [] }
  }
}

exports.main = async (event = {}) => {
  const identityResult = await requireIdentity()
  if (!identityResult.ok) return identityResult.response

  // 小程序端走旧契约（原始文档数组），Web 端走下方新契约
  if (identityResult.identity.platform === 'wechat_miniprogram') {
    return legacyRequestsForMiniprogram(event, identityResult.identity)
  }

  try {
    const branches = ownerBranches(identityResult.identity)
    if (!branches.length) return fail('UNAUTHENTICATED', 'Unauthenticated')

    const requestedStatus = readString(event.status) || 'all'
    const offset = Math.max(0, Math.round(readNumber(event.offset, 0)))
    const limit = Math.min(100, Math.max(1, Math.round(readNumber(event.limit, 20))))

    const res = await db.collection('requests')
      .where({
        isDelete: _.neq(1),
        isDeleted: _.neq(true),
        _: _.or(branches),
      })
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const allItems = (res.data || []).map(serializeRequest)
    const filteredItems = requestedStatus === 'all'
      ? allItems
      : allItems.filter((item) => item.status === requestedStatus)
    const items = filteredItems.slice(offset, offset + limit)
    const pagination = {
      limit,
      offset,
      hasMore: offset + items.length < filteredItems.length,
    }

    console.log('[requests_list] list ok', {
      platform: identityResult.identity.platform,
      userId: identityResult.identity.userId,
      total: filteredItems.length,
      returned: items.length,
    })

    return ok({
      items,
      list: items,
      total: filteredItems.length,
      pagination,
    }, {
      total: filteredItems.length,
      pagination,
    })
  } catch (error) {
    console.error('[requests_list] failed:', error)
    return fromError(error, 'REQUESTS_LIST_ERROR')
  }
}
