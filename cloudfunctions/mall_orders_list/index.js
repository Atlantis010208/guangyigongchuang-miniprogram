// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { OPENID } = wxContext

  try {
    const {
      page = 1,
      pageSize = 20,
      status,
      orderType,     // 订单类型筛选: physical / virtual / mixed
      startTime,
      endTime,
      orderNo,       // 支持按订单号查询单个订单
      category,      // 订单分类
      limit          // 可选的结果限制
    } = event

    // 如果指定了订单号，直接查询单个订单
    if (orderNo) {
      const orderResult = await db.collection('orders')
        .where({
          orderNo: orderNo,
          userId: OPENID,
          isDelete: _.or(_.eq(0), _.exists(false))
        })
        .get()
      
      if (orderResult.data.length === 0) {
        return {
          success: false,
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在',
          data: [],
          timestamp: Date.now()
        }
      }

      const order = orderResult.data[0]
      order.statusText = getOrderStatusText(order.status, order.orderType)

      // 批量处理单个订单的图片
      await batchProcessOrderImages([order])

      return {
        success: true,
        code: 'OK',
        message: '查询成功',
        data: [order],
        timestamp: Date.now()
      }
    }

    // 构建查询条件
    const query = {
      userId: OPENID,
      isDelete: _.or(_.eq(0), _.exists(false))
    }

    // 正式版兼容：商城列表同时返回工具包，沿用客户端商城订单详情分支。
    // 订单记录仍保留 category=toolkit，客户端按订单号去重。
    let categoryCondition = null
    if (category === 'mall') {
      categoryCondition = _.or([{ type: 'mall' }, { category: _.in(['mall', 'goods', 'toolkit']) }])
    } else if (category) {
      query.category = category
    }

    // 订单类型筛选（新增）
    if (orderType) {
      query.orderType = orderType
    }

    // 状态筛选
    if (status) {
      query.status = status
    }

    // 时间范围筛选
    if (startTime || endTime) {
      const timeConditions = []
      if (startTime) {
        timeConditions.push(_.gte(new Date(startTime)))
      }
      if (endTime) {
        timeConditions.push(_.lte(new Date(endTime)))
      }
      query.createdAt = timeConditions.length === 2
        ? timeConditions[0].and(timeConditions[1])
        : timeConditions[0]
    }

    const finalQuery = categoryCondition ? _.and([query, categoryCondition]) : query

    // 计算分页偏移量
    const skip = (Number(page) - 1) * Number(pageSize)

    // 并行获取总数和订单列表
    const [countResult, ordersResult] = await Promise.all([
      db.collection('orders').where(finalQuery).count(),
      db.collection('orders')
        .where(finalQuery)
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(Number(pageSize))
        .get()
    ])

    const total = countResult.total
    const orders = ordersResult.data

    if (category === 'mall') {
      // 补齐同页工具包窗口：否则较旧工具包可能落在商城混合分页之外，
      // 却出现在独立工具包响应中，旧客户端仍会走错误的商品详情分支。
      // 此兼容列表最多额外返回一页工具包；独立查询的过滤和分页保持原样。
      const toolkitResult = await db.collection('orders')
        .where({ ...query, category: 'toolkit' })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(Number(pageSize))
        .get()
      const seen = new Set(orders.map(order => order.orderNo || order._id))
      for (const order of toolkitResult.data || []) {
        const key = order.orderNo || order._id
        if (!seen.has(key)) { orders.push(order); seen.add(key) }
      }
      orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    // 格式化订单状态
    orders.forEach(order => {
      order.statusText = getOrderStatusText(order.status, order.orderType)
    })

    // 批量处理所有订单中的商品图片
    await batchProcessOrderImages(orders)

    // 使用 limit 参数覆盖 pageSize（向后兼容）
    const actualLimit = limit || pageSize

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: orders,
      pagination: {
        page: Number(page),
        pageSize: Number(actualLimit),
        total,
        totalPages: Math.ceil(total / Number(actualLimit))
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

// 获取订单状态文本（区分实物/虚拟订单）
function getOrderStatusText(status, orderType) {
  // 虚拟订单状态映射
  if (orderType === 'virtual') {
    const virtualStatusMap = {
      'pending': '待支付',
      'pending_payment': '待支付',
      'payment_processing': '支付中',
      'paid': '已完成',
      'completed': '已完成',
      'closed': '已关闭',
      'cancelled': '已取消',
      'refunded': '已退款'
    }
    return virtualStatusMap[status] || status
  }

  // 实物/混合订单状态映射
  const statusMap = {
    'pending': '待支付',
    'pending_payment': '待支付',
    'payment_processing': '支付中',
    'paid': '已支付',
    'shipped': '已发货',
    'delivered': '已送达',
    'completed': '已完成',
    'closed': '已关闭',
    'cancelled': '已取消',
    'refunded': '已退款'
  }
  return statusMap[status] || status
}

/**
 * 批量处理所有订单中商品图片的 cloud:// URL
 * 汇总所有订单所有商品的图片后一次性调用 getTempFileURL
 * @param {Array} orders - 订单数组
 */
async function batchProcessOrderImages(orders) {
  if (!orders || orders.length === 0) return

  // 收集所有 cloud:// 图片（去重）
  const cloudFileIdSet = new Set()

  orders.forEach(order => {
    if (order.params && order.params.items) {
      order.params.items.forEach(item => {
        if (item.image && typeof item.image === 'string' && item.image.startsWith('cloud://')) {
          cloudFileIdSet.add(item.image)
        }
      })
    }
  })

  if (cloudFileIdSet.size === 0) {
    // 没有需要转换的，直接赋值 imageUrl
    orders.forEach(order => {
      if (order.params && order.params.items) {
        order.params.items.forEach(item => {
          item.imageUrl = item.image || ''
        })
      }
    })
    return
  }

  try {
    const tempFileResult = await cloud.getTempFileURL({
      fileList: Array.from(cloudFileIdSet)
    })

    // 构建映射表
    const urlMap = {}
    if (tempFileResult.fileList) {
      tempFileResult.fileList.forEach(file => {
        if (file.fileID && file.tempFileURL) {
          urlMap[file.fileID] = file.tempFileURL
        }
      })
    }

    // 回填到所有订单商品中
    orders.forEach(order => {
      if (order.params && order.params.items) {
        order.params.items.forEach(item => {
          if (item.image && urlMap[item.image]) {
            item.imageUrl = urlMap[item.image]
          } else {
            item.imageUrl = item.image || ''
          }
        })
      }
    })
  } catch (error) {
    console.warn('批量获取订单商品图片失败:', error)
    // 降级：直接使用原始 URL
    orders.forEach(order => {
      if (order.params && order.params.items) {
        order.params.items.forEach(item => {
          item.imageUrl = item.image || ''
        })
      }
    })
  }
}
