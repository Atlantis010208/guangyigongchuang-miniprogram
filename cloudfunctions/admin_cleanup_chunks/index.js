/**
 * 清理分片云函数
 * 清理上传失败时遗留的临时分片
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  // 获取当前环境 ID（必须在 main 函数内获取）
  const envId = cloud.getWXContext().ENV
  
  try {
    const {
      uploadId,      // 上传任务 ID
      cloudPath,     // 最终文件路径（可选）
    } = event
    
    if (!uploadId) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少 uploadId 参数',
        timestamp: Date.now()
      }
    }
    
    console.log(`[admin_cleanup_chunks] 清理临时分片，uploadId: ${uploadId}, envId: ${envId}`)
    
    // 尝试删除可能存在的分片（假设最多 100 个分片）
    const maxParts = 100
    const fileIDs = []
    
    for (let i = 0; i < maxParts; i++) {
      const tempPath = `_temp_chunks/${uploadId}/part_${String(i).padStart(4, '0')}`
      fileIDs.push(`cloud://${envId}/${tempPath}`)
    }
    
    // 批量删除
    try {
      await cloud.deleteFile({
        fileList: fileIDs
      })
    } catch (deleteError) {
      // 忽略删除错误（文件可能不存在）
      console.warn('[admin_cleanup_chunks] 删除时出现警告:', deleteError.message)
    }
    
    console.log('[admin_cleanup_chunks] 清理完成')
    
    return {
      success: true,
      code: 'OK',
      message: '临时分片清理完成',
      timestamp: Date.now()
    }
    
  } catch (error) {
    console.error('[admin_cleanup_chunks] 清理失败:', error)
    return {
      success: false,
      code: 'CLEANUP_ERROR',
      errorMessage: '清理失败: ' + (error.message || '未知错误'),
      timestamp: Date.now()
    }
  }
}

