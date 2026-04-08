/**
 * 设计师作品集管理云函数
 * 支持操作：list（获取列表）、add（添加作品）、delete（删除作品）
 *
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：list / add / delete
 * @param {number} [event.page] - 页码，默认1（list 时使用）
 * @param {number} [event.pageSize] - 每页数量，默认20（list 时使用）
 * @param {string} [event.spaceType] - 空间类型筛选（list 时使用）
 * @param {object} [event.portfolio] - 作品数据（add 时必填）
 * @param {string} [event.portfolioId] - 作品ID（delete 时必填）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 支持的空间类型
const VALID_SPACE_TYPES = ['住宅', '商业', '办公', '艺术装置', '景观']

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: '用户身份验证失败'
    }
  }

  const { action } = event

  try {
    switch (action) {
      case 'list':
        return await listPortfolios(openid, event)
      case 'add':
        return await addPortfolio(openid, event.portfolio)
      case 'delete':
        return await deletePortfolio(openid, event.portfolioId)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('[designer_portfolios] 操作失败:', err)
    if (err.message === 'NOT_DESIGNER') {
      return { success: false, code: 'NOT_DESIGNER', message: '当前账号不是设计师身份' }
    }
    if (err.message === 'USER_NOT_FOUND') {
      return { success: false, code: 'NOT_FOUND', message: '用户不存在，请先登录' }
    }
    return { success: false, code: 'SERVER_ERROR', message: err.message || '服务器错误' }
  }
}

/**
 * 验证用户为设计师，返回 user 和 designer 文档
 */
async function verifyDesigner(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) throw new Error('USER_NOT_FOUND')
  const user = userRes.data[0]
  if (user.roles !== 2 && user.roles !== 0) throw new Error('NOT_DESIGNER')

  const designerRes = await db.collection('designers')
    .where(_.or([{ _openid: openid }, { openid: openid }]))
    .limit(1)
    .get()

  const designer = (designerRes.data && designerRes.data.length > 0) ? designerRes.data[0] : null
  return { user, designer }
}

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
    console.warn('[designer_portfolios] 批量转换临时链接失败:', err.message)
  }
  return map
}

/**
 * 获取作品集列表
 */
async function listPortfolios(openid, event) {
  const { page = 1, pageSize = 20, spaceType } = event

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return {
      success: true,
      code: 'OK',
      message: '获取成功',
      data: { list: [], total: 0, page, pageSize, hasMore: false }
    }
  }

  let condition = {
    designerId: designer._id,
    isDelete: _.neq(1)
  }
  if (spaceType && VALID_SPACE_TYPES.includes(spaceType)) {
    condition.spaceType = spaceType
  }

  const countRes = await db.collection('designer_portfolios').where(condition).count()
  const total = countRes.total || 0

  const skip = (page - 1) * pageSize
  const res = await db.collection('designer_portfolios')
    .where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const portfolios = res.data || []

  // 收集所有需要转换的 fileID
  const allFileIds = []
  portfolios.forEach(p => {
    if (p.coverImage) allFileIds.push(p.coverImage)
    if (Array.isArray(p.galleryImages)) {
      p.galleryImages.forEach(img => allFileIds.push(img))
    }
  })

  const tempUrlMap = await convertCloudFileIds(allFileIds)

  // 替换临时链接
  const list = portfolios.map(p => ({
    ...p,
    tempCoverImage: tempUrlMap[p.coverImage] || p.coverImage || '',
    tempGalleryImages: Array.isArray(p.galleryImages)
      ? p.galleryImages.map(img => tempUrlMap[img] || img)
      : []
  }))

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: { list, total, page, pageSize, hasMore: skip + list.length < total }
  }
}

/**
 * 添加新作品
 */
async function addPortfolio(openid, portfolio) {
  if (!portfolio || typeof portfolio !== 'object') {
    return { success: false, code: 'MISSING_PARAM', message: '缺少作品数据' }
  }

  const { title, spaceType, description, coverImage, galleryImages } = portfolio

  // 参数校验
  if (!title || !title.trim()) {
    return { success: false, code: 'VALIDATION_ERROR', message: '请填写作品名称' }
  }
  if (title.trim().length > 30) {
    return { success: false, code: 'VALIDATION_ERROR', message: '作品名称不能超过30字' }
  }
  if (!spaceType || !VALID_SPACE_TYPES.includes(spaceType)) {
    return { success: false, code: 'VALIDATION_ERROR', message: '请选择有效的空间类型' }
  }
  if (!coverImage || !coverImage.startsWith('cloud://')) {
    return { success: false, code: 'VALIDATION_ERROR', message: '封面图必须先上传到云存储' }
  }
  if (!Array.isArray(galleryImages) || galleryImages.length < 1) {
    return { success: false, code: 'VALIDATION_ERROR', message: '请至少添加一张项目图集' }
  }
  if (galleryImages.length > 9) {
    return { success: false, code: 'VALIDATION_ERROR', message: '项目图集最多9张' }
  }
  if (!description || !description.trim()) {
    return { success: false, code: 'VALIDATION_ERROR', message: '请填写设计理念说明' }
  }
  if (description.length > 500) {
    return { success: false, code: 'VALIDATION_ERROR', message: '设计理念说明不能超过500字' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在，请先完善个人资料' }
  }

  const now = Date.now()
  const newPortfolio = {
    _openid: openid,
    designerId: designer._id,
    title: title.trim(),
    spaceType,
    description: description.trim(),
    coverImage,
    galleryImages,
    isDelete: 0,
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('designer_portfolios').add({ data: newPortfolio })

  // 更新设计师作品集计数
  try {
    await db.collection('designers').doc(designer._id).update({
      data: { portfolioCount: _.inc(1), updatedAt: now }
    })
  } catch (err) {
    console.warn('[designer_portfolios] 更新作品集计数失败:', err.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '作品发布成功',
    data: { _id: addRes._id, ...newPortfolio }
  }
}

/**
 * 软删除作品
 */
async function deletePortfolio(openid, portfolioId) {
  if (!portfolioId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少作品ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  // 查询作品并验证归属
  let portfolio
  try {
    const res = await db.collection('designer_portfolios').doc(portfolioId).get()
    portfolio = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '作品不存在' }
  }

  if (!portfolio || portfolio.isDelete === 1) {
    return { success: false, code: 'NOT_FOUND', message: '作品不存在或已删除' }
  }
  if (portfolio.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此作品' }
  }

  const now = Date.now()
  await db.collection('designer_portfolios').doc(portfolioId).update({
    data: { isDelete: 1, updatedAt: now }
  })

  // 更新设计师作品集计数（最低为0）
  try {
    const currentCount = designer.portfolioCount || 0
    await db.collection('designers').doc(designer._id).update({
      data: {
        portfolioCount: currentCount > 0 ? _.inc(-1) : 0,
        updatedAt: now
      }
    })
  } catch (err) {
    console.warn('[designer_portfolios] 更新作品集计数失败:', err.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '作品已删除'
  }
}
