/**
 * 创建预约云函数
 * 用于创建设计师预约记录
 * 
 * @param {object} event - 请求参数
 * @param {object} event.form - 预约表单数据
 * @param {string} event.form.spaceType - 空间类型
 * @param {string} event.form.area - 设计面积
 * @param {string} event.form.budget - 预算范围
 * @param {string} event.form.contactType - 联系方式类型
 * @param {string} event.form.contact - 联系方式
 * @param {string} event.form.remark - 备注
 * @param {string} event.designerId - 设计师ID
 * @param {string} event.designerName - 设计师姓名
 * @param {string} [event.serviceName] - 服务名称
 * @param {string} [event.appointmentDate] - 预约日期
 * @param {string} [event.appointmentTime] - 预约时间
 * @param {string} [event.address] - 服务地址
 * @param {string} [event.phone] - 联系电话
 * @param {string} [event.requestId] - 关联的设计请求ID（可选）
 * @param {boolean} [event.autoMatch] - 是否自动匹配用户的待处理设计请求（默认true）
 * @returns {object} { success, appointment, errorMessage }
 */
const cloud = require('wx-server-sdk')

// 使用动态环境，自动匹配当前云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 自动匹配用户的待处理设计请求
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @returns {Object|null} 匹配到的设计请求 { _id, orderNo }
 */
async function autoMatchRequest(userId, openid) {
  try {
    // 查询用户的待处理设计请求
    // 🔥 放宽条件：未删除、未分配设计师、不是商城订单、非完成状态
    const query = {
      isDelete: _.neq(1),
      status: _.neq('done'),  // 🔥 只排除已完成的
      category: _.neq('mall'),  // 排除商城订单
      // 未分配设计师的情况
      designerId: _.or(_.exists(false), _.eq(''), _.eq(null))
    }
    
    // 优先使用 userId
    if (userId) {
      query.userId = userId
    } else if (openid) {
      query._openid = openid
    } else {
      console.log('[autoMatchRequest] 缺少 userId 和 openid，无法匹配')
      return null
    }
    
    console.log('[autoMatchRequest] 查询条件:', JSON.stringify(query))
    
    const requestRes = await db.collection('requests')
      .where(query)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    
    if (requestRes.data && requestRes.data.length > 0) {
      const matched = requestRes.data[0]
      console.log(`[autoMatchRequest] 自动匹配到设计请求: ${matched.orderNo}, ID: ${matched._id}, status: ${matched.status}`)
      return matched
    }
    
    console.log('[autoMatchRequest] 未找到匹配的设计请求')
    return null
  } catch (err) {
    console.error('[autoMatchRequest] 自动匹配失败:', err)
    return null
  }
}

exports.main = async (event, context) => {
  console.log('appointments_create 收到请求:', JSON.stringify(event))
  
  try {
    // 获取用户身份
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID || wxContext.openid
    
    if (!openid) {
      console.error('用户身份验证失败: 缺少 openid')
      return { 
        success: false, 
        code: 'AUTH_FAILED',
        errorMessage: '用户身份验证失败' 
      }
    }
    
    // 解析参数
    const form = event.form || {}
    const designerId = event.designerId || ''
    const designerName = event.designerName || ''
    
    // 获取用户ID
    let userId = ''
    try {
      const usersCol = db.collection('users')
      const userRes = await usersCol.where({ _openid: openid }).limit(1).get()
      if (userRes.data && userRes.data.length > 0) {
        userId = userRes.data[0]._id
      }
    } catch (err) {
      console.warn('获取用户ID失败:', err.message)
    }
    
    // 构建预约文档
    const now = Date.now()
    
    // 处理关联设计请求
    let requestId = event.requestId || ''
    let requestOrderNo = event.requestOrderNo || ''
    
    // 如果没有指定 requestId 且开启自动匹配
    if (!requestId && event.autoMatch !== false) {
      const matchedRequest = await autoMatchRequest(userId, openid)
      if (matchedRequest) {
        requestId = matchedRequest._id
        requestOrderNo = matchedRequest.orderNo || ''
        console.log(`[appointments_create] 自动关联设计请求: ${requestOrderNo}`)
      }
    } else if (requestId) {
      // 🔥 兼容处理：检查 requestId 是否为 orderNo 格式（纯数字）
      // 如果是，则通过 orderNo 查找真正的 _id
      const isOrderNoFormat = /^\d+$/.test(requestId)
      
      if (isOrderNoFormat) {
        console.log(`[appointments_create] 检测到 requestId 为 orderNo 格式: ${requestId}，尝试转换`)
        try {
          const reqByOrderNo = await db.collection('requests')
            .where({ orderNo: requestId })
            .limit(1)
            .get()
          
          if (reqByOrderNo.data && reqByOrderNo.data.length > 0) {
            const foundReq = reqByOrderNo.data[0]
            requestId = foundReq._id
            requestOrderNo = foundReq.orderNo || requestId
            console.log(`[appointments_create] 转换成功: orderNo=${requestOrderNo}, _id=${requestId}`)
          } else {
            console.warn(`[appointments_create] 未找到 orderNo=${requestId} 的请求`)
            requestId = ''
          }
        } catch (e) {
          console.warn('[appointments_create] 通过 orderNo 查找请求失败:', e.message)
          requestId = ''
        }
      } else {
        // 正常的 _id 格式，获取关联请求的订单号
        try {
          const reqRes = await db.collection('requests').doc(requestId).get()
          if (reqRes.data) {
            requestOrderNo = reqRes.data.orderNo || ''
          }
        } catch (e) {
          console.warn('获取关联请求信息失败:', e.message)
        }
      }
    }
    
    const doc = {
      _openid: openid,                      // 重要：添加 _openid 用于查询归属
      userId: userId,
      designerId: designerId,
      designerName: designerName,
      // 关联设计请求
      requestId: requestId,                 // 关联的设计请求ID
      requestOrderNo: requestOrderNo,       // 关联的设计请求订单号
      // 服务信息
      serviceName: event.serviceName || designerName || '设计咨询',
      spaceType: form.spaceType || '',
      area: form.area || '',
      budget: form.budget || '',
      // 用户联系信息 - 预约确认后设计师可见
      contactType: form.contactType || '',
      contact: form.contact || '',
      phone: event.phone || (form.contactType === '电话' ? form.contact : '') || '',
      address: event.address || '',
      // 备注
      remark: form.remark || '',
      // 状态管理
      status: 'pending',                    // pending-待确认, confirmed-已确认, completed-已完成, cancelled-已取消
      // 时间戳
      createdAt: now,
      updatedAt: now
    }
    
    // 写入数据库
    const apptCol = db.collection('appointments')
    const addRes = await apptCol.add({ data: doc })
    const appointmentId = addRes._id
    
    if (!appointmentId) {
      console.error('创建预约失败: 未返回文档ID')
      return {
        success: false,
        code: 'CREATE_FAILED',
        errorMessage: '创建预约失败'
      }
    }
    
    // 🔥 如果有关联的设计请求，同步更新反向关联
    if (requestId) {
      try {
        await db.collection('requests').doc(requestId).update({
          data: {
            appointmentId: appointmentId,
            hasAppointment: true,
            updatedAt: now
          }
        })
        console.log(`[appointments_create] 已建立设计请求 ${requestId} 的反向关联`)
      } catch (e) {
        console.warn('更新设计请求反向关联失败:', e.message)
      }
    }
    
    // 获取完整的预约记录
    const savedDoc = await apptCol.doc(appointmentId).get()
    const appointment = savedDoc.data || { _id: appointmentId, ...doc }
    
    console.log('预约创建成功:', appointmentId, requestId ? `关联设计请求: ${requestOrderNo}` : '无关联请求')
    
    return { 
      success: true,
      code: 'OK',
      message: requestId ? `预约创建成功，已关联设计请求 ${requestOrderNo}` : '预约创建成功',
      appointment: {
        id: appointment._id,
        ...appointment
      },
      linkedRequest: requestId ? { requestId, orderNo: requestOrderNo } : null
    }
    
  } catch (err) {
    console.error('创建预约异常:', err)
    return { 
      success: false, 
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误' 
    }
  }
}
