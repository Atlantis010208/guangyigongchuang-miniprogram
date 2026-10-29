const cloud = require('wx-server-sdk')
const { resolveIdentity } = require('./common/identity')
const { requireAuthenticated } = require('./common/permissions')
const { ok, fail, fromError } = require('./common/response')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_STATUS = new Set(['all', 'pending', 'paid', 'shipped', 'completed', 'after_sales'])
const VALID_CATEGORY = new Set(['all', 'course', 'product'])
const PAID_STATUSES = new Set(['paid', 'completed'])
const SHOP_ORDER_CATEGORIES = new Set(['course', 'toolkit', 'mall', 'product', 'goods'])
const REQUEST_ORDER_CATEGORIES = new Set(['publish', 'design', 'design_request', 'request', 'lighting_collection'])
const MAX_LIMIT = 100

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '')
    const match = normalized.match(/-?\d+(?:\.\d+)?/)
    if (match) {
      const number = Number(match[0])
      if (Number.isFinite(number)) return number
    }
  }
  return fallback
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function readObject(value) {
  return isObject(value) ? value : {}
}

function readMoney(value) {
  const number = readNumber(value, NaN)
  if (!Number.isFinite(number)) return null
  return Math.round(number * 100) / 100
}

function readCentMoney(value) {
  const number = readNumber(value, NaN)
  if (!Number.isFinite(number)) return null
  return Math.round(number) / 100
}

function firstPositiveMoney(...values) {
  for (const value of values) {
    const amount = readMoney(value)
    if (amount !== null && amount > 0) return amount
  }
  return null
}

function firstMoney(...values) {
  const positive = firstPositiveMoney(...values)
  if (positive !== null) return positive

  for (const value of values) {
    const amount = readMoney(value)
    if (amount !== null) return amount
  }

  return 0
}

function itemQty(item) {
  return readNumber(item.qty, readNumber(item.quantity, readNumber(item.count, 1))) || 1
}

function itemUnitPrice(item) {
  return firstMoney(
    item.price,
    item.unitPrice,
    item.salePrice,
    item.amount,
    item.payAmount,
    item.totalAmount,
  )
}

function itemKind(item, order) {
  const value = readString(item.category) || readString(item.type) || readString(order.category)
  const id = readString(item.id) || readString(item.productId) || readString(item.courseId) || readString(item.toolkitId)

  if (value === 'course' || readString(item.courseId) || id.startsWith('CO_')) return 'course'
  if (value === 'toolkit' || readString(item.toolkitId) || id.startsWith('TK_')) return 'toolkit'
  return 'product'
}

function lookupKeysForItem(item, order) {
  return [
    item.courseId,
    item.toolkitId,
    item.productId,
    item.skuId,
    item.id,
    order.courseId,
    order.toolkitId,
    order.productId,
  ].filter((value, index, arr) => typeof value === 'string' && value && arr.indexOf(value) === index)
}

function catalogPrice(record) {
  if (!record) return 0
  return firstPositiveMoney(record.price, record.salePrice, record.amount, record.totalAmount, record.payAmount) || 0
}

function catalogTitle(record) {
  if (!record) return ''
  return readString(record.title) || readString(record.name)
}

function catalogImage(record) {
  if (!record) return ''
  return firstImage(
    record.coverUrl,
    record.cover,
    record.coverImage,
    record.image,
    record.thumbnail,
    record.poster,
    record.swiperImages,
    record.images,
  )
}

function catalogRecordForItem(item, order, catalogs) {
  if (!catalogs) return null

  const kind = itemKind(item, order)
  const keys = lookupKeysForItem(item, order)

  for (const key of keys) {
    if (kind === 'course' && catalogs.courses[key]) return catalogs.courses[key]
    if (kind === 'toolkit' && catalogs.toolkits[key]) return catalogs.toolkits[key]
    if (catalogs.products[key]) return catalogs.products[key]
    if (catalogs.toolkits[key]) return catalogs.toolkits[key]
    if (catalogs.courses[key]) return catalogs.courses[key]
  }

  return null
}

function itemUnitPriceWithCatalog(item, order, catalogs) {
  const explicitPrice = itemUnitPrice(item)
  if (explicitPrice > 0) return explicitPrice
  return catalogPrice(catalogRecordForItem(item, order, catalogs))
}

function itemLineAmount(item, order, catalogs) {
  const explicitTotal = firstPositiveMoney(
    item.lineAmount,
    item.subtotal,
    item.subTotal,
    item.total,
    item.totalAmount,
    item.payAmount,
  )
  if (explicitTotal !== null) return explicitTotal
  return Math.round(itemUnitPriceWithCatalog(item, order, catalogs) * itemQty(item) * 100) / 100
}

function itemsAmount(items, order, catalogs) {
  let hasAmount = false
  let total = 0

  for (const item of items) {
    const lineAmount = itemLineAmount(item, order, catalogs)
    if (lineAmount > 0) hasAmount = true
    total += lineAmount
  }

  return hasAmount ? Math.round(total * 100) / 100 : null
}

function paymentLikeObject(order) {
  return readObject(order.payment || order.pay || order.payInfo || order.transaction || order.transactionInfo || order.payResult)
}

function centAmountCandidates(order, params, payment) {
  return [
    order.totalFee,
    order.total_fee,
    order.cashFee,
    order.cash_fee,
    order.refundFee,
    order.refund_fee,
    params.totalFee,
    params.total_fee,
    params.cashFee,
    params.cash_fee,
    payment.totalFee,
    payment.total_fee,
    payment.cashFee,
    payment.cash_fee,
  ].map(readCentMoney).filter((amount) => amount !== null)
}

function inferDesignOrderAmount(order) {
  const params = readObject(order.params)
  const category = readString(order.category)
  if (category !== 'publish' && category !== 'design' && category !== 'design_request') return null

  const area = readNumber(params.area, readNumber(order.area, 0))
  const unitPrice = readNumber(
    params.budget,
    readNumber(params.unitPrice, readNumber(order.budget, readNumber(order.unitPrice, 0))),
  )

  if (area <= 0 || unitPrice <= 0) return null
  return Math.round(area * unitPrice * 100) / 100
}

function orderAmountCandidates(order, rawItems, catalogs) {
  const params = readObject(order.params)
  const payment = paymentLikeObject(order)
  const itemAmount = itemsAmount(rawItems, order, catalogs)
  const inferredDesignAmount = inferDesignOrderAmount(order)

  return {
    pay: [
      order.payAmount,
      order.actualAmount,
      order.paidAmount,
      params.payAmount,
      params.actualAmount,
      params.paidAmount,
      payment.payAmount,
      payment.actualAmount,
      payment.paidAmount,
      payment.amount,
      ...centAmountCandidates(order, params, payment),
      order.totalAmount,
      params.totalAmount,
      itemAmount,
      inferredDesignAmount,
    ],
    total: [
      order.totalAmount,
      order.orderAmount,
      order.amount,
      order.price,
      params.totalAmount,
      params.orderAmount,
      params.amount,
      params.price,
      payment.totalAmount,
      payment.orderAmount,
      ...centAmountCandidates(order, params, payment),
      itemAmount,
      inferredDesignAmount,
    ],
  }
}

function normalizeStatus(value) {
  return VALID_STATUS.has(value) ? value : 'all'
}

function normalizeCategory(value) {
  return VALID_CATEGORY.has(value) ? value : 'all'
}

function normalizeLimit(value) {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number < 1) return 50
  return Math.min(number, MAX_LIMIT)
}

function normalizeOffset(value) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : 0
}

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

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeOrderStatus(status) {
  const input = readString(status)
  if (input === 'pending_payment' || input === 'unpaid') return 'pending'
  if (input === 'refunding' || input === 'refunded' || input === 'afterSale' || input === '退款申请中' || input === '已退款') return 'after_sales'
  if (input === '支付成功' || input === '已支付') return 'paid'
  if (input === '已完成') return 'completed'
  if (VALID_STATUS.has(input) && input !== 'all') return input
  return input || 'pending'
}

function itemCategory(item, order) {
  if (itemKind(item, order) === 'course') return 'course'
  return 'product'
}

function imageFromItem(item) {
  return readString(item.image)
    || readString(item.cover)
    || readString(item.coverUrl)
    || readString(item.thumbnail)
    || readString(item.pic)
}

function imageCandidate(value) {
  if (typeof value !== 'string') return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('cloud://')) return value
  return ''
}

function readImageFromObject(value) {
  if (!value || typeof value !== 'object') return ''
  return imageCandidate(value.url)
    || imageCandidate(value.tempFileURL)
    || imageCandidate(value.fileID)
    || imageCandidate(value.fileId)
    || imageCandidate(value.downloadUrl)
}

function firstImage(...values) {
  for (const value of values) {
    const direct = imageCandidate(value)
    if (direct) return direct

    const objectImage = readImageFromObject(value)
    if (objectImage) return objectImage

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = imageCandidate(item) || readImageFromObject(item)
        if (nested) return nested
      }
    }
  }

  return ''
}

async function toPublicUrl(value) {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (!value.startsWith('cloud://')) return ''

  try {
    const res = await cloud.getTempFileURL({ fileList: [value] })
    const file = res.fileList && res.fileList[0]
    return file && file.tempFileURL ? file.tempFileURL : ''
  } catch (_) {
    return ''
  }
}

function normalizeItems(order) {
  const rawItems = order.params && Array.isArray(order.params.items)
    ? order.params.items
    : Array.isArray(order.items)
      ? order.items
      : []

  if (!rawItems.length && readString(order.category) === 'publish') {
    const params = readObject(order.params)
    const amount = inferDesignOrderAmount(order)
    return [{
      id: order._id,
      category: 'product',
      type: 'publish',
      name: readString(params.service) || '灯光设计服务',
      spec: [readString(params.space), readString(params.area) ? `${readString(params.area)}m²` : ''].filter(Boolean).join(' / '),
      price: amount === null ? 0 : amount,
      qty: 1,
      image: firstImage(params.images),
    }]
  }

  if (!rawItems.length && (order.courseId || order.productId || order.title || order.name)) {
    return [{
      id: order.courseId || order.productId || order._id,
      courseId: order.courseId,
      productId: order.productId,
      category: order.category,
      type: order.category,
      name: order.title || order.name || order.productName || order.courseTitle,
      price: firstPositiveMoney(order.price, order.totalAmount, order.payAmount) || 0,
      qty: order.quantity || 1,
      image: order.image || order.coverUrl || order.cover,
    }]
  }

  return rawItems
}

function publicOrderItem(item, order, catalogs) {
  const category = itemCategory(item, order)
  const courseId = readString(item.courseId) || (category === 'course' ? readString(item.id) || readString(item.productId) : '')
  const productId = readString(item.productId) || (category !== 'course' ? readString(item.id) : '')
  const id = readString(item.id) || courseId || productId
  const catalog = catalogRecordForItem(item, order, catalogs)

  return {
    id,
    productId,
    courseId,
    type: readString(item.type) || category,
    category,
    name: readString(item.name) || readString(item.title) || readString(item.productName) || readString(item.courseTitle) || catalogTitle(catalog),
    spec: readString(item.spec) || readString(item.skuName) || readString(item.variant) || readString(readObject(item.specs).version),
    image: imageFromItem(item) || catalogImage(catalog),
    price: itemUnitPriceWithCatalog(item, order, catalogs),
    qty: itemQty(item),
  }
}

function publicOrder(order, catalogs) {
  const status = normalizeOrderStatus(order.status)
  const rawItems = normalizeItems(order)
  const items = rawItems.map((item) => publicOrderItem(item, order, catalogs)).filter((item) => item.id || item.name)
  const category = readString(order.category) || (items.some((item) => item.category === 'course') ? 'course' : 'product')
  const amountCandidates = orderAmountCandidates(order, rawItems, catalogs)
  const totalAmount = firstMoney(...amountCandidates.total)
  const payAmount = firstMoney(...amountCandidates.pay, totalAmount)

  return {
    id: readString(order._id) || readString(order.id),
    orderNo: readString(order.orderNo) || readString(order.tradeNo) || readString(order.outTradeNo) || readString(order._id),
    status,
    category,
    createdAt: toTimestamp(order.createdAt),
    paidAt: toTimestamp(order.paidAt),
    updatedAt: toTimestamp(order.updatedAt),
    totalAmount,
    payAmount,
    items,
  }
}

function indexCatalog(records, keys, output) {
  for (const record of records || []) {
    for (const key of keys(record)) {
      if (typeof key === 'string' && key) output[key] = record
    }
  }
}

async function readCatalogs(rawOrders) {
  const courseIds = []
  const toolkitIds = []
  const productIds = []

  for (const order of rawOrders) {
    for (const item of normalizeItems(order)) {
      const kind = itemKind(item, order)
      const keys = lookupKeysForItem(item, order)
      const target = kind === 'course' ? courseIds : kind === 'toolkit' ? toolkitIds : productIds
      for (const key of keys) {
        if (!target.includes(key)) target.push(key)
      }
    }
  }

  const [coursesRes, toolkitsRes, productsRes] = await Promise.all([
    courseIds.length
      ? db.collection('courses')
        .where(_.or([
          { courseId: _.in(courseIds) },
          { id: _.in(courseIds) },
          { _id: _.in(courseIds) },
        ]))
        .field({
          _id: true,
          id: true,
          courseId: true,
          title: true,
          name: true,
          price: true,
          originalPrice: true,
          coverUrl: true,
          cover: true,
          coverImage: true,
          image: true,
          thumbnail: true,
          poster: true,
          swiperImages: true,
          images: true,
        })
        .limit(100)
        .get()
        .catch(() => ({ data: [] }))
      : { data: [] },
    toolkitIds.length
      ? db.collection('toolkits')
        .where(_.or([
          { toolkitId: _.in(toolkitIds) },
          { id: _.in(toolkitIds) },
          { _id: _.in(toolkitIds) },
        ]))
        .field({
          _id: true,
          id: true,
          toolkitId: true,
          title: true,
          name: true,
          price: true,
          amount: true,
          coverUrl: true,
          cover: true,
          image: true,
          thumbnail: true,
          poster: true,
          swiperImages: true,
          images: true,
        })
        .limit(100)
        .get()
        .catch(() => ({ data: [] }))
      : { data: [] },
    productIds.length
      ? db.collection('products')
        .where(_.or([
          { productId: _.in(productIds) },
          { id: _.in(productIds) },
          { _id: _.in(productIds) },
        ]))
        .field({
          _id: true,
          id: true,
          productId: true,
          title: true,
          name: true,
          price: true,
          salePrice: true,
          amount: true,
          coverUrl: true,
          cover: true,
          image: true,
          thumbnail: true,
          poster: true,
          swiperImages: true,
          images: true,
        })
        .limit(100)
        .get()
        .catch(() => ({ data: [] }))
      : { data: [] },
  ])

  const catalogs = {
    courses: {},
    toolkits: {},
    products: {},
  }

  indexCatalog(coursesRes.data, (course) => [course._id, course.id, course.courseId], catalogs.courses)
  indexCatalog(toolkitsRes.data, (toolkit) => [toolkit._id, toolkit.id, toolkit.toolkitId], catalogs.toolkits)
  indexCatalog(productsRes.data, (product) => [product._id, product.id, product.productId], catalogs.products)

  return catalogs
}

function isRequestLikeOrder(order) {
  const category = readString(order.category)
  return REQUEST_ORDER_CATEGORIES.has(category)
}

function isShopOrder(order) {
  const category = readString(order.category)
  if (REQUEST_ORDER_CATEGORIES.has(category) || category === 'membership') return false
  if (SHOP_ORDER_CATEGORIES.has(category)) return true

  return normalizeItems(order).some((item) => {
    const kind = itemKind(item, order)
    return kind === 'course' || kind === 'toolkit' || kind === 'product'
  })
}

function courseIdsFromOrders(orders) {
  const ids = []
  for (const order of orders) {
    if (!PAID_STATUSES.has(order.status)) continue
    for (const item of order.items) {
      if (item.category === 'course' && item.courseId) ids.push(item.courseId)
    }
  }
  return [...new Set(ids)]
}

async function readProgress(identity, courseIds) {
  const ids = identityValues(identity)
  if (!ids.length || !courseIds.length) return {}

  const res = await db.collection('course_progress')
    .where({
      userId: _.in(ids),
      courseId: _.in(courseIds),
    })
    .limit(100)
    .get()

  const map = {}
  for (const item of res.data || []) {
    map[item.courseId] = {
      progress: readNumber(item.progress, 0),
      completedLessons: Array.isArray(item.completedLessons) ? item.completedLessons : [],
      totalLessons: readNumber(item.totalLessons, 0),
      lastLessonId: readString(item.lastLessonId),
      updatedAt: toTimestamp(item.updatedAt),
    }
  }
  return map
}

async function readCourseSummaries(courseIds) {
  if (!courseIds.length) return {}

  const res = await db.collection('courses')
    .where({
      courseId: _.in(courseIds),
      isDelete: _.neq(1),
    })
    .field({
      _id: true,
      courseId: true,
      title: true,
      subtitle: true,
      coverUrl: true,
      cover: true,
      coverImage: true,
      image: true,
      thumbnail: true,
      poster: true,
      swiperImages: true,
      images: true,
      lessonCount: true,
    })
    .limit(100)
    .get()

  const map = {}
  for (const course of res.data || []) {
    const id = readString(course.courseId) || readString(course._id)
    const coverUrl = await toPublicUrl(firstImage(
      course.coverUrl,
      course.cover,
      course.coverImage,
      course.image,
      course.thumbnail,
      course.poster,
      course.swiperImages,
      course.images,
    ))
    map[id] = {
      courseId: id,
      title: readString(course.title),
      subtitle: readString(course.subtitle),
      coverUrl,
      lessonCount: readNumber(course.lessonCount, 0),
    }
  }
  return map
}

async function buildAssets(identity, orders) {
  const courseIds = courseIdsFromOrders(orders)
  const [progressMap, courseMap] = await Promise.all([
    readProgress(identity, courseIds),
    readCourseSummaries(courseIds),
  ])

  return {
    courses: courseIds.map((courseId) => ({
      courseId,
      title: courseMap[courseId] ? courseMap[courseId].title : '',
      subtitle: courseMap[courseId] ? courseMap[courseId].subtitle : '',
      coverUrl: courseMap[courseId] ? courseMap[courseId].coverUrl : '',
      lessonCount: courseMap[courseId] ? courseMap[courseId].lessonCount : 0,
      progress: progressMap[courseId] ? progressMap[courseId].progress : 0,
      completedLessons: progressMap[courseId] ? progressMap[courseId].completedLessons : [],
      totalLessons: progressMap[courseId] ? progressMap[courseId].totalLessons : 0,
      lastLessonId: progressMap[courseId] ? progressMap[courseId].lastLessonId : '',
      updatedAt: progressMap[courseId] ? progressMap[courseId].updatedAt : 0,
    })),
  }
}

function filterOrders(orders, status, category) {
  return orders.filter((order) => {
    const statusMatched = status === 'all' || order.status === status
    const categoryMatched = category === 'all' || order.category === category || order.items.some((item) => item.category === category)
    return statusMatched && categoryMatched
  })
}

function summaryFromOrders(allOrders, filteredOrders, assets) {
  return {
    total: allOrders.length,
    filteredTotal: filteredOrders.length,
    pendingCount: allOrders.filter((order) => order.status === 'pending').length,
    paidCount: allOrders.filter((order) => order.status === 'paid').length,
    shippedCount: allOrders.filter((order) => order.status === 'shipped').length,
    completedCount: allOrders.filter((order) => order.status === 'completed').length,
    afterSalesCount: allOrders.filter((order) => order.status === 'after_sales').length,
    courseAssetCount: assets.courses.length,
  }
}

/**
 * 小程序端兼容契约（旧版）。
 * pages/cart 的 fetchOrdersFromDB 依赖：
 *   { success: true, data: [orders 集合原始文档...], total, pendingCount }
 * 由客户端自行按 type/category/isDelete/status 过滤并做字段映射。
 * Web 端继续使用下方新的 { items, assets, summary, pagination } 契约，保持不变。
 */
async function legacyOrdersForMiniprogram(event, identity) {
  try {
    const values = identityValues(identity)
    const userId = event && typeof event.userId === 'string' ? event.userId : ''
    const ids = userId
      ? [userId, ...values].filter((value, index, arr) => value && arr.indexOf(value) === index)
      : values
    if (!ids.length) {
      return { success: false, message: '缺少用户ID', data: [] }
    }

    const res = await db.collection('orders')
      .where(_.or([
        { userId: _.in(ids) },
        { _openid: _.in(ids) },
        { openid: _.in(ids) },
        { webUid: _.in(ids) },
        { webCustomUserId: _.in(ids) },
      ]))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const data = res.data || []
    const pendingCount = data.filter((d) => d.status === 'pending_payment' || d.status === 'pending').length
    console.log('[orders_list] miniprogram legacy ok', { total: data.length, pendingCount })
    return { success: true, data, total: data.length, pendingCount }
  } catch (error) {
    console.error('[orders_list] miniprogram legacy failed:', error)
    return { success: false, message: error && error.message ? error.message : '查询失败', data: [] }
  }
}

exports.main = async (event) => {
  if (event && event.action === 'virtual_delivery') return require('./virtual-delivery').main(event)
  try {
    const auth = requireAuthenticated(await resolveIdentity())
    if (!auth.ok) return fail(auth.code, auth.errorMessage)

    // 小程序端走旧契约（原始文档数组），Web 端走下方新契约
    if (auth.identity.platform === 'wechat_miniprogram') {
      return legacyOrdersForMiniprogram(event, auth.identity)
    }

    const status = normalizeStatus(event && event.status)
    const category = normalizeCategory(event && event.category)
    const limit = normalizeLimit(event && event.limit)
    const offset = normalizeOffset(event && event.offset)
    const values = identityValues(auth.identity)
    if (!values.length) return fail('UNAUTHENTICATED', 'Unauthenticated')

    const res = await db.collection('orders')
      .where(_.or([
        { userId: _.in(values) },
        { _openid: _.in(values) },
        { openid: _.in(values) },
        { webUid: _.in(values) },
        { webCustomUserId: _.in(values) },
      ]))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()

    const rawOrders = (res.data || []).filter((order) => order.isDelete !== 1 && !isRequestLikeOrder(order) && isShopOrder(order))
    const catalogs = await readCatalogs(rawOrders)
    const allOrders = rawOrders.map((order) => publicOrder(order, catalogs))
    const assets = await buildAssets(auth.identity, allOrders)
    const filtered = filterOrders(allOrders, status, category)
    const page = filtered.slice(offset, offset + limit)

    return ok({
      items: page,
      assets,
      summary: summaryFromOrders(allOrders, filtered, assets),
      pagination: {
        limit,
        offset,
        hasMore: offset + page.length < filtered.length,
      },
    })
  } catch (error) {
    return fromError(error, 'ORDERS_LIST_FAILED')
  }
}
