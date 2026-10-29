const cloud = require('wx-server-sdk')
const {
  GENERAL_COLLECTION_TYPE,
  ACTIVE_STATUSES,
  amountFenToYuan,
  makeCollectionOutTradeNo,
  getCollectionByToken,
  isExpired,
  safeAddPaymentLog
} = require('./payment_collection_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const PAY_LOCK_MS = Number(process.env.GENERAL_COLLECTION_PAY_LOCK_MS || 2 * 60 * 1000)

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    const token = String(event.token || event.t || '').trim()
    if (!OPENID) return { success: false, code: 'NO_OPENID', errorMessage: '无法获取微信身份，请重新打开小程序' }
    if (!token) return { success: false, code: 'INVALID_PARAMS', errorMessage: '付款入口无效' }

    const payment = await getCollectionByToken(db, token)
    if (!payment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款单不存在或已失效' }
    if (payment.status === 'paid') return { success: false, code: 'PAID', errorMessage: '该收款单已支付' }
    if (payment.status === 'cancelled') return { success: false, code: 'CANCELLED', errorMessage: '该收款单已取消' }
    if (payment.status === 'abnormal') return { success: false, code: 'ABNORMAL', errorMessage: '该收款单状态异常，请联系工作人员' }
    if (!ACTIVE_STATUSES.includes(payment.status)) return { success: false, code: 'INVALID_STATUS', errorMessage: '当前收款状态不可支付' }
    if (isExpired(payment)) {
      await db.collection('collection_payment_requests').doc(payment._id).update({
        data: { status: 'expired', updatedAt: new Date() }
      })
      return { success: false, code: 'EXPIRED', errorMessage: '付款入口已过期，请联系工作人员重新发送' }
    }

    const lockResult = await acquirePayLock(payment, OPENID)
    if (!lockResult.ok) return lockResult.response

    const locked = lockResult.payment
    const outTradeNo = await createPayAttemptOrder(locked, OPENID)
    const payRes = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_order',
        orderNo: outTradeNo,
        description: locked.description || '光乙服务收款',
        openid: OPENID
      }
    })
    const result = payRes && payRes.result ? payRes.result : payRes
    if (!result || result.code !== 0) {
      await releasePayLockAfterPrepareFailure(locked, outTradeNo)
      await safeAddPaymentLog(db, {
        businessNo: locked.collectionNo,
        outTradeNo,
        action: 'prepare_failed',
        source: 'miniprogram',
        reason: result && (result.message || result.errorMessage) || '微信支付下单失败'
      })
      return {
        success: false,
        code: 'WX_PREPAY_FAILED',
        errorMessage: result && (result.message || result.errorMessage) || '微信支付下单失败'
      }
    }

    await db.collection('collection_payment_requests').doc(locked._id).update({
      data: {
        status: 'paying',
        currentOutTradeNo: outTradeNo,
        paymentParamsSnapshot: {
          timeStamp: result.data.timeStamp,
          nonceStr: result.data.nonceStr,
          packageVal: result.data.packageVal,
          signType: result.data.signType
        },
        lastPrepareAt: new Date(),
        updatedAt: new Date()
      }
    })

    await safeAddPaymentLog(db, {
      businessNo: locked.collectionNo,
      outTradeNo,
      action: 'prepare',
      source: 'miniprogram',
      openidHash: OPENID.slice(0, 8)
    })

    return {
      success: true,
      code: 'OK',
      data: {
        ...result.data,
        collectionNo: locked.collectionNo,
        outTradeNo
      }
    }
  } catch (err) {
    console.error('[collection_payment_prepare] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

async function acquirePayLock(payment, openid) {
  const now = Date.now()
  const lockExpiresAt = normalizeDate(payment.payLockExpiresAt)
  const lockActive = payment.status === 'paying' &&
    payment.payLockOpenid &&
    lockExpiresAt &&
    lockExpiresAt.getTime() > now

  if (lockActive && payment.payLockOpenid !== openid) {
    return {
      ok: false,
      response: { success: false, code: 'PAYMENT_BUSY', errorMessage: '该收款单正在支付处理中，请稍后重试' }
    }
  }

  const previousNonce = payment.payLockNonce || ''
  const lockNonce = Math.random().toString(36).slice(2, 10).toUpperCase()
  const nextLockExpiresAt = new Date(Date.now() + PAY_LOCK_MS)
  const where = { _id: payment._id, status: _.in(['pending', 'paying']), payLockNonce: previousNonce }

  const updateResult = await db.collection('collection_payment_requests').where(where).update({
    data: {
      status: 'paying',
      payLockNonce: lockNonce,
      payLockOpenid: openid,
      payLockExpiresAt: nextLockExpiresAt,
      updatedAt: new Date()
    }
  })
  if (!updateResult.stats || updateResult.stats.updated !== 1) {
    return {
      ok: false,
      response: { success: false, code: 'PAYMENT_BUSY', errorMessage: '该收款单正在支付处理中，请稍后重试' }
    }
  }

  const latest = await db.collection('collection_payment_requests').doc(payment._id).get()
  const locked = latest && latest.data
  if (!locked || locked.payLockNonce !== lockNonce || locked.payLockOpenid !== openid) {
    return {
      ok: false,
      response: { success: false, code: 'PAYMENT_BUSY', errorMessage: '该收款单正在支付处理中，请稍后重试' }
    }
  }
  return { ok: true, payment: locked }
}

async function releasePayLockAfterPrepareFailure(payment, outTradeNo) {
  const now = new Date()
  const reason = 'wxpay_order_failed'
  await db.collection('orders').where({ orderNo: outTradeNo, paid: _.neq(true) }).update({
    data: {
      status: 'failed',
      failReason: reason,
      updatedAt: now
    }
  }).catch(err => console.warn('[collection_payment_prepare] mark order failed error:', err))

  await db.collection('collection_payment_requests')
    .where({
      _id: payment._id,
      status: 'paying',
      payLockNonce: payment.payLockNonce || '',
      currentOutTradeNo: outTradeNo
    })
    .update({
      data: {
        status: 'pending',
        currentOutTradeNo: '',
        payLockNonce: '',
        payLockOpenid: '',
        payLockExpiresAt: null,
        lastPrepareFailReason: reason,
        updatedAt: now
      }
    })
    .catch(err => console.warn('[collection_payment_prepare] release pay lock error:', err))
}

async function createPayAttemptOrder(payment, openid) {
  const now = new Date()
  const attemptSeq = Math.max(0, Number(payment.payAttemptSeq) || 0) + 1
  const outTradeNo = makeCollectionOutTradeNo(payment.collectionNo, attemptSeq)
  const orderData = {
    orderNo: outTradeNo,
    collectionNo: payment.collectionNo,
    type: GENERAL_COLLECTION_TYPE,
    category: GENERAL_COLLECTION_TYPE,
    userId: openid,
    _openid: openid,
    paid: false,
    status: 'pending',
    params: {
      totalAmount: amountFenToYuan(payment.amountFen),
      amountFen: payment.amountFen,
      collectionNo: payment.collectionNo
    },
    attach: JSON.stringify({
      t: 'c',
      p: payment.collectionNo
    }),
    payAttemptSeq: attemptSeq,
    createdAt: now,
    updatedAt: now
  }

  await db.collection('orders').add({ data: orderData })
  await db.collection('collection_payment_requests').doc(payment._id).update({
    data: {
      payAttemptSeq: attemptSeq,
      currentOutTradeNo: outTradeNo,
      updatedAt: now
    }
  })
  return outTradeNo
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
