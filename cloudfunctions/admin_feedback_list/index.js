/**
 * 云函数：admin_feedback_list
 * 功能：用户反馈列表查询
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
      console.log('[admin_feedback_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      type,
      status,
      isRead,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 类型筛选
    if (type) {
      query.type = type
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 已读状态筛选
    if (typeof isRead === 'boolean') {
      query.isRead = isRead
    }
    
    // 获取总数
    const countRes = await db.collection('feedbacks').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('feedbacks')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 格式化返回数据
    const feedbacks = dataRes.data.map(feedback => ({
      ...feedback,
      typeLabel: {
        suggestion: '功能建议',
        bug: '问题反馈',
        complaint: '投诉',
        other: '其他'
      }[feedback.type] || feedback.type,
      statusLabel: {
        pending: '待处理',
        processing: '处理中',
        resolved: '已解决',
        closed: '已关闭'
      }[feedback.status] || feedback.status
    }))
    
    return {
      success: true,
      code: 'OK',
      data: feedbacks,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取反馈列表成功'
    }
    
  } catch (err) {
    console.error('[admin_feedback_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
