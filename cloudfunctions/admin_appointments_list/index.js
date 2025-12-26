/**
 * 云函数：admin_appointments_list
 * 功能：预约列表查询
 * 权限：管理员（roles=0）或设计师（roles=1）
 * 
 * 权限说明：
 * - 管理员：查看全部预约
 * - 设计师：仅查看分配给自己的预约
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

exports.main = async (event) => {
  try {
    // 权限验证（支持管理员和设计师）
    const authResult = await requireBackendAuth(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_appointments_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      status,
      spaceType,
      designerId,
      startDate,
      endDate,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // ========== 设计师数据过滤 ==========
    // 如果是设计师登录（roles=1），强制只查看自己的预约
    if (authResult.roles === 1 && authResult.designerId) {
      query.designerId = authResult.designerId
      console.log('[admin_appointments_list] 设计师模式，筛选 designerId:', authResult.designerId)
    }
    // 管理员可以按 designerId 筛选
    else if (designerId) {
      query.designerId = designerId
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 空间类型筛选
    if (spaceType) {
      query.spaceType = spaceType
    }
    
    // 日期范围筛选
    if (startDate && endDate) {
      query.createdAt = _.gte(new Date(startDate).getTime()).and(_.lte(new Date(endDate).getTime()))
    }
    
    // 获取总数
    const countRes = await db.collection('appointments').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('appointments')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 获取关联的用户和设计师信息
    const userIds = [...new Set(dataRes.data.map(a => a.userId).filter(Boolean))]
    const designerIds = [...new Set(dataRes.data.map(a => a.designerId).filter(Boolean))]
    
    let usersMap = {}
    let designersMap = {}
    
    if (userIds.length > 0) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(userIds) })
        .field({ _id: true, _openid: true, nickname: true, phoneNumber: true, avatarUrl: true })
        .get()
      usersRes.data.forEach(u => { usersMap[u._id] = u })
      
      const missingUserIds = userIds.filter(id => !usersMap[id])
      if (missingUserIds.length > 0) {
        const usersRes2 = await db.collection('users')
          .where({ _openid: _.in(missingUserIds) })
          .field({ _id: true, _openid: true, nickname: true, phoneNumber: true, avatarUrl: true })
          .get()
        usersRes2.data.forEach(u => { usersMap[u._openid] = u })
      }
    }
    
    if (designerIds.length > 0) {
      const designersRes = await db.collection('designers')
        .where({ _id: _.in(designerIds) })
        .field({ _id: true, name: true, avatar: true, rating: true, phone: true, wechat: true })
        .get()
      designersRes.data.forEach(d => { designersMap[d._id] = d })
    }
    
    // 格式化返回数据
    const appointments = dataRes.data.map(appointment => {
      const userInfo = usersMap[appointment.userId] || null
      
      const fallbackUserInfo = userInfo ? userInfo : {
        nickname: appointment.contact || '未知用户',
        phoneNumber: appointment.phone || appointment.contact || '-',
        avatarUrl: ''
      }
      
      const designerInfo = designersMap[appointment.designerId] || null
      const isConfirmed = appointment.status === 'confirmed' || appointment.status === 'completed'
      
      const fallbackDesignerInfo = designerInfo ? {
        ...designerInfo,
        phone: isConfirmed ? designerInfo.phone : undefined,
        wechat: isConfirmed ? designerInfo.wechat : undefined
      } : {
        name: appointment.designerName || appointment.serviceName || '未分配',
        avatar: '',
        rating: null
      }
      
      let formattedAppointmentTime = null
      if (appointment.appointmentTime) {
        formattedAppointmentTime = appointment.appointmentTime
      } else if (appointment.appointmentDate) {
        formattedAppointmentTime = appointment.appointmentDate
      }
      
      return {
        ...appointment,
        userInfo: {
          ...(userInfo || fallbackUserInfo),
          contact: appointment.contact || '',
          contactType: appointment.contactType || ''
        },
        designerInfo: fallbackDesignerInfo,
        statusLabel: {
          pending: '待确认',
          confirmed: '已确认',
          completed: '已完成',
          cancelled: '已取消'
        }[appointment.status] || appointment.status,
        hasRequest: !!appointment.requestId,
        requestId: appointment.requestId || null,
        requestOrderNo: appointment.requestOrderNo || null
      }
    })
    
    return {
      success: true,
      code: 'OK',
      data: appointments,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      // 返回当前用户角色信息
      userRoles: authResult.roles,
      designerId: authResult.designerId,
      message: '获取预约列表成功'
    }
    
  } catch (err) {
    console.error('[admin_appointments_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
