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
      transactionId,
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

    // 验证支付结果（这里简化处理，实际应该调用微信支付查询API）
    const paymentResult = await verifyPaymentResult(transactionId, paymentMethod)

    if (paymentResult.success) {
      // 支付成功，更新订单状态
      await db.collection('orders')
        .doc(order._id)
        .update({
          data: {
            status: 'paid',
            paid: true,
            paidAt: new Date(),
            transactionId,
            updatedAt: db.serverDate()
          }
        })

      // 更新支付记录
      await db.collection('transactions')
        .where({
          orderNo,
          userId: OPENID,
          type: 'payment'
        })
        .update({
          data: {
            status: 'success',
            transactionId,
            updatedAt: db.serverDate()
          }
        })

      // 更新商品销量和库存
      await updateProductSales(order.params.items)

      return {
        success: true,
        code: 'OK',
        message: '支付验证成功',
        data: {
          orderNo,
          status: 'paid',
          paidAt: new Date()
        },
        timestamp: Date.now()
      }

    } else {
      // 支付失败，更新订单状态
      await db.collection('orders')
        .doc(order._id)
        .update({
          data: {
            status: 'payment_failed',
            updatedAt: db.serverDate()
          }
        })

      // 更新支付记录
      await db.collection('transactions')
        .where({
          orderNo,
          userId: OPENID,
          type: 'payment'
        })
        .update({
          data: {
            status: 'failed',
            errorMessage: paymentResult.errorMessage,
            updatedAt: db.serverDate()
          }
        })

      return {
        success: false,
        code: 'PAYMENT_FAILED',
        errorMessage: '支付验证失败',
        data: {
          orderNo,
          status: 'payment_failed'
        },
        timestamp: Date.now()
      }
    }

  } catch (error) {
    console.error('支付验证失败:', error)
    return {
      success: false,
      code: 'VERIFY_PAYMENT_ERROR',
      errorMessage: '支付验证失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 验证支付结果
async function verifyPaymentResult(transactionId, paymentMethod) {
  try {
    if (paymentMethod === 'wechat_pay' && transactionId) {
      // 调用微信支付查询订单API
      const queryResult = await cloud.openapi.wx.queryOrder({
        outTradeNo: transactionId
      })

      if (queryResult.tradeState === 'SUCCESS') {
        return {
          success: true,
          transactionId: queryResult.transactionId,
          paidAt: queryResult.timeEnd
        }
      } else {
        return {
          success: false,
          errorMessage: `支付状态: ${queryResult.tradeState}`
        }
      }
    } else {
      // 其他支付方式的验证
      // 这里应该调用相应支付方式的查询API
      return {
        success: true,
        transactionId
      }
    }
  } catch (error) {
    console.error('验证支付结果失败:', error)
    return {
      success: false,
      errorMessage: '支付结果验证异常'
    }
  }
}

// 更新商品销量和库存
async function updateProductSales(items) {
  if (!items || !Array.isArray(items)) {
    return
  }

  for (const item of items) {
    try {
      const productId = item.productId
      const quantity = item.quantity

      // 更新销量
      await db.collection('products')
        .doc(productId)
        .update({
          data: {
            sales: db.command.inc(quantity),
            updatedAt: db.serverDate()
          }
        })

    } catch (error) {
      console.warn(`更新商品销量失败，商品ID: ${item.productId}`, error)
    }
  }
}