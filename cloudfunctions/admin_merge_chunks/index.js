/**
 * 合并分片云函数
 * 从云存储获取所有分片，合并成完整文件
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
      cloudPath,     // 最终文件路径
      fileName,      // 原始文件名
      fileType,      // 文件类型
      totalParts,    // 总分片数
      parts,         // 分片信息数组 [{partNumber, fileID, tempPath}, ...]
    } = event
    
    // 验证必要参数
    if (!uploadId || !cloudPath || !totalParts || !parts || parts.length === 0) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少必要参数或分片信息',
        timestamp: Date.now()
      }
    }
    
    console.log(`[admin_merge_chunks] 开始合并 ${totalParts} 个分片，uploadId: ${uploadId}, envId: ${envId}`)
    console.log(`[admin_merge_chunks] 收到 ${parts.length} 个分片信息`)
    
    // 按分片编号排序
    parts.sort((a, b) => a.partNumber - b.partNumber)
    
    // 下载所有分片（使用上传时返回的 fileID）
    const chunks = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      console.log(`[admin_merge_chunks] 下载分片 ${i + 1}/${parts.length}, fileID: ${part.fileID}`)
      
      try {
        // 使用完整的 fileID 下载分片
        const downloadResult = await cloud.downloadFile({
          fileID: part.fileID
        })
        
        chunks.push(downloadResult.fileContent)
        console.log(`[admin_merge_chunks] 分片 ${i + 1} 下载成功，大小: ${downloadResult.fileContent.length} bytes`)
      } catch (downloadError) {
        console.error(`[admin_merge_chunks] 分片 ${i + 1} 下载失败:`, downloadError)
        console.error(`[admin_merge_chunks] 错误详情:`, {
          fileID: part.fileID,
          message: downloadError.message,
          code: downloadError.code,
          errCode: downloadError.errCode
        })
        throw new Error(`分片 ${i + 1} 下载失败: ${downloadError.message}`)
      }
    }
    
    // 合并所有分片
    console.log('[admin_merge_chunks] 合并分片...')
    const mergedBuffer = Buffer.concat(chunks)
    console.log(`[admin_merge_chunks] 合并完成，总大小: ${mergedBuffer.length} bytes`)
    
    // 上传合并后的文件
    console.log('[admin_merge_chunks] 上传最终文件...')
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: mergedBuffer
    })
    
    console.log('[admin_merge_chunks] 最终文件上传成功:', uploadResult.fileID)
    
    // 获取临时访问链接
    let tempFileURL = ''
    try {
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: [uploadResult.fileID]
      })
      if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
        tempFileURL = tempUrlResult.fileList[0].tempFileURL
      }
    } catch (urlError) {
      console.warn('[admin_merge_chunks] 获取临时链接失败:', urlError)
    }
    
    // 清理临时分片（使用上传时返回的 fileID）
    console.log('[admin_merge_chunks] 清理临时分片...')
    try {
      const fileIDs = parts.map(p => p.fileID)
      await cloud.deleteFile({
        fileList: fileIDs
      })
      console.log('[admin_merge_chunks] 临时分片清理完成')
    } catch (cleanupError) {
      console.warn('[admin_merge_chunks] 清理临时分片失败:', cleanupError)
      // 不影响主流程
    }
    
    return {
      success: true,
      code: 'OK',
      message: '文件合并上传成功',
      data: {
        fileID: uploadResult.fileID,
        tempFileURL: tempFileURL,
        cloudPath: cloudPath,
        fileSize: mergedBuffer.length,
      },
      timestamp: Date.now()
    }
    
  } catch (error) {
    console.error('[admin_merge_chunks] 合并失败:', error)
    return {
      success: false,
      code: 'MERGE_ERROR',
      errorMessage: '文件合并失败: ' + (error.message || '未知错误'),
      timestamp: Date.now()
    }
  }
}

