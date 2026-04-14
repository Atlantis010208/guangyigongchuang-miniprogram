/**
 * 云函数：admin_gallery_images
 * 功能：灯光图库图片管理（CRUD + 批量导入）
 * 权限：仅管理员
 * 
 * 支持操作：
 *   - add: 新增图片（自动生成 keywords，自动计算 aspect，更新标签 imageCount）
 *   - update: 更新图片（同步更新 keywords，处理标签变更时的 imageCount 增减）
 *   - delete: 逻辑删除（更新标签 imageCount）
 *   - list: 管理端分页列表（支持按状态/标签/关键词筛选）
 *   - batchAdd: 批量导入（最多 50 条）
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口
exports.main = async (event, context) => {
  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      console.log('[admin_gallery_images] 权限验证失败:', authResult.errorCode)
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode),
        timestamp: Date.now()
      }
    }

    const { action } = event

    if (!action) {
      return {
        success: false,
        code: 'MISSING_ACTION',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    switch (action) {
      case 'add':
        return await addImage(event, authResult)
      case 'update':
        return await updateImage(event)
      case 'delete':
        return await deleteImage(event)
      case 'list':
        return await listImages(event)
      case 'batchAdd':
        return await batchAddImages(event, authResult)
      case 'getCover':
        return await getGalleryCover()
      case 'setCover':
        return await setGalleryCover(event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('[admin_gallery_images] 异常:', error)
    return {
      success: false,
      code: 'GALLERY_IMAGES_ERROR',
      errorMessage: error.message || '图片操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 新增图片
 */
async function addImage(event, authResult) {
  const {
    title,
    description = '',
    tags = [],
    fileID,
    thumbFileID = '',
    width = 0,
    height = 0,
    size = 0,
    sortOrder = 1000
  } = event

  if (!title || !fileID) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少必要参数：标题(title)、文件ID(fileID)',
      timestamp: Date.now()
    }
  }

  if (!Array.isArray(tags) || tags.length === 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '至少需要一个标签(tags)',
      timestamp: Date.now()
    }
  }

  const now = Date.now()
  const aspect = calculateAspect(width, height)
  const keywords = generateKeywords(title, tags, description)

  const imageData = {
    title,
    description,
    tags,
    keywords,
    fileID,
    thumbFileID: thumbFileID || fileID,
    width: Number(width),
    height: Number(height),
    aspect,
    size: Number(size),
    sortOrder: Number(sortOrder),
    viewCount: 0,
    favoriteCount: 0,
    status: 1,
    createdBy: authResult.user._id || authResult.user._openid || '',
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('gallery_images').add({ data: imageData })

  // 更新标签的 imageCount
  await updateTagImageCounts(tags, 1)

  console.log('[admin_gallery_images] 新增图片:', { title, imageId: addRes._id })

  return {
    success: true,
    code: 'OK',
    message: '图片新增成功',
    data: { imageId: addRes._id, title, tags, aspect },
    timestamp: Date.now()
  }
}

/**
 * 更新图片
 */
async function updateImage(event) {
  const {
    imageId,
    title,
    description,
    tags,
    fileID,
    thumbFileID,
    width,
    height,
    size,
    sortOrder,
    status
  } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

  // 获取旧数据（用于比较标签变更）
  let oldImage = null
  try {
    const oldRes = await db.collection('gallery_images').doc(imageId).get()
    oldImage = oldRes.data
  } catch (e) {
    return {
      success: false,
      code: 'IMAGE_NOT_FOUND',
      errorMessage: '图片不存在',
      timestamp: Date.now()
    }
  }

  // 构建更新数据
  const updateData = { updatedAt: Date.now() }
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (tags !== undefined) updateData.tags = tags
  if (fileID !== undefined) updateData.fileID = fileID
  if (thumbFileID !== undefined) updateData.thumbFileID = thumbFileID
  if (width !== undefined) updateData.width = Number(width)
  if (height !== undefined) updateData.height = Number(height)
  if (size !== undefined) updateData.size = Number(size)
  if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder)
  if (status !== undefined) updateData.status = Number(status)

  // 重新计算 aspect
  const finalWidth = width !== undefined ? Number(width) : oldImage.width
  const finalHeight = height !== undefined ? Number(height) : oldImage.height
  if (width !== undefined || height !== undefined) {
    updateData.aspect = calculateAspect(finalWidth, finalHeight)
  }

  // 重新生成 keywords
  const finalTitle = title !== undefined ? title : oldImage.title
  const finalTags = tags !== undefined ? tags : oldImage.tags
  const finalDesc = description !== undefined ? description : oldImage.description
  if (title !== undefined || tags !== undefined || description !== undefined) {
    updateData.keywords = generateKeywords(finalTitle, finalTags, finalDesc)
  }

  const updateRes = await db.collection('gallery_images')
    .doc(imageId)
    .update({ data: updateData })

  // 处理标签变更时的 imageCount 增减
  if (tags !== undefined && oldImage.status === 1) {
    const oldTags = oldImage.tags || []
    const newTags = tags
    const removedTags = oldTags.filter(t => !newTags.includes(t))
    const addedTags = newTags.filter(t => !oldTags.includes(t))

    if (removedTags.length > 0) await updateTagImageCounts(removedTags, -1)
    if (addedTags.length > 0) await updateTagImageCounts(addedTags, 1)
  }

  // 处理状态变更时的 imageCount
  if (status !== undefined && Number(status) !== oldImage.status) {
    const imageTags = tags !== undefined ? tags : (oldImage.tags || [])
    if (Number(status) === 0 && oldImage.status === 1) {
      // 下架：所有标签 -1
      await updateTagImageCounts(imageTags, -1)
    } else if (Number(status) === 1 && oldImage.status === 0) {
      // 上架：所有标签 +1
      await updateTagImageCounts(imageTags, 1)
    }
  }

  console.log('[admin_gallery_images] 更新图片:', { imageId, updated: updateRes.stats.updated })

  return {
    success: true,
    code: 'OK',
    message: '图片更新成功',
    data: { imageId, updated: updateRes.stats.updated },
    timestamp: Date.now()
  }
}

/**
 * 逻辑删除图片
 */
async function deleteImage(event) {
  const { imageId } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

  // 获取图片数据（需要标签信息来更新计数）
  let image = null
  try {
    const imgRes = await db.collection('gallery_images').doc(imageId).get()
    image = imgRes.data
  } catch (e) {
    return {
      success: false,
      code: 'IMAGE_NOT_FOUND',
      errorMessage: '图片不存在',
      timestamp: Date.now()
    }
  }

  // 如果已经是删除状态，直接返回
  if (image.status === 0) {
    return {
      success: true,
      code: 'OK',
      message: '图片已是删除状态',
      data: { imageId },
      timestamp: Date.now()
    }
  }

  const updateRes = await db.collection('gallery_images')
    .doc(imageId)
    .update({
      data: {
        status: 0,
        updatedAt: Date.now()
      }
    })

  // 更新标签的 imageCount
  if (image.tags && image.tags.length > 0) {
    await updateTagImageCounts(image.tags, -1)
  }

  console.log('[admin_gallery_images] 删除图片:', { imageId, deleted: updateRes.stats.updated })

  return {
    success: true,
    code: 'OK',
    message: '图片删除成功',
    data: { imageId, deleted: updateRes.stats.updated },
    timestamp: Date.now()
  }
}

/**
 * 管理端分页列表
 */
async function listImages(event) {
  const {
    page = 1,
    pageSize = 20,
    keyword,
    tag,
    status: filterStatus
  } = event

  // 构建查询条件
  const query = {}

  // 状态筛选（管理端可以查看已下架的）
  if (filterStatus !== undefined) {
    query.status = Number(filterStatus)
  }

  // 标签筛选
  if (tag) {
    query.tags = tag
  }

  // 关键词搜索
  if (keyword) {
    query.keywords = db.RegExp({ regexp: keyword, options: 'i' })
  }

  const skip = (Number(page) - 1) * Number(pageSize)

  // 获取总数
  const countRes = await db.collection('gallery_images')
    .where(query)
    .count()

  const total = countRes.total

  // 获取列表
  const listRes = await db.collection('gallery_images')
    .where(query)
    .orderBy('sortOrder', 'desc')
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(Number(pageSize))
    .get()

  const images = listRes.data || []

  // 转换云存储图片链接
  const processedImages = await processCloudFileUrls(images)

  return {
    success: true,
    code: 'OK',
    message: '获取图片列表成功',
    data: {
      images: processedImages,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total,
        totalPages: Math.ceil(total / Number(pageSize))
      }
    },
    timestamp: Date.now()
  }
}

/**
 * 批量导入图片（最多 50 条）
 */
async function batchAddImages(event, authResult) {
  const { images } = event

  if (!images || !Array.isArray(images) || images.length === 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片数据(images)',
      timestamp: Date.now()
    }
  }

  if (images.length > 50) {
    return {
      success: false,
      code: 'BATCH_LIMIT_EXCEEDED',
      errorMessage: '单次批量导入最多 50 条',
      timestamp: Date.now()
    }
  }

  const now = Date.now()
  const createdBy = authResult.user._id || authResult.user._openid || ''
  const results = []
  const allTags = new Set()

  // 逐条写入
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    try {
      if (!img.title || !img.fileID) {
        results.push({ index: i, success: false, error: '缺少 title 或 fileID' })
        continue
      }

      const tags = Array.isArray(img.tags) ? img.tags : []
      const aspect = calculateAspect(img.width || 0, img.height || 0)
      const keywords = generateKeywords(img.title, tags, img.description || '')

      const imageData = {
        title: img.title,
        description: img.description || '',
        tags,
        keywords,
        fileID: img.fileID,
        thumbFileID: img.thumbFileID || img.fileID,
        width: Number(img.width) || 0,
        height: Number(img.height) || 0,
        aspect,
        size: Number(img.size) || 0,
        sortOrder: Number(img.sortOrder) || 1000,
        viewCount: 0,
        favoriteCount: 0,
        status: 1,
        createdBy,
        createdAt: now + i,
        updatedAt: now + i
      }

      const addRes = await db.collection('gallery_images').add({ data: imageData })
      tags.forEach(t => allTags.add(t))
      results.push({ index: i, success: true, imageId: addRes._id })
    } catch (e) {
      results.push({ index: i, success: false, error: e.message })
    }
  }

  // 批量更新标签计数（统计每个标签的新增图片数）
  const tagCountMap = {}
  results.forEach((r, i) => {
    if (r.success && images[i].tags) {
      images[i].tags.forEach(t => {
        tagCountMap[t] = (tagCountMap[t] || 0) + 1
      })
    }
  })

  for (const [tagName, count] of Object.entries(tagCountMap)) {
    await updateTagImageCounts([tagName], count)
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  console.log('[admin_gallery_images] 批量导入:', { total: images.length, success: successCount, fail: failCount })

  return {
    success: true,
    code: 'OK',
    message: `批量导入完成：成功 ${successCount} 条，失败 ${failCount} 条`,
    data: { results, successCount, failCount },
    timestamp: Date.now()
  }
}

// ========== 工具函数 ==========

/**
 * 根据宽高计算 aspect 类名
 */
function calculateAspect(width, height) {
  if (!width || !height) return 'aspect-square'
  const ratio = height / width
  if (ratio >= 1.2) return 'aspect-3-4'
  if (ratio <= 0.83) return 'aspect-4-3'
  return 'aspect-square'
}

/**
 * 生成冗余搜索字段 keywords
 */
function generateKeywords(title, tags, description) {
  const parts = [title || '']
  if (Array.isArray(tags)) parts.push(...tags)
  if (description) {
    // 提取描述中的关键词（简单分词：按空格、逗号、句号等分割）
    const descWords = description
      .replace(/[，。、；：！？\n\r]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && w.length <= 10)
    parts.push(...descWords)
  }
  // 去重并拼接
  return [...new Set(parts)].join(' ')
}

/**
 * 批量更新标签的 imageCount
 * @param {string[]} tagNames - 标签名数组
 * @param {number} increment - 增量（正数加，负数减）
 */
async function updateTagImageCounts(tagNames, increment) {
  if (!tagNames || tagNames.length === 0) return

  for (const name of tagNames) {
    try {
      await db.collection('gallery_tags')
        .where({ name, status: 1 })
        .update({
          data: {
            imageCount: _.inc(increment),
            updatedAt: Date.now()
          }
        })
    } catch (e) {
      console.warn('[admin_gallery_images] 更新标签计数失败:', name, e.message)
    }
  }
}

/**
 * 获取图库封面图配置
 */
async function getGalleryCover() {
  try {
    const res = await db.collection('app_config').where({ key: 'gallery_cover' }).limit(1).get()
    const doc = res.data && res.data[0]

    if (!doc) {
      return {
        success: true,
        code: 'OK',
        data: { coverFileID: '', coverUrl: '' },
        timestamp: Date.now()
      }
    }

    // 如果有 cloud:// 开头的 fileID，转换为临时 URL
    let coverUrl = doc.value || ''
    if (coverUrl.startsWith('cloud://')) {
      try {
        const tempRes = await cloud.getTempFileURL({ fileList: [coverUrl] })
        const fileItem = tempRes.fileList && tempRes.fileList[0]
        if (fileItem && fileItem.tempFileURL) {
          coverUrl = fileItem.tempFileURL
        }
      } catch (e) {
        console.warn('[admin_gallery_images] 转换封面图临时链接失败:', e.message)
      }
    }

    return {
      success: true,
      code: 'OK',
      data: { coverFileID: doc.value || '', coverUrl },
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[admin_gallery_images] 获取封面图配置失败:', error)
    return {
      success: false,
      code: 'GET_COVER_ERROR',
      errorMessage: '获取封面图配置失败: ' + error.message,
      timestamp: Date.now()
    }
  }
}

/**
 * 设置图库封面图
 */
async function setGalleryCover(event) {
  const { coverFileID } = event

  if (!coverFileID) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少封面图文件ID(coverFileID)',
      timestamp: Date.now()
    }
  }

  try {
    const now = Date.now()
    const res = await db.collection('app_config').where({ key: 'gallery_cover' }).limit(1).get()

    if (res.data && res.data.length > 0) {
      await db.collection('app_config').doc(res.data[0]._id).update({
        data: { value: coverFileID, updatedAt: now }
      })
    } else {
      await db.collection('app_config').add({
        data: { key: 'gallery_cover', value: coverFileID, createdAt: now, updatedAt: now }
      })
    }

    console.log('[admin_gallery_images] 更新封面图:', coverFileID)

    return {
      success: true,
      code: 'OK',
      message: '封面图更新成功',
      data: { coverFileID },
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[admin_gallery_images] 设置封面图失败:', error)
    return {
      success: false,
      code: 'SET_COVER_ERROR',
      errorMessage: '设置封面图失败: ' + error.message,
      timestamp: Date.now()
    }
  }
}

/**
 * 转换云存储 fileID 为临时 HTTPS URL
 */
async function processCloudFileUrls(images) {
  if (!images || images.length === 0) return images

  // 收集所有 cloud:// 开头的文件ID
  const cloudFileIds = new Set()
  images.forEach(img => {
    if (img.fileID && img.fileID.startsWith('cloud://')) cloudFileIds.add(img.fileID)
    if (img.thumbFileID && img.thumbFileID.startsWith('cloud://')) cloudFileIds.add(img.thumbFileID)
  })

  if (cloudFileIds.size === 0) return images

  try {
    const tempRes = await cloud.getTempFileURL({
      fileList: [...cloudFileIds]
    })

    const urlMap = {}
    ;(tempRes.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) {
        urlMap[file.fileID] = file.tempFileURL
      }
    })

    return images.map(img => ({
      ...img,
      fileUrl: urlMap[img.fileID] || img.fileID,
      thumbUrl: urlMap[img.thumbFileID] || img.thumbFileID || urlMap[img.fileID] || img.fileID
    }))
  } catch (e) {
    console.warn('[admin_gallery_images] 转换临时链接失败:', e.message)
    return images.map(img => ({
      ...img,
      fileUrl: img.fileID,
      thumbUrl: img.thumbFileID || img.fileID
    }))
  }
}
