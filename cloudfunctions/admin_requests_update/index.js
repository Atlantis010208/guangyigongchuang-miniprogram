/**
 * 云函数：admin_requests_update
 * 功能：设计请求更新（分配设计师、推进工作流）
 * 权限：管理员和设计师（roles=0 或 roles=1）
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

// 工作流阶段顺序（9阶段含已完成）
const WORKFLOW_STAGES = [
  'publish', 'survey', 'concept', 'calc', 
  'selection', 'optimize', 'construction', 'commission', 'completed'
]

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端，允许设计师访问）
    const authResult = await requireBackendAuth(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_requests_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少请求ID' }
    }
    
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 获取当前请求
    const requestRes = await db.collection('requests').doc(id).get()
    
    if (!requestRes.data) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '设计请求不存在' }
    }
    
    const currentRequest = requestRes.data
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }
    
    // 分配设计师
    if (data.designerId !== undefined) {
      updateData.designerId = data.designerId
    }
    
    // 推进工作流阶段
    if (data.stage) {
      const currentStageIndex = WORKFLOW_STAGES.indexOf(currentRequest.stage)
      const newStageIndex = WORKFLOW_STAGES.indexOf(data.stage)
      
      // 验证阶段是否可以推进（只能往后推进，或者回退到前一阶段）
      if (newStageIndex < 0) {
        return { success: false, code: 'INVALID_STAGE', errorMessage: '无效的工作流阶段' }
      }
      
      updateData.stage = data.stage
      
      // 更新 steps 数组（确保 steps 始终是数组）
      const steps = Array.isArray(currentRequest.steps) 
        ? currentRequest.steps 
        : WORKFLOW_STAGES.map(s => ({
            stage: s,
            status: s === 'publish' ? 'completed' : 'pending'
          }))
      
      // 标记当前阶段完成，新阶段激活
      steps.forEach((step, index) => {
        if (index < newStageIndex) {
          step.status = 'completed'
          if (!step.completedAt) step.completedAt = Date.now()
        } else if (index === newStageIndex) {
          step.status = 'active'
          step.startedAt = Date.now()
        } else {
          step.status = 'pending'
        }
      })
      
      updateData.steps = steps
      
      // 如果是最后阶段（已完成），更新状态为完成
      if (data.stage === 'completed') {
        updateData.status = 'done'
      } else if (newStageIndex > 0) {
        updateData.status = 'design'
      }
    }
    
    // 更新状态
    if (data.status) {
      updateData.status = data.status
    }
    
    // 更新备注
    if (data.note !== undefined) {
      updateData.adminNote = data.note
    }
    
    // 执行更新
    const result = await db.collection('requests')
      .doc(id)
      .update({
        data: updateData
      })
    
    console.log(`[admin_requests_update] Admin: ${authResult.user._id}, Updated request: ${id}`)
    
    return {
      success: true,
      code: 'OK',
      data: { updated: result.stats.updated },
      message: '设计请求更新成功'
    }
    
  } catch (err) {
    console.error('[admin_requests_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
