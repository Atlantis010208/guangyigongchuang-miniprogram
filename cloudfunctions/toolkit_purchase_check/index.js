/**
 * 云函数：toolkit_purchase_check
 * 功能：检查用户是否已购买工具包
 * 权限：公开（未登录返回 isPurchased: false）
 * 
 * 参数：
 * - toolkitId: 工具包 ID（可选，默认为 'toolkit'）
 * 
 * 返回：
 * - success: true/false
 * - code: 'OK' | 'INVALID_PARAMS' | 'SERVER_ERROR'
 * - data: { isPurchased: boolean, purchasedAt?: Date, orderId?: string }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const startTime = Date.now()
  
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    
    const { toolkitId = 'toolkit' } = event
    
    console.log('[toolkit_purchase_check] 开始检查权限:', {
      OPENID: OPENID ? `${OPENID.substring(0, 10)}...` : 'null',
      toolkitId
    })
    
    // 1. 如果用户未登录，直接返回未购买
    if (!OPENID) {
      console.log('[toolkit_purchase_check] 用户未登录，返回未购买')
      return {
        success: true,
        code: 'OK',
        data: { isPurchased: false },
        message: '用户未登录'
      }
    }
    
    // 2. 查询用户已支付的工具包订单
    // 查询条件：(userId 或 _openid) + category='toolkit' + status in ['paid', 'completed'] + isDelete != 1
    const ordersRes = await db.collection('orders')
      .where({
        _openid: OPENID,  // 使用 _openid 字段查询，这是云数据库自动添加的字段
        category: 'toolkit',
        status: _.in(['paid', 'completed']),
        isDelete: _.neq(1)
      })
      .field({
        _id: true,
        orderNo: true,
        paidAt: true,
        createdAt: true,
        params: true,
        items: true,
        category: true
      })
      .limit(20)  // 限制查询数量，优化性能
      .get()
    
    console.log('[toolkit_purchase_check] 查询订单数量:', ordersRes.data.length)
    
    // 打印订单详情用于调试
    if (ordersRes.data.length > 0) {
      console.log('[toolkit_purchase_check] 订单详情:', JSON.stringify(ordersRes.data, null, 2))
    }
    
    // 3. 检查订单中是否包含目标工具包
    for (const order of ordersRes.data) {
      // 获取订单商品列表（兼容不同数据结构）
      const items = (order.params && order.params.items) || order.items || []
      
      for (const item of items) {
        // 获取商品 ID（兼容不同字段名）
        const itemId = item.id || item.productId || item.toolkitId
        const itemCategory = item.category || ''
        const itemType = item.type || ''
        
        // 匹配工具包：ID 匹配 或 category 为 toolkit 或 type 为 toolkit
        if (itemId === toolkitId || itemCategory === 'toolkit' || itemType === 'toolkit') {
          const purchasedAt = order.paidAt || order.createdAt
          const orderId = order.orderNo || order._id
          
          console.log('[toolkit_purchase_check] 找到已购买订单:', {
            orderId,
            purchasedAt,
            耗时: Date.now() - startTime + 'ms'
          })
          
          return {
            success: true,
            code: 'OK',
            data: {
              isPurchased: true,
              purchasedAt,
              orderId
            },
            message: '用户已购买工具包'
          }
        }
      }
      
      // 如果订单本身就是工具包（没有 items 的情况）
      if (items.length === 0 && order.category === 'toolkit') {
        const purchasedAt = order.paidAt || order.createdAt
        const orderId = order.orderNo || order._id
        
        console.log('[toolkit_purchase_check] 找到工具包订单（无items）:', {
          orderId,
          purchasedAt,
          耗时: Date.now() - startTime + 'ms'
        })
        
        return {
          success: true,
          code: 'OK',
          data: {
            isPurchased: true,
            purchasedAt,
            orderId
          },
          message: '用户已购买工具包'
        }
      }
    }
    
    // 4. 未找到匹配的订单，返回未购买
    console.log('[toolkit_purchase_check] 未找到购买记录，返回未购买, 耗时:', Date.now() - startTime + 'ms')
    
    return {
      success: true,
      code: 'OK',
      data: { isPurchased: false },
      message: '用户未购买工具包'
    }
    
  } catch (err) {
    console.error('[toolkit_purchase_check] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误',
      data: { isPurchased: false }
    }
  }
}

