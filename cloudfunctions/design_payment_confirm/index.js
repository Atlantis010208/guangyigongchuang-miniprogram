const cloud = require('wx-server-sdk')
const {
  getPaymentByNo,
  syncDesignPaymentSuccess,
  safeAddLog
} = require('./design_payment_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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

    const outTradeNo = payment.currentOutTradeNo || paymentRequestNo
    const orderRes = await db.collection('orders').where({ orderNo: outTradeNo }).limit(1).get()
    const order = orderRes.data && orderRes.data[0]
    if (!order) return { success: false, code: 'ORDER_NOT_FOUND', errorMessage: '本地支付订单不存在' }

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
      return { success: false, code: 'WECHAT_QUERY_FAILED', errorMessage: wxResult && wxResult.message || '微信查单失败' }
    }

    const tradeState = wxResult.data && wxResult.data.tradeState
    let syncResult = null
    if (tradeState === 'SUCCESS') {
      syncResult = await syncDesignPaymentSuccess(db, _, order, {
        transactionId: wxResult.data.transactionId,
        successTime: wxResult.data.successTime,
        tradeState,
        amount: wxResult.data.amount,
        payerOpenid: OPENID
      }, 'miniprogram_query')
    } else {
      await db.collection('design_payment_requests').doc(payment._id).update({
        data: {
          lastQueryAt: new Date(),
          lastQueryResult: wxResult.data,
          updatedAt: new Date()
        }
      })
    }

    await safeAddLog(db, {
      action: 'confirm',
      source: 'miniprogram',
      paymentRequestNo,
      outTradeNo,
      requestId: payment.requestId,
      tradeState
    })

    return {
      success: true,
      code: 'OK',
      data: {
        tradeState,
        outTradeNo,
        paid: tradeState === 'SUCCESS',
        syncResult
      }
    }
  } catch (err) {
    console.error('[design_payment_confirm] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}
