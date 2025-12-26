/**
 * 云函数：toolkit_detail
 * 功能：获取工具包详情（供小程序端使用）
 * 权限：公开（已上架的工具包）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { id, toolkitId } = event
    
    if (!id && !toolkitId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少工具包ID参数'
      }
    }
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 判断 id 是 MongoDB ObjectId 格式还是 toolkitId 格式
    const queryId = id || toolkitId
    if (queryId) {
      // 如果以 TK 开头，说明是 toolkitId
      if (queryId.startsWith('TK')) {
        query.toolkitId = queryId
      } else if (queryId.length === 32) {
        // 32位字符串，可能是 _id
        query._id = queryId
      } else {
        // 其他情况，同时尝试匹配 _id 和 toolkitId
        query = {
          isDelete: _.neq(1),
          ..._.or([{ _id: queryId }, { toolkitId: queryId }])
        }
      }
    }
    
    // 查询工具包
    const result = await db.collection('toolkits')
      .where(query)
      .limit(1)
      .get()
    
    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: '工具包不存在或已下架'
      }
    }
    
    const toolkit = result.data[0]
    
    // 检查状态（只返回已上架的工具包）
    if (toolkit.status !== 'active') {
      return {
        success: false,
        code: 'NOT_AVAILABLE',
        errorMessage: '该工具包暂未上架'
      }
    }
    
    // 处理图片：如果有 images 字段且包含云存储 fileID，转换为临时链接
    let images = toolkit.images || []
    if (toolkit.cover && images.length === 0) {
      images = [toolkit.cover]
    }
    
    // 转换云存储 fileID 为临时链接
    if (images.length > 0) {
      const cloudFileIDs = images.filter(url => url && url.startsWith('cloud://'))
      if (cloudFileIDs.length > 0) {
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: cloudFileIDs })
          const urlMap = {}
          if (tempRes.fileList) {
            tempRes.fileList.forEach(item => {
              if (item.status === 0 && item.tempFileURL) {
                urlMap[item.fileID] = item.tempFileURL
              }
            })
          }
          // 替换 images 中的 fileID 为临时链接
          images = images.map(url => urlMap[url] || url)
        } catch (e) {
          console.warn('获取临时链接失败:', e)
        }
      }
    }
    
    // 格式化返回数据，兼容小程序端字段命名
    const formattedToolkit = {
      _id: toolkit._id,
      id: toolkit.toolkitId || toolkit._id,
      toolkitId: toolkit.toolkitId,
      name: toolkit.title,
      title: toolkit.title,
      desc: toolkit.description,
      description: toolkit.description,
      price: toolkit.price || 0,
      originalPrice: toolkit.originalPrice,
      images: images,
      cover: images[0] || toolkit.cover || '',
      contentList: toolkit.contentList || [],
      params: toolkit.params || [],
      variantGroups: toolkit.variantGroups || [],
      targetGroups: toolkit.targetGroups || [],
      category: toolkit.category,
      categoryLabel: {
        cad: 'CAD图纸',
        model: '3D模型',
        material: '材质贴图',
        calculation: '计算工具',
        other: '其他资源'
      }[toolkit.category] || toolkit.category,
      tags: toolkit.tags || [],
      files: toolkit.files || [],
      downloadCount: toolkit.downloadCount || 0,
      favoriteCount: toolkit.favoriteCount || 0,
      rating: toolkit.rating || 0,
      ratingCount: toolkit.ratingCount || 0,
      status: toolkit.status,
      createdAt: toolkit.createdAt,
      updatedAt: toolkit.updatedAt
    }
    
    return {
      success: true,
      code: 'OK',
      data: formattedToolkit,
      message: '获取工具包详情成功'
    }
    
  } catch (err) {
    console.error('[toolkit_detail] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

