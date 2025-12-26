/**
 * 云函数：admin_orders_list
 * 功能：订单列表查询（增强版，关联用户信息）
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_orders_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      orderNo = '',
      status,
      type,
      startDate,
      endDate,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 订单号搜索
    if (orderNo) {
      query.orderNo = db.RegExp({ regexp: orderNo, options: 'i' })
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 类型筛选
    if (type) {
      query.type = type
    }
    
    // 日期范围筛选
    if (startDate && endDate) {
      query.createdAt = _.gte(new Date(startDate).getTime()).and(_.lte(new Date(endDate).getTime()))
    } else if (startDate) {
      query.createdAt = _.gte(new Date(startDate).getTime())
    } else if (endDate) {
      query.createdAt = _.lte(new Date(endDate).getTime())
    }
    
    // 获取总数
    const countRes = await db.collection('orders').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('orders')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 获取关联的用户信息
    const userIds = [...new Set(dataRes.data.map(o => o.userId).filter(Boolean))]
    let usersMap = {}
    
    if (userIds.length > 0) {
      const usersRes = await db.collection('users')
        .where({ _openid: _.in(userIds) })
        .field({ _openid: true, nickname: true, phoneNumber: true, avatarUrl: true })
        .get()
      
      usersRes.data.forEach(u => {
        usersMap[u._openid] = u
      })
    }
    
    // 格式化返回数据，映射字段以匹配后台管理系统期望的数据结构
    const orders = dataRes.data.map(order => {
      const params = order.params || {}
      
      // 映射商品列表
      let items = []
      if (params.items && Array.isArray(params.items)) {
        items = params.items.map(item => ({
          productId: item.id || item.productId,
          productName: item.name || item.productName || '未知商品',
          quantity: item.quantity || 1,
          price: item.amount || item.price || 0,
          specs: item.specs || {}
        }))
      }
      
      // 映射收货信息
      let shippingInfo = null
      if (params.address) {
        shippingInfo = {
          name: params.address.name || '',
          phone: params.address.phone || '',
          address: params.address.full || params.addressText || '',
          detail: params.address.detail || '',
          region: params.address.region || []
        }
      }
      
      // 计算总金额
      const totalAmount = params.totalAmount || items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      
      return {
        ...order,
        // 映射的字段
        totalAmount,
        items,
        shippingInfo,
        note: params.note || '',
        // 关联用户信息
        userInfo: usersMap[order.userId] || null,
        statusLabel: {
          // 待付款状态
          pending: '待付款',
          pending_payment: '待付款',
          // 已付款状态
          paid: '已付款',
          '已支付': '已支付',
          // 发货状态
          shipped: '已发货',
          delivering: '配送中',
          // 完成状态
          completed: '已完成',
          '已完成': '已完成',
          // 取消状态
          cancelled: '已取消',
          canceled: '已取消',
          '已取消': '已取消',
          // 关闭状态（超时未支付）
          closed: '已关闭',
          '已关闭': '已关闭',
          // 退款状态
          refunded: '已退款',
          '已退款': '已退款',
          refunding: '退款中',
          // 失败状态
          failed: '支付失败',
          payment_failed: '支付失败',
          '支付失败': '支付失败'
        }[order.status] || order.status
      }
    })
    
    return {
      success: true,
      code: 'OK',
      data: orders,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取订单列表成功'
    }
    
  } catch (err) {
    console.error('[admin_orders_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
