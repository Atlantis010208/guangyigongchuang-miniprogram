/**
 * 云函数：lighting_delivery_list
 * 功能：小程序端只读获取设计服务交付标准列表
 * 权限：匿名可调用
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'lighting_delivery'

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

// 批量请求 getTempFileURL，单次最多 50 个
async function batchGetTempFileURLs(fileList) {
  const unique = Array.from(new Set(fileList.filter(v => typeof v === 'string' && v.startsWith('cloud://'))))
  const urlMap = new Map()
  if (!unique.length) return urlMap

  const chunkSize = 50
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      ;(res.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) {
          urlMap.set(item.fileID, item.tempFileURL)
        }
      })
    } catch (e) {
      console.error('[lighting_delivery_list] getTempFileURL 失败', e)
    }
  }
  return urlMap
}

exports.main = async (event) => {
  const limit = Math.min(100, Math.max(1, parseInt(event.limit || 50, 10)))

  try {
    const listRes = await db.collection(COLLECTION)
      .where({ status: 'active' })
      .orderBy('sortOrder', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const items = listRes.data || []
    // 兼容旧数据：若无 imageFileIds 数组，回退到 [imageFileId]
    const allFileIds = []
    items.forEach(it => {
      const ids = Array.isArray(it.imageFileIds) && it.imageFileIds.length
        ? it.imageFileIds
        : (it.imageFileId ? [it.imageFileId] : [])
      allFileIds.push(...ids)
    })
    const urlMap = await batchGetTempFileURLs(allFileIds)

    const enriched = items.map(item => {
      const fileIds = Array.isArray(item.imageFileIds) && item.imageFileIds.length
        ? item.imageFileIds
        : (item.imageFileId ? [item.imageFileId] : [])
      const imageUrls = fileIds.map(fid => urlMap.get(fid) || '').filter(Boolean)
      return {
        _id: item._id,
        imageFileIds: fileIds,
        imageUrls,
        // 兼容字段：首图
        imageFileId: fileIds[0] || '',
        imageUrl: imageUrls[0] || '',
        title: item.title || '',
        phase: item.phase || '',
        period: item.period || '',
        desc: item.desc || '',
        phaseColor: item.phaseColor || '',
        phaseTextColor: item.phaseTextColor || '',
        periodColor: item.periodColor || '',
        periodTextColor: item.periodTextColor || '',
        sortOrder: item.sortOrder || 0
      }
    })

    return resp(true, 'OK', '查询成功', { items: enriched })
  } catch (e) {
    console.error('[lighting_delivery_list] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
