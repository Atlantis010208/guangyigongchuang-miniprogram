/**
 * 云函数：gallery_list
 * 功能：灯光图库列表查询、搜索、标签获取、图片详情（小程序端）
 * 权限：无需登录，任何用户可浏览
 * 
 * 支持操作：
 *   - list: 图库列表（游标分页、标签筛选、多标签 AND 筛选）
 *   - search: 关键词搜索（keywords 正则匹配 + 标签组合）
 *   - tags: 获取标签列表（支持 tagVersion 缓存判断）
 *   - detail: 单张图片详情（含原图 URL）
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口
exports.main = async (event, context) => {
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
      case 'list':
        return await getImageList(event)
      case 'search':
        return await searchImages(event)
      case 'tags':
        return await getTags(event)
      case 'detail':
        return await getImageDetail(event)
      case 'getCover':
        return await getGalleryCover()
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('[gallery_list] 异常:', error)
    return {
      success: false,
      code: 'GALLERY_LIST_ERROR',
      errorMessage: error.message || '图库查询失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 图库列表（游标分页、标签筛选）
 */
async function getImageList(event) {
  const {
    tag,
    tags,
    pageSize = 20,
    lastId,
    sortBy = 'sortOrder',
    sortOrder = 'desc'
  } = event

  const limit = Math.min(Number(pageSize), 40)

  // 构建查询条件
  const query = { status: 1 }

  // 单标签筛选
  if (tag) {
    query.tags = tag
  }

  // 多标签 AND 筛选
  if (tags && Array.isArray(tags) && tags.length > 0) {
    query.tags = _.all(tags)
  }

  // 分页：使用 offset(skip) 方式
  const skip = Number(event.offset) || 0

  // 查询图片列表
  const listRes = await db.collection('gallery_images')
    .where(query)
    .orderBy(sortBy, sortOrder)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit + 1) // 多取一条判断是否有下一页
    .get()

  const allImages = listRes.data || []
  const hasMore = allImages.length > limit
  const images = hasMore ? allImages.slice(0, limit) : allImages

  // 把 cloud:// 协议转成带签名的临时 URL，绕过 CDN 缓存
  const urlMap = await resolveTempFileURLs(images)
  const result = images.map(img => {
    const cloudId = img.thumbFileID || img.fileID
    return {
      _id: img._id,
      title: img.title,
      tags: img.tags,
      thumbUrl: urlMap[cloudId] || cloudId,
      aspect: img.aspect,
      favoriteCount: img.favoriteCount || 0
    }
  })

  const newLastId = images.length > 0 ? images[images.length - 1]._id : null

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
 * CDN 缓存版本号
 * 当批量覆盖 gallery/full 或 gallery/thumb 下的图片时，需要更新此版本号，
 * 以便生成的 URL 带上新的 ?v=xxx 参数，绕过 CDN 缓存强制回源拉取新图。
 * 日常业务不会覆盖同名文件（新上传用新文件名），所以平时无需修改。
 */
const CDN_CACHE_VERSION = '20260423-dewm'

/**
 * 批量把图片记录里的 cloud:// 转成 https URL，并在末尾拼接 ?v=版本号
 * 目的：
 *   1. cloud:// 协议由小程序端解析为 CDN 加速域名 URL，会命中 CDN 缓存
 *   2. 云存储桶为公有读时，getTempFileURL 返回裸链无 sign，无法自动绕过缓存
 *   3. 通过拼接 ?v=<版本号>，CDN 按完整 URL 作为缓存 key，版本号变化 → 回源 → 拿到新图
 */
async function resolveTempFileURLs(images) {
  const fileIds = new Set()
  for (const img of images) {
    const id = img.thumbFileID || img.fileID
    if (id && typeof id === 'string' && id.startsWith('cloud://')) {
      fileIds.add(id)
    }
  }
  if (fileIds.size === 0) return {}

  const urlMap = {}
  const ids = [...fileIds]
  // cloud.getTempFileURL 单次最多 50 个
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      ;(res.fileList || []).forEach(f => {
        if (f.fileID && f.tempFileURL) {
          const sep = f.tempFileURL.includes('?') ? '&' : '?'
          urlMap[f.fileID] = `${f.tempFileURL}${sep}v=${CDN_CACHE_VERSION}`
        }
      })
    } catch (e) {
      console.warn('[gallery_list] 获取临时URL失败:', e.message)
    }
  }
  return urlMap
}

/**
 * 关键词模糊搜索（多 token AND + 多字段 OR + 正则特殊字符转义）
 *
 * 例子：
 *   keyword="卧室 吊灯"
 *   → 切分为 ["卧室", "吊灯"]
 *   → 每个 token 在 keywords/title/description 任一字段命中即可（OR）
 *   → 多个 token 之间必须都命中（AND）
 *   → 故能匹配 title="主卧吊灯设计" 或 keywords 含"卧室 吊灯"的图片
 */
async function searchImages(event) {
  const {
    keyword = '',
    tag,
    tags,
    pageSize = 20,
    lastId
  } = event

  // 如果没有搜索关键词，退化为普通列表
  if (!keyword.trim()) {
    return await getImageList({ ...event, action: 'list' })
  }

  const limit = Math.min(Number(pageSize), 40)

  // 1) 切分用户输入：按中英文空格、常见标点切分为多个 token
  const tokens = String(keyword)
    .trim()
    .split(/[\s,，;；、|\/]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .slice(0, 5) // 最多 5 个 token，避免恶意超长输入

  // 2) 构建查询条件
  const baseQuery = { status: 1 }

  // 标签筛选（与搜索组合 AND 逻辑）
  if (tag) {
    baseQuery.tags = tag
  }
  if (tags && Array.isArray(tags) && tags.length > 0) {
    baseQuery.tags = _.all(tags)
  }

  // 3) 每个 token 命中 keywords / title / description / tags 任意字段即可
  //    多 token 之间 AND
  const tokenConditions = tokens.map(token => {
    const safe = escapeRegExp(token)
    const re = db.RegExp({ regexp: safe, options: 'i' })
    return _.or([
      { keywords: re },
      { title: re },
      { description: re },
      { tags: re } // 数组字段：任一元素匹配即命中
    ])
  })

  const finalWhere = tokenConditions.length > 0
    ? _.and([baseQuery, ...tokenConditions])
    : baseQuery

  // 分页：使用 offset(skip) 方式
  const skip = Number(event.offset) || 0

  const listRes = await db.collection('gallery_images')
    .where(finalWhere)
    .orderBy('sortOrder', 'desc')
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit + 1)
    .get()

  const allImages = listRes.data || []
  const hasMore = allImages.length > limit
  const images = hasMore ? allImages.slice(0, limit) : allImages

  // 把 cloud:// 转成带签名的临时 URL，绕过 CDN 缓存
  const urlMap = await resolveTempFileURLs(images)
  const result = images.map(img => {
    const cloudId = img.thumbFileID || img.fileID
    return {
      _id: img._id,
      title: img.title,
      tags: img.tags,
      thumbUrl: urlMap[cloudId] || cloudId,
      aspect: img.aspect,
      favoriteCount: img.favoriteCount || 0
    }
  })

  const newLastId = images.length > 0 ? images[images.length - 1]._id : null

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
 * 获取标签列表（支持 tagVersion 缓存）
 */
async function getTags(event) {
  const { tagVersion: clientVersion } = event

  // 获取服务端 tagVersion
  let serverVersion = 1
  try {
    const configRes = await db.collection('gallery_config').doc('tag_version').get()
    if (configRes.data) {
      serverVersion = configRes.data.value
    }
  } catch (e) {
    console.warn('[gallery_list] 获取 tagVersion 失败:', e.message)
  }

  // 如果客户端版本与服务端一致，返回 304 标识
  if (clientVersion !== undefined && Number(clientVersion) === serverVersion) {
    return {
      success: true,
      code: 'OK',
      data: {
        tags: [],
        tagVersion: serverVersion,
        notModified: true
      },
      timestamp: Date.now()
    }
  }

  // 查询所有启用的标签
  const listRes = await db.collection('gallery_tags')
    .where({ status: 1 })
    .orderBy('sortOrder', 'asc')
    .orderBy('name', 'asc')
    .limit(200)
    .get()

  const tags = (listRes.data || []).map(tag => ({
    _id: tag._id,
    name: tag.name,
    group: tag.group,
    imageCount: tag.imageCount || 0
  }))

  return {
    success: true,
    code: 'OK',
    data: {
      tags,
      tagVersion: serverVersion,
      notModified: false
    },
    timestamp: Date.now()
  }
}

/**
 * 单张图片详情（含原图 URL）
 */
async function getImageDetail(event) {
  const { imageId } = event

  if (!imageId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少图片ID(imageId)',
      timestamp: Date.now()
    }
  }

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

  // 转换原图和缩略图 URL
  const cloudFileIds = new Set()
  if (image.fileID && image.fileID.startsWith('cloud://')) cloudFileIds.add(image.fileID)
  if (image.thumbFileID && image.thumbFileID.startsWith('cloud://')) cloudFileIds.add(image.thumbFileID)

  let fileUrl = image.fileID
  let thumbUrl = image.thumbFileID || image.fileID

  if (cloudFileIds.size > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: [...cloudFileIds] })
      const urlMap = {}
      ;(tempRes.fileList || []).forEach(f => {
        if (f.fileID && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
      })
      fileUrl = urlMap[image.fileID] || image.fileID
      thumbUrl = urlMap[image.thumbFileID] || urlMap[image.fileID] || image.thumbFileID || image.fileID
    } catch (e) {
      console.warn('[gallery_list] 转换详情图片链接失败:', e.message)
    }
  }

  // 更新浏览次数
  try {
    await db.collection('gallery_images').doc(imageId).update({
      data: { viewCount: _.inc(1) }
    })
  } catch (e) {
    // 不影响主流程
  }

  return {
    success: true,
    code: 'OK',
    data: {
      _id: image._id,
      title: image.title,
      description: image.description,
      tags: image.tags,
      fileUrl,
      thumbUrl,
      width: image.width,
      height: image.height,
      aspect: image.aspect,
      viewCount: (image.viewCount || 0) + 1,
      favoriteCount: image.favoriteCount || 0,
      createdAt: image.createdAt
    },
    timestamp: Date.now()
  }
}

/**
 * 获取图库封面图配置（小程序端）
 */
async function getGalleryCover() {
  try {
    const res = await db.collection('app_config').where({ key: 'gallery_cover' }).limit(1).get()
    const doc = res.data && res.data[0]

    if (!doc || !doc.value) {
      return {
        success: true,
        code: 'OK',
        data: { coverUrl: '' },
        timestamp: Date.now()
      }
    }

    // cloud:// 格式的 fileID 小程序 image 组件可直接使用
    return {
      success: true,
      code: 'OK',
      data: { coverUrl: doc.value },
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[gallery_list] 获取封面图配置失败:', error)
    return {
      success: true,
      code: 'OK',
      data: { coverUrl: '' },
      timestamp: Date.now()
    }
  }
}

// ========== 工具函数 ==========

/**
 * 转义正则表达式特殊字符
 * 防止用户输入 . * + ? ( ) [ ] { } 等符号时把搜索词当做有效正则解析。
 */
function escapeRegExp(str) {
  if (!str) return ''
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 批量转换缩略图的 cloud:// fileID 为临时 HTTPS URL
 */
async function processThumbUrls(images) {
  if (!images || images.length === 0) return images

  const cloudFileIds = new Set()
  images.forEach(img => {
    const thumbId = img.thumbFileID || img.fileID
    if (thumbId && thumbId.startsWith('cloud://')) {
      cloudFileIds.add(thumbId)
    }
  })

  if (cloudFileIds.size === 0) {
    return images.map(img => ({
      ...img,
      thumbUrl: img.thumbFileID || img.fileID
    }))
  }

  try {
    const tempRes = await cloud.getTempFileURL({ fileList: [...cloudFileIds] })
    const urlMap = {}
    ;(tempRes.fileList || []).forEach(f => {
      if (f.fileID && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
    })

    return images.map(img => {
      const thumbId = img.thumbFileID || img.fileID
      return {
        ...img,
        thumbUrl: urlMap[thumbId] || thumbId
      }
    })
  } catch (e) {
    console.warn('[gallery_list] 批量转换缩略图链接失败:', e.message)
    return images.map(img => ({
      ...img,
      thumbUrl: img.thumbFileID || img.fileID
    }))
  }
}
