const cloud = require('wx-server-sdk')
const https = require('https')
const { requireBackendAuth, getErrorMessage } = require('./admin_auth')
const {
  DESIGN_PAYMENT_TYPE,
  ACTIVE_STATUSES,
  normalizeAmountFen,
  amountFenToYuan,
  makePaymentRequestNo,
  resolveCustomerIdentity,
  recalculateRequestPaymentSummary,
  syncDesignPaymentSuccess,
  safeAddLog
} = require('./design_payment_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const PAYMENT_PAGE = '/pages/request/payment/payment'
const URL_LINK_PAYMENT_PAGE = ''
const DEFAULT_EXPIRE_HOURS = 72
const HIGH_AMOUNT_FEN = Number(process.env.DESIGN_PAYMENT_HIGH_AMOUNT_FEN || 1000000)
const URL_LINK_MAX_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_URL_LINK_ENV_VERSION = process.env.WX_MINIPROGRAM_ENV_VERSION || 'trial'

exports.main = async (event = {}) => {
  try {
    const authResult = await requireBackendAuth(db, _)
    if (!authResult.ok || authResult.roles !== 0) {
      return {
        success: false,
        code: authResult.errorCode || 'FORBIDDEN',
        errorMessage: getErrorMessage(authResult.errorCode) || '无收款管理权限'
      }
    }

    const action = event.action || 'list'
    if (action === 'create') return await createPayment(event, authResult)
    if (action === 'list') return await listPayments(event)
    if (action === 'cancel') return await cancelPayment(event, authResult)
    if (action === 'refresh') return await refreshPayment(event, authResult)
    if (action === 'share_link') return await generateShareLink(event, authResult)
    if (action === 'refund_entry') return await refundEntry(event, authResult)

    return { success: false, code: 'INVALID_ACTION', errorMessage: '鏈煡鎿嶄綔' }
  } catch (err) {
    console.error('[admin_design_payment] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

async function createPayment(event, authResult) {
  const requestId = event.requestId
  const description = String(event.description || '').trim()
  const internalRemark = String(event.internalRemark || '').trim()
  const amountFen = normalizeAmountFen(event.amountYuan !== undefined ? event.amountYuan : event.amount)
  const expiresAt = parseExpiresAt(event.expiresAt)

  if (!requestId) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯璁捐璇锋眰ID' }
  if (!description) return { success: false, code: 'INVALID_PARAMS', errorMessage: '请输入付款说明' }
  if (description.length > 80) return { success: false, code: 'INVALID_PARAMS', errorMessage: '付款说明不能超过80字' }
  if (internalRemark.length > 200) return { success: false, code: 'INVALID_PARAMS', errorMessage: '内部备注不能超过200字' }
  if (amountFen >= HIGH_AMOUNT_FEN && !event.highAmountConfirmed) {
    return {
      success: false,
      code: 'HIGH_AMOUNT_CONFIRM_REQUIRED',
      errorMessage: '鏀舵閲戦杈冮珮锛岃浜屾纭鍚庡啀鎻愪氦',
      data: { amountFen, thresholdFen: HIGH_AMOUNT_FEN }
    }
  }

  const request = await getRequest(requestId)
  if (!request) return { success: false, code: 'NOT_FOUND', errorMessage: '设计请求不存在' }

  const identity = await resolveCustomerIdentity(db, request)
  const paymentRequestNo = makePaymentRequestNo()
  const paymentPagePath = `${PAYMENT_PAGE}?paymentRequestNo=${encodeURIComponent(paymentRequestNo)}`
  const now = new Date()

  const paymentData = {
    paymentRequestNo,
    requestId,
    requestOrderNo: request.orderNo || '',
    customerUserId: identity.customerUserId || request.userId || '',
    customerOpenid: identity.customerOpenid,
    customerIdentitySource: identity.source,
    amountFen,
    amountYuan: amountFenToYuan(amountFen),
    description,
    internalRemark,
    status: 'pending',
    channel: 'wechat_jsapi',
    expiresAt,
    paymentPagePath,
    miniProgramCodeFileID: '',
    createdBy: authResult.user && authResult.user._id ? authResult.user._id : '',
    createdByName: authResult.user && (authResult.user.name || authResult.user.nickname || authResult.user.username) || '',
    createdAt: now,
    updatedAt: now
  }

  await ensureCollection('design_payment_requests')
  await db.collection('design_payment_requests').add({ data: paymentData })

  const orderData = {
    orderNo: paymentRequestNo,
    paymentRequestNo,
    type: DESIGN_PAYMENT_TYPE,
    category: DESIGN_PAYMENT_TYPE,
    userId: identity.customerOpenid,
    _openid: identity.customerOpenid,
    paid: false,
    status: 'pending',
    params: {
      totalAmount: amountFenToYuan(amountFen),
      amountFen,
      paymentRequestNo,
      requestId,
      requestOrderNo: request.orderNo || ''
    },
    attach: JSON.stringify({
      type: DESIGN_PAYMENT_TYPE,
      paymentRequestNo,
      requestId
    }),
    createdAt: now,
    updatedAt: now
  }

  await db.collection('orders').add({ data: orderData })
  const paymentSummary = await recalculateRequestPaymentSummary(db, _, requestId)

  await safeAddLog(db, {
    action: 'create',
    source: 'admin',
    paymentRequestNo,
    requestId,
    amountFen,
    operatorId: paymentData.createdBy
  })

  return {
    success: true,
    code: 'OK',
    message: '鏀舵璇锋眰鍒涘缓鎴愬姛',
    data: {
      ...paymentData,
      paymentSummary
    }
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    const message = err && err.message ? err.message : ''
    if (message.indexOf('already') === -1 && message.indexOf('exists') === -1 && message.indexOf('集合已存在') === -1) {
      console.log('[admin_design_payment] createCollection skipped:', name, message)
    }
  }
}

async function listPayments(event) {
  const requestId = event.requestId
  if (!requestId) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯璁捐璇锋眰ID' }

  const request = await getRequest(requestId)
  if (!request) return { success: false, code: 'NOT_FOUND', errorMessage: '设计请求不存在' }

  await ensureCollection('design_payment_requests')

  const res = await db.collection('design_payment_requests')
    .where({ requestId })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()

  const paymentSummary = request.paymentSummary || await recalculateRequestPaymentSummary(db, _, requestId)

  return {
    success: true,
    code: 'OK',
    data: res.data || [],
    paymentSummary,
    total: (res.data || []).length
  }
}

async function generateShareLink(event, authResult) {
  const paymentRequestNo = event.paymentRequestNo
  if (!paymentRequestNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯鏀舵鍗曞彿' }

  const payment = await getPayment(paymentRequestNo)
  if (!payment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款请求不存在' }
  if (!ACTIVE_STATUSES.includes(payment.status)) {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '当前状态不能生成付款链接' }
  }

  const expiresAt = normalizeDate(payment.expiresAt)
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return { success: false, code: 'EXPIRED', errorMessage: '收款请求已过期，请重新发起收款' }
  }

  const now = new Date()
  const expireTime = Math.floor(resolveUrlLinkExpireAt(expiresAt).getTime() / 1000)
  const query = `paymentRequestNo=${encodeURIComponent(paymentRequestNo)}`

  try {
    const linkParams = {
      path: URL_LINK_PAYMENT_PAGE,
      query,
      envVersion: normalizeUrlLinkEnvVersion(event.envVersion || DEFAULT_URL_LINK_ENV_VERSION),
      isExpire: true,
      expireType: 0,
      expireTime
    }
    const linkResult = await generateUrlLink(linkParams)

    const shareUrl = linkResult && (linkResult.urlLink || linkResult.url_link)
    if (!shareUrl) {
      return {
        success: false,
        code: 'URL_LINK_EMPTY',
        errorMessage: linkResult && linkResult.errMsg || '鐢熸垚浠樻閾炬帴澶辫触'
      }
    }

    await db.collection('design_payment_requests').doc(payment._id).update({
      data: {
        shareUrl,
        shareType: 'url_link',
        shareQuery: query,
        shareUrlExpireAt: new Date(expireTime * 1000),
        shareUrlGeneratedAt: now,
        updatedAt: now
      }
    })

    await safeAddLog(db, {
      action: 'share_link',
      source: 'admin',
      paymentRequestNo,
      requestId: payment.requestId,
      operatorId: authResult.user && authResult.user._id
    })

    return {
      success: true,
      code: 'OK',
      message: '付款链接已生成',
      data: {
        paymentRequestNo,
        paymentPagePath: `${PAYMENT_PAGE}?${query}`,
        shareUrl,
        shareUrlExpireAt: new Date(expireTime * 1000)
      }
    }
  } catch (err) {
    console.error('[admin_design_payment] generate url link failed:', err)
    return {
      success: false,
      code: 'URL_LINK_FAILED',
      errorMessage: err && (err.errMsg || err.message) || '鐢熸垚浠樻閾炬帴澶辫触'
    }
  }
}

function normalizeUrlLinkEnvVersion(value) {
  if (value === 'release' || value === 'trial' || value === 'develop') return value
  return 'trial'
}

async function generateUrlLink(params) {
  try {
    return await cloud.openapi.urllink.generate(params)
  } catch (err) {
    if (!isInvalidWxAccessTokenError(err)) throw err
    if (!process.env.WX_APPID || !process.env.WX_APPSECRET) {
      throw new Error('鐢熸垚浠樻閾炬帴闇€瑕侀厤缃?admin_design_payment 浜戝嚱鏁扮幆澧冨彉閲?WX_APPID 鍜?WX_APPSECRET')
    }
    return await generateUrlLinkByHttp(params)
  }
}

function isInvalidWxAccessTokenError(err) {
  const text = [
    err && err.code,
    err && err.errCode,
    err && err.message,
    err && err.errMsg
  ].filter(Boolean).join(' ')
  return text.indexOf('INVALID_WX_ACCESS_TOKEN') !== -1 ||
    text.indexOf('invalid wx openapi access_token') !== -1
}

async function generateUrlLinkByHttp(params) {
  const tokenRes = await requestJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(process.env.WX_APPID)}&secret=${encodeURIComponent(process.env.WX_APPSECRET)}`)
  if (!tokenRes || !tokenRes.access_token) {
    const message = tokenRes && (tokenRes.errmsg || tokenRes.errMsg) || 'failed to get wechat access_token'
    throw new Error(message)
  }

  const body = {
    path: params.path,
    query: params.query,
    env_version: params.envVersion,
    is_expire: params.isExpire,
    expire_type: params.expireType,
    expire_time: params.expireTime
  }
  const linkRes = await postJson(`https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(tokenRes.access_token)}`, body)
  if (!linkRes || (linkRes.errcode && linkRes.errcode !== 0)) {
    const message = linkRes && (linkRes.errmsg || linkRes.errMsg) || 'failed to generate wechat url link'
    throw new Error(message)
  }
  return {
    urlLink: linkRes.url_link || linkRes.urlLink,
    errCode: linkRes.errcode || 0,
    errMsg: linkRes.errmsg || 'ok'
  }
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => parseJsonResponse(raw, resolve, reject))
    }).on('error', reject)
  })
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => parseJsonResponse(raw, resolve, reject))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function parseJsonResponse(raw, resolve, reject) {
  try {
    resolve(raw ? JSON.parse(raw) : {})
  } catch (err) {
    reject(err)
  }
}

async function cancelPayment(event, authResult) {
  const paymentRequestNo = event.paymentRequestNo
  const reason = String(event.reason || '').trim()
  if (!paymentRequestNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯鏀舵鍗曞彿' }
  if (!reason) return { success: false, code: 'INVALID_PARAMS', errorMessage: '请输入取消原因' }

  const payment = await getPayment(paymentRequestNo)
  if (!payment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款请求不存在' }
  if (!ACTIVE_STATUSES.includes(payment.status)) {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '当前状态不可取消' }
  }

  const now = new Date()
  await db.collection('design_payment_requests').doc(payment._id).update({
    data: {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: now,
      updatedAt: now
    }
  })

  const outTradeNo = payment.currentOutTradeNo || paymentRequestNo
  const order = await getOrder(outTradeNo)
  if (order) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'cancelled',
        closeReason: reason,
        updatedAt: now
      }
    })
  }
  await db.collection('orders')
    .where({ paymentRequestNo, status: _.in(ACTIVE_STATUSES) })
    .update({
      data: {
        status: 'cancelled',
        closeReason: reason,
        updatedAt: now
      }
    })

  const paymentSummary = await recalculateRequestPaymentSummary(db, _, payment.requestId)
  await safeAddLog(db, {
    action: 'cancel',
    source: 'admin',
    paymentRequestNo,
    requestId: payment.requestId,
    reason,
    operatorId: authResult.user && authResult.user._id
  })

  return { success: true, code: 'OK', message: '收款请求已取消', data: { paymentSummary } }
}

async function refreshPayment(event, authResult) {
  const paymentRequestNo = event.paymentRequestNo
  if (!paymentRequestNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯鏀舵鍗曞彿' }

  const existingPayment = await getPayment(paymentRequestNo)
  if (!existingPayment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款请求不存在' }

  const outTradeNo = existingPayment.currentOutTradeNo || paymentRequestNo
  const order = await getOrder(outTradeNo)
  if (!order) return { success: false, code: 'NOT_FOUND', errorMessage: '本地支付订单不存在' }

  const queryRes = await cloud.callFunction({
    name: 'wxpayFunctions',
    data: {
      type: 'wxpay_query_order_by_out_trade_no',
      orderNo: outTradeNo,
      syncStatus: false
    }
  })

  const wxResult = queryRes && queryRes.result ? queryRes.result : queryRes
  if (!wxResult || wxResult.code !== 0) {
    return { success: false, code: 'WECHAT_QUERY_FAILED', errorMessage: wxResult && wxResult.message || '寰俊鏌ュ崟澶辫触' }
  }

  let syncResult = null
  const tradeState = wxResult.data && wxResult.data.tradeState
  if (tradeState === 'SUCCESS') {
    syncResult = await syncDesignPaymentSuccess(db, _, order, {
      transactionId: wxResult.data.transactionId,
      successTime: wxResult.data.successTime,
      tradeState,
      amount: wxResult.data.amount
    }, 'admin_query')
  } else if (tradeState === 'CLOSED') {
    await db.collection('design_payment_requests')
      .where({ paymentRequestNo })
      .update({ data: { lastClosedOutTradeNo: outTradeNo, lastQueryAt: new Date(), updatedAt: new Date(), lastQueryResult: wxResult.data } })
  } else {
    await db.collection('design_payment_requests')
      .where({ paymentRequestNo })
      .update({ data: { lastQueryAt: new Date(), lastQueryResult: wxResult.data, updatedAt: new Date() } })
  }

  const payment = await getPayment(paymentRequestNo)
  const paymentSummary = payment ? await recalculateRequestPaymentSummary(db, _, payment.requestId) : null
  await safeAddLog(db, {
    action: 'refresh',
    source: 'admin',
    paymentRequestNo,
    outTradeNo,
    tradeState,
    operatorId: authResult.user && authResult.user._id
  })

  return {
    success: true,
    code: 'OK',
    message: '鏀粯鐘舵€佸凡鍒锋柊',
    data: { tradeState, outTradeNo, payment, paymentSummary, syncResult }
  }
}

async function refundEntry(event, authResult) {
  const paymentRequestNo = event.paymentRequestNo
  if (!paymentRequestNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缂哄皯鏀舵鍗曞彿' }

  const payment = await getPayment(paymentRequestNo)
  if (!payment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款请求不存在' }
  if (payment.status !== 'paid' && payment.status !== 'refund_reserved') {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '仅已支付收款可进入退款预留' }
  }

  await db.collection('design_payment_requests').doc(payment._id).update({
    data: {
      status: 'refund_reserved',
      refundReservedAt: new Date(),
      updatedAt: new Date()
    }
  })

  const paymentSummary = await recalculateRequestPaymentSummary(db, _, payment.requestId)
  await safeAddLog(db, {
    action: 'refund_entry',
    source: 'admin',
    paymentRequestNo,
    requestId: payment.requestId,
    operatorId: authResult.user && authResult.user._id
  })

  return {
    success: true,
    code: 'OK',
    message: '閫€娆捐兘鍔涙殏鏈笂绾匡紝璇疯蛋绾夸笅璐㈠姟娴佺▼',
    data: { paymentSummary }
  }
}

async function getRequest(requestId) {
  try {
    const res = await db.collection('requests').doc(requestId).get()
    return res && res.data ? res.data : null
  } catch (err) {
    return null
  }
}

async function getPayment(paymentRequestNo) {
  const res = await db.collection('design_payment_requests')
    .where({ paymentRequestNo })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function getOrder(orderNo) {
  const res = await db.collection('orders')
    .where({ orderNo })
    .limit(1)
    .get()
  return res.data && res.data[0] ? res.data[0] : null
}

function parseExpiresAt(value) {
  if (value) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime()) && date.getTime() > Date.now()) return date
    throw new Error('有效期必须晚于当前时间')
  }
  return new Date(Date.now() + DEFAULT_EXPIRE_HOURS * 60 * 60 * 1000)
}

function normalizeDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  if (value.$date) return new Date(value.$date)
  return new Date(value)
}

function resolveUrlLinkExpireAt(paymentExpiresAt) {
  const maxExpireAt = new Date(Date.now() + URL_LINK_MAX_EXPIRE_MS)
  if (!paymentExpiresAt || Number.isNaN(paymentExpiresAt.getTime())) return maxExpireAt
  return paymentExpiresAt.getTime() < maxExpireAt.getTime() ? paymentExpiresAt : maxExpireAt
}
