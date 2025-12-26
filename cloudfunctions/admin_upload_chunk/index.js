/**
 * 分片上传云函数
 * 接收单个分片的 Base64 数据，上传到云存储的临时目录
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const {
      uploadId,      // 上传任务 ID
      cloudPath,     // 最终文件路径
      partNumber,    // 分片编号（从 0 开始）
      totalParts,    // 总分片数
      chunkData,     // 分片的 Base64 数据
      fileName,      // 原始文件名
      fileType,      // 文件类型
      fileSize,      // 原始文件大小
      isLast,        // 是否是最后一个分片
    } = event
    
    // 验证必要参数
    if (!uploadId || !cloudPath || partNumber === undefined || !chunkData) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少必要参数',
        timestamp: Date.now()
      }
    }
    
    console.log(`[admin_upload_chunk] 上传分片 ${partNumber + 1}/${totalParts}，uploadId: ${uploadId}`)
    
    // 将 Base64 转换为 Buffer
    const chunkBuffer = Buffer.from(chunkData, 'base64')
    
    // 生成临时分片路径
    const tempChunkPath = `_temp_chunks/${uploadId}/part_${String(partNumber).padStart(4, '0')}`
    
    // 上传分片到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: tempChunkPath,
      fileContent: chunkBuffer
    })
    
    console.log(`[admin_upload_chunk] 分片 ${partNumber + 1} 上传成功:`, uploadResult.fileID)
    console.log(`[admin_upload_chunk] 临时路径:`, tempChunkPath)
    
    return {
      success: true,
      code: 'OK',
      message: `分片 ${partNumber + 1}/${totalParts} 上传成功`,
      data: {
        partNumber,
        fileID: uploadResult.fileID,  // 返回完整的 fileID，包含 bucket ID
        tempPath: tempChunkPath,
      },
      timestamp: Date.now()
    }
    
  } catch (error) {
    console.error('[admin_upload_chunk] 分片上传失败:', error)
    return {
      success: false,
      code: 'UPLOAD_CHUNK_ERROR',
      errorMessage: '分片上传失败: ' + (error.message || '未知错误'),
      timestamp: Date.now()
    }
  }
}

