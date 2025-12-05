// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { OPENID } = wxContext

  try {
    const {
      orderNo,
      paymentMethod = 'wechat_pay'
    } = event

    // 验证必要参数
    if (!orderNo) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少订单号参数',
        timestamp: Date.now()
      }
    }

    // 查询订单信息
    const orderResult = await db.collection('orders')
      .where({
        orderNo,
        userId: OPENID,
        isDelete: 0
      })
      .get()

    if (orderResult.data.length === 0) {
      return {
        success: false,
        code: 'ORDER_NOT_FOUND',
        errorMessage: '订单不存在',
        timestamp: Date.now()
      }
    }

    const order = orderResult.data[0]

    // 检查订单状态
    if (order.paid) {
      return {
        success: false,
        code: 'ORDER_ALREADY_PAID',
        errorMessage: '订单已支付',
        timestamp: Date.now()
      }
    }

    if (order.status !== 'pending_payment') {
      return {
        success: false,
        code: 'INVALID_ORDER_STATUS',
        errorMessage: '订单状态不正确',
        timestamp: Date.now()
      }
    }

    // 生成支付参数
    const paymentParams = await generatePaymentParams(order, paymentMethod)

    // 创建支付记录
    const paymentId = `PAY_${Date.now()}`
    await db.collection('transactions').add({
      data: {
        paymentId,
        orderNo,
        userId: OPENID,
        amount: order.params.totalAmount,
        type: 'payment',
        status: 'pending',
        paymentMethod,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    // 更新订单状态为支付中
    await db.collection('orders')
      .doc(order._id)
      .update({
        data: {
          status: 'payment_processing',
          paymentId,
          updatedAt: db.serverDate()
        }
      })

    return {
      success: true,
      code: 'OK',
      message: '支付参数生成成功',
      data: {
        paymentId,
        orderNo,
        amount: order.params.totalAmount,
        paymentParams
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('创建支付订单失败:', error)
    return {
      success: false,
      code: 'CREATE_PAYMENT_ERROR',
      errorMessage: '创建支付订单失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 生成支付参数
async function generatePaymentParams(order, paymentMethod) {
  const totalAmount = order.params.totalAmount
  const orderNo = order.orderNo

  try {
    if (paymentMethod === 'wechat_pay') {
      // 调用微信支付API
      const paymentResult = await cloud.openapi.wx.requestOrderPayment({
        body: `光乙共创平台-商品订单-${orderNo}`,
        outTradeNo: orderNo,
        totalFee: Math.round(totalAmount * 100), // 微信支付金额单位为分
        spbillCreateIp: '127.0.0.1',
        notifyUrl: 'https://your-domain.com/payment/notify', // 替换为实际的回调地址
        tradeType: 'JSAPI',
        openid: order.userId
      })

      return {
        timeStamp: paymentResult.timeStamp,
        nonceStr: paymentResult.nonceStr,
        package: paymentResult.package,
        signType: paymentResult.signType,
        paySign: paymentResult.paySign
      }
    } else {
      // 其他支付方式的处理
      return {
        paymentMethod,
        orderNo,
        amount: totalAmount,
        description: `光乙共创平台-商品订单-${orderNo}`
      }
    }
  } catch (error) {
    console.error('生成支付参数失败:', error)
    throw error
  }
}