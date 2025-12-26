/**
 * 云函数：admin_appointments_update
 * 功能：预约状态更新 + 同步更新关联的设计请求
 * 权限：管理员和设计师（roles=0 或 roles=1）
 * 
 * 业务逻辑：
 * - 预约可以关联到已有的设计请求（通过 requestId 字段）
 * - 确认预约(confirmed)时：如果有关联的设计请求，将设计师分配到该请求
 * - 完成预约(completed)时：如果有关联的设计请求，推进工作流到现场勘测阶段
 * - 支持手动关联：管理员可以将预约关联到设计请求
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
 * 将设计师分配到设计请求，并同步预约关联信息
 * @param {string} requestId - 设计请求ID
 * @param {string} designerId - 设计师ID
 * @param {string} designerName - 设计师名称（可选）
 * @param {string} appointmentId - 预约ID（可选，用于建立反向关联）
 */
async function assignDesignerToRequest(requestId, designerId, designerName, appointmentId) {
  if (!requestId || !designerId) {
    console.log('[assignDesignerToRequest] 缺少 requestId 或 designerId')
    return { success: false, error: '缺少必要参数' }
  }
  
  try {
    const now = Date.now()
    const updateData = {
      designerId: designerId,
      designerName: designerName || '',
      status: 'design',  // 更新状态为设计中
      updatedAt: now
    }
    
    // 🔥 如果有预约ID，同步建立反向关联
    if (appointmentId) {
      updateData.appointmentId = appointmentId
      updateData.hasAppointment = true
      console.log(`[assignDesignerToRequest] 同步建立预约关联: ${appointmentId}`)
    }
    
    const updateResult = await db.collection('requests')
      .doc(requestId)
      .update({
        data: updateData
      })
    
    console.log(`[assignDesignerToRequest] 设计师已分配到请求 ${requestId}，更新 ${updateResult.stats?.updated || 0} 条`)
    return { success: true, updated: updateResult.stats?.updated || 0 }
  } catch (err) {
    console.error('[assignDesignerToRequest] 分配设计师失败:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 推进设计请求工作流到现场勘测阶段
 * @param {string} requestId - 设计请求ID
 */
async function advanceRequestToSurvey(requestId) {
  if (!requestId) {
    console.log('[advanceRequestToSurvey] 缺少 requestId')
    return { success: false, error: '缺少必要参数' }
  }
  
  try {
    const now = Date.now()
    const updateResult = await db.collection('requests')
      .doc(requestId)
      .update({
        data: {
          stage: 'survey',
          status: 'review',
          'steps.0.status': 'completed',
          'steps.0.completedAt': now,
          'steps.1.status': 'active',
          'steps.1.startedAt': now,
          updatedAt: now
        }
      })
    
    console.log(`[advanceRequestToSurvey] 设计请求 ${requestId} 已推进到现场勘测阶段`)
    return { success: true, updated: updateResult.stats?.updated || 0 }
  } catch (err) {
    console.error('[advanceRequestToSurvey] 推进工作流失败:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 自动匹配用户的待处理设计请求
 * @param {Object} appointment - 预约记录
 * @returns {Object|null} 匹配到的设计请求 { _id, orderNo }
 */
async function autoMatchRequest(appointment) {
  if (!appointment.userId && !appointment._openid) {
    console.log('[autoMatchRequest] 缺少 userId 和 _openid，无法匹配')
    return null
  }
  
  try {
    // 查询用户的待处理设计请求
    // 🔥 放宽条件：未删除、未分配设计师、不是商城订单
    // 允许 submitted 或其他非完成状态的请求
    const query = {
      isDelete: _.neq(1),
      status: _.neq('done'),  // 🔥 只排除已完成的
      category: _.neq('mall'),  // 排除商城订单
      // 未分配设计师的情况
      designerId: _.or(_.exists(false), _.eq(''), _.eq(null))
    }
    
    // 优先使用 userId
    if (appointment.userId) {
      query.userId = appointment.userId
    } else if (appointment._openid) {
      query._openid = appointment._openid
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
      return { _id: matched._id, orderNo: matched.orderNo }
    }
    
    console.log('[autoMatchRequest] 未找到匹配的设计请求')
    return null
  } catch (err) {
    console.error('[autoMatchRequest] 自动匹配失败:', err)
    return null
  }
}

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireBackendAuth(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_appointments_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少预约ID' }
    }
    
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 获取当前预约记录
    let appointment = null
    try {
      const appointmentRes = await db.collection('appointments').doc(id).get()
      appointment = appointmentRes.data
    } catch (e) {
      console.log('[admin_appointments_update] 获取预约记录失败:', e.message)
      return { success: false, code: 'NOT_FOUND', errorMessage: '预约不存在' }
    }
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }
    
    // 用于返回的额外信息
    let requestInfo = null
    
    // 手动关联设计请求
    if (data.requestId !== undefined) {
      updateData.requestId = data.requestId || null
      if (data.requestId) {
        // 获取关联请求的订单号，并同步建立反向关联
        try {
          const reqRes = await db.collection('requests').doc(data.requestId).get()
          if (reqRes.data) {
            updateData.requestOrderNo = reqRes.data.orderNo || ''
            
            // 🔥 同步更新设计请求的反向关联
            await db.collection('requests').doc(data.requestId).update({
              data: {
                appointmentId: id,
                hasAppointment: true,
                updatedAt: Date.now()
              }
            })
            console.log(`[admin_appointments_update] 已建立设计请求 ${data.requestId} 的反向关联`)
          }
        } catch (e) {
          console.log('[admin_appointments_update] 获取/更新关联请求失败:', e.message)
        }
      }
    }
    
    // 状态更新
    if (data.status) {
      const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled']
      if (!validStatuses.includes(data.status)) {
        return { success: false, code: 'INVALID_STATUS', errorMessage: '无效的状态值' }
      }
      updateData.status = data.status
      
      // 获取当前关联的设计请求ID
      const currentRequestId = updateData.requestId || appointment.requestId
      
      // 🔥 确认预约时：分配设计师到关联的设计请求
      if (data.status === 'confirmed') {
        updateData.confirmedAt = Date.now()
        
        // 如果没有关联请求，尝试自动匹配
        let linkedRequestId = currentRequestId
        if (!linkedRequestId && data.autoMatch !== false) {
          const matchedRequest = await autoMatchRequest(appointment)
          if (matchedRequest) {
            linkedRequestId = matchedRequest._id
            updateData.requestId = matchedRequest._id
            updateData.requestOrderNo = matchedRequest.orderNo || ''
            console.log(`[admin_appointments_update] 自动匹配关联请求: ${matchedRequest.orderNo}`)
          }
        }
        
        // 如果有关联的设计请求，分配设计师并建立反向关联
        if (linkedRequestId && appointment.designerId) {
          const assignResult = await assignDesignerToRequest(
            linkedRequestId, 
            appointment.designerId,
            appointment.designerName,
            id  // 🔥 传入预约ID，建立反向关联
          )
          if (assignResult.success && assignResult.updated > 0) {
            requestInfo = { 
              action: 'assigned',
              requestId: linkedRequestId,
              message: '已将设计师分配到关联的设计请求'
            }
          }
        }
      }
      // 🔥 完成预约时：推进关联设计请求的工作流
      else if (data.status === 'completed') {
        updateData.completedAt = Date.now()
        
        // 推进关联的设计请求
        if (currentRequestId) {
          const advanceResult = await advanceRequestToSurvey(currentRequestId)
          if (advanceResult.success && advanceResult.updated > 0) {
            requestInfo = { 
              action: 'advanced', 
              stage: 'survey',
              message: '关联的设计请求已推进到现场勘测阶段'
            }
          }
        }
      }
      // 取消预约时
      else if (data.status === 'cancelled') {
        updateData.cancelledAt = Date.now()
        // 暂不同步取消设计请求，保留历史数据
      }
    }
    
    // 备注更新
    if (data.adminNote !== undefined) {
      updateData.adminNote = data.adminNote
    }
    
    // 执行更新
    const result = await db.collection('appointments')
      .doc(id)
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '预约不存在或无变更' }
    }
    
    console.log(`[admin_appointments_update] Admin: ${authResult.user._id}, Updated appointment: ${id}, Status: ${data.status || 'unchanged'}`)
    
    // 构建返回消息
    let message = '预约更新成功'
    if (requestInfo) {
      message = requestInfo.message || message
    }
    
    return {
      success: true,
      code: 'OK',
      data: { 
        updated: result.stats.updated,
        request: requestInfo
      },
      message
    }
    
  } catch (err) {
    console.error('[admin_appointments_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
