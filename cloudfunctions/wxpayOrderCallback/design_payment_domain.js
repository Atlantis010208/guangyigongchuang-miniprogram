const DESIGN_PAYMENT_TYPE = 'design_request_payment'
const PAYMENT_NO_PREFIX = 'DRP'

const ACTIVE_STATUSES = ['pending', 'paying']
const VALID_SUMMARY_STATUSES = ['pending', 'paying', 'paid', 'refund_reserved', 'abnormal']

function nowDate() {
  return new Date()
}

function normalizeAmountFen(amountYuan) {
  if (amountYuan === null || amountYuan === undefined || amountYuan === '') {
    throw new Error('请输入收款金额')
  }
  const raw = String(amountYuan).trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('金额格式不正确，最多支持两位小数')
  }
  const [yuanPart, centPart = ''] = raw.split('.')
  const fen = Number(yuanPart) * 100 + Number((centPart + '00').slice(0, 2))
  if (!Number.isSafeInteger(fen) || fen <= 0) {
    throw new Error('收款金额必须大于 0')
  }
  return fen
}

function amountFenToYuan(fen) {
  return Math.round(Number(fen || 0)) / 100
}

function makePaymentRequestNo() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${PAYMENT_NO_PREFIX}${stamp}${random}`
}

function makePaymentOutTradeNo(paymentRequestNo, attemptSeq = 1) {
  const seq = Math.max(1, Number(attemptSeq) || 1).toString(36).toUpperCase().padStart(2, '0')
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${paymentRequestNo}A${seq}${random}`
}

function parseAttach(attach) {
  if (!attach) return {}
  if (typeof attach === 'object') return attach
  try {
    return JSON.parse(attach)
  } catch (err) {
    return {}
  }
}

function getPaymentRequestNoFromOrder(order) {
  if (!order) return ''
  const params = order.params || {}
  const attach = parseAttach(order.attach)
  const orderNo = String(order.orderNo || '')
  return order.paymentRequestNo ||
    params.paymentRequestNo ||
    attach.paymentRequestNo ||
    attach.p ||
    (/^DRP\d{14}[A-Z0-9]{6}$/.test(orderNo)
      ? orderNo
      : '')
}

function isOpenidLike(value) {
  return typeof value === 'string' && /^o[A-Za-z0-9_-]{10,}$/.test(value)
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isExpired(payment, at = nowDate()) {
  const expiresAt = toDate(payment && payment.expiresAt)
  return Boolean(expiresAt && expiresAt.getTime() <= at.getTime())
}

function publicPaymentView(payment, request) {
  return {
    paymentRequestNo: payment.paymentRequestNo,
    requestId: payment.requestId,
    requestOrderNo: payment.requestOrderNo || (request && request.orderNo) || '',
    amountFen: payment.amountFen,
    amountYuan: amountFenToYuan(payment.amountFen),
    description: payment.description || '',
    status: payment.status,
    channel: payment.channel || 'wechat_jsapi',
    expiresAt: payment.expiresAt || null,
    paidAt: payment.paidAt || null,
    transactionId: payment.transactionId || '',
    canPay: ACTIVE_STATUSES.includes(payment.status) && !isExpired(payment)
  }
}

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    const message = err && err.message ? err.message : ''
    if (message.indexOf('collection already exists') === -1 && message.indexOf('already exist') === -1) {
      // CloudBase also returns errors when collection exists or cannot be created by permissions.
      // Collection creation is a best-effort bootstrap and should not block normal writes.
    }
  }
}

async function safeAddLog(db, data) {
  try {
    await ensureCollection(db, 'design_payment_logs')
    await db.collection('design_payment_logs').add({
      data: {
        ...data,
        createdAt: nowDate()
      }
    })
  } catch (err) {
    console.warn('[design_payment] 写审计日志失败:', err.message)
  }
}

async function resolveCustomerIdentity(db, request) {
  if (!request) throw new Error('设计请求不存在')

  if (request._openid) {
    return {
      customerOpenid: request._openid,
      customerUserId: request.userId || '',
      source: 'request._openid'
    }
  }

  if (request.userId) {
    try {
      const userDoc = await db.collection('users').doc(request.userId).get()
      if (userDoc && userDoc.data && userDoc.data._openid) {
        return {
          customerOpenid: userDoc.data._openid,
          customerUserId: userDoc.data._id || request.userId,
          source: 'users._id'
        }
      }
    } catch (err) {
      console.log('[design_payment] users.doc 查询未命中:', err.message)
    }

    if (isOpenidLike(request.userId)) {
      return {
        customerOpenid: request.userId,
        customerUserId: '',
        source: 'request.userId_openid'
      }
    }

    try {
      const userRes = await db.collection('users')
        .where({ _openid: request.userId })
        .limit(1)
        .get()
      if (userRes.data && userRes.data[0]) {
        return {
          customerOpenid: userRes.data[0]._openid,
          customerUserId: userRes.data[0]._id || '',
          source: 'users._openid'
        }
      }
    } catch (err) {
      console.log('[design_payment] users._openid 查询失败:', err.message)
    }
  }

  throw new Error('无法解析发布需求客户 OPENID')
}

async function getPaymentByNo(db, paymentRequestNo) {
  const res = await db.collection('design_payment_requests')
    .where({ paymentRequestNo })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function recalculateRequestPaymentSummary(db, _, requestId) {
  const res = await db.collection('design_payment_requests')
    .where({
      requestId,
      status: _.in(VALID_SUMMARY_STATUSES)
    })
    .limit(100)
    .get()

  let pendingAmountFen = 0
  let pendingCount = 0
  let paidAmountFen = 0
  let paidCount = 0
  let abnormalCount = 0
  let lastPaidAt = null

  for (const item of res.data || []) {
    if (item.status === 'paid' || item.status === 'refund_reserved') {
      paidAmountFen += Number(item.amountFen || 0)
      paidCount += 1
      const paidAt = toDate(item.paidAt)
      if (paidAt && (!lastPaidAt || paidAt > lastPaidAt)) lastPaidAt = paidAt
    } else if (item.status === 'pending' || item.status === 'paying') {
      if (!isExpired(item)) {
        pendingAmountFen += Number(item.amountFen || 0)
        pendingCount += 1
      }
    } else if (item.status === 'abnormal') {
      abnormalCount += 1
    }
  }

  let status = 'none'
  if (abnormalCount > 0) status = 'abnormal'
  else if (paidCount > 0 && pendingCount > 0) status = 'partial_paid'
  else if (paidCount > 0) status = 'paid'
  else if (pendingCount > 0) status = 'pending'

  const paymentSummary = {
    status,
    pendingAmountFen,
    pendingCount,
    paidAmountFen,
    paidCount,
    lastPaidAt
  }

  await db.collection('requests').doc(requestId).update({
    data: {
      paymentSummary,
      updatedAt: nowDate()
    }
  })

  return paymentSummary
}

function normalizeWechatPayInfo(input) {
  const data = input || {}
  const amount = data.amount || {}
  const payer = data.payer || {}
  return {
    transactionId: data.transactionId || data.transaction_id || '',
    successTime: data.successTime || data.success_time || '',
    tradeState: data.tradeState || data.trade_state || '',
    mchid: data.mchid || data.mch_id || '',
    amountTotal: typeof amount.total === 'number' ? amount.total : null,
    payerOpenid: payer.openid || data.payerOpenid || ''
  }
}

async function markDesignPaymentAbnormal(db, _, payment, order, reason, extra = {}) {
  const updateData = {
    status: 'abnormal',
    abnormalReason: reason,
    abnormalDetail: extra,
    updatedAt: nowDate()
  }
  await db.collection('design_payment_requests').doc(payment._id).update({ data: updateData })
  if (order && order._id) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'abnormal',
        abnormalReason: reason,
        updatedAt: nowDate()
      }
    })
  }
  await recalculateRequestPaymentSummary(db, _, payment.requestId)
  await safeAddLog(db, {
    action: 'mark_abnormal',
    paymentRequestNo: payment.paymentRequestNo,
    requestId: payment.requestId,
    reason,
    extra
  })
  return { success: false, code: 'ABNORMAL', reason }
}

async function syncDesignPaymentSuccess(db, _, order, payInfo, source = 'unknown') {
  if (!order || !order.orderNo) {
    return { success: false, code: 'ORDER_MISSING', errorMessage: '本地订单不存在' }
  }

  const paymentRequestNo = getPaymentRequestNoFromOrder(order)
  const payment = await getPaymentByNo(db, paymentRequestNo)
  if (!payment) {
    return { success: false, code: 'PAYMENT_NOT_FOUND', errorMessage: '收款请求不存在' }
  }

  const normalized = normalizeWechatPayInfo(payInfo)
  const transactionId = normalized.transactionId
  const paidAt = normalized.successTime ? new Date(normalized.successTime) : nowDate()

  if (payment.status === 'paid' && payment.transactionId === transactionId) {
    return { success: true, skipped: true, paymentRequestNo: payment.paymentRequestNo }
  }

  if (payment.status === 'paid' && payment.transactionId && payment.transactionId !== transactionId) {
    return markDesignPaymentAbnormal(db, _, payment, order, '重复支付交易号不一致', normalized)
  }

  if (payment.status === 'cancelled') {
    return markDesignPaymentAbnormal(db, _, payment, order, '已取消收款请求收到支付成功', normalized)
  }

  if (isExpired(payment) && payment.status !== 'paying') {
    return markDesignPaymentAbnormal(db, _, payment, order, '已过期收款请求收到支付成功', normalized)
  }

  if (normalized.tradeState && normalized.tradeState !== 'SUCCESS') {
    return { success: false, code: 'NOT_SUCCESS', tradeState: normalized.tradeState }
  }

  const expectedMchid = process.env.WX_MCHID || ''
  if (expectedMchid && normalized.mchid && normalized.mchid !== expectedMchid) {
    return markDesignPaymentAbnormal(db, _, payment, order, '商户号与本地配置不一致', normalized)
  }

  if (normalized.amountTotal !== null && normalized.amountTotal !== Number(payment.amountFen)) {
    return markDesignPaymentAbnormal(db, _, payment, order, '支付金额与本地应付金额不一致', normalized)
  }

  if (normalized.payerOpenid && normalized.payerOpenid !== payment.customerOpenid) {
    return markDesignPaymentAbnormal(db, _, payment, order, '付款人不是设计请求发布客户', normalized)
  }

  const paymentUpdate = {
    status: 'paid',
    paidAt,
    transactionId,
    payerOpenid: normalized.payerOpenid || payment.customerOpenid,
    paymentAmountFen: normalized.amountTotal,
    syncSource: source,
    updatedAt: nowDate()
  }

  await db.collection('design_payment_requests').doc(payment._id).update({ data: paymentUpdate })

  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'paid',
      paid: true,
      paidAt,
      transactionId,
      paymentAmount: normalized.amountTotal,
      payerOpenid: normalized.payerOpenid || payment.customerOpenid,
      syncSource: source,
      updatedAt: nowDate()
    }
  })

  const paymentSummary = await recalculateRequestPaymentSummary(db, _, payment.requestId)
  await safeAddLog(db, {
    action: 'paid',
    source,
    paymentRequestNo: payment.paymentRequestNo,
    requestId: payment.requestId,
    transactionId,
    amountFen: normalized.amountTotal
  })

  return {
    success: true,
    paymentRequestNo: payment.paymentRequestNo,
    requestId: payment.requestId,
    paymentSummary
  }
}

module.exports = {
  DESIGN_PAYMENT_TYPE,
  ACTIVE_STATUSES,
  normalizeAmountFen,
  amountFenToYuan,
  makePaymentRequestNo,
  isExpired,
  publicPaymentView,
  resolveCustomerIdentity,
  getPaymentByNo,
  recalculateRequestPaymentSummary,
  syncDesignPaymentSuccess,
  makePaymentOutTradeNo,
  getPaymentRequestNoFromOrder,
  safeAddLog
}
