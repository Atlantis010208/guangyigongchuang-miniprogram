// 云函数：获取用户的所有请求（突破小程序端 20 条限制）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  // 从 event 或 context 获取 userId
  const userId = event.userId || OPENID
  
  if (!userId) {
    return { success: false, message: '缺少用户ID', data: [] }
  }
  
  try {
    // 云函数中可以获取最多 1000 条记录
    // 使用 _.or 匹配 userId 或 _openid
    const res = await db.collection('requests')
      .where(_.or([
        { userId: userId },
        { _openid: OPENID }
      ]))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()
    
    console.log('[requests_list] 查询用户请求, userId:', userId, 'OPENID:', OPENID, '返回数量:', res.data.length)
    
    return {
      success: true,
      data: res.data,
      total: res.data.length
    }
  } catch (err) {
    console.error('[requests_list] 查询失败:', err)
    return {
      success: false,
      message: err.message || '查询失败',
      data: []
    }
  }
}

