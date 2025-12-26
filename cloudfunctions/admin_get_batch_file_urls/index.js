/**
 * 批量获取云存储文件临时访问链接
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const { fileIDs } = event
    
    if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少文件ID列表参数'
      }
    }
    
    // 过滤有效的 fileID
    const validFileIDs = fileIDs.filter(id => id && id.startsWith('cloud://'))
    
    if (validFileIDs.length === 0) {
      return {
        success: false,
        code: 'NO_VALID_FILE_IDS',
        errorMessage: '没有有效的文件ID'
      }
    }
    
    console.log('[admin_get_batch_file_urls] 批量获取临时链接:', validFileIDs.length, '个文件')
    
    const result = await cloud.getTempFileURL({
      fileList: validFileIDs
    })
    
    if (result.fileList && result.fileList.length > 0) {
      const files = result.fileList
        .filter(file => file.status === 0)
        .map(file => ({
          fileID: file.fileID,
          tempFileURL: file.tempFileURL
        }))
      
      console.log('[admin_get_batch_file_urls] 成功获取:', files.length, '个文件链接')
      
      return {
        success: true,
        code: 'OK',
        data: {
          files: files
        }
      }
    }
    
    return {
      success: false,
      code: 'GET_URLS_FAILED',
      errorMessage: '批量获取临时链接失败'
    }
    
  } catch (error) {
    console.error('[admin_get_batch_file_urls] 获取临时链接失败:', error)
    return {
      success: false,
      code: 'ERROR',
      errorMessage: error.message || '获取临时链接失败'
    }
  }
}

