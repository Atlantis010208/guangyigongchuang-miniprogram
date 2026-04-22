/**
 * 云函数：lighting_cases_list
 * 功能：客户端只读拉取落地案例列表，自动生成图片临时 URL
 * 权限：无需登录
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

exports.main = async (event) => {
  try {
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
    const enriched = items.map(item => {
      const fileIds = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
      const imageUrls = fileIds.map(fid => urlMap.get(fid) || '').filter(Boolean)
      return {
        _id: item._id,
        imageFileIds: fileIds,
        imageUrls,
        title: item.title || '',
        services: item.services || [],
        desc: item.desc || '',
        officialAccountUrl: item.officialAccountUrl || '',
        sortOrder: item.sortOrder || 0
      }
    })

    return resp(true, 'OK', '查询成功', { items: enriched })
  } catch (e) {
    console.error('[lighting_cases_list] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
