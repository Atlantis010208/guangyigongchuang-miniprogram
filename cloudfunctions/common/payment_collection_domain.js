const crypto = require('crypto')

const GENERAL_COLLECTION_TYPE = 'general_collection_payment'
const COLLECTION_NO_PREFIX = 'COL'
const ACTIVE_STATUSES = ['pending', 'paying']
const TERMINAL_STATUSES = ['paid', 'cancelled', 'expired', 'abnormal']

function nowDate() {
  return new Date()
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  if (value.$date) return new Date(value.$date)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

function randomId(size = 12) {
  return crypto.randomBytes(size).toString('hex')
}

function dateStamp() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

function makeCollectionNo() {
  const stamp = dateStamp()
  const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${COLLECTION_NO_PREFIX}${stamp}${seq}`
}

function makeCollectionOutTradeNo(collectionNo, attemptSeq = 1) {
  const seq = Math.max(1, Number(attemptSeq) || 1).toString().padStart(3, '0')
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `${collectionNo}A${seq}${random}`.slice(0, 32)
}

function makeShareToken() {
  return randomId(16)
}

function hashShareToken(token) {
  const secret = process.env.COLLECTION_SHARE_TOKEN_SECRET || process.env.TCB_ENV || 'guangyi-collection-payment'
  return crypto.createHash('sha256').update(`${secret}:${token}`).digest('hex')
}

function isExpired(payment, at = nowDate()) {
  const expiresAt = toDate(payment && payment.expiresAt)
  return Boolean(expiresAt && expiresAt.getTime() <= at.getTime())
}

function publicCollectionView(payment) {
  const expired = isExpired(payment)
  const status = expired && ACTIVE_STATUSES.includes(payment.status) ? 'expired' : payment.status
  return {
    collectionNo: payment.collectionNo,
    customerName: payment.customerName || '',
    amountFen: payment.amountFen,
    amountYuan: amountFenToYuan(payment.amountFen),
    description: payment.description || '',
    status,
    channel: payment.channel || 'wechat_jsapi',
    expiresAt: payment.expiresAt || null,
    paidAt: payment.paidAt || null,
    canPay: status === 'pending' || status === 'paying'
  }
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

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    const message = err && err.message ? err.message : ''
    if (message.indexOf('already') === -1 && message.indexOf('exists') === -1 && message.indexOf('集合已存在') === -1) {
      console.warn('[collection_payment] createCollection skipped:', name, message)
    }
  }
}

async function safeAddPaymentLog(db, data) {
  try {
    await ensureCollection(db, 'payment_operation_logs')
    await db.collection('payment_operation_logs').add({
      data: {
        paymentType: GENERAL_COLLECTION_TYPE,
        ...data,
        createdAt: nowDate()
      }
    })
  } catch (err) {
    console.warn('[collection_payment] 写审计日志失败:', err.message)
  }
}

async function getCollectionByNo(db, collectionNo) {
  const res = await db.collection('collection_payment_requests')
    .where({ collectionNo })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function getCollectionByToken(db, token) {
  if (!token) return null
  const shareTokenHash = hashShareToken(token)
  const res = await db.collection('collection_payment_requests')
    .where({ shareTokenHash })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

function getCollectionNoFromOrder(order) {
  if (!order) return ''
  if (order.collectionNo) return order.collectionNo
  if (order.params && order.params.collectionNo) return order.params.collectionNo
  if (order.attach) {
    try {
      const attach = typeof order.attach === 'string' ? JSON.parse(order.attach) : order.attach
      return attach.collectionNo || attach.p || ''
    } catch (err) {
      return ''
    }
  }
  const orderNo = String(order.orderNo || '')
  const idx = orderNo.indexOf('A')
  return orderNo.startsWith(COLLECTION_NO_PREFIX) && idx > 0 ? orderNo.slice(0, idx) : ''
}

async function markGeneralCollectionAbnormal(db, _, collection, order, reason, extra = {}) {
  const now = nowDate()
  if (collection && collection._id) {
    await db.collection('collection_payment_requests').doc(collection._id).update({
      data: {
        status: 'abnormal',
        abnormalReason: reason,
        abnormalDetail: extra,
        updatedAt: now
      }
    })
  }
  if (order && order._id) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'abnormal',
        abnormalReason: reason,
        updatedAt: now
      }
    })
  }
  await safeAddPaymentLog(db, {
    businessNo: collection && collection.collectionNo || getCollectionNoFromOrder(order),
    outTradeNo: order && order.orderNo,
    action: 'abnormal',
    source: 'system',
    reason,
    detail: extra,
    beforeStatus: collection && collection.status,
    afterStatus: 'abnormal'
  })
  return { success: false, code: 'ABNORMAL', reason }
}

async function closeOtherCollectionAttempts(db, _, collectionNo, currentOutTradeNo) {
  try {
    await db.collection('orders')
      .where({
        collectionNo,
        orderNo: _.neq(currentOutTradeNo),
        paid: _.neq(true),
        status: _.in(['pending', 'paying', 'created'])
      })
      .update({
        data: {
          status: 'invalidated',
          closeReason: '通用收款已完成，其他支付尝试失效',
          updatedAt: nowDate()
        }
      })
  } catch (err) {
    console.warn('[collection_payment] close other attempts failed:', err.message)
  }
}

async function syncGeneralCollectionSuccess(db, _, order, payInfo, source = 'unknown') {
  if (!order || !order.orderNo) {
    return { success: false, code: 'ORDER_MISSING', errorMessage: '本地支付订单不存在' }
  }

  const collectionNo = getCollectionNoFromOrder(order)
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) {
    return { success: false, code: 'COLLECTION_NOT_FOUND', errorMessage: '收款单不存在' }
  }

  const normalized = normalizeWechatPayInfo(payInfo)
  const transactionId = normalized.transactionId
  const paidAt = normalized.successTime ? new Date(normalized.successTime) : nowDate()

  if (collection.status === 'paid' && collection.transactionId === transactionId) {
    return { success: true, skipped: true, collectionNo: collection.collectionNo }
  }

  if (collection.status === 'paid' && collection.transactionId && collection.transactionId !== transactionId) {
    return markGeneralCollectionAbnormal(db, _, collection, order, '重复支付交易号不一致', normalized)
  }

  if (collection.status === 'cancelled') {
    return markGeneralCollectionAbnormal(db, _, collection, order, '已取消收款单收到支付成功', normalized)
  }

  if (isExpired(collection) && collection.status !== 'paying') {
    return markGeneralCollectionAbnormal(db, _, collection, order, '已过期收款单收到支付成功', normalized)
  }

  if (normalized.tradeState && normalized.tradeState !== 'SUCCESS') {
    return { success: false, code: 'NOT_SUCCESS', tradeState: normalized.tradeState }
  }

  const expectedMchid = process.env.WX_MCHID || ''
  if (expectedMchid && normalized.mchid && normalized.mchid !== expectedMchid) {
    return markGeneralCollectionAbnormal(db, _, collection, order, '商户号与本地配置不一致', normalized)
  }

  if (normalized.amountTotal !== null && normalized.amountTotal !== Number(collection.amountFen)) {
    return markGeneralCollectionAbnormal(db, _, collection, order, '支付金额与本地应付金额不一致', normalized)
  }

  const now = nowDate()
  await db.collection('collection_payment_requests').doc(collection._id).update({
    data: {
      status: 'paid',
      paidAt,
      transactionId,
      payerOpenid: normalized.payerOpenid || order.userId || order._openid || '',
      paymentAmountFen: normalized.amountTotal,
      currentOutTradeNo: order.orderNo,
      payLockNonce: '',
      payLockOpenid: '',
      payLockExpiresAt: null,
      syncSource: source,
      updatedAt: now
    }
  })

  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'paid',
      paid: true,
      paidAt,
      transactionId,
      paymentAmount: normalized.amountTotal,
      payerOpenid: normalized.payerOpenid || order.userId || order._openid || '',
      syncSource: source,
      updatedAt: now
    }
  })

  await closeOtherCollectionAttempts(db, _, collection.collectionNo, order.orderNo)

  await safeAddPaymentLog(db, {
    businessNo: collection.collectionNo,
    outTradeNo: order.orderNo,
    action: 'paid',
    source,
    beforeStatus: collection.status,
    afterStatus: 'paid',
    openidHash: normalized.payerOpenid ? hashShareToken(normalized.payerOpenid) : '',
    detail: {
      transactionId,
      amountFen: normalized.amountTotal
    }
  })

  return {
    success: true,
    collectionNo: collection.collectionNo,
    outTradeNo: order.orderNo
  }
}

module.exports = {
  GENERAL_COLLECTION_TYPE,
  COLLECTION_NO_PREFIX,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  normalizeAmountFen,
  amountFenToYuan,
  makeCollectionNo,
  makeCollectionOutTradeNo,
  makeShareToken,
  hashShareToken,
  isExpired,
  publicCollectionView,
  ensureCollection,
  safeAddPaymentLog,
  getCollectionByNo,
  getCollectionByToken,
  getCollectionNoFromOrder,
  normalizeWechatPayInfo,
  markGeneralCollectionAbnormal,
  closeOtherCollectionAttempts,
  syncGeneralCollectionSuccess
}
