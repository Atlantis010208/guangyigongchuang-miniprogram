/**
 * 收藏夹操作云函数
 * 支持操作：get（获取列表）、add（添加）、remove（移除）、batch_remove（批量移除）、clear（清空）、check（检查是否已收藏）
 * 
 * 入参 event:
 *   - action: string, 操作类型
 *   - productId: string, 商品ID（add/remove/check 时使用）
 *   - product: object, 商品信息（add 时使用，包含 id/name/price/image/specs 等）
 *   - productIds: string[], 商品ID数组（batch_remove 时使用）
 * 
 * 返回值:
 *   - success: boolean
 *   - code: string
 *   - message: string
 *   - data: any
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

  // 验证用户身份
  if (!OPENID) {
    return {
      success: false,
      code: 'MISSING_OPENID',
      errorMessage: '缺少用户身份信息',
      timestamp: Date.now()
    }
  }

  try {
    const { action } = event

    // 验证操作类型
    if (!action) {
      return {
        success: false,
        code: 'MISSING_ACTION',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    // 根据操作类型分发处理
    switch (action) {
      case 'get':
        return await getFavorites(OPENID, event)
      case 'add':
        return await addFavorite(OPENID, event)
      case 'remove':
        return await removeFavorite(OPENID, event)
      case 'batch_remove':
        return await batchRemoveFavorites(OPENID, event)
      case 'clear':
        return await clearFavorites(OPENID)
      case 'check':
        return await checkFavorite(OPENID, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('收藏操作异常:', error)
    return {
      success: false,
      code: 'FAVORITES_ERROR',
      errorMessage: error.message || '收藏操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 获取用户收藏列表
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（支持 page/pageSize 分页）
 */
async function getFavorites(userId, event) {
  try {
    const { page = 1, pageSize = 50 } = event
    const skip = (Number(page) - 1) * Number(pageSize)

    // 确保集合存在
    await ensureCollection('favorites')

    // 查询收藏数量
    const countRes = await db.collection('favorites')
      .where({
        userId,
        isDelete: _.neq(1)
      })
      .count()

    const total = countRes.total || 0

    // 查询收藏列表
    const listRes = await db.collection('favorites')
      .where({
        userId,
        isDelete: _.neq(1)
      })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Number(pageSize))
      .get()

    const favorites = listRes.data || []

    // 处理云存储图片链接
    const processedFavorites = await processImageUrls(favorites)

    return {
      success: true,
      code: 'OK',
      message: '获取收藏列表成功',
      data: {
        list: processedFavorites,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize))
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('获取收藏列表失败:', error)
    throw error
  }
}

/**
 * 添加收藏
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（包含 product 商品信息）
 */
async function addFavorite(userId, event) {
  try {
    const { product } = event

    // 验证商品信息
    if (!product || !product.id) {
      return {
        success: false,
        code: 'MISSING_PRODUCT',
        errorMessage: '缺少商品信息',
        timestamp: Date.now()
      }
    }

    // 确保集合存在
    await ensureCollection('favorites')

    // 检查是否已收藏
    const existRes = await db.collection('favorites')
      .where({
        userId,
        productId: product.id,
        isDelete: _.neq(1)
      })
      .get()

    if (existRes.data && existRes.data.length > 0) {
      return {
        success: true,
        code: 'ALREADY_EXISTS',
        message: '商品已在收藏夹中',
        data: { favoriteId: existRes.data[0]._id },
        timestamp: Date.now()
      }
    }

    // 添加收藏记录
    const now = Date.now()
    const favoriteData = {
      userId,
      productId: product.id,
      name: product.name || '',
      price: Number(product.price) || 0,
      image: product.image || '',
      specs: product.specs || {},
      description: product.description || '',
      category: product.category || '',
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }

    const addRes = await db.collection('favorites').add({
      data: favoriteData
    })

    console.log('添加收藏成功:', { userId, productId: product.id, favoriteId: addRes._id })

    return {
      success: true,
      code: 'OK',
      message: '收藏成功',
      data: {
        favoriteId: addRes._id,
        product: favoriteData
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('添加收藏失败:', error)
    throw error
  }
}

/**
 * 移除收藏
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（包含 productId）
 */
async function removeFavorite(userId, event) {
  try {
    const { productId } = event

    if (!productId) {
      return {
        success: false,
        code: 'MISSING_PRODUCT_ID',
        errorMessage: '缺少商品ID',
        timestamp: Date.now()
      }
    }

    // 逻辑删除
    const updateRes = await db.collection('favorites')
      .where({
        userId,
        productId
      })
      .update({
        data: {
          isDelete: 1,
          updatedAt: Date.now()
        }
      })

    console.log('移除收藏:', { userId, productId, updated: updateRes.stats.updated })

    return {
      success: true,
      code: 'OK',
      message: '已取消收藏',
      data: { removed: updateRes.stats.updated },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('移除收藏失败:', error)
    throw error
  }
}

/**
 * 批量移除收藏
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（包含 productIds 数组）
 */
async function batchRemoveFavorites(userId, event) {
  try {
    const { productIds } = event

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return {
        success: false,
        code: 'MISSING_PRODUCT_IDS',
        errorMessage: '缺少商品ID列表',
        timestamp: Date.now()
      }
    }

    // 批量逻辑删除
    const updateRes = await db.collection('favorites')
      .where({
        userId,
        productId: _.in(productIds)
      })
      .update({
        data: {
          isDelete: 1,
          updatedAt: Date.now()
        }
      })

    console.log('批量移除收藏:', { userId, productIds, updated: updateRes.stats.updated })

    return {
      success: true,
      code: 'OK',
      message: `已移除 ${updateRes.stats.updated} 件商品`,
      data: { removed: updateRes.stats.updated },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('批量移除收藏失败:', error)
    throw error
  }
}

/**
 * 清空收藏夹
 * @param {string} userId - 用户 openid
 */
async function clearFavorites(userId) {
  try {
    // 逻辑删除所有收藏
    const updateRes = await db.collection('favorites')
      .where({
        userId,
        isDelete: _.neq(1)
      })
      .update({
        data: {
          isDelete: 1,
          updatedAt: Date.now()
        }
      })

    console.log('清空收藏夹:', { userId, updated: updateRes.stats.updated })

    return {
      success: true,
      code: 'OK',
      message: '已清空收藏夹',
      data: { cleared: updateRes.stats.updated },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('清空收藏夹失败:', error)
    throw error
  }
}

/**
 * 检查商品是否已收藏
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（包含 productId）
 */
async function checkFavorite(userId, event) {
  try {
    const { productId } = event

    if (!productId) {
      return {
        success: false,
        code: 'MISSING_PRODUCT_ID',
        errorMessage: '缺少商品ID',
        timestamp: Date.now()
      }
    }

    // 确保集合存在
    await ensureCollection('favorites')

    const existRes = await db.collection('favorites')
      .where({
        userId,
        productId,
        isDelete: _.neq(1)
      })
      .get()

    const isFavorited = existRes.data && existRes.data.length > 0

    return {
      success: true,
      code: 'OK',
      message: isFavorited ? '已收藏' : '未收藏',
      data: {
        isFavorited,
        favoriteId: isFavorited ? existRes.data[0]._id : null
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('检查收藏状态失败:', error)
    throw error
  }
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try {
        await db.createCollection(collectionName)
        console.log('创建集合成功:', collectionName)
      } catch (createErr) {
        // 可能已被其他请求创建，忽略错误
        console.log('创建集合忽略:', createErr.message)
      }
    }
  }
}

/**
 * 处理云存储图片链接
 * @param {array} favorites - 收藏列表
 */
async function processImageUrls(favorites) {
  if (!favorites || favorites.length === 0) return favorites

  // 收集所有 cloud:// 开头的图片
  const cloudFiles = favorites
    .map(item => item.image)
    .filter(src => src && typeof src === 'string' && src.startsWith('cloud://'))

  if (cloudFiles.length === 0) return favorites

  try {
    const tempRes = await cloud.getTempFileURL({
      fileList: [...new Set(cloudFiles)] // 去重
    })

    // 构建映射
    const urlMap = {}
    ;(tempRes.fileList || []).forEach(file => {
      if (file.fileID && file.tempFileURL) {
        urlMap[file.fileID] = file.tempFileURL
      }
    })

    // 替换图片链接
    return favorites.map(item => {
      if (item.image && urlMap[item.image]) {
        return { ...item, imageUrl: urlMap[item.image] }
      }
      return { ...item, imageUrl: item.image }
    })

  } catch (err) {
    console.warn('转换图片临时链接失败:', err)
    return favorites.map(item => ({ ...item, imageUrl: item.image }))
  }
}
