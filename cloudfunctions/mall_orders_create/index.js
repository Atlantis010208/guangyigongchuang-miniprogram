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
      items = [],
      addressInfo = {},
      totalAmount = 0,
      paymentMethod = 'wechat',
      remark = ''
    } = event

    // 验证必要参数
    if (!items || items.length === 0) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '商品列表不能为空',
        timestamp: Date.now()
      }
    }

    if (!addressInfo || !addressInfo.name || !addressInfo.phone || !addressInfo.address) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '收货地址信息不完整',
        timestamp: Date.now()
      }
    }

    if (!totalAmount || totalAmount <= 0) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '订单金额必须大于0',
        timestamp: Date.now()
      }
    }

    // 生成订单号
    const orderNo = generateOrderNo()

    // 创建订单数据
    const orderData = {
      orderNo,
      userId: OPENID,
      type: 'mall',
      category: '商品订单',
      params: {
        items: items.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          specs: item.specs || {},
          image: item.image || '',
          totalPrice: item.price * item.quantity
        })),
        address: {
          name: addressInfo.name,
          phone: addressInfo.phone,
          province: addressInfo.province || '',
          city: addressInfo.city || '',
          district: addressInfo.district || '',
          address: addressInfo.address,
          postalCode: addressInfo.postalCode || ''
        },
        totalAmount,
        paymentMethod,
        remark,
        status: 'pending_payment' // 待支付
      },
      status: 'pending_payment',
      paid: false,
      isDelete: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // 插入订单
    const result = await db.collection('orders').add({
      data: orderData
    })

    // 创建交易记录
    await db.collection('transactions').add({
      data: {
        orderNo,
        userId: OPENID,
        amount: totalAmount,
        type: 'payment',
        status: 'pending',
        paymentMethod,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    // 减少商品库存
    for (const item of items) {
      try {
        const productResult = await db.collection('products')
          .doc(item.id)
          .get()

        if (productResult.data) {
          const product = productResult.data
          const newInventory = Math.max(0, product.inventory - item.quantity)

          await db.collection('products')
            .doc(item.id)
            .update({
              data: {
                inventory: newInventory,
                sales: db.command.inc(item.quantity),
                updatedAt: db.serverDate()
              }
            })
        }
      } catch (error) {
        console.warn(`更新商品库存失败，商品ID: ${item.id}`, error)
      }
    }

    return {
      success: true,
      code: 'OK',
      message: '订单创建成功',
      data: {
        orderId: result._id,
        orderNo,
        totalAmount,
        status: 'pending_payment'
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('创建电商订单失败:', error)
    return {
      success: false,
      code: 'CREATE_ORDER_ERROR',
      errorMessage: '创建订单失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 生成订单号
function generateOrderNo() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `M${timestamp}${random}`
}