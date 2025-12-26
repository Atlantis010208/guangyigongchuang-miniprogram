/**
 * 云函数：admin_orders_update
 * 功能：订单状态更新（含发货）
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

// 订单状态流转规则
const STATUS_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'refunded'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
  refunded: []
}

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_orders_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少订单ID' }
    }
    
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 获取当前订单
    const orderRes = await db.collection('orders').doc(id).get()
    
    if (!orderRes.data) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '订单不存在' }
    }
    
    const currentOrder = orderRes.data
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }
    
    // 状态更新验证
    if (data.status) {
      const allowedStatuses = STATUS_TRANSITIONS[currentOrder.status] || []
      if (!allowedStatuses.includes(data.status)) {
        return {
          success: false,
          code: 'INVALID_STATUS_TRANSITION',
          errorMessage: `不允许从 ${currentOrder.status} 状态变更为 ${data.status}`
        }
      }
      updateData.status = data.status
      
      // 如果是发货状态，需要验证物流信息
      if (data.status === 'shipped') {
        if (!data.shippingInfo || !data.shippingInfo.trackingNo) {
          return { success: false, code: 'INVALID_PARAMS', errorMessage: '发货需要填写物流单号' }
        }
        updateData.shippingInfo = {
          ...currentOrder.shippingInfo,
          ...data.shippingInfo,
          shippedAt: Date.now()
        }
      }
      
      // 如果是完成状态，记录完成时间
      if (data.status === 'completed') {
        updateData.completedAt = Date.now()
      }
    }
    
    // 其他字段更新
    if (data.remark !== undefined) {
      updateData.adminRemark = data.remark
    }
    
    // 执行更新
    const result = await db.collection('orders')
      .doc(id)
      .update({
        data: updateData
      })
    
    console.log(`[admin_orders_update] Admin: ${authResult.user._id}, Updated order: ${id}, Status: ${data.status || 'unchanged'}`)
    
    return {
      success: true,
      code: 'OK',
      data: { updated: result.stats.updated },
      message: '订单更新成功'
    }
    
  } catch (err) {
    console.error('[admin_orders_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
