/**
 * 云函数：admin_feedback_reply
 * 功能：回复用户反馈
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
      console.log('[admin_feedback_reply] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const adminUser = authResult.user
    const { feedbackId, id, reply, status } = event
    const targetId = feedbackId || id
    
    if (!targetId) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少反馈ID' }
    }
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now(),
      isRead: true
    }
    
    // 回复内容
    if (reply) {
      updateData.reply = reply
      updateData.replyTime = Date.now()
      updateData.repliedBy = adminUser._id
    }
    
    // 状态更新
    if (status) {
      const validStatuses = ['pending', 'processing', 'resolved', 'closed']
      if (!validStatuses.includes(status)) {
        return { success: false, code: 'INVALID_STATUS', errorMessage: '无效的状态值' }
      }
      updateData.status = status
      updateData.statusLabel = {
        pending: '待处理',
        processing: '处理中',
        resolved: '已解决',
        closed: '已关闭'
      }[status]
    }
    
    // 如果有回复内容，默认设置为处理中
    if (reply && !status) {
      updateData.status = 'processing'
      updateData.statusLabel = '处理中'
    }
    
    // 执行更新
    const result = await db.collection('feedbacks')
      .doc(targetId)
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '反馈不存在' }
    }
    
    console.log(`[admin_feedback_reply] Admin: ${adminUser._id}, Replied feedback: ${targetId}`)
    
    return {
      success: true,
      code: 'OK',
      data: { updated: result.stats.updated },
      message: '反馈回复成功'
    }
    
  } catch (err) {
    console.error('[admin_feedback_reply] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
