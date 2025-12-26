/**
 * 云函数：admin_toolkits_update
 * 功能：更新工具包
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
      console.log('[admin_toolkits_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少工具包ID' }
    }
    
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }
    
    // 允许更新的字段
    const allowedFields = [
      'title', 'description', 'price', 'originalPrice', 'cover',
      'category', 'tags', 'status', 'isDelete',
      // 网盘交付配置
      'driveLink', 'drivePassword', 'driveContent', 'driveAltContact',
      // 小程序详情页扩展字段
      'images', 'contentList', 'params', 'variantGroups', 'targetGroups'
    ]
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })
    
    // 执行更新
    const result = await db.collection('toolkits')
      .doc(id)
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '工具包不存在' }
    }
    
    console.log(`[admin_toolkits_update] Admin: ${authResult.user._id}, Updated toolkit: ${id}`)
    
    return {
      success: true,
      code: 'OK',
      data: { updated: result.stats.updated },
      message: '工具包更新成功'
    }
    
  } catch (err) {
    console.error('[admin_toolkits_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

