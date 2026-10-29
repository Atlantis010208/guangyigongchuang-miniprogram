const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const paidStatuses = new Set(['paid', 'shipped', 'completed', 'delivered', '已支付', '已发货', '已完成', '已送达'])
const text = value => typeof value === 'string' ? value.trim() : ''

function keysFor(item, order) {
  const keys = [item.productId, item.id, item._id, item.toolkitId, item.courseId, order.productId, order.toolkitId, order.courseId].map(text).filter(Boolean)
  if (keys.includes('toolkit')) keys.push('TK_DEFAULT_001')
  return [...new Set(keys)]
}

async function find(collection, clauses) {
  if (!clauses.length) return null
  const res = await db.collection(collection).where(_.and([
    { isDelete: _.neq(1) }, _.or(clauses)
  ])).limit(1).get()
  return res.data && res.data[0] || null
}

function delivery(record, item, virtual) {
  const vc = virtual ? (record.virtualContent || {}) : record
  const service = virtual && record.deliveryType === 'service'
  const link = text(vc.driveLink) || text(vc.downloadUrl)
  const contact = text(vc.contactWechat)
  const content = service ? text(vc.serviceDescription) : text(vc.driveContent)
  const qrcode = service ? text(vc.qrcodeImage) : ''
  if (service ? !contact && !content && !qrcode : !link) return null
  return {
    productId: record.productId || record.toolkitId || record.courseId || record._id,
    productName: record.name || record.title || item.name || '',
    title: '虚拟发货信息', deliveryType: service ? 'service' : 'download',
    content, link: service ? contact : link,
    linkLabel: service ? '客服微信' : '下载链接',
    codeLabel: '访问密码', extractCode: service ? '' : text(vc.drivePassword),
    altContact: text(vc.driveAltContact), qrcodeImage: qrcode,
    updatedAt: record.updatedAt || null
  }
}

async function resolveItem(item, order) {
  const keys = keysFor(item, order)
  if (!keys.length) return null
  const productKeys = [...new Set(keys.flatMap(key => [key, `VP_${key}`]))]
  let product = await find('products', [
    { _id: _.in(productKeys) }, { productId: _.in(productKeys) }, { _originalToolkitId: _.in(keys) }
  ])
  if (product) return product.type === 'virtual' ? delivery(product, item, true) : null

  // Only exact legacy matches are allowed. Never select the latest unrelated product.
  const kind = item.type || item.category || order.category || order.type
  if (kind === 'toolkit' || keys.some(key => key.startsWith('TK_') || key === 'toolkit')) {
    const toolkitKeys = [...new Set(keys.map(key => key.replace(/^VP_/, '')))]
    const toolkit = await find('toolkits', [{ _id: _.in(toolkitKeys) }, { toolkitId: _.in(toolkitKeys) }])
    if (!toolkit) return null
    // Migrated records can be linked by the original toolkit document ID as well.
    product = await find('products', [{ _originalToolkitId: toolkit._id }])
    if (product) return product.type === 'virtual' ? delivery(product, item, true) : null
    return delivery(toolkit, item, false)
  }
  if (kind === 'course' || keys.some(key => key.startsWith('CO'))) {
    const course = await find('courses', [{ _id: _.in(keys) }, { courseId: _.in(keys) }])
    return course ? delivery(course, item, false) : null
  }
  return null
}

exports.main = async (event = {}) => {
  const ctx = cloud.getWXContext()
  const openid = ctx.OPENID || ctx.openid
  if (!openid) return { success: false, code: 'UNAUTHORIZED' }
  const orderNo = text(event.orderNo)
  if (!orderNo) return { success: false, code: 'INVALID_PARAMS' }
  try {
    const result = await db.collection('orders').where(_.and([
      { orderNo, isDelete: _.neq(1) }, _.or([{ userId: openid }, { _openid: openid }])
    ])).limit(1).get()
    const order = result.data && result.data[0]
    if (!order) return { success: false, code: 'ORDER_NOT_FOUND' }
    if (!paidStatuses.has(order.status)) return { success: false, code: 'ORDER_NOT_PAID' }
    const items = (order.params && order.params.items) || order.items || []
    const candidates = items.length ? items : [{}]
    const deliveries = []
    for (const item of candidates) {
      const info = await resolveItem(item, order)
      if (info && !deliveries.some(entry => entry.productId === info.productId)) deliveries.push(info)
    }
    for (const info of deliveries) {
      if (info.qrcodeImage.startsWith('cloud://')) {
        const res = await cloud.getTempFileURL({ fileList: [info.qrcodeImage] })
        info.qrcodeImage = res.fileList[0] && res.fileList[0].tempFileURL || ''
      }
    }
    return { success: true, code: 'OK', data: { orderNo, deliveries } }
  } catch (error) {
    console.error('[order_virtual_delivery]', error.message)
    return { success: false, code: 'DELIVERY_QUERY_FAILED', errorMessage: '获取发货信息失败，请重试' }
  }
}
