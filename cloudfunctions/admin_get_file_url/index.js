/**
 * 获取云存储文件临时访问链接
 * 支持单个文件和批量获取
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  try {
    const { fileID, fileIDs } = event
    
    // 单个文件获取
    if (fileID && !fileIDs) {
      if (!fileID.startsWith('cloud://')) {
        return {
          success: false,
          code: 'INVALID_FILE_ID',
          errorMessage: '无效的文件ID格式'
        }
      }
      
      const result = await cloud.getTempFileURL({
        fileList: [fileID]
      })
      
      if (result.fileList && result.fileList.length > 0) {
        const file = result.fileList[0]
        if (file.status === 0) {
          return {
            success: true,
            code: 'OK',
            data: {
              fileID: file.fileID,
              tempFileURL: file.tempFileURL
            }
          }
        } else {
          return {
            success: false,
            code: 'GET_URL_FAILED',
            errorMessage: file.errMsg || '获取临时链接失败'
          }
        }
      }
      
      return {
        success: false,
        code: 'GET_URL_FAILED',
        errorMessage: '获取临时链接失败'
      }
    }
    
    // 批量获取
    if (fileIDs && Array.isArray(fileIDs) && fileIDs.length > 0) {
      // 过滤有效的 fileID
      const validFileIDs = fileIDs.filter(id => id && id.startsWith('cloud://'))
      
      if (validFileIDs.length === 0) {
        return {
          success: false,
          code: 'NO_VALID_FILE_IDS',
          errorMessage: '没有有效的文件ID'
        }
      }
      
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
    }
    
    return {
      success: false,
      code: 'MISSING_PARAMS',
      errorMessage: '缺少文件ID参数'
    }
    
  } catch (error) {
    console.error('[admin_get_file_url] 获取临时链接失败:', error)
    return {
      success: false,
      code: 'ERROR',
      errorMessage: error.message || '获取临时链接失败'
    }
  }
}

