const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ALLOWED_UPDATE_FIELDS = [
  'name',
  'bio',
  'intro',
  'experience',
  'styles',
  'specialties',
  'spaceType',
  'phone',
  'wechat',
  'avatarUrl',
  'avatar',
  'title',
  'profession'
]

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

  ;[
    user.phone,
    user.phoneNumber,
    user.mobile,
    user.purePhoneNumber,
    user.fullPhoneNumber
  ].forEach((value) => {
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

function toArrayText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ')
  return value || ''
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

async function getActiveWhitelistOptional(openid, user) {
  try {
    return await getActiveWhitelist(openid, user)
  } catch (error) {
    if (error.message === 'DESIGNER_NOT_CERTIFIED') return null
    throw error
  }
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
  const idCandidates = unique([
    whitelist && whitelist.designerId,
    whitelist && whitelist.designer_id,
    user.designerId
  ])

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
  whitelist = whitelist || {}
  const timestamp = now()
  const phone = cleanPhone(user.phone || user.phoneNumber || whitelist.phone || '')
  const data = {
    _openid: openid,
    openid,
    userId: user._id || '',
    whitelistId: whitelist._id || '',
    name: whitelist.name || user.nickname || user.name || '设计师',
    title: '专业灯光设计',
    avatar: user.avatarUrl || '',
    bio: '',
    intro: '',
    experience: 0,
    styles: '',
    specialties: [],
    spaceType: [],
    phone,
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

async function linkDesignerIdentity(openid, user, whitelist, designer) {
  whitelist = whitelist || {}
  const timestamp = now()
  const userUpdate = {
    designerId: designer._id,
    identitySelected: true,
    availableRoles: ['owner', 'designer'],
    updatedAt: timestamp
  }
  if (whitelist._id) {
    userUpdate.designerWhitelistId = whitelist._id
    userUpdate.designerCertified = true
  } else {
    userUpdate.designerCertified = user.designerCertified === true
  }
  if (user.roles !== 0) userUpdate.roles = 2

  const tasks = [
    db.collection('users').doc(user._id).update({ data: userUpdate }),
    db.collection('designers').doc(designer._id).update({
      data: {
        _openid: openid,
        openid,
        userId: user._id,
        whitelistId: whitelist._id || designer.whitelistId || '',
        updatedAt: timestamp
      }
    })
  ]
  if (whitelist._id) {
    tasks.push(db.collection('designer_whitelist').doc(whitelist._id).update({
      data: {
        userId: user._id,
        designerId: designer._id,
        activatedOpenid: openid,
        activatedAt: whitelist.activatedAt || timestamp,
        updatedAt: timestamp
      }
    }))
  }
  await Promise.all(tasks)

  Object.assign(user, userUpdate)
  Object.assign(whitelist, {
    userId: user._id,
    designerId: designer._id,
    activatedOpenid: openid,
    activatedAt: whitelist.activatedAt || timestamp
  })
  Object.assign(designer, {
    _openid: openid,
    openid,
    userId: user._id,
    whitelistId: whitelist._id
  })
}

async function withTempUrl(fileId) {
  if (!fileId || !String(fileId).startsWith('cloud://')) return fileId || ''
  try {
    const res = await cloud.getTempFileURL({ fileList: [fileId] })
    const item = res.fileList && res.fileList[0]
    return item && item.tempFileURL || fileId
  } catch (error) {
    console.warn('[designer_profile] getTempFileURL failed:', error.message)
    return fileId
  }
}

function normalizeDesignerProfile(designer, user, whitelist, tempAvatarUrl) {
  whitelist = whitelist || {}
  const specialtyText = toArrayText(designer.specialties) || toArrayText(designer.spaceType)
  const profession = designer.profession || designer.title || specialtyText || '专业灯光设计'
  const intro = designer.intro || designer.bio || designer.description || '专注住宅与商业空间灯光设计'

  return Object.assign({}, designer, {
    certified: user.designerCertified === true || Boolean(whitelist._id),
    certificationStatus: (user.designerCertified === true || whitelist._id) ? 'active' : 'pending',
    whitelistId: whitelist._id || designer.whitelistId || '',
    name: designer.name || whitelist.name || user.nickname || '设计师',
    nickname: designer.name || whitelist.name || user.nickname || '设计师',
    profession,
    specialty: designer.specialty || specialtyText || profession,
    intro,
    bio: designer.bio || intro,
    avatarUrl: tempAvatarUrl,
    tempAvatarUrl,
    modeLabel: '设计师模式',
    stats: {
      projects: Number(designer.projects) || 0,
      rating: Number(designer.rating) || 5,
      experience: Number(designer.experience) || 0,
      portfolioCount: Number(designer.portfolioCount) || 0
    }
  })
}

async function verifyDesignerAccess(openid) {
  const user = await getUser(openid)
  if (user.roles !== 2 && user.roles !== 0) throw new Error('NOT_DESIGNER')
  const whitelist = await getActiveWhitelistOptional(openid, user)
  let designer = await findDesigner(openid, user, whitelist)
  if (!designer) {
    designer = await initDesignerProfile(openid, user, whitelist)
  }
  await linkDesignerIdentity(openid, user, whitelist, designer)
  return { user, whitelist, designer }
}

async function getSharedAccount(openid) {
  try {
    const user = await getUser(openid)
    const avatar = user.avatarUrl || user.avatar || ''
    const tempAvatarUrl = await withTempUrl(avatar)
    const phoneNumber = user.phoneNumber || user.purePhoneNumber || ''
    return {
      authenticated: true,
      profileComplete: Boolean(user.nickname && avatar && phoneNumber),
      nickname: user.nickname || user.name || '',
      avatarUrl: avatar,
      tempAvatarUrl,
      phoneNumber,
      designerCertified: user.designerCertified === true,
      designerId: user.designerId || ''
    }
  } catch (error) {
    return null
  }
}

function validateUpdateData(data) {
  if (data.name !== undefined) {
    const text = String(data.name || '').trim()
    if (text.length < 1 || text.length > 20) {
      return { valid: false, message: '姓名长度需在 1-20 字之间' }
    }
  }
  if (data.bio !== undefined && String(data.bio || '').length > 200) {
    return { valid: false, message: '简介不能超过 200 字' }
  }
  if (data.intro !== undefined && String(data.intro || '').length > 200) {
    return { valid: false, message: '简介不能超过 200 字' }
  }
  if (data.experience !== undefined) {
    const exp = Number(data.experience)
    if (!Number.isInteger(exp) || exp < 0 || exp > 99) {
      return { valid: false, message: '从业年限需为 0-99 之间的整数' }
    }
  }
  const avatarValue = data.avatarUrl !== undefined ? data.avatarUrl : data.avatar
  if (avatarValue !== undefined) {
    const text = String(avatarValue || '')
    if (text && !text.startsWith('cloud://') && !text.startsWith('https://')) {
      return { valid: false, message: '头像地址格式不正确' }
    }
  }
  return { valid: true }
}

async function getDesignerProfile(openid) {
  const { user, whitelist, designer } = await verifyDesignerAccess(openid)
  const avatar = designer.avatar || designer.avatarUrl || user.avatarUrl || ''
  const tempAvatarUrl = await withTempUrl(avatar)
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: normalizeDesignerProfile(designer, user, whitelist, tempAvatarUrl)
  }
}

async function updateDesignerProfile(openid, updateData) {
  if (!updateData || typeof updateData !== 'object') {
    return { success: false, code: 'MISSING_PARAM', message: '缺少更新数据' }
  }

  const { user, designer } = await verifyDesignerAccess(openid)
  const filteredData = {}
  ALLOWED_UPDATE_FIELDS.forEach((field) => {
    if (updateData[field] !== undefined) filteredData[field] = updateData[field]
  })

  if (Object.keys(filteredData).length === 0) {
    return { success: false, code: 'NO_VALID_FIELDS', message: '没有可更新的有效字段' }
  }

  const validation = validateUpdateData(filteredData)
  if (!validation.valid) {
    return { success: false, code: 'VALIDATION_ERROR', message: validation.message }
  }

  if (filteredData.avatarUrl !== undefined) {
    filteredData.avatar = filteredData.avatarUrl
    delete filteredData.avatarUrl
  }
  if (filteredData.profession !== undefined) {
    filteredData.title = filteredData.profession
    delete filteredData.profession
  }
  filteredData.updatedAt = now()

  await db.collection('designers').doc(designer._id).update({ data: filteredData })

  const syncData = {}
  if (filteredData.name) syncData.nickname = filteredData.name
  if (filteredData.avatar) syncData.avatarUrl = filteredData.avatar
  if (Object.keys(syncData).length > 0 && user._id) {
    syncData.updatedAt = now()
    try {
      await db.collection('users').doc(user._id).update({ data: syncData })
    } catch (error) {
      console.warn('[designer_profile] sync users failed:', error.message)
    }
  }

  return { success: true, code: 'OK', message: '更新成功' }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  try {
    switch (event.action) {
      case 'get':
        return await getDesignerProfile(openid)
      case 'update':
        return await updateDesignerProfile(openid, event.updateData)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作类型: ${event.action}` }
    }
  } catch (error) {
    console.error('[designer_profile] failed:', error)
    if (error.message === 'NOT_DESIGNER') {
      const account = await getSharedAccount(openid)
      return {
        success: false,
        code: 'NOT_DESIGNER',
        message: '请先选择设计师身份',
        data: {
          certified: false,
          authenticated: Boolean(account),
          account
        }
      }
    }
    if (error.message === 'DESIGNER_NOT_CERTIFIED') {
      const account = await getSharedAccount(openid)
      return {
        success: false,
        code: 'DESIGNER_NOT_CERTIFIED',
        message: '当前账号尚未通过设计师认证',
        data: {
          certified: false,
          authenticated: Boolean(account),
          account
        }
      }
    }
    if (error.message === 'USER_NOT_FOUND') {
      return {
        success: false,
        code: 'NOT_FOUND',
        message: '用户不存在，请先登录',
        data: { certified: false, authenticated: false, account: null }
      }
    }
    return { success: false, code: 'SERVER_ERROR', message: error.message || '服务器错误' }
  }
}
