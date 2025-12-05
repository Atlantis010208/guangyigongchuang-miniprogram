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
      page = 1,
      pageSize = 20,
      status,
      startTime,
      endTime
    } = event

    // 构建查询条件
    let query = {
      userId: OPENID,
      type: 'mall',
      isDelete: 0
    }

    // 状态筛选
    if (status) {
      query.status = status
    }

    // 时间范围筛选
    if (startTime || endTime) {
      query.createdAt = {}
      if (startTime) {
        query.createdAt.$gte = new Date(startTime)
      }
      if (endTime) {
        query.createdAt.$lte = new Date(endTime)
      }
    }

    // 计算分页偏移量
    const skip = (Number(page) - 1) * Number(pageSize)

    // 获取总数
    const countResult = await db.collection('orders')
      .where(query)
      .count()

    const total = countResult.total

    // 获取订单列表
    const ordersResult = await db.collection('orders')
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Number(pageSize))
      .get()

    const orders = ordersResult.data

    // 处理订单数据
    for (let order of orders) {
      // 格式化订单状态
      order.statusText = getOrderStatusText(order.status)

      // 处理商品图片
      if (order.params && order.params.items) {
        for (let item of order.params.items) {
          if (item.image && item.image.startsWith('cloud://')) {
            try {
              const tempFileResult = await cloud.getTempFileURL({
                fileList: [item.image]
              })
              item.imageUrl = tempFileResult.fileList[0].tempFileURL
            } catch (error) {
              console.warn('获取商品图片URL失败:', error)
              item.imageUrl = item.image
            }
          } else {
            item.imageUrl = item.image
          }
        }
      }
    }

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        orders,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / Number(pageSize))
        }
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('查询电商订单列表失败:', error)
    return {
      success: false,
      code: 'QUERY_ORDERS_ERROR',
      errorMessage: '查询订单列表失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 获取订单状态文本
function getOrderStatusText(status) {
  const statusMap = {
    'pending_payment': '待支付',
    'paid': '已支付',
    'shipped': '已发货',
    'delivered': '已送达',
    'completed': '已完成',
    'cancelled': '已取消',
    'refunded': '已退款'
  }
  return statusMap[status] || status
}