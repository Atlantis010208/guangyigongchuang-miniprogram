/**
 * 云函数：lighting_cases_list
 * 功能：客户端只读拉取落地案例，自动生成图片临时 URL
 * 权限：无需登录
 *
 * 支持操作：
 *   - 不传 action（默认）：拉取展示中的案例列表
 *   - action='detail'：按 _id 拉取单条案例详情，供 v2 案例详情页使用
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'lighting_cases'

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

/**
 * 批量获取云存储临时 URL（按 50 个一批切片）
 * @param {string[]} fileIds
 * @returns {Map<string, string>} fileID → URL 映射
 */
async function batchGetTempUrls(fileIds) {
  const map = new Map()
  if (!fileIds || !fileIds.length) return map

  const CHUNK = 50
  for (let i = 0; i < fileIds.length; i += CHUNK) {
    const chunk = fileIds.slice(i, i + CHUNK)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      if (res.fileList) {
        for (const item of res.fileList) {
          if (item.fileID && item.tempFileURL) {
            map.set(item.fileID, item.tempFileURL)
          }
        }
      }
    } catch (e) {
      console.error('[lighting_cases_list] getTempFileURL 异常:', e)
    }
  }
  return map
}

/**
 * 把数据库文档整理成客户端契约，并回填图片临时 URL
 * @param {object} item 数据库原始文档
 * @param {Map<string,string>} urlMap fileID → 临时 URL
 */
function mapCase(item, urlMap) {
  const fileIds = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
  return {
    _id: item._id,
    imageFileIds: fileIds,
    imageUrls: fileIds.map(fid => urlMap.get(fid) || '').filter(Boolean),
    title: item.title || '',
    services: Array.isArray(item.services) ? item.services : [],
    desc: item.desc || '',
    city: item.city || '',
    area: item.area || '',
    style: item.style || '',
    officialAccountUrl: item.officialAccountUrl || '',
    sortOrder: item.sortOrder || 0
  }
}

/**
 * 按 _id 拉取单条案例详情
 * 已下架（status !== 'active'）的案例一律按不存在处理，避免通过直链访问
 */
async function getCaseDetail(event) {
  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) {
    return resp(false, 'INVALID_PARAMS', '缺少案例 id')
  }

  let doc = null
  try {
    const res = await db.collection(COLLECTION).doc(id).get()
    // doc().get() 在不同运行时下 data 可能是对象或单元素数组，这里统一处理
    doc = Array.isArray(res.data) ? res.data[0] : res.data
  } catch (e) {
    console.warn('[lighting_cases_list] 案例不存在:', id, e.message)
    return resp(false, 'NOT_FOUND', '案例不存在或已下架')
  }

  if (!doc || doc.status !== 'active') {
    return resp(false, 'NOT_FOUND', '案例不存在或已下架')
  }

  const urlMap = await batchGetTempUrls(
    Array.isArray(doc.imageFileIds) ? doc.imageFileIds : []
  )
  return resp(true, 'OK', '查询成功', { item: mapCase(doc, urlMap) })
}

exports.main = async (event) => {
  try {
    if (event && event.action === 'detail') {
      return await getCaseDetail(event)
    }

    const limitRaw = parseInt(event.limit || 20, 10)
    const limit = Math.min(50, Math.max(1, limitRaw))

    const listRes = await db.collection(COLLECTION)
      .where({ status: 'active' })
      .orderBy('sortOrder', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const items = listRes.data || []

    // 收集所有 fileID 去重
    const allFileIds = []
    const seen = new Set()
    for (const item of items) {
      const ids = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
      for (const fid of ids) {
        if (fid && !seen.has(fid)) {
          seen.add(fid)
          allFileIds.push(fid)
        }
      }
    }

    // 批量获取临时 URL
    const urlMap = await batchGetTempUrls(allFileIds)

    // 回填 imageUrls
    const enriched = items.map(item => mapCase(item, urlMap))

    return resp(true, 'OK', '查询成功', { items: enriched })
  } catch (e) {
    console.error('[lighting_cases_list] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
