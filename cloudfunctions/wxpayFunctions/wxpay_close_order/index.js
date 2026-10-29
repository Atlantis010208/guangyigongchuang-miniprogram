const { closeOrder } = require('../utils/wechatpay')

exports.main = async (event = {}) => {
  const orderNo = event.orderNo || event.outTradeNo
  if (!orderNo) {
    return { code: -1, message: '缺少订单号参数', data: null }
  }

  try {
    const result = await closeOrder(orderNo)
    if (!result.success) {
      return {
        code: -2,
        message: result.message || '关闭订单失败',
        data: result
      }
    }
    return { code: 0, message: '关闭订单成功', data: result }
  } catch (err) {
    return { code: -99, message: err.message || '系统异常', data: null }
  }
}
