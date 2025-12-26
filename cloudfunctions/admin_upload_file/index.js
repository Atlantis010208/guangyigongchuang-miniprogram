/**
 * 管理员文件上传云函数
 * 接收 Base64 编码的文件数据，上传到云存储
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const {
      fileData,      // Base64 编码的文件数据
      fileName,      // 文件名
      fileType,      // 文件类型（如 image/jpeg）
      cloudPath,     // 云存储路径
      _adminToken,   // 管理员 Token
      _adminUserId,  // 管理员用户 ID
    } = event
    
    // 验证必要参数
    if (!fileData) {
      return {
        success: false,
        code: 'MISSING_FILE_DATA',
        errorMessage: '缺少文件数据',
        timestamp: Date.now()
      }
    }
    
    if (!cloudPath) {
      return {
        success: false,
        code: 'MISSING_CLOUD_PATH',
        errorMessage: '缺少云存储路径',
        timestamp: Date.now()
      }
    }
    
    // 简单的管理员验证（检查是否有 token）
    if (!_adminToken && !_adminUserId) {
      console.warn('上传请求缺少管理员凭证，但继续处理')
    }
    
    // 将 Base64 转换为 Buffer
    const fileBuffer = Buffer.from(fileData, 'base64')
    
    console.log('[admin_upload_file] 开始上传文件:', {
      cloudPath,
      fileSize: fileBuffer.length,
      fileType
    })
    
    // 上传文件到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: fileBuffer
    })
    
    console.log('[admin_upload_file] 上传成功:', uploadResult)
    
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
      console.warn('[admin_upload_file] 获取临时链接失败:', urlError)
    }
    
    return {
      success: true,
      code: 'OK',
      message: '文件上传成功',
      data: {
        fileID: uploadResult.fileID,
        tempFileURL: tempFileURL,
        cloudPath: cloudPath
      },
      timestamp: Date.now()
    }
    
  } catch (error) {
    console.error('[admin_upload_file] 上传失败:', error)
    return {
      success: false,
      code: 'UPLOAD_ERROR',
      errorMessage: '文件上传失败: ' + (error.message || '未知错误'),
      timestamp: Date.now()
    }
  }
}

