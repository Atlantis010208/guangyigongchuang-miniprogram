/**
 * 云函数：admin_fix_order_category
 * 功能：批量修复订单的 category 字段
 * 说明：根据商品名称或商品ID判断订单类型（toolkit/course/mall）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 验证管理员权限
async function verifyAdmin(openid) {
  if (!openid) return { success: false, errorCode: 'NO_OPENID' }
  
  try {
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, errorCode: 'USER_NOT_FOUND' }
    }
    
    const user = userRes.data[0]
    if (user.role !== 'admin') {
      return { success: false, errorCode: 'NOT_ADMIN' }
    }
    
    return { success: true, user }
  } catch (err) {
    console.error('验证管理员权限失败:', err)
    return { success: false, errorCode: 'VERIFY_ERROR' }
  }
}

// 判断订单分类
function determineCategory(order) {
  // 如果已经有正确的 category，跳过
  if (order.category === 'toolkit' || order.category === 'course') {
    return null // 不需要修改
  }
  
  // 获取商品信息
  const items = (order.params && order.params.items) || order.items || []
  const firstItem = items[0]
  
  if (!firstItem) {
    return null
  }
  
  const name = (firstItem.name || firstItem.title || '').toLowerCase()
  const id = (firstItem.id || '').toLowerCase()
  
  // 判断是否为工具包
  if (
    name.includes('工具包') || 
    name.includes('toolkit') ||
    id.startsWith('tk') ||
    id.includes('toolkit')
  ) {
    return 'toolkit'
  }
  
  // 判断是否为课程
  if (
    name.includes('课程') || 
    name.includes('course') ||
    name.includes('设计课') ||
    name.includes('培训') ||
    id.startsWith('co') ||
    id.includes('course')
  ) {
    return 'course'
  }
  
  // 其他情况保持不变
  return null
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action = 'preview', orderIds } = event
  
  // 验证管理员权限
  const authResult = await verifyAdmin(wxContext.OPENID)
  if (!authResult.success) {
    return {
      success: false,
      code: authResult.errorCode,
      errorMessage: '需要管理员权限'
    }
  }
  
  try {
    // 查询所有商城订单
    let query = db.collection('orders').where({
      type: 'goods',
      isDelete: _.neq(1)
    })
    
    // 如果指定了订单ID，只查询这些订单
    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      query = db.collection('orders').where({
        _id: _.in(orderIds)
      })
    }
    
    const ordersRes = await query.limit(1000).get()
    const orders = ordersRes.data || []
    
    console.log(`[admin_fix_order_category] 查询到 ${orders.length} 个订单`)
    
    // 分析需要修复的订单
    const toFix = []
    const skipped = []
    
    for (const order of orders) {
      const newCategory = determineCategory(order)
      if (newCategory) {
        toFix.push({
          _id: order._id,
          orderNo: order.orderNo,
          oldCategory: order.category || '(未设置)',
          newCategory: newCategory,
          itemName: (order.params?.items?.[0]?.name) || (order.items?.[0]?.name) || '未知商品'
        })
      } else {
        skipped.push({
          _id: order._id,
          orderNo: order.orderNo,
          category: order.category || '(未设置)',
          reason: order.category === 'toolkit' || order.category === 'course' ? '已是虚拟商品' : '无法判断类型'
        })
      }
    }
    
    // 如果是预览模式，只返回分析结果
    if (action === 'preview') {
      return {
        success: true,
        data: {
          total: orders.length,
          toFixCount: toFix.length,
          skippedCount: skipped.length,
          toFix: toFix,
          skipped: skipped.slice(0, 10) // 只返回前10条
        },
        message: `共 ${orders.length} 个订单，其中 ${toFix.length} 个需要修复`
      }
    }
    
    // 执行修复
    if (action === 'fix') {
      const results = []
      
      for (const item of toFix) {
        try {
          await db.collection('orders').doc(item._id).update({
            data: {
              category: item.newCategory,
              updatedAt: db.serverDate()
            }
          })
          results.push({ ...item, status: 'success' })
        } catch (err) {
          console.error(`修复订单 ${item.orderNo} 失败:`, err)
          results.push({ ...item, status: 'failed', error: err.message })
        }
      }
      
      const successCount = results.filter(r => r.status === 'success').length
      const failedCount = results.filter(r => r.status === 'failed').length
      
      return {
        success: true,
        data: {
          total: toFix.length,
          successCount,
          failedCount,
          results: results
        },
        message: `修复完成：成功 ${successCount} 个，失败 ${failedCount} 个`
      }
    }
    
    return {
      success: false,
      errorMessage: '无效的 action 参数，请使用 preview 或 fix'
    }
    
  } catch (err) {
    console.error('[admin_fix_order_category] Error:', err)
    return {
      success: false,
      code: 'QUERY_ERROR',
      errorMessage: err.message || '查询订单失败'
    }
  }
}

