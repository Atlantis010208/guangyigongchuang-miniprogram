const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const db = cloud.database()
const _ = db.command

/**
 * 批量将 cloud:// 链接转换为临时访问链接
 */
async function convertCloudFileIds(fileIds) {
  const validIds = fileIds.filter(id => id && id.startsWith('cloud://'))
  if (validIds.length === 0) return {}
  const map = {}
  try {
    const res = await cloud.getTempFileURL({ fileList: validIds })
    if (res.fileList) {
      res.fileList.forEach(item => {
        if (item.tempFileURL) map[item.fileID] = item.tempFileURL
      })
    }
  } catch (err) {
    console.warn('[designer_detail] 批量转换临时链接失败:', err.message)
  }
  return map
}

exports.main = async (event) => {
  const id = event && event.id ? String(event.id) : ''
  if (!id) return { success: false, errorMessage: 'missing id' }
  const col = db.collection('designers')
  try {
    const r = await col.doc(id).get()
    const item = r && r.data ? r.data : null
    if (!item) return { success: false, errorMessage: 'not found' }

    // 聚合作品集：designers.portfolioImages（管理员添加）+ designer_portfolios（设计师上传）
    const adminImages = Array.isArray(item.portfolioImages) ? item.portfolioImages : []
    const adminNames = Array.isArray(item.portfolioNames) ? item.portfolioNames : []

    // 查询 designer_portfolios 集合中该设计师的作品
    let dpImages = []
    let dpNames = []
    try {
      const dpRes = await db.collection('designer_portfolios')
        .where({ designerId: id, isDelete: _.neq(1) })
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
      const portfolios = dpRes.data || []
      portfolios.forEach(p => {
        if (p.coverImage) {
          dpImages.push(p.coverImage)
          dpNames.push(p.title || '')
        }
      })
    } catch (err) {
      console.warn('[designer_detail] 查询作品集失败（非致命）:', err.message)
    }

    // 合并：设计师上传的优先展示，管理员添加的补充在后面
    const mergedImages = [...dpImages, ...adminImages]
    const mergedNames = [...dpNames, ...adminNames]

    // 收集所有需要转换的 cloud:// 链接
    const allFileIds = [...mergedImages]
    if (item.avatar && item.avatar.startsWith('cloud://')) {
      allFileIds.push(item.avatar)
    }

    const tempUrlMap = await convertCloudFileIds(allFileIds)

    // 替换作品集图片为临时链接
    item.portfolioImages = mergedImages.map(img => tempUrlMap[img] || img)
    item.portfolioNames = mergedNames

    // 替换头像为临时链接
    if (item.avatar && tempUrlMap[item.avatar]) {
      item.avatar = tempUrlMap[item.avatar]
    }

    // 补充 title：如果为空，尝试用 styles 或 specialties 生成
    if (!item.title) {
      if (item.styles && typeof item.styles === 'string' && item.styles.trim()) {
        item.title = item.styles.trim()
      } else if (Array.isArray(item.specialties) && item.specialties.length > 0) {
        item.title = item.specialties.slice(0, 2).join(' / ')
      }
    }

    return { success: true, item }
  } catch (e) {
    return { success: false, errorMessage: e && e.message ? e.message : 'error' }
  }
}
