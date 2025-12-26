/**
 * 云函数：admin_dashboard_stats
 * 功能：后台管理仪表盘统计数据
 * 权限：管理员（roles=0）或设计师（roles=1）
 * 
 * 权限说明：
 * - 管理员：查看全平台统计
 * - 设计师：仅查看个人相关统计
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireBackendAuth, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 获取指定时间范围的起始时间戳
 */
function getTimeRange(range) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (range) {
    case 'today':
      return today.getTime()
    case 'week':
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - 7)
      return weekStart.getTime()
    case 'month':
      const monthStart = new Date(today)
      monthStart.setMonth(today.getMonth() - 1)
      return monthStart.getTime()
    case 'year':
      const yearStart = new Date(today)
      yearStart.setFullYear(today.getFullYear() - 1)
      return yearStart.getTime()
    default:
      const defaultStart = new Date(today)
      defaultStart.setDate(today.getDate() - 7)
      return defaultStart.getTime()
  }
}

/**
 * 获取近N天的每日统计（支持设计师过滤）
 */
async function getDailyTrend(collection, days = 7, designerId = null) {
  const result = []
  const now = new Date()
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1
    
    try {
      let query = {
        createdAt: _.gte(startOfDay).and(_.lte(endOfDay)),
        isDelete: _.neq(1)
      }
      
      // 设计师数据过滤
      if (designerId) {
        query.designerId = designerId
      }
      
      const countRes = await db.collection(collection)
        .where(query)
        .count()
      
      result.push({
        date: `${date.getMonth() + 1}-${date.getDate()}`,
        fullDate: date.toISOString().split('T')[0],
        count: countRes.total,
        amount: 0
      })
    } catch (e) {
      result.push({
        date: `${date.getMonth() + 1}-${date.getDate()}`,
        fullDate: date.toISOString().split('T')[0],
        count: 0,
        amount: 0
      })
    }
  }
  
  return result
}

exports.main = async (event) => {
  try {
    // 权限验证（支持管理员和设计师）
    const authResult = await requireBackendAuth(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_dashboard_stats] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { timeRange = 'week' } = event
    const rangeStart = getTimeRange(timeRange)
    const isDesigner = authResult.roles === 1
    const designerId = authResult.designerId
    
    console.log('[admin_dashboard_stats] 用户角色:', { isDesigner, designerId })
    
    // ========== 设计师统计模式 ==========
    if (isDesigner && designerId) {
      // 设计师只看自己的数据
      const [
        myRequestsCount,
        myPendingRequestsCount,
        myCompletedRequestsCount,
        myAppointmentsCount,
        myPendingAppointmentsCount,
        myConfirmedAppointmentsCount,
        requestsTrend
      ] = await Promise.all([
        // 我的请求总数
        db.collection('requests').where({ 
          designerId: designerId,
          isDelete: _.neq(1)
        }).count(),
        // 我的待处理请求
        db.collection('requests').where({
          designerId: designerId,
          status: 'submitted',
          isDelete: _.neq(1)
        }).count(),
        // 我的已完成请求
        db.collection('requests').where({
          designerId: designerId,
          status: 'completed',
          isDelete: _.neq(1)
        }).count(),
        // 我的预约总数
        db.collection('appointments').where({
          designerId: designerId,
          isDelete: _.neq(1)
        }).count(),
        // 我的待确认预约
        db.collection('appointments').where({
          designerId: designerId,
          status: 'pending',
          isDelete: _.neq(1)
        }).count(),
        // 我的已确认预约
        db.collection('appointments').where({
          designerId: designerId,
          status: 'confirmed',
          isDelete: _.neq(1)
        }).count(),
        // 我的请求趋势
        getDailyTrend('requests', 7, designerId)
      ])
      
      return {
        success: true,
        code: 'OK',
        data: {
          isDesignerMode: true,
          designerInfo: {
            designerId: designerId,
            name: authResult.user.name || authResult.user.nickname
          },
          overview: {
            myRequests: myRequestsCount.total,
            myPendingRequests: myPendingRequestsCount.total,
            myCompletedRequests: myCompletedRequestsCount.total,
            myAppointments: myAppointmentsCount.total,
            myPendingAppointments: myPendingAppointmentsCount.total,
            myConfirmedAppointments: myConfirmedAppointmentsCount.total
          },
          requestsTrend
        },
        message: '获取设计师统计数据成功'
      }
    }
    
    // ========== 管理员统计模式 ==========
    const [
      usersCount,
      newUsersCount,
      designersCount,
      ordersCount,
      pendingOrdersCount,
      monthOrdersRes,
      requestsCount,
      pendingRequestsCount,
      appointmentsCount,
      pendingAppointmentsCount,
      ordersTrend,
      requestsRes
    ] = await Promise.all([
      db.collection('users').where({ isDelete: _.neq(1) }).count(),
      db.collection('users').where({ 
        createdAt: _.gte(rangeStart),
        isDelete: _.neq(1)
      }).count(),
      db.collection('designers').where({ isDelete: _.neq(1) }).count(),
      db.collection('orders').where({ isDelete: _.neq(1) }).count(),
      db.collection('orders').where({ 
        status: 'pending',
        isDelete: _.neq(1)
      }).count(),
      db.collection('orders').where({
        createdAt: _.gte(getTimeRange('month')),
        isDelete: _.neq(1),
        status: _.in(['paid', 'shipped', 'completed'])
      }).field({ totalAmount: true }).get(),
      db.collection('requests').where({ isDelete: _.neq(1) }).count(),
      db.collection('requests').where({
        status: 'submitted',
        isDelete: _.neq(1)
      }).count(),
      db.collection('appointments').where({ isDelete: _.neq(1) }).count(),
      db.collection('appointments').where({
        status: 'pending',
        isDelete: _.neq(1)
      }).count(),
      getDailyTrend('orders', 7),
      db.collection('requests').where({ isDelete: _.neq(1) }).field({ space: true }).get()
    ])
    
    const totalRevenue = monthOrdersRes.data.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
    
    const requestsDistribution = {
      residential: 0,
      commercial: 0,
      office: 0,
      hotel: 0
    }
    requestsRes.data.forEach(req => {
      if (req.space && requestsDistribution.hasOwnProperty(req.space)) {
        requestsDistribution[req.space]++
      }
    })
    
    return {
      success: true,
      code: 'OK',
      data: {
        isDesignerMode: false,
        overview: {
          totalUsers: usersCount.total,
          newUsersThisWeek: newUsersCount.total,
          totalDesigners: designersCount.total,
          totalOrders: ordersCount.total,
          pendingOrders: pendingOrdersCount.total,
          monthOrders: monthOrdersRes.data.length,
          totalRevenue: totalRevenue,
          totalRequests: requestsCount.total,
          pendingRequests: pendingRequestsCount.total,
          totalAppointments: appointmentsCount.total,
          pendingAppointments: pendingAppointmentsCount.total
        },
        ordersTrend,
        requestsDistribution
      },
      message: '获取统计数据成功'
    }
    
  } catch (err) {
    console.error('[admin_dashboard_stats] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
