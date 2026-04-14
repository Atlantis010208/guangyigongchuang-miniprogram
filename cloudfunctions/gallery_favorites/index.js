/**
 * 云函数：gallery_favorites
 * 功能：灯光图库收藏操作（小程序端）
 * 权限：需要登录（通过 OPENID 识别用户）
 * 
 * 支持操作：
 *   - add: 添加收藏（去重检查，更新 favoriteCount）
 *   - remove: 取消收藏（逻辑删除，更新 favoriteCount）
 *   - list: 收藏列表（游标分页，关联查询图片信息）
 *   - check: 检查单张图片收藏状态
 *   - batchCheck: 批量检查收藏状态
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID

  if (!OPENID) {
    return {
      success: false,
      code: 'MISSING_OPENID',
      errorMessage: '缺少用户身份信息，请先登录',
      timestamp: Date.now()
    }
  }

  try {
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
        return await addFavorite(OPENID, event)
      case 'remove':
        return await removeFavorite(OPENID, event)
      case 'list':
        return await listFavorites(OPENID, event)
      case 'check':
        return await checkFavorite(OPENID, event)
      case 'batchCheck':
        return await batchCheckFavorites(OPENID, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('[gallery_favorites] 异常:', error)
    return {
      success: false,
      code: 'GALLERY_FAVORITES_ERROR',
      errorMessage: error.message || '收藏操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 添加收藏
 */
async function addFavorite(userId, event) {
  const { imageId } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

  // 检查图片是否存在
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

  if (!image || image.status !== 1) {
    return {
      success: false,
      code: 'IMAGE_NOT_FOUND',
      errorMessage: '图片不存在或已下架',
      timestamp: Date.now()
    }
  }

  // 检查是否已收藏（包括逻辑删除的记录，可复用）
  const existRes = await db.collection('gallery_favorites')
    .where({ userId, imageId })
    .limit(1)
    .get()

  if (existRes.data && existRes.data.length > 0) {
    const existing = existRes.data[0]

    if (existing.isDelete === 0) {
      // 已收藏，直接返回
      return {
        success: true,
        code: 'ALREADY_EXISTS',
        message: '已收藏',
        data: { favoriteId: existing._id, isFavorited: true },
        timestamp: Date.now()
      }
    }

    // 之前取消过收藏，恢复
    await db.collection('gallery_favorites').doc(existing._id).update({
      data: {
        isDelete: 0,
        updatedAt: Date.now()
      }
    })

    // 更新图片 favoriteCount
    await updateImageFavoriteCount(imageId, 1)

    return {
      success: true,
      code: 'OK',
      message: '收藏成功',
      data: { favoriteId: existing._id, isFavorited: true },
      timestamp: Date.now()
    }
  }

  // 新建收藏记录
  const now = Date.now()
  const addRes = await db.collection('gallery_favorites').add({
    data: {
      userId,
      imageId,
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
  })

  // 更新图片 favoriteCount
  await updateImageFavoriteCount(imageId, 1)

  console.log('[gallery_favorites] 添加收藏:', { userId, imageId, favoriteId: addRes._id })

  return {
    success: true,
    code: 'OK',
    message: '收藏成功',
    data: { favoriteId: addRes._id, isFavorited: true },
    timestamp: Date.now()
  }
}

/**
 * 取消收藏
 */
async function removeFavorite(userId, event) {
  const { imageId } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

  const updateRes = await db.collection('gallery_favorites')
    .where({ userId, imageId, isDelete: 0 })
    .update({
      data: {
        isDelete: 1,
        updatedAt: Date.now()
      }
    })

  const removed = updateRes.stats.updated || 0

  // 更新图片 favoriteCount
  if (removed > 0) {
    await updateImageFavoriteCount(imageId, -1)
  }

  console.log('[gallery_favorites] 取消收藏:', { userId, imageId, removed })

  return {
    success: true,
    code: 'OK',
    message: '已取消收藏',
    data: { removed, isFavorited: false },
    timestamp: Date.now()
  }
}

/**
 * 收藏列表（offset 分页，关联查询图片信息）
 */
async function listFavorites(userId, event) {
  const { pageSize = 20 } = event
  const limit = Math.min(Number(pageSize), 40)
  const skip = Number(event.offset) || 0

  // 构建查询条件
  const query = { userId, isDelete: 0 }

  // 查询收藏记录
  const listRes = await db.collection('gallery_favorites')
    .where(query)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit + 1)
    .get()

  const allFavorites = listRes.data || []
  const hasMore = allFavorites.length > limit
  const favorites = hasMore ? allFavorites.slice(0, limit) : allFavorites

  if (favorites.length === 0) {
    return {
      success: true,
      code: 'OK',
      data: { images: [], hasMore: false, lastId: null },
      timestamp: Date.now()
    }
  }

  // 关联查询图片信息
  const imageIds = favorites.map(f => f.imageId)
  const imagesRes = await db.collection('gallery_images')
    .where({ _id: _.in(imageIds), status: 1 })
    .get()

  const imageMap = {}
  ;(imagesRes.data || []).forEach(img => { imageMap[img._id] = img })

  // 转换缩略图 URL
  const cloudFileIds = new Set()
  Object.values(imageMap).forEach(img => {
    const thumbId = img.thumbFileID || img.fileID
    if (thumbId && thumbId.startsWith('cloud://')) cloudFileIds.add(thumbId)
  })

  let urlMap = {}
  if (cloudFileIds.size > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: [...cloudFileIds] })
      ;(tempRes.fileList || []).forEach(f => {
        if (f.fileID && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
      })
    } catch (e) {
      console.warn('[gallery_favorites] 转换缩略图失败:', e.message)
    }
  }

  // 组装返回数据
  const result = favorites
    .filter(f => imageMap[f.imageId]) // 过滤掉已删除的图片
    .map(f => {
      const img = imageMap[f.imageId]
      const thumbId = img.thumbFileID || img.fileID
      return {
        _id: img._id,
        title: img.title,
        tags: img.tags,
        thumbUrl: urlMap[thumbId] || thumbId,
        aspect: img.aspect,
        favoriteCount: img.favoriteCount || 0,
        favoritedAt: f.createdAt
      }
    })

  const newLastId = favorites.length > 0 ? favorites[favorites.length - 1]._id : null

  return {
    success: true,
    code: 'OK',
    data: {
      images: result,
      hasMore,
      lastId: newLastId
    },
    timestamp: Date.now()
  }
}

/**
 * 检查单张图片收藏状态
 */
async function checkFavorite(userId, event) {
  const { imageId } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

  const existRes = await db.collection('gallery_favorites')
    .where({ userId, imageId, isDelete: 0 })
    .limit(1)
    .get()

  const isFavorited = existRes.data && existRes.data.length > 0

  return {
    success: true,
    code: 'OK',
    data: { imageId, isFavorited },
    timestamp: Date.now()
  }
}

/**
 * 批量检查收藏状态（用于列表页一次性检查整页图片）
 */
async function batchCheckFavorites(userId, event) {
  const { imageIds } = event

  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID列表(imageIds)',
      timestamp: Date.now()
    }
  }

  // 限制单次最多检查 40 张
  const checkIds = imageIds.slice(0, 40)

  const existRes = await db.collection('gallery_favorites')
    .where({
      userId,
      imageId: _.in(checkIds),
      isDelete: 0
    })
    .get()

  // 构建已收藏的 imageId Set
  const favoritedSet = new Set()
  ;(existRes.data || []).forEach(f => favoritedSet.add(f.imageId))

  // 返回每张图片的收藏状态
  const result = {}
  checkIds.forEach(id => {
    result[id] = favoritedSet.has(id)
  })

  return {
    success: true,
    code: 'OK',
    data: { favorites: result },
    timestamp: Date.now()
  }
}

// ========== 工具函数 ==========

/**
 * 更新图片的 favoriteCount
 */
async function updateImageFavoriteCount(imageId, increment) {
  try {
    await db.collection('gallery_images').doc(imageId).update({
      data: { favoriteCount: _.inc(increment) }
    })
  } catch (e) {
    console.warn('[gallery_favorites] 更新 favoriteCount 失败:', imageId, e.message)
  }
}
