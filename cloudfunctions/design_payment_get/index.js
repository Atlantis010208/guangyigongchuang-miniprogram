const cloud = require('wx-server-sdk')
const { getPaymentByNo, publicPaymentView, isExpired } = require('./design_payment_domain')

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

    let request = null
    try {
      const reqRes = await db.collection('requests').doc(payment.requestId).get()
      request = reqRes.data || null
    } catch (err) {
      console.warn('[design_payment_get] 查询设计请求失败:', err.message)
    }

    if (payment.customerOpenid !== OPENID) {
      return {
        success: false,
        code: 'NO_PERMISSION',
        errorMessage: '该付款入口仅限发布需求客户使用',
        data: {
          status: payment.status,
          canPay: false
        }
      }
    }

    const view = publicPaymentView(payment, request)
    if (isExpired(payment) && payment.status !== 'paid') {
      view.status = 'expired'
      view.canPay = false
    }

    return {
      success: true,
      code: 'OK',
      data: view
    }
  } catch (err) {
    console.error('[design_payment_get] Error:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务器错误' }
  }
}
