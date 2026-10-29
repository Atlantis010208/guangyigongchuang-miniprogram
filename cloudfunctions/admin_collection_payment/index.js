const cloud = require('wx-server-sdk')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { requireBackendAuth, getErrorMessage } = require('./admin_auth')
const {
  GENERAL_COLLECTION_TYPE,
  ACTIVE_STATUSES,
  normalizeAmountFen,
  amountFenToYuan,
  makeCollectionNo,
  makeShareToken,
  hashShareToken,
  publicCollectionView,
  ensureCollection,
  safeAddPaymentLog,
  getCollectionByNo,
  isExpired,
  syncGeneralCollectionSuccess
} = require('./payment_collection_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const PAYMENT_PAGE = '/pages/collection/payment/payment'
const URL_LINK_PAYMENT_PAGE = 'pages/products/products'
const DEFAULT_EXPIRE_DAYS = Number(process.env.GENERAL_COLLECTION_DEFAULT_EXPIRE_DAYS || 7)
const HIGH_AMOUNT_FEN = Number(process.env.GENERAL_COLLECTION_HIGH_AMOUNT_FEN || 1000000)
// 发起收款当前用于开发联调：付款链接和付款海报统一打开开发版小程序。
const DEFAULT_URL_LINK_ENV_VERSION = 'develop'
const URL_LINK_MAX_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000
const POSTER_BACKGROUND_BASE64 = fs.readFileSync(
  path.join(__dirname, 'assets', 'collection-payment-poster-bg.png')
).toString('base64')

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
    if (action === 'list') return await listCollections(event)
    if (action === 'detail') return await detailCollection(event)
    if (action === 'stats') return await collectionStats(event)
    if (action === 'create') return await createCollection(event, authResult)
    if (action === 'cancel') return await cancelCollection(event, authResult)
    if (action === 'refresh') return await refreshCollection(event, authResult)
    if (action === 'share_link') return await generateShareLink(event, authResult)
    if (action === 'generate_poster') return await generatePoster(event, authResult)
    if (action === 'refund_entry' || action === 'refund') return await refundEntry(event, authResult)

    return { success: false, code: 'INVALID_ACTION', errorMessage: '未知操作' }
  } catch (err) {
    console.error('[admin_collection_payment] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

async function createCollection(event, authResult) {
  const customerName = String(event.customerName || '').trim()
  const customerPhone = String(event.customerPhone || '').trim()
  const description = String(event.description || '').trim()
  const internalRemark = String(event.internalRemark || '').trim()
  const amountFen = normalizeAmountFen(event.amountYuan !== undefined ? event.amountYuan : event.amount)
  const expiresAt = parseExpiresAt(event.expiresAt)

  if (!customerName) return { success: false, code: 'INVALID_PARAMS', errorMessage: '请输入客户名' }
  if (customerName.length > 40) return { success: false, code: 'INVALID_PARAMS', errorMessage: '客户名不能超过40字' }
  if (customerPhone && customerPhone.length > 30) return { success: false, code: 'INVALID_PARAMS', errorMessage: '客户手机号不能超过30字' }
  if (!description) return { success: false, code: 'INVALID_PARAMS', errorMessage: '请输入收款描述' }
  if (description.length > 120) return { success: false, code: 'INVALID_PARAMS', errorMessage: '收款描述不能超过120字' }
  if (internalRemark.length > 200) return { success: false, code: 'INVALID_PARAMS', errorMessage: '内部备注不能超过200字' }
  if (amountFen >= HIGH_AMOUNT_FEN && !event.highAmountConfirmed) {
    return {
      success: false,
      code: 'HIGH_AMOUNT_CONFIRM_REQUIRED',
      errorMessage: '收款金额较高，请二次确认后再提交',
      data: { amountFen, thresholdFen: HIGH_AMOUNT_FEN }
    }
  }

  await ensureCollection(db, 'collection_payment_requests')
  await ensureCollection(db, 'payment_operation_logs')

  const collectionNo = await makeUniqueCollectionNo()
  const shareToken = makeShareToken()
  const shareTokenHash = hashShareToken(shareToken)
  const paymentPagePath = `${PAYMENT_PAGE}?t=${encodeURIComponent(shareToken)}`
  const now = new Date()
  const createdBy = authResult.user && authResult.user._id ? authResult.user._id : ''
  const createdByName = authResult.user && (authResult.user.name || authResult.user.nickname || authResult.user.username) || ''

  const data = {
    collectionNo,
    sourceType: 'manual',
    sourceId: '',
    customerName,
    customerPhone,
    amountFen,
    amountYuan: amountFenToYuan(amountFen),
    description,
    internalRemark,
    payerMode: 'open_payer',
    status: 'pending',
    channel: 'wechat_jsapi',
    shareTokenHash,
    shareTokenLast4: shareToken.slice(-4),
    paymentPagePath,
    shareUrl: '',
    shareUrlExpireAt: null,
    miniProgramCodeFileID: '',
    expiresAt,
    payLockNonce: '',
    payLockOpenid: '',
    payLockExpiresAt: null,
    currentOutTradeNo: '',
    payAttemptSeq: 0,
    payerOpenid: '',
    transactionId: '',
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now
  }

  const addResult = await db.collection('collection_payment_requests').add({ data })
  const savedData = { ...data, _id: addResult._id }
  await safeAddPaymentLog(db, {
    businessNo: collectionNo,
    action: 'create',
    source: 'admin',
    operatorId: createdBy,
    afterStatus: 'pending',
    detail: { amountFen }
  })

  const shareResult = await tryGenerateShareLinkForCollection(savedData, shareToken, authResult, event.envVersion)
  const responseData = {
    ...savedData,
    ...shareResult.data,
    shareToken
  }

  return {
    success: true,
    code: 'OK',
    message: shareResult.ok ? '收款单创建成功，付款链接已生成' : '收款单创建成功，但付款链接生成失败',
    data: {
      ...responseData,
      publicView: publicCollectionView(responseData),
      shareLinkStatus: shareResult.ok ? 'generated' : 'failed',
      shareLinkError: shareResult.ok ? '' : shareResult.errorMessage
    }
  }
}

async function listCollections(event) {
  await ensureCollection(db, 'collection_payment_requests')
  const pageSize = Math.min(Math.max(Number(event.pageSize || event.limit || 20), 1), 100)
  const page = Math.max(Number(event.page || 1), 1)
  const offset = Number.isFinite(Number(event.offset)) ? Number(event.offset) : (page - 1) * pageSize
  const where = buildListWhere(event)

  const countRes = await db.collection('collection_payment_requests').where(where).count()
  const listRes = await db.collection('collection_payment_requests')
    .where(where)
    .orderBy(event.orderBy || 'createdAt', event.order || 'desc')
    .skip(offset)
    .limit(pageSize)
    .get()

  const data = (listRes.data || []).map(maskAdminCollection)
  return {
    success: true,
    code: 'OK',
    data,
    total: countRes.total || data.length,
    page,
    pageSize
  }
}

async function detailCollection(event) {
  const collectionNo = event.collectionNo
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }

  const attempts = await db.collection('orders')
    .where({ collectionNo })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
  const logs = await db.collection('payment_operation_logs')
    .where({ paymentType: GENERAL_COLLECTION_TYPE, businessNo: collectionNo })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()

  return {
    success: true,
    code: 'OK',
    data: {
      collection: maskAdminCollection(collection),
      attempts: attempts.data || [],
      logs: logs.data || []
    }
  }
}

async function collectionStats(event) {
  await ensureCollection(db, 'collection_payment_requests')
  const where = buildListWhere(event)
  const res = await db.collection('collection_payment_requests')
    .where(where)
    .limit(1000)
    .get()

  const stats = {
    pendingAmountFen: 0,
    paidAmountFen: 0,
    pendingCount: 0,
    paidCount: 0,
    abnormalCount: 0,
    totalCount: 0
  }

  for (const item of res.data || []) {
    stats.totalCount += 1
    const status = isExpired(item) && ACTIVE_STATUSES.includes(item.status) ? 'expired' : item.status
    if (status === 'paid' || status === 'refund_failed') {
      stats.paidAmountFen += Number(item.amountFen || 0)
      stats.paidCount += 1
    } else if (status === 'pending' || status === 'paying') {
      stats.pendingAmountFen += Number(item.amountFen || 0)
      stats.pendingCount += 1
    } else if (status === 'abnormal') {
      stats.abnormalCount += 1
    }
  }

  return { success: true, code: 'OK', data: stats }
}

async function tryGenerateShareLinkForCollection(collection, shareToken, authResult, envVersion) {
  try {
    const result = await generateAndPersistShareLink(collection, shareToken, authResult, envVersion)
    return { ok: true, data: result.data || {} }
  } catch (err) {
    const errorMessage = err && (err.errMsg || err.message) || '生成付款链接失败'
    await db.collection('collection_payment_requests').doc(collection._id).update({
      data: {
        shareUrlError: errorMessage,
        shareUrlFailedAt: new Date(),
        updatedAt: new Date()
      }
    }).catch(updateErr => console.warn('[admin_collection_payment] save share link error failed:', updateErr))
    await safeAddPaymentLog(db, {
      businessNo: collection.collectionNo,
      action: 'share_failed',
      source: 'admin',
      operatorId: authResult.user && authResult.user._id,
      reason: errorMessage
    })
    return { ok: false, data: {}, errorMessage }
  }
}

async function cancelCollection(event, authResult) {
  const collectionNo = event.collectionNo
  const reason = String(event.reason || '').trim()
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  if (!reason) return { success: false, code: 'INVALID_PARAMS', errorMessage: '请输入取消原因' }

  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }
  if (collection.status === 'paid') return { success: false, code: 'INVALID_STATUS', errorMessage: '已支付收款单不能取消' }
  if (!ACTIVE_STATUSES.includes(collection.status)) return { success: false, code: 'INVALID_STATUS', errorMessage: '当前状态不可取消' }

  const now = new Date()
  await db.collection('collection_payment_requests').doc(collection._id).update({
    data: {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: now,
      updatedAt: now
    }
  })
  await db.collection('orders')
    .where({ collectionNo, paid: _.neq(true), status: _.in(['pending', 'paying', 'created']) })
    .update({
      data: {
        status: 'cancelled',
        closeReason: reason,
        updatedAt: now
      }
    })

  await closeCurrentWechatOrder(collection)
  await safeAddPaymentLog(db, {
    businessNo: collectionNo,
    action: 'cancel',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id,
    reason,
    beforeStatus: collection.status,
    afterStatus: 'cancelled'
  })

  return { success: true, code: 'OK', message: '收款单已取消' }
}

async function refreshCollection(event, authResult) {
  const collectionNo = event.collectionNo
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }

  if (collection.refundNo && (collection.status === 'refunding' || collection.status === 'refund_failed')) {
    const refundSync = await queryAndSyncRefundStatus(collection, authResult, 'admin_refresh')
    const latest = await getCollectionByNo(db, collectionNo)
    return {
      success: true,
      code: 'OK',
      message: refundSync.message || '退款状态已刷新',
      data: { refundSync, collection: maskAdminCollection(latest) }
    }
  }

  if (!collection.currentOutTradeNo) {
    return { success: true, code: 'OK', message: '暂无支付尝试', data: { collection: maskAdminCollection(collection) } }
  }

  const order = await getOrder(collection.currentOutTradeNo)
  if (!order) return { success: false, code: 'ORDER_NOT_FOUND', errorMessage: '本地支付尝试不存在' }

  const queryRes = await cloud.callFunction({
    name: 'wxpayFunctions',
    data: {
      type: 'wxpay_query_order_by_out_trade_no',
      orderNo: collection.currentOutTradeNo,
      syncStatus: false
    }
  })
  const wxResult = queryRes && queryRes.result ? queryRes.result : queryRes
  if (!wxResult || wxResult.code !== 0) {
    await updateCollectionQueryResult(collection._id, null, wxResult)
    return { success: false, code: 'WECHAT_QUERY_FAILED', errorMessage: wxResult && wxResult.message || '微信查单失败' }
  }

  let syncResult = null
  const tradeState = wxResult.data && wxResult.data.tradeState
  if (tradeState === 'SUCCESS') {
    syncResult = await syncGeneralCollectionSuccess(db, _, order, {
      transactionId: wxResult.data.transactionId,
      successTime: wxResult.data.successTime,
      tradeState,
      amount: wxResult.data.amount
    }, 'admin_query')
  } else {
    await updateCollectionQueryResult(collection._id, tradeState, wxResult.data)
  }

  const latest = await getCollectionByNo(db, collectionNo)
  await safeAddPaymentLog(db, {
    businessNo: collectionNo,
    outTradeNo: collection.currentOutTradeNo,
    action: 'refresh',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id,
    detail: { tradeState }
  })

  return {
    success: true,
    code: 'OK',
    message: '支付状态已刷新',
    data: { tradeState, collection: maskAdminCollection(latest), syncResult }
  }
}

async function generateShareLink(event, authResult) {
  const collectionNo = event.collectionNo
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }
  if (!ACTIVE_STATUSES.includes(collection.status) || isExpired(collection)) {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '当前状态不能生成付款链接' }
  }

  const shareToken = resolveShareToken(collection, event)
  if (!shareToken) return { success: false, code: 'TOKEN_NOT_AVAILABLE', errorMessage: '无法从收款单中解析付款 token，请重新创建收款单' }

  try {
    return await generateAndPersistShareLink(collection, shareToken, authResult, event.envVersion)
  } catch (err) {
    console.error('[admin_collection_payment] generate url link failed:', err)
    return { success: false, code: 'URL_LINK_FAILED', errorMessage: err && (err.errMsg || err.message) || '生成付款链接失败' }
  }
}

async function generateAndPersistShareLink(collection, shareToken, authResult, envVersion) {
  const expiresAt = normalizeDate(collection.expiresAt)
  const expireTime = Math.floor(resolveUrlLinkExpireAt(expiresAt).getTime() / 1000)
  const paymentQuery = `t=${encodeURIComponent(shareToken)}`
  const urlLinkQuery = `collectionPaymentToken=${encodeURIComponent(shareToken)}`

  const linkParams = {
    path: URL_LINK_PAYMENT_PAGE,
    query: urlLinkQuery,
    envVersion: normalizeUrlLinkEnvVersion(envVersion || DEFAULT_URL_LINK_ENV_VERSION),
    isExpire: true,
    expireType: 0,
    expireTime
  }
  const linkResult = await generateUrlLink(linkParams)
  const shareUrl = linkResult && (linkResult.urlLink || linkResult.url_link)
  if (!shareUrl) {
    throw new Error(linkResult && linkResult.errMsg || '生成付款链接失败')
  }

  const updateData = {
    shareUrl,
    shareType: 'url_link',
    shareUrlEnvVersion: linkParams.envVersion,
    shareQuery: urlLinkQuery,
    shareEntryPath: URL_LINK_PAYMENT_PAGE,
    shareUrlExpireAt: new Date(expireTime * 1000),
    shareUrlGeneratedAt: new Date(),
    shareUrlError: '',
    updatedAt: new Date()
  }
  await db.collection('collection_payment_requests').doc(collection._id).update({ data: updateData })

  await safeAddPaymentLog(db, {
    businessNo: collection.collectionNo,
    action: 'share',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id
  })

  return {
    success: true,
    code: 'OK',
    message: '付款链接已生成',
    data: {
      collectionNo: collection.collectionNo,
      paymentPagePath: `${PAYMENT_PAGE}?${paymentQuery}`,
      shareUrl,
      shareUrlExpireAt: new Date(expireTime * 1000),
      ...updateData
    }
  }
}

function resolveShareToken(collection, event = {}) {
  const directToken = String(event.shareToken || event.token || '').trim()
  if (directToken) return directToken
  const path = String(collection.paymentPagePath || '').trim()
  const matched = path.match(/[?&](?:t|collectionPaymentToken)=([^&]+)/)
  return matched ? decodeURIComponent(matched[1]) : ''
}

async function generatePoster(event, authResult) {
  const collectionNo = event.collectionNo
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }
  if (!ACTIVE_STATUSES.includes(collection.status) || isExpired(collection)) {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '仅待支付收款单可生成付款海报' }
  }

  const shareToken = resolveShareToken(collection, event)
  if (!shareToken) return { success: false, code: 'TOKEN_NOT_AVAILABLE', errorMessage: '无法解析付款 token，请重新创建收款单' }

  const envVersion = normalizeUrlLinkEnvVersion(event.envVersion || DEFAULT_URL_LINK_ENV_VERSION)
  const codeBuffer = await generateMiniProgramCodeBuffer({
    scene: shareToken,
    page: URL_LINK_PAYMENT_PAGE,
    width: 430,
    checkPath: false,
    envVersion
  })
  const posterSvg = buildCollectionPosterSvg(collection, codeBuffer)
  const now = new Date()
  const cloudPath = `collection-payment-posters/${collection.collectionNo}-${Date.now()}.svg`
  const uploaded = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(posterSvg, 'utf8')
  })
  const posterFileID = uploaded && (uploaded.fileID || uploaded.fileId)
  if (!posterFileID) throw new Error('付款海报上传失败')

  const temp = await cloud.getTempFileURL({ fileList: [posterFileID] })
  const item = temp && temp.fileList && temp.fileList[0]
  const posterUrl = item && (item.tempFileURL || item.download_url || item.downloadUrl)
  if (!posterUrl) throw new Error('付款海报临时链接获取失败')

  const updateData = {
    posterFileID,
    posterUrl,
    posterGeneratedAt: now,
    posterEnvVersion: envVersion,
    updatedAt: now
  }
  await db.collection('collection_payment_requests').doc(collection._id).update({ data: updateData })

  await safeAddPaymentLog(db, {
    businessNo: collection.collectionNo,
    action: 'poster',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id,
    detail: { posterFileID, envVersion }
  })

  return {
    success: true,
    code: 'OK',
    message: '付款海报已生成',
    data: {
      collectionNo: collection.collectionNo,
      posterFileID,
      posterUrl,
      posterGeneratedAt: now,
      posterEnvVersion: envVersion
    }
  }
}

async function refundEntry(event, authResult) {
  const collectionNo = event.collectionNo
  const reason = String(event.reason || '').trim() || '后台发起收款退款'
  if (!collectionNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }
  const collection = await getCollectionByNo(db, collectionNo)
  if (!collection) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在' }
  if (collection.status === 'refunded') return { success: false, code: 'ALREADY_REFUNDED', errorMessage: '该收款单已退款' }
  if (collection.status === 'refunding') {
    const refundSync = await queryAndSyncRefundStatus(collection, authResult, 'admin_refund_existing')
    return {
      success: true,
      code: 'OK',
      message: refundSync.message || '退款已在处理中',
      data: { refundNo: collection.refundNo, refundSync }
    }
  }
  if (collection.status !== 'paid' && collection.status !== 'refund_failed') {
    return { success: false, code: 'INVALID_STATUS', errorMessage: '仅已支付或退款失败的收款单可发起退款' }
  }
  if (!collection.currentOutTradeNo) {
    return { success: false, code: 'ORDER_MISSING', errorMessage: '缺少原支付订单号，无法退款' }
  }

  const order = await getOrder(collection.currentOutTradeNo)
  if (!order) return { success: false, code: 'ORDER_NOT_FOUND', errorMessage: '本地支付订单不存在，无法退款' }

  const refundNo = makeCollectionRefundNo(collection.collectionNo)
  const now = new Date()
  const refundAmount = Number(collection.amountFen || order.paymentAmount || 0)
  const totalAmount = Number(order.paymentAmount || collection.paymentAmountFen || collection.amountFen || 0)

  if (!refundAmount || refundAmount <= 0 || !totalAmount || totalAmount <= 0) {
    return { success: false, code: 'INVALID_AMOUNT', errorMessage: '退款金额异常，无法退款' }
  }

  await db.collection('collection_payment_requests').doc(collection._id).update({
    data: {
      status: 'refunding',
      refundNo,
      refundReason: reason,
      refundAmountFen: refundAmount,
      refundRequestedAt: now,
      refundOperatorId: authResult.user && authResult.user._id || '',
      refundOperatorName: authResult.user && (authResult.user.name || authResult.user.nickname || authResult.user.username) || '',
      refundWxStatus: 'REQUESTING',
      refundError: '',
      updatedAt: now
    }
  })

  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'refunding',
      refundNo,
      refundAmount,
      refundReason: reason,
      updatedAt: now
    }
  })

  await safeAddPaymentLog(db, {
    businessNo: collectionNo,
    outTradeNo: collection.currentOutTradeNo,
    action: 'refund_request',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id,
    beforeStatus: collection.status,
    afterStatus: 'refunding',
    reason,
    detail: { refundNo, refundAmountFen: refundAmount, totalAmountFen: totalAmount }
  })

  try {
    const refundRes = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_refund',
        outTradeNo: collection.currentOutTradeNo,
        outRefundNo: refundNo,
        refundAmount,
        totalAmount,
        reason
      }
    })
    const wxResult = refundRes && (refundRes.result || refundRes)
    if (!wxResult || wxResult.code !== 0) {
      const errorMessage = wxResult && wxResult.message || '微信退款申请失败'
      await markRefundFailed(collection, order, refundNo, errorMessage, wxResult, authResult)
      return { success: false, code: 'WX_REFUND_FAILED', errorMessage, data: { refundNo, wxResult } }
    }

    const latest = await getCollectionByNo(db, collectionNo)
    const refundSync = await syncRefundStatus(latest || { ...collection, _id: collection._id, refundNo }, order, wxResult.data, authResult, 'admin_refund')
    return {
      success: true,
      code: 'OK',
      message: refundSync.message || '退款已发起，等待微信处理',
      data: { refundNo, refundSync }
    }
  } catch (err) {
    const errorMessage = err && err.message || '退款接口异常'
    await markRefundFailed(collection, order, refundNo, errorMessage, { errorMessage }, authResult)
    return { success: false, code: 'WX_REFUND_ERROR', errorMessage, data: { refundNo } }
  }
}

function makeCollectionRefundNo(collectionNo) {
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `RF${collectionNo}${String(Date.now()).slice(-8)}${random}`.slice(0, 64)
}

async function queryAndSyncRefundStatus(collection, authResult, source) {
  const refundNo = collection.refundNo
  if (!refundNo) return { success: false, code: 'REFUND_NO_MISSING', message: '缺少退款单号' }
  const queryRes = await cloud.callFunction({
    name: 'wxpayFunctions',
    data: {
      type: 'wxpay_refund_query',
      outRefundNo: refundNo
    }
  })
  const wxResult = queryRes && (queryRes.result || queryRes)
  if (!wxResult || wxResult.code !== 0) {
    const errorMessage = wxResult && wxResult.message || '微信退款查询失败'
    await db.collection('collection_payment_requests').doc(collection._id).update({
      data: {
        lastRefundQueryAt: new Date(),
        lastRefundQueryResult: wxResult || null,
        refundError: errorMessage,
        updatedAt: new Date()
      }
    })
    return { success: false, code: 'WX_REFUND_QUERY_FAILED', message: errorMessage, wxResult }
  }

  const order = collection.currentOutTradeNo ? await getOrder(collection.currentOutTradeNo) : null
  return await syncRefundStatus(collection, order, wxResult.data, authResult, source)
}

async function syncRefundStatus(collection, order, refundData = {}, authResult, source) {
  const wxStatus = refundData.status || ''
  const now = new Date()
  const refundId = refundData.refundId || refundData.refund_id || ''
  const successTime = refundData.successTime || refundData.success_time || ''
  const refundedAt = successTime ? new Date(successTime) : now
  const refundAmount = Number(
    (refundData.amount && (refundData.amount.refund || refundData.amount.payer_refund)) ||
    collection.refundAmountFen ||
    collection.amountFen ||
    0
  )

  let nextStatus = 'refunding'
  let message = '退款处理中，请稍后刷新'
  if (wxStatus === 'SUCCESS') {
    nextStatus = 'refunded'
    message = '退款成功'
  } else if (wxStatus === 'CLOSED' || wxStatus === 'ABNORMAL') {
    nextStatus = 'refund_failed'
    message = wxStatus === 'ABNORMAL' ? '退款异常，请检查微信商户平台' : '退款已关闭'
  }

  const updateData = {
    status: nextStatus,
    refundWxStatus: wxStatus || 'PROCESSING',
    wxRefundId: refundId,
    refundAmountFen: refundAmount,
    lastRefundQueryAt: now,
    lastRefundQueryResult: refundData,
    updatedAt: now
  }
  if (nextStatus === 'refunded') {
    updateData.refundedAt = refundedAt
    updateData.refundError = ''
  }
  if (nextStatus === 'refund_failed') {
    updateData.refundFailedAt = now
    updateData.refundError = message
  }

  await db.collection('collection_payment_requests').doc(collection._id).update({ data: updateData })
  if (order && order._id) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: nextStatus,
        refundNo: collection.refundNo,
        wxRefundId: refundId,
        refundAmount,
        refundedAt: nextStatus === 'refunded' ? refundedAt : order.refundedAt || null,
        updatedAt: now
      }
    })
  }

  await safeAddPaymentLog(db, {
    businessNo: collection.collectionNo,
    outTradeNo: collection.currentOutTradeNo,
    action: nextStatus === 'refunded' ? 'refund_success' : nextStatus === 'refund_failed' ? 'refund_failed' : 'refund_processing',
    source,
    operatorId: authResult.user && authResult.user._id,
    beforeStatus: collection.status,
    afterStatus: nextStatus,
    reason: nextStatus === 'refund_failed' ? message : '',
    detail: { refundNo: collection.refundNo, wxStatus, refundId, refundAmountFen: refundAmount }
  })

  return { success: nextStatus !== 'refund_failed', status: nextStatus, wxStatus, message, refundId }
}

async function markRefundFailed(collection, order, refundNo, errorMessage, detail, authResult) {
  const now = new Date()
  await db.collection('collection_payment_requests').doc(collection._id).update({
    data: {
      status: 'refund_failed',
      refundNo,
      refundWxStatus: 'FAILED',
      refundError: errorMessage,
      refundFailedAt: now,
      lastRefundResult: detail || null,
      updatedAt: now
    }
  })
  if (order && order._id) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'refund_failed',
        refundNo,
        refundError: errorMessage,
        updatedAt: now
      }
    })
  }
  await safeAddPaymentLog(db, {
    businessNo: collection.collectionNo,
    outTradeNo: collection.currentOutTradeNo,
    action: 'refund_failed',
    source: 'admin',
    operatorId: authResult.user && authResult.user._id,
    afterStatus: 'refund_failed',
    reason: errorMessage,
    detail: { refundNo, result: detail || null }
  })
}

function buildListWhere(event) {
  const clauses = [{ sourceType: 'manual' }]
  const keyword = String(event.keyword || '').trim()
  if (event.status) clauses.push({ status: event.status })
  if (event.createdStart || event.createdEnd) clauses.push(buildDateRange('createdAt', event.createdStart, event.createdEnd))
  if (event.paidStart || event.paidEnd) clauses.push(buildDateRange('paidAt', event.paidStart, event.paidEnd))
  if (keyword) {
    clauses.push(_.or([
      { collectionNo: db.RegExp({ regexp: keyword, options: 'i' }) },
      { customerName: db.RegExp({ regexp: keyword, options: 'i' }) },
      { description: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }
  return clauses.length === 1 ? clauses[0] : _.and(clauses)
}

function buildDateRange(field, start, end) {
  const startDate = normalizeDate(start)
  const endDate = normalizeDate(end)
  if (startDate && endDate) return { [field]: _.gte(startDate).and(_.lte(endDate)) }
  if (startDate) return { [field]: _.gte(startDate) }
  if (endDate) return { [field]: _.lte(endDate) }
  return {}
}

function maskAdminCollection(collection) {
  if (!collection) return null
  const expiredStatus = isExpired(collection) && ACTIVE_STATUSES.includes(collection.status) ? 'expired' : collection.status
  return {
    ...collection,
    status: expiredStatus,
    shareTokenHash: undefined,
    payLockOpenid: collection.payLockOpenid ? `${collection.payLockOpenid.slice(0, 8)}***` : '',
    payerOpenid: collection.payerOpenid ? `${collection.payerOpenid.slice(0, 8)}***` : ''
  }
}

async function makeUniqueCollectionNo() {
  for (let i = 0; i < 8; i += 1) {
    const collectionNo = makeCollectionNo()
    const existing = await getCollectionByNo(db, collectionNo)
    if (!existing) return collectionNo
  }
  throw new Error('生成收款单号失败，请重试')
}

async function getOrder(orderNo) {
  const res = await db.collection('orders').where({ orderNo }).limit(1).get()
  return res.data && res.data[0] ? res.data[0] : null
}

async function updateCollectionQueryResult(collectionId, tradeState, result) {
  await db.collection('collection_payment_requests').doc(collectionId).update({
    data: {
      lastQueryAt: new Date(),
      lastQueryTradeState: tradeState || '',
      lastQueryResult: result || null,
      updatedAt: new Date()
    }
  })
}

async function closeCurrentWechatOrder(collection) {
  if (!collection.currentOutTradeNo) return
  try {
    const closeRes = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_close_order',
        orderNo: collection.currentOutTradeNo
      }
    })
    await db.collection('collection_payment_requests').doc(collection._id).update({
      data: {
        lastCloseOrderResult: closeRes && (closeRes.result || closeRes),
        updatedAt: new Date()
      }
    })
  } catch (err) {
    await db.collection('collection_payment_requests').doc(collection._id).update({
      data: {
        closeOrderFailed: true,
        closeOrderError: err.message,
        updatedAt: new Date()
      }
    })
  }
}

function parseExpiresAt(value) {
  if (value) {
    const date = normalizeDate(value)
    if (date && date.getTime() > Date.now()) return date
    throw new Error('有效期必须晚于当前时间')
  }
  return new Date(Date.now() + DEFAULT_EXPIRE_DAYS * 24 * 60 * 60 * 1000)
}

function normalizeDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  if (value.$date) return new Date(value.$date)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function resolveUrlLinkExpireAt(paymentExpiresAt) {
  const maxExpireAt = new Date(Date.now() + URL_LINK_MAX_EXPIRE_MS)
  if (!paymentExpiresAt || Number.isNaN(paymentExpiresAt.getTime())) return maxExpireAt
  return paymentExpiresAt.getTime() < maxExpireAt.getTime() ? paymentExpiresAt : maxExpireAt
}

function normalizeUrlLinkEnvVersion(value) {
  if (value === 'release' || value === 'trial' || value === 'develop') return value
  return 'develop'
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function posterDate(value) {
  const date = normalizeDate(value)
  if (!date) return '-'
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fitPosterText(value, max = 24) {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildCollectionPosterSvg(collection, codeBuffer) {
  const codeBase64 = Buffer.from(codeBuffer).toString('base64')
  const amount = `¥${amountFenToYuan(collection.amountFen).toFixed(2)}`
  const description = fitPosterText(collection.description || '灯光设计服务费', 28)
  const customerName = fitPosterText(collection.customerName || '客户', 18)
  const collectionNo = collection.collectionNo || '-'
  const expiresAt = posterDate(collection.expiresAt)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="992" height="1586" viewBox="0 0 992 1586">
  <defs>
    <linearGradient id="cardFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="62%" stop-color="#FFFDF9"/>
      <stop offset="100%" stop-color="#FBF7EF"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0B376B" flood-opacity="0.07"/>
    </filter>
    <style>
      .title { fill: #0B376B; font-family: "Noto Serif SC", "Songti SC", "STSong", serif; font-weight: 700; }
      .blue { fill: #0B376B; font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .gold { fill: #C49A4A; }
      .line { stroke: #D6B56E; stroke-width: 1.5; stroke-linecap: round; }
    </style>
  </defs>

  <image x="0" y="0" width="992" height="1586" href="data:image/png;base64,${POSTER_BACKGROUND_BASE64}" preserveAspectRatio="none"/>

  <rect x="180" y="357" width="635" height="1193" rx="39" fill="url(#cardFill)"/>

  <text x="496" y="483" text-anchor="middle" class="title" font-size="49" letter-spacing="8">付款确认单</text>
  <line x1="326" y1="516" x2="461" y2="516" class="line"/>
  <path d="M496 505 L506 516 L496 528 L486 516 Z" class="gold"/>
  <line x1="531" y1="516" x2="666" y2="516" class="line"/>

  <text x="496" y="652" text-anchor="middle" class="blue" font-size="105" font-weight="800" letter-spacing="1">${xmlEscape(amount)}</text>
  <line x1="231" y1="709" x2="420" y2="709" class="line"/>
  <path d="M496 683 c15 20 15 45 0 64 c-15 -19 -15 -44 0 -64" fill="none" stroke="#C49A4A" stroke-width="2.2"/>
  <path d="M496 694 c18 12 21 31 0 49 c-21 -18 -18 -37 0 -49" fill="none" stroke="#C49A4A" stroke-width="2.2"/>
  <line x1="572" y1="709" x2="761" y2="709" class="line"/>

  <text x="496" y="783" text-anchor="middle" class="blue" font-size="37" font-weight="500">${xmlEscape(description)}</text>
  <text x="496" y="832" text-anchor="middle" class="blue" font-size="28">客户：${xmlEscape(customerName)}</text>

  <rect x="294" y="861" width="405" height="361" rx="18" fill="#FFFDFC" stroke="#E2C98F" stroke-width="1.4" filter="url(#softShadow)"/>
  <image x="322" y="873" width="349" height="337" href="data:image/png;base64,${codeBase64}" preserveAspectRatio="xMidYMid meet"/>

  <text x="496" y="1268" text-anchor="middle" class="blue" font-size="30" letter-spacing="2">微信扫码进入小程序付款</text>
  <line x1="308" y1="1303" x2="461" y2="1303" class="line"/>
  <path d="M496 1292 L506 1303 L496 1313 L486 1303 Z" class="gold"/>
  <line x1="531" y1="1303" x2="684" y2="1303" class="line"/>
  <line x1="233" y1="1328" x2="760" y2="1328" class="line" opacity="0.7"/>

  <g class="blue" font-size="24" text-anchor="middle">
    <text x="496" y="1366"><tspan class="gold">▣</tspan><tspan dx="14">收款单号：${xmlEscape(collectionNo)}</tspan></text>
    <text x="496" y="1417"><tspan class="gold">◷</tspan><tspan dx="14">有效期：${xmlEscape(expiresAt)}</tspan></text>
    <text x="496" y="1468"><tspan class="gold">✓</tspan><tspan dx="14">请核对金额与收款描述后付款</tspan></text>
  </g>
</svg>`
}

function extractCodeBuffer(result) {
  if (!result) return null
  if (Buffer.isBuffer(result)) return result
  if (Buffer.isBuffer(result.buffer)) return result.buffer
  if (result.data && Buffer.isBuffer(result.data.buffer)) return result.data.buffer
  if (result.data && Buffer.isBuffer(result.data)) return result.data
  return null
}

async function generateMiniProgramCodeBuffer(params) {
  let buffer
  try {
    const codeResult = await cloud.openapi.wxacode.getUnlimited(params)
    buffer = extractCodeBuffer(codeResult)
  } catch (err) {
    if (!isInvalidWxAccessTokenError(err)) throw err
    if (!process.env.WX_APPID || !process.env.WX_APPSECRET) {
      throw new Error('生成付款海报需要配置 WX_APPID 和 WX_APPSECRET')
    }
    buffer = await generateUnlimitedCodeByHttp({
      appId: process.env.WX_APPID,
      appSecret: process.env.WX_APPSECRET,
      ...params
    })
  }
  if (!buffer) throw new Error('小程序码接口未返回图片数据')
  return buffer
}

function requestBuffer({ method = 'GET', url, body, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const req = https.request(url, {
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      } : undefined
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const buffer = Buffer.concat(chunks)
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`微信接口请求失败（HTTP ${response.statusCode}）`))
          return
        }
        resolve({ buffer, contentType: String(response.headers['content-type'] || '') })
      })
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error('微信接口请求超时')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function parseWechatJson(buffer, fallbackMessage) {
  let result
  try {
    result = JSON.parse(buffer.toString('utf8'))
  } catch (error) {
    throw new Error(fallbackMessage)
  }
  if (result && result.errcode !== undefined && Number(result.errcode) !== 0) {
    const apiError = new Error(result.errmsg || fallbackMessage)
    apiError.code = result.errcode
    throw apiError
  }
  return result
}

async function generateUnlimitedCodeByHttp({ appId, appSecret, scene, page, width, checkPath, envVersion }) {
  const tokenResponse = await requestBuffer({
    method: 'GET',
    url: 'https://api.weixin.qq.com/cgi-bin/token?' + [
      'grant_type=client_credential',
      `appid=${encodeURIComponent(appId)}`,
      `secret=${encodeURIComponent(appSecret)}`
    ].join('&')
  })
  const tokenResult = parseWechatJson(tokenResponse.buffer, '微信 access_token 获取失败')
  if (!tokenResult.access_token) throw new Error('微信 access_token 获取失败')

  const codeResponse = await requestBuffer({
    method: 'POST',
    url: `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(tokenResult.access_token)}`,
    body: {
      scene,
      page,
      width,
      check_path: checkPath,
      env_version: envVersion
    }
  })
  const looksLikeJson = codeResponse.contentType.includes('json') || codeResponse.buffer[0] === 0x7b
  if (looksLikeJson) parseWechatJson(codeResponse.buffer, '小程序码生成失败')
  if (!codeResponse.buffer.length) throw new Error('小程序码接口未返回图片数据')
  return codeResponse.buffer
}

async function generateUrlLink(params) {
  try {
    return await cloud.openapi.urllink.generate(params)
  } catch (err) {
    if (!isInvalidWxAccessTokenError(err)) throw err
    if (!process.env.WX_APPID || !process.env.WX_APPSECRET) {
      throw new Error('生成付款链接需要配置 WX_APPID 和 WX_APPSECRET')
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
    const message = linkRes && (linkRes.errmsg || linkRes.errMsg) || 'failed to generate wechat url_link'
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
