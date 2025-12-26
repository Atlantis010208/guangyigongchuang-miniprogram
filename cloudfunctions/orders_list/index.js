// 云函数：获取用户的所有订单（突破小程序端 20 条限制）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  // 从 event 或 context 获取 userId
  const userId = event.userId || OPENID
  
  console.log('[orders_list] 开始查询, event.userId:', event.userId, 'OPENID:', OPENID, '最终userId:', userId)
  
  if (!userId && !OPENID) {
    return { success: false, message: '缺少用户ID', data: [] }
  }
  
  try {
    // 构建查询条件数组
    const conditions = []
    if (userId) {
      conditions.push({ userId: userId })
    }
    if (OPENID) {
      conditions.push({ _openid: OPENID })
    }
    
    // 云函数中可以获取最多 1000 条记录
    // 使用 _.or 匹配 userId 或 _openid
    const res = await db.collection('orders')
      .where(_.or(conditions))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()
    
    // 统计待支付订单数量
    const pendingCount = res.data.filter(d => 
      d.status === 'pending_payment' || d.status === 'pending'
    ).length
    
    console.log('[orders_list] 查询结果: 总数:', res.data.length, '待支付:', pendingCount)
    
    return {
      success: true,
      data: res.data,
      total: res.data.length,
      pendingCount: pendingCount
    }
  } catch (err) {
    console.error('[orders_list] 查询失败:', err)
    return {
      success: false,
      message: err.message || '查询失败',
      data: []
    }
  }
}

