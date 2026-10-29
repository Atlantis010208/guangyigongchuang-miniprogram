const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_SPACE_TYPES = ['住宅', '商业', '办公', '艺术装置', '景观']

function now() {
  return Date.now()
}

function cleanPhone(value) {
  return String(value || '').trim().replace(/[\s\-()]/g, '')
}

function getPhoneMatchList(user) {
  const values = []
  const add = (value) => {
    const text = cleanPhone(value)
    if (text && values.indexOf(text) === -1) values.push(text)
  }

  ;[user.phone, user.phoneNumber, user.mobile, user.purePhoneNumber, user.fullPhoneNumber].forEach((value) => {
    const raw = cleanPhone(value)
    if (!raw) return
    add(raw)
    let pure = raw
    if (pure.indexOf('+86') === 0) pure = pure.slice(3)
    if (pure.indexOf('86') === 0 && pure.length === 13) pure = pure.slice(2)
    add(pure)
    if (/^1\d{10}$/.test(pure)) {
      add('+86' + pure)
      add('86' + pure)
    }
  })

  return values
}

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

async function getUser(openid) {
  const res = await db.collection('users').where(_.or([
    { _openid: openid },
    { openid },
    { alternateOpenids: openid }
  ])).limit(1).get()
  if (!res.data || res.data.length === 0) throw new Error('USER_NOT_FOUND')
  if (res.data[0].isDelete === 1) throw new Error('USER_NOT_FOUND')
  return res.data[0]
}

async function getActiveWhitelist(openid, user) {
  const conditions = [
    { status: 'active', openid },
    { status: 'active', _openid: openid },
    { status: 'active', activatedOpenid: openid },
    { status: 'active', userOpenid: openid },
    { status: 'active', designerOpenid: openid }
  ]
  if (user._id) conditions.push({ status: 'active', userId: user._id })
  if (user.designerId) conditions.push({ status: 'active', designerId: user.designerId })
  if (user.designerWhitelistId) conditions.push({ status: 'active', _id: user.designerWhitelistId })
  const phoneMatchList = getPhoneMatchList(user)
  if (phoneMatchList.length > 0) {
    conditions.push({ status: 'active', phone: _.in(phoneMatchList) })
    conditions.push({ status: 'active', purePhoneNumber: _.in(phoneMatchList) })
    conditions.push({ status: 'active', fullPhoneNumber: _.in(phoneMatchList) })
  }

  const res = await db.collection('designer_whitelist')
    .where(_.or(conditions))
    .limit(1)
    .get()
  if (!res.data || res.data.length === 0) throw new Error('DESIGNER_NOT_CERTIFIED')
  return res.data[0]
}

async function getDocById(collectionName, id) {
  if (!id) return null
  try {
    const res = await db.collection(collectionName).doc(id).get()
    return res.data || null
  } catch (error) {
    return null
  }
}

async function findDesigner(openid, user, whitelist) {
  const idCandidates = unique([whitelist.designerId, whitelist.designer_id, user.designerId])
  for (const id of idCandidates) {
    const doc = await getDocById('designers', id)
    if (doc && doc.isDelete !== 1) return doc
  }

  const phoneMatchList = getPhoneMatchList(user)
  const conditions = [
    { _openid: openid, isDelete: _.neq(1) },
    { openid, isDelete: _.neq(1) }
  ]
  if (user._id) conditions.push({ userId: user._id, isDelete: _.neq(1) })
  if (phoneMatchList.length > 0) {
    conditions.push({ phone: _.in(phoneMatchList), isDelete: _.neq(1) })
    conditions.push({ phoneNumber: _.in(phoneMatchList), isDelete: _.neq(1) })
  }

  const res = await db.collection('designers').where(_.or(conditions)).limit(1).get()
  return res.data && res.data[0] || null
}

async function initDesignerProfile(openid, user, whitelist) {
  const timestamp = now()
  const data = {
    _openid: openid,
    openid,
    userId: user._id || '',
    whitelistId: whitelist._id || '',
    name: whitelist.name || user.nickname || user.name || '设计师',
    title: '专业灯光设计',
    avatar: user.avatarUrl || '',
    bio: '',
    experience: 0,
    styles: '',
    specialties: [],
    spaceType: [],
    phone: cleanPhone(user.phone || user.phoneNumber || whitelist.phone || ''),
    wechat: '',
    rating: 5,
    projects: 0,
    portfolioCount: 0,
    isDelete: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const addRes = await db.collection('designers').add({ data })
  return Object.assign({ _id: addRes._id }, data)
}

async function verifyDesignerAccess(openid) {
  const user = await getUser(openid)
  const whitelist = await getActiveWhitelist(openid, user)
  let designer = await findDesigner(openid, user, whitelist)
  if (!designer) designer = await initDesignerProfile(openid, user, whitelist)
  return { user, whitelist, designer }
}

async function convertCloudFileIds(fileIds) {
  const validIds = unique(fileIds.filter((id) => id && String(id).startsWith('cloud://')))
  if (validIds.length === 0) return {}

  const map = {}
  try {
    const res = await cloud.getTempFileURL({ fileList: validIds })
    if (res.fileList) {
      res.fileList.forEach((item) => {
        if (item.tempFileURL) map[item.fileID] = item.tempFileURL
      })
    }
  } catch (error) {
    console.warn('[designer_portfolios] getTempFileURL failed:', error.message)
  }
  return map
}

function getImageListFromDesigner(designer) {
  if (Array.isArray(designer.portfolioImages)) return designer.portfolioImages.filter(Boolean)
  if (Array.isArray(designer.works)) {
    return designer.works
      .map((item) => item.coverImage || item.coverUrl || item.image || item.imageUrl)
      .filter(Boolean)
  }
  return []
}

function normalizePortfolio(item, tempUrlMap) {
  const galleryImages = Array.isArray(item.galleryImages) ? item.galleryImages : []
  const coverImage = item.coverImage || item.coverUrl || item.imageUrl || galleryImages[0] || ''
  return Object.assign({}, item, {
    coverImage,
    tempCoverImage: tempUrlMap[coverImage] || coverImage || '',
    tempGalleryImages: galleryImages.map((image) => tempUrlMap[image] || image),
    imageUrl: tempUrlMap[coverImage] || coverImage || ''
  })
}

function buildDesignerImagePortfolios(designer, page, pageSize, spaceType) {
  const images = getImageListFromDesigner(designer)
  const labels = Array.isArray(designer.portfolioTitles) ? designer.portfolioTitles : []
  return images.map((image, index) => ({
    _id: `${designer._id || 'designer'}-portfolio-image-${index}`,
    id: `${designer._id || 'designer'}-portfolio-image-${index}`,
    designerId: designer._id,
    title: labels[index] || `作品 ${index + 1}`,
    spaceType: spaceType || '',
    description: designer.bio || designer.intro || '',
    coverImage: image,
    galleryImages: [image],
    source: 'designers.portfolioImages',
    isDelete: 0,
    createdAt: designer.updatedAt || designer.createdAt || now(),
    updatedAt: designer.updatedAt || designer.createdAt || now()
  }))
}

async function listPortfolios(openid, event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(event.pageSize) || 20))
  const { spaceType } = event
  const { designer } = await verifyDesignerAccess(openid)

  let condition = {
    designerId: designer._id,
    isDelete: _.neq(1)
  }
  if (spaceType && VALID_SPACE_TYPES.includes(spaceType)) {
    condition.spaceType = spaceType
  }

  const skip = (page - 1) * pageSize
  const countRes = await db.collection('designer_portfolios').where(condition).count()
  const total = countRes.total || 0
  const res = await db.collection('designer_portfolios')
    .where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  let rawList = res.data || []
  let effectiveTotal = total

  if (rawList.length === 0 && total === 0) {
    const fromDesigner = buildDesignerImagePortfolios(designer, page, pageSize, spaceType)
    effectiveTotal = fromDesigner.length
    rawList = fromDesigner.slice(skip, skip + pageSize)
  }

  const allFileIds = []
  rawList.forEach((portfolio) => {
    if (portfolio.coverImage) allFileIds.push(portfolio.coverImage)
    if (Array.isArray(portfolio.galleryImages)) {
      portfolio.galleryImages.forEach((image) => allFileIds.push(image))
    }
  })

  const tempUrlMap = await convertCloudFileIds(allFileIds)
  const list = rawList.map((portfolio) => normalizePortfolio(portfolio, tempUrlMap))

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: { list, total: effectiveTotal, page, pageSize, hasMore: skip + list.length < effectiveTotal }
  }
}

function validatePortfolio(portfolio) {
  if (!portfolio || typeof portfolio !== 'object') {
    return { valid: false, code: 'MISSING_PARAM', message: '缺少作品数据' }
  }
  if (!portfolio.title || !String(portfolio.title).trim()) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '请填写作品名称' }
  }
  if (String(portfolio.title).trim().length > 30) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '作品名称不能超过30字' }
  }
  if (!portfolio.spaceType || !VALID_SPACE_TYPES.includes(portfolio.spaceType)) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '请选择有效的空间类型' }
  }
  if (!portfolio.coverImage || !String(portfolio.coverImage).startsWith('cloud://')) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '封面图必须先上传到云存储' }
  }
  if (!Array.isArray(portfolio.galleryImages) || portfolio.galleryImages.length < 1) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '请至少添加一张项目图集' }
  }
  if (portfolio.galleryImages.length > 9) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '项目图集最多9张' }
  }
  if (!portfolio.description || !String(portfolio.description).trim()) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '请填写设计理念说明' }
  }
  if (String(portfolio.description).length > 500) {
    return { valid: false, code: 'VALIDATION_ERROR', message: '设计理念说明不能超过500字' }
  }
  return { valid: true }
}

async function addPortfolio(openid, portfolio) {
  const validation = validatePortfolio(portfolio)
  if (!validation.valid) return validation

  const { designer } = await verifyDesignerAccess(openid)
  const timestamp = now()
  const data = {
    _openid: openid,
    designerId: designer._id,
    title: String(portfolio.title).trim(),
    spaceType: portfolio.spaceType,
    description: String(portfolio.description).trim(),
    coverImage: portfolio.coverImage,
    galleryImages: portfolio.galleryImages,
    isDelete: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const addRes = await db.collection('designer_portfolios').add({ data })
  try {
    await db.collection('designers').doc(designer._id).update({
      data: { portfolioCount: _.inc(1), updatedAt: timestamp }
    })
  } catch (error) {
    console.warn('[designer_portfolios] update portfolioCount failed:', error.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '作品发布成功',
    data: Object.assign({ _id: addRes._id }, data)
  }
}

async function deletePortfolio(openid, portfolioId) {
  if (!portfolioId) return { success: false, code: 'MISSING_PARAM', message: '缺少作品ID' }

  const { designer } = await verifyDesignerAccess(openid)
  let portfolio
  try {
    const res = await db.collection('designer_portfolios').doc(portfolioId).get()
    portfolio = res.data
  } catch (error) {
    return { success: false, code: 'NOT_FOUND', message: '作品不存在' }
  }

  if (!portfolio || portfolio.isDelete === 1) {
    return { success: false, code: 'NOT_FOUND', message: '作品不存在或已删除' }
  }
  if (portfolio.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此作品' }
  }

  const timestamp = now()
  await db.collection('designer_portfolios').doc(portfolioId).update({
    data: { isDelete: 1, updatedAt: timestamp }
  })

  try {
    await db.collection('designers').doc(designer._id).update({
      data: { portfolioCount: _.inc(-1), updatedAt: timestamp }
    })
  } catch (error) {
    console.warn('[designer_portfolios] update portfolioCount failed:', error.message)
  }

  return { success: true, code: 'OK', message: '作品已删除' }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  try {
    switch (event.action) {
      case 'list':
        return await listPortfolios(openid, event)
      case 'add':
        return await addPortfolio(openid, event.portfolio)
      case 'delete':
        return await deletePortfolio(openid, event.portfolioId)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作类型: ${event.action}` }
    }
  } catch (error) {
    console.error('[designer_portfolios] failed:', error)
    if (error.message === 'DESIGNER_NOT_CERTIFIED') {
      return {
        success: false,
        code: 'DESIGNER_NOT_CERTIFIED',
        message: '当前账号尚未通过设计师认证',
        data: { certified: false }
      }
    }
    if (error.message === 'USER_NOT_FOUND') {
      return { success: false, code: 'NOT_FOUND', message: '用户不存在，请先登录' }
    }
    return { success: false, code: 'SERVER_ERROR', message: error.message || '服务器错误' }
  }
}
