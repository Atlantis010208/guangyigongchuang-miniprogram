const cloud = require('wx-server-sdk')
const {
  DESIGN_PAYMENT_TYPE,
  ACTIVE_STATUSES,
  amountFenToYuan,
  makePaymentOutTradeNo,
  getPaymentByNo,
  isExpired,
  safeAddLog
} = require('./design_payment_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    const paymentRequestNo = event.paymentRequestNo

    if (!OPENID) return { success: false, code: 'NO_LOGIN', errorMessage: '请先登录' }
    if (!paymentRequestNo) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少收款单号' }

    const payment = await getPaymentByNo(db, paymentRequestNo)
    if (!payment) return { success: false, code: 'NOT_FOUND', errorMessage: '收款请求不存在' }
    if (payment.customerOpenid !== OPENID) {
      return { success: false, code: 'NO_PERMISSION', errorMessage: '该付款入口仅限发布需求客户使用' }
    }
    if (!ACTIVE_STATUSES.includes(payment.status)) {
      return { success: false, code: 'INVALID_STATUS', errorMessage: '当前收款状态不可支付' }
    }
    if (isExpired(payment)) {
      await db.collection('design_payment_requests').doc(payment._id).update({
        data: { status: 'expired', updatedAt: new Date() }
      })
      return { success: false, code: 'EXPIRED', errorMessage: '付款入口已过期，请联系工作人员重新发送' }
    }

    const outTradeNo = await createPayAttemptOrder(payment, OPENID)

    const payRes = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_order',
        orderNo: outTradeNo,
        description: payment.description || '光乙设计服务费',
        openid: OPENID
      }
    })

    const result = payRes && payRes.result ? payRes.result : payRes
    if (!result || result.code !== 0) {
      await safeAddLog(db, {
        action: 'prepare_failed',
        source: 'miniprogram',
        paymentRequestNo,
        requestId: payment.requestId,
        reason: result && (result.message || result.errorMessage) || '微信支付下单失败'
      })
      return {
        success: false,
        code: 'WX_PREPAY_FAILED',
        errorMessage: result && (result.message || result.errorMessage) || '微信支付下单失败'
      }
    }

    await db.collection('design_payment_requests').doc(payment._id).update({
      data: {
        status: 'paying',
        currentOutTradeNo: outTradeNo,
        paymentParamsSnapshot: {
          timeStamp: result.data.timeStamp,
          nonceStr: result.data.nonceStr,
          packageVal: result.data.packageVal,
          signType: result.data.signType
        },
        updatedAt: new Date()
      }
    })

    await safeAddLog(db, {
      action: 'prepare',
      source: 'miniprogram',
      paymentRequestNo,
      outTradeNo,
      requestId: payment.requestId
    })

    return {
      success: true,
      code: 'OK',
      data: result.data
    }
  } catch (err) {
    console.error('[design_payment_prepare] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}

async function createPayAttemptOrder(payment, openid) {
  const now = new Date()
  const attemptSeq = Math.max(0, Number(payment.payAttemptSeq) || 0) + 1
  const outTradeNo = makePaymentOutTradeNo(payment.paymentRequestNo, attemptSeq)
  const orderData = {
    orderNo: outTradeNo,
    paymentRequestNo: payment.paymentRequestNo,
    type: DESIGN_PAYMENT_TYPE,
    category: DESIGN_PAYMENT_TYPE,
    userId: openid,
    _openid: openid,
    paid: false,
    status: 'pending',
    params: {
      totalAmount: amountFenToYuan(payment.amountFen),
      amountFen: payment.amountFen,
      paymentRequestNo: payment.paymentRequestNo,
      requestId: payment.requestId,
      requestOrderNo: payment.requestOrderNo || ''
    },
    attach: JSON.stringify({
      t: 'd',
      p: payment.paymentRequestNo
    }),
    payAttemptSeq: attemptSeq,
    createdAt: now,
    updatedAt: now
  }

  await db.collection('orders').add({ data: orderData })
  await db.collection('design_payment_requests').doc(payment._id).update({
    data: {
      payAttemptSeq: attemptSeq,
      currentOutTradeNo: outTradeNo,
      lastPrepareAt: now,
      updatedAt: now
    }
  })

  await safeAddLog(db, {
    action: 'create_pay_attempt',
    source: 'miniprogram',
    paymentRequestNo: payment.paymentRequestNo,
    outTradeNo,
    requestId: payment.requestId,
    attemptSeq
  })

  return outTradeNo
}

async function ensurePayableLocalOrder(payment, openid) {
  const orderRes = await db.collection('orders')
    .where({ orderNo: payment.paymentRequestNo })
    .limit(1)
    .get()
  const order = orderRes.data && orderRes.data[0]
  const now = new Date()
  const orderData = {
    orderNo: payment.paymentRequestNo,
    paymentRequestNo: payment.paymentRequestNo,
    type: DESIGN_PAYMENT_TYPE,
    category: DESIGN_PAYMENT_TYPE,
    userId: openid,
    _openid: openid,
    paid: false,
    status: 'pending',
    params: {
      totalAmount: amountFenToYuan(payment.amountFen),
      amountFen: payment.amountFen,
      paymentRequestNo: payment.paymentRequestNo,
      requestId: payment.requestId,
      requestOrderNo: payment.requestOrderNo || ''
    },
    attach: JSON.stringify({
      type: DESIGN_PAYMENT_TYPE,
      paymentRequestNo: payment.paymentRequestNo,
      requestId: payment.requestId
    }),
    updatedAt: now
  }

  if (!order) {
    await db.collection('orders').add({
      data: {
        ...orderData,
        createdAt: payment.createdAt || now,
        recoveredAt: now,
        recoveredReason: 'design_payment_prepare_missing_local_order'
      }
    })
    await safeAddLog(db, {
      action: 'recover_local_order',
      source: 'miniprogram',
      paymentRequestNo: payment.paymentRequestNo,
      requestId: payment.requestId,
      reason: 'missing_local_order'
    })
    return
  }

  if (order.status === 'closed' || order.status === 'cancelled') {
    await db.collection('orders').doc(order._id).update({
      data: {
        ...orderData,
        reopenedAt: now,
        reopenedReason: 'design_payment_prepare_active_payment',
        closedAt: null,
        closeReason: '',
        closedReason: ''
      }
    })
    await safeAddLog(db, {
      action: 'reopen_local_order',
      source: 'miniprogram',
      paymentRequestNo: payment.paymentRequestNo,
      requestId: payment.requestId,
      previousStatus: order.status
    })
    return
  }

  if (order.status !== 'pending' || order.paid === true || order.userId !== openid) {
    await db.collection('orders').doc(order._id).update({ data: orderData })
  }
}
