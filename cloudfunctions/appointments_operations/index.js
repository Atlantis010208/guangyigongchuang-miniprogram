/**
 * 预约操作云函数
 * 支持操作：list（获取列表）、cancel（取消预约）、reschedule（改期）、detail（获取详情）
 * 
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：list / cancel / reschedule / detail
 * @param {string} [event.appointmentId] - 预约ID（cancel、reschedule、detail 时必填）
 * @param {object} [event.rescheduleData] - 改期数据（reschedule 时使用）
 * @param {number} [event.page] - 页码，默认1（list 时使用）
 * @param {number} [event.pageSize] - 每页数量，默认20（list 时使用）
 * @param {string} [event.status] - 筛选状态（list 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 预约状态定义
const APPOINTMENT_STATUS = {
  pending: { text: '待确认', color: '#007aff' },
  confirmed: { text: '已确认', color: '#34c759' },
  completed: { text: '已完成', color: '#000' },
  cancelled: { text: '已取消', color: '#8e8e93' }
}

// 服务类型定义 - 根据 category 映射
const SERVICE_TYPES = {
  // 空间类型
  residential: '住宅设计',
  commercial: '商业设计',
  office: '办公设计',
  hotel: '酒店设计',
  // 服务类型
  custom: '个性需求定制',
  selection: '选配服务',
  publish: '设计需求',
  optimize: '方案优化',
  full: '全案设计',
  // 其他
  light_experience: '光环境体验',
  site_survey: '现场勘测',
  design_consultation: '设计咨询',
  installation: '安装服务',
  maintenance: '维护保养',
  other: '其他服务'
}

// 空间类型中文映射
const SPACE_TYPE_MAP = {
  '住宅': '住宅设计',
  '商业': '商业设计',
  '办公': '办公设计',
  '酒店': '酒店设计'
}

exports.main = async (event, context) => {
  // 获取用户身份
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: '用户身份验证失败'
    }
  }

  // 获取用户ID
  const userId = await getUserId(openid)
  
  const { action } = event

  try {
    switch (action) {
      case 'list':
        return await getAppointmentList(userId, openid, event)
      case 'cancel':
        return await cancelAppointment(userId, openid, event)
      case 'reschedule':
        return await rescheduleAppointment(userId, openid, event)
      case 'detail':
        return await getAppointmentDetail(userId, openid, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('预约操作失败:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务器错误'
    }
  }
}

/**
 * 获取用户ID
 * @param {string} openid - 用户openid
 * @returns {string} 用户ID
 */
async function getUserId(openid) {
  try {
    const usersCol = db.collection('users')
    const res = await usersCol.where({ _openid: openid }).limit(1).get()
    if (res.data && res.data.length > 0) {
      return res.data[0]._id
    }
    return ''
  } catch (err) {
    console.error('获取用户ID失败:', err)
    return ''
  }
}

/**
 * 获取预约列表
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 预约列表
 */
async function getAppointmentList(userId, openid, event) {
  const { page = 1, pageSize = 20, status } = event
  
  await ensureCollection('appointments')
  
  const col = db.collection('appointments')
  
  // 构建查询条件 - 支持 userId 或 _openid
  let condition = {}
  if (userId) {
    condition = _.or([
      { userId: userId },
      { _openid: openid }
    ])
  } else {
    condition = { _openid: openid }
  }
  
  // 如果指定了状态筛选
  if (status && APPOINTMENT_STATUS[status]) {
    condition = _.and([
      condition,
      { status: status }
    ])
  }
  
  // 查询总数
  const countRes = await col.where(condition).count()
  const total = countRes.total || 0
  
  // 分页查询
  const skip = (page - 1) * pageSize
  const res = await col
    .where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()
  
  // 收集设计师ID以批量查询联系方式
  const designerIds = [...new Set(res.data.filter(item => item.designerId).map(item => item.designerId))]
  
  // 收集关联的设计请求ID
  const requestIds = [...new Set(res.data.filter(item => item.requestId).map(item => item.requestId))]
  
  // 批量查询设计师信息
  let designersMap = {}
  if (designerIds.length > 0) {
    try {
      const designersRes = await db.collection('designers').where({
        _id: _.in(designerIds)
      }).field({
        _id: true,
        name: true,
        avatar: true,
        rating: true,
        phone: true,
        wechat: true
      }).get()
      
      designersRes.data.forEach(d => {
        designersMap[d._id] = d
      })
    } catch (err) {
      console.warn('批量查询设计师信息失败:', err.message)
    }
  }
  
  // 批量查询关联的设计请求，获取服务类型
  let requestsMap = {}
  if (requestIds.length > 0) {
    try {
      const requestsRes = await db.collection('requests').where({
        _id: _.in(requestIds)
      }).field({
        _id: true,
        category: true,
        orderNo: true
      }).get()
      
      requestsRes.data.forEach(r => {
        requestsMap[r._id] = r
      })
    } catch (err) {
      console.warn('批量查询设计请求失败:', err.message)
    }
  }
  
  // 处理预约数据，添加状态文本和设计师联系方式
  const appointments = (res.data || []).map(item => {
    const designer = designersMap[item.designerId] || {}
    const request = requestsMap[item.requestId] || {}
    const isConfirmed = item.status === 'confirmed' || item.status === 'completed'
    
    // 🔥 智能生成服务名称：优先使用关联请求的 category，其次是空间类型映射
    let serviceName = item.serviceName
    if (!serviceName || serviceName === item.designerName || serviceName === designer.name) {
      // 尝试从关联的设计请求获取服务类型
      if (request.category && SERVICE_TYPES[request.category]) {
        serviceName = SERVICE_TYPES[request.category]
      } else if (item.spaceType && SPACE_TYPE_MAP[item.spaceType]) {
        serviceName = SPACE_TYPE_MAP[item.spaceType]
      } else if (item.spaceType && SERVICE_TYPES[item.spaceType]) {
        serviceName = SERVICE_TYPES[item.spaceType]
      } else {
        serviceName = '设计咨询'
      }
    }
    
    return {
      id: item._id,
      ...item,
      statusText: APPOINTMENT_STATUS[item.status]?.text || item.status,
      statusColor: APPOINTMENT_STATUS[item.status]?.color || '#8e8e93',
      // 🔥 服务名称 - 显示服务类型而非设计师名称
      serviceName: serviceName,
      // 🔥 设计师信息 - 单独保留
      designerName: item.designerName || designer.name || '未分配',
      designerAvatar: designer.avatar || '',
      designerRating: designer.rating || 0,
      // 设计师联系方式 - 仅确认后可见
      designerPhone: isConfirmed ? (designer.phone || '') : '',
      designerWechat: isConfirmed ? (designer.wechat || '') : ''
    }
  })
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: {
      list: appointments,
      total,
      page,
      pageSize,
      hasMore: skip + appointments.length < total
    }
  }
}

/**
 * 取消预约
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function cancelAppointment(userId, openid, event) {
  const { appointmentId, reason } = event
  
  if (!appointmentId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少预约ID'
    }
  }
  
  const col = db.collection('appointments')
  
  // 查询预约，验证归属
  const res = await col.doc(appointmentId).get()
  
  if (!res.data) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '预约不存在'
    }
  }
  
  const appointment = res.data
  
  // 验证预约归属权
  const isOwner = appointment.userId === userId || appointment._openid === openid
  if (!isOwner) {
    return {
      success: false,
      code: 'FORBIDDEN',
      message: '无权操作此预约'
    }
  }
  
  // 检查预约状态
  if (appointment.status === 'cancelled') {
    return {
      success: false,
      code: 'ALREADY_CANCELLED',
      message: '预约已取消'
    }
  }
  
  if (appointment.status === 'completed') {
    return {
      success: false,
      code: 'ALREADY_COMPLETED',
      message: '已完成的预约无法取消'
    }
  }
  
  // 更新预约状态
  await col.doc(appointmentId).update({
    data: {
      status: 'cancelled',
      cancelReason: reason || '',
      cancelledAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  
  console.log(`预约已取消: ${appointmentId}, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: '预约已取消'
  }
}

/**
 * 改期预约
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function rescheduleAppointment(userId, openid, event) {
  const { appointmentId, rescheduleData } = event
  
  if (!appointmentId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少预约ID'
    }
  }
  
  if (!rescheduleData || !rescheduleData.newDate || !rescheduleData.newTime) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '请选择新的预约时间'
    }
  }
  
  const col = db.collection('appointments')
  
  // 查询预约，验证归属
  const res = await col.doc(appointmentId).get()
  
  if (!res.data) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '预约不存在'
    }
  }
  
  const appointment = res.data
  
  // 验证预约归属权
  const isOwner = appointment.userId === userId || appointment._openid === openid
  if (!isOwner) {
    return {
      success: false,
      code: 'FORBIDDEN',
      message: '无权操作此预约'
    }
  }
  
  // 检查预约状态
  if (appointment.status === 'cancelled') {
    return {
      success: false,
      code: 'CANCELLED',
      message: '已取消的预约无法改期'
    }
  }
  
  if (appointment.status === 'completed') {
    return {
      success: false,
      code: 'COMPLETED',
      message: '已完成的预约无法改期'
    }
  }
  
  // 构建新的预约时间
  const newAppointmentTime = `${rescheduleData.newDate} ${rescheduleData.newTime}`
  
  // 保存改期历史
  const rescheduleHistory = appointment.rescheduleHistory || []
  rescheduleHistory.push({
    oldTime: appointment.appointmentTime || appointment.appointmentDate,
    newTime: newAppointmentTime,
    rescheduledAt: Date.now(),
    reason: rescheduleData.reason || ''
  })
  
  // 更新预约
  await col.doc(appointmentId).update({
    data: {
      appointmentDate: rescheduleData.newDate,
      appointmentTime: newAppointmentTime,
      status: 'pending', // 改期后需要重新确认
      rescheduleHistory,
      rescheduleCount: (appointment.rescheduleCount || 0) + 1,
      updatedAt: Date.now()
    }
  })
  
  console.log(`预约已改期: ${appointmentId}, 新时间: ${newAppointmentTime}`)
  
  return {
    success: true,
    code: 'OK',
    message: '改期成功，等待确认',
    data: {
      newAppointmentTime
    }
  }
}

/**
 * 获取预约详情
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 预约详情
 */
async function getAppointmentDetail(userId, openid, event) {
  const { appointmentId } = event
  
  if (!appointmentId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少预约ID'
    }
  }
  
  const col = db.collection('appointments')
  const res = await col.doc(appointmentId).get()
  
  if (!res.data) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '预约不存在'
    }
  }
  
  const appointment = res.data
  
  // 验证预约归属权
  const isOwner = appointment.userId === userId || appointment._openid === openid
  if (!isOwner) {
    return {
      success: false,
      code: 'FORBIDDEN',
      message: '无权查看此预约'
    }
  }
  
  // 查询设计师联系方式
  let designerInfo = {}
  if (appointment.designerId) {
    try {
      const designerRes = await db.collection('designers').doc(appointment.designerId).get()
      if (designerRes.data) {
        designerInfo = designerRes.data
      }
    } catch (err) {
      console.warn('查询设计师信息失败:', err.message)
    }
  }
  
  const isConfirmed = appointment.status === 'confirmed' || appointment.status === 'completed'
  
  // 处理返回数据
  const detail = {
    id: appointment._id,
    ...appointment,
    statusText: APPOINTMENT_STATUS[appointment.status]?.text || appointment.status,
    statusColor: APPOINTMENT_STATUS[appointment.status]?.color || '#8e8e93',
    serviceName: appointment.serviceName || appointment.designerName || designerInfo.name || SERVICE_TYPES[appointment.spaceType] || '预约服务',
    // 设计师信息
    designerName: appointment.designerName || designerInfo.name || '未分配',
    designerAvatar: designerInfo.avatar || '',
    designerRating: designerInfo.rating || 0,
    // 🔥 设计师联系方式 - 仅确认后可见
    designerPhone: isConfirmed ? (designerInfo.phone || '') : '',
    designerWechat: isConfirmed ? (designerInfo.wechat || '') : ''
  }
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: detail
  }
}

/**
 * 格式化预约时间
 * @param {object} appointment - 预约对象
 * @returns {string} 格式化的时间字符串
 */
function formatAppointmentTime(appointment) {
  // 如果已有格式化的时间字符串
  if (appointment.appointmentTime && typeof appointment.appointmentTime === 'string') {
    return appointment.appointmentTime
  }
  
  // 如果有日期和时间分开存储
  if (appointment.appointmentDate) {
    return appointment.appointmentDate
  }
  
  // 如果有时间戳
  if (appointment.appointmentTimestamp) {
    const date = new Date(appointment.appointmentTimestamp)
    return formatDate(date)
  }
  
  // 使用创建时间作为后备
  if (appointment.createdAt) {
    const date = new Date(appointment.createdAt)
    return formatDate(date)
  }
  
  return '待确认'
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期字符串
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (err) {
    if (err.errCode === -502005) {
      console.log(`集合 ${collectionName} 不存在，请在云开发控制台创建`)
    }
  }
}
