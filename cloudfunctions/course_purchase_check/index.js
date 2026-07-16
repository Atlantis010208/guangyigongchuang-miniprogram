const cloud = require('wx-server-sdk')
const { resolveIdentity } = require('./common/identity')
const { isAdmin } = require('./common/permissions')
const { ok, fail, fromError } = require('./common/response')
const phoneUtils = require('./common/phone')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const PAID_STATUS = ['paid', 'completed']
const WHITELIST_STATUS = ['activated', 'active', 'valid']

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value, fallback) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

// 当前调用者的全部身份标识（兼容小程序 OPENID 与 Web Auth）
function identityValues(identity) {
  const user = identity && identity.user ? identity.user : {}
  return [
    identity && identity.userId,
    identity && identity.openid,
    identity && identity.webUid,
    user._id,
    user.userId,
    user._openid,
    user.openid,
    user.webUid,
    user.webCustomUserId,
  ].filter((item, index, arr) => typeof item === 'string' && item && arr.indexOf(item) === index)
}

function userPhone(identity) {
  const user = identity && identity.user ? identity.user : {}
  const raw = user.purePhoneNumber || user.phoneNumber || user.phone || ''
  return typeof raw === 'string' ? phoneUtils.normalizePhone(raw) : ''
}

function userPhoneVariants(identity) {
  const user = identity && identity.user ? identity.user : {}
  return phoneUtils.generatePhoneMatchList(user.phoneNumber || user.phone || '', user.purePhoneNumber || '', user.countryCode || '')
}

function notPurchasedResult(courseIds, isBatch) {
  if (isBatch) {
    const result = {}
    for (const id of courseIds) result[id] = { isPurchased: false, progress: 0 }
    return ok(result, { message: '批量检查购买状态成功' })
  }
  return ok({ isPurchased: false, progress: 0 }, { message: '检查购买状态成功' })
}

function orderItems(order) {
  if (order.params && Array.isArray(order.params.items)) return order.params.items
  if (Array.isArray(order.items)) return order.items
  return []
}

exports.main = async (event = {}) => {
  try {
    const courseId = readString(event.courseId)
    const courseIds = Array.isArray(event.courseIds) ? event.courseIds.filter((id) => typeof id === 'string' && id) : null
    const isBatch = Boolean(courseIds)
    const idsToCheck = isBatch ? courseIds : (courseId ? [courseId] : [])

    if (!idsToCheck.length) return fail('INVALID_PARAMS', '缺少课程ID参数')

    // 公开可调用：未登录返回未购买，不报错
    const resolved = await resolveIdentity()
    if (!resolved || !resolved.ok || !resolved.identity || !resolved.identity.userId) {
      return notPurchasedResult(idsToCheck, isBatch)
    }
    const identity = resolved.identity
    const ids = identityValues(identity)
    if (!ids.length) return notPurchasedResult(idsToCheck, isBatch)

    const phone = userPhone(identity)
    const phoneVariants = userPhoneVariants(identity)
    if (phone && !phoneVariants.includes(phone)) phoneVariants.push(phone)
    const queries = [
      db.collection('orders')
        .where({ userId: _.in(ids), status: _.in(PAID_STATUS), isDelete: _.neq(1) })
        .limit(100)
        .get()
        .catch(() => ({ data: [] })),
      db.collection('course_progress')
        .where({ userId: _.in(ids) })
        .limit(100)
        .get()
        .catch(() => ({ data: [] })),
    ]
    if (phoneVariants.length) {
      queries.push(
        db.collection('course_whitelist')
          .where({ phone: _.in(phoneVariants), status: _.in(WHITELIST_STATUS) })
          .limit(100)
          .get()
          .catch(() => ({ data: [] })),
      )
    }

    const [ordersRes, progressRes, whitelistRes] = await Promise.all(queries)

    // 学习进度映射
    const progressMap = {}
    for (const record of progressRes.data || []) {
      if (!record.courseId) continue
      progressMap[record.courseId] = {
        progress: readNumber(record.progress, 0),
        completedLessons: Array.isArray(record.completedLessons) ? record.completedLessons : [],
        totalLessons: readNumber(record.totalLessons, 0),
        lastLessonId: readString(record.lastLessonId),
      }
    }

    // 已购买映射（订单）
    const purchasedMap = {}
    const productLinkCandidates = []
    for (const order of ordersRes.data || []) {
      if (order.isDelete === 1) continue
      const items = orderItems(order)
      for (const item of items) {
        const itemCourseId = item.courseId || item.id || item.productId
        if (item.courseId || item.category === 'course' || item.type === 'course' || order.category === 'course') {
          if (itemCourseId) {
            purchasedMap[itemCourseId] = {
              isPurchased: true,
              purchasedAt: order.paidAt || order.createdAt || 0,
              orderId: order.orderNo || order._id,
              ...(progressMap[itemCourseId] || { progress: 0 }),
            }
          }
        }
        const candidateIds = [item.id, item.productId].filter(Boolean)
        if (candidateIds.length) productLinkCandidates.push({ ids: candidateIds, order })
      }
      if (!items.length && order.courseId) {
        purchasedMap[order.courseId] = {
          isPurchased: true,
          purchasedAt: order.paidAt || order.createdAt || 0,
          orderId: order.orderNo || order._id,
          ...(progressMap[order.courseId] || { progress: 0 }),
        }
      }
    }

    // 商城虚拟商品 -> 课程关联（products.courseId）
    if (productLinkCandidates.length) {
      try {
        const allIds = [...new Set(productLinkCandidates.reduce((acc, e) => acc.concat(e.ids), []))]
        const productRes = await db.collection('products')
          .where(_.or([{ _id: _.in(allIds) }, { productId: _.in(allIds) }]))
          .field({ _id: true, productId: true, courseId: true })
          .get()
        const productCourseMap = {}
        for (const p of productRes.data || []) {
          if (!p.courseId) continue
          if (p._id) productCourseMap[p._id] = p.courseId
          if (p.productId) productCourseMap[p.productId] = p.courseId
        }
        for (const entry of productLinkCandidates) {
          const linkedCourseId = entry.ids.map((id) => productCourseMap[id]).find(Boolean)
          if (linkedCourseId && !purchasedMap[linkedCourseId]) {
            purchasedMap[linkedCourseId] = {
              isPurchased: true,
              purchasedAt: entry.order.paidAt || entry.order.createdAt || 0,
              orderId: entry.order.orderNo || entry.order._id,
              source: 'product_link',
              ...(progressMap[linkedCourseId] || { progress: 0 }),
            }
          }
        }
      } catch (linkErr) {
        console.warn('[course_purchase_check] product link resolve failed:', linkErr && linkErr.message)
      }
    }

    // 白名单兜底
    if (whitelistRes && Array.isArray(whitelistRes.data)) {
      for (const wl of whitelistRes.data) {
        const wlCourseId = wl.courseId
        if (wlCourseId && !purchasedMap[wlCourseId]) {
          purchasedMap[wlCourseId] = {
            isPurchased: true,
            purchasedAt: wl.activatedAt || wl.createdAt || 0,
            orderId: wl.orderId || null,
            source: 'whitelist',
            ...(progressMap[wlCourseId] || { progress: 0 }),
          }
        }
      }
    }

    // 注意：不再让管理员自动视为已购买课程。
    // 看课的真正鉴权在 course_videos（无管理员免购逻辑），
    // 若此处给管理员放行，会出现“详情页显示已购买、点击观看却提示未购买”的不一致。
    // 管理员如需预览课程，请走白名单或正常下单。
    const checkPurchased = (targetId) => {
      if (purchasedMap[targetId]) return purchasedMap[targetId]
      if (progressMap[targetId]) return { isPurchased: false, ...progressMap[targetId] }
      return { isPurchased: false, progress: 0 }
    }

    if (isBatch) {
      const result = {}
      for (const id of idsToCheck) result[id] = checkPurchased(id)
      return ok(result, { message: '批量检查购买状态成功' })
    }
    return ok(checkPurchased(courseId), { message: '检查购买状态成功' })
  } catch (error) {
    console.error('[course_purchase_check] failed:', error)
    return fromError(error, 'SERVER_ERROR')
  }
}
