/**
 * 设计师档案管理云函数
 * 支持操作：get（获取档案）、update（更新档案）
 *
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：get / update
 * @param {object} [event.updateData] - 更新数据（update 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 允许更新的字段白名单
const ALLOWED_UPDATE_FIELDS = ['name', 'bio', 'experience', 'styles', 'phone', 'wechat', 'avatarUrl']

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
      case 'get':
        return await getDesignerProfile(openid)
      case 'update':
        return await updateDesignerProfile(openid, event.updateData)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('[designer_profile] 操作失败:', err)
    if (err.message === 'NOT_DESIGNER') {
      return { success: false, code: 'NOT_DESIGNER', message: '当前账号不是设计师身份，请先完成身份认证' }
    }
    if (err.message === 'USER_NOT_FOUND') {
      return { success: false, code: 'NOT_FOUND', message: '用户不存在，请先登录' }
    }
    return { success: false, code: 'SERVER_ERROR', message: err.message || '服务器错误' }
  }
}

/**
 * 验证用户是否为设计师，返回 user 文档
 */
async function verifyDesigner(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!res.data || res.data.length === 0) {
    throw new Error('USER_NOT_FOUND')
  }
  const user = res.data[0]
  // roles 0=管理员 2=设计师，均可通过验证
  if (user.roles !== 2 && user.roles !== 0) {
    throw new Error('NOT_DESIGNER')
  }
  return user
}

/**
 * 从 users 集合初始化一条基础设计师档案并插入 designers 集合
 */
async function initDesignerProfile(openid, user) {
  const newDesigner = {
    _openid: openid,
    openid: openid,
    userId: user._id,
    name: user.nickname || user.name || '设计师',
    avatar: user.avatarUrl || '',
    bio: '',
    experience: 0,
    styles: '',
    phone: user.phone || '',
    wechat: '',
    rating: 5.0,
    projects: 0,
    portfolioCount: 0,
    isDelete: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  const addRes = await db.collection('designers').add({ data: newDesigner })
  newDesigner._id = addRes._id
  return newDesigner
}

/**
 * 获取设计师档案
 */
async function getDesignerProfile(openid) {
  const user = await verifyDesigner(openid)

  const designerRes = await db.collection('designers')
    .where(_.or([
      { _openid: openid },
      { openid: openid }
    ]))
    .limit(1)
    .get()

  let designer
  if (designerRes.data && designerRes.data.length > 0) {
    designer = designerRes.data[0]
  } else {
    designer = await initDesignerProfile(openid, user)
  }

  // 处理头像临时链接
  if (designer.avatar && designer.avatar.startsWith('cloud://')) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: [designer.avatar] })
      if (tempRes.fileList && tempRes.fileList[0].tempFileURL) {
        designer.tempAvatarUrl = tempRes.fileList[0].tempFileURL
      } else {
        designer.tempAvatarUrl = designer.avatar
      }
    } catch (err) {
      console.warn('[designer_profile] 头像临时链接获取失败:', err.message)
      designer.tempAvatarUrl = designer.avatar
    }
  } else {
    designer.tempAvatarUrl = designer.avatar || ''
  }

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: designer
  }
}

/**
 * 校验更新字段
 */
function validateUpdateData(data) {
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length < 1 || data.name.trim().length > 20) {
      return { valid: false, message: '姓名长度须在 1-20 字之间' }
    }
  }
  if (data.bio !== undefined) {
    if (typeof data.bio !== 'string' || data.bio.length > 200) {
      return { valid: false, message: '简介不能超过 200 字' }
    }
  }
  if (data.experience !== undefined) {
    const exp = Number(data.experience)
    if (!Number.isInteger(exp) || exp < 0 || exp > 99) {
      return { valid: false, message: '从业年限须为 0-99 之间的整数' }
    }
  }
  if (data.avatarUrl !== undefined) {
    if (typeof data.avatarUrl !== 'string' ||
        (!data.avatarUrl.startsWith('cloud://') && !data.avatarUrl.startsWith('https://'))) {
      return { valid: false, message: '头像地址格式不正确' }
    }
  }
  return { valid: true }
}

/**
 * 更新设计师档案
 */
async function updateDesignerProfile(openid, updateData) {
  if (!updateData || typeof updateData !== 'object') {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少更新数据'
    }
  }

  const user = await verifyDesigner(openid)

  // 白名单过滤
  const filteredData = {}
  ALLOWED_UPDATE_FIELDS.forEach(field => {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field]
    }
  })

  if (Object.keys(filteredData).length === 0) {
    return {
      success: false,
      code: 'NO_VALID_FIELDS',
      message: '没有可更新的有效字段'
    }
  }

  // 字段校验
  const validation = validateUpdateData(filteredData)
  if (!validation.valid) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      message: validation.message
    }
  }

  // avatarUrl → avatar 字段映射（designers 集合使用 avatar 字段名）
  if (filteredData.avatarUrl !== undefined) {
    filteredData.avatar = filteredData.avatarUrl
    delete filteredData.avatarUrl
  }

  filteredData.updatedAt = Date.now()

  // 查找设计师档案
  const designerRes = await db.collection('designers')
    .where(_.or([
      { _openid: openid },
      { openid: openid }
    ]))
    .limit(1)
    .get()

  if (designerRes.data && designerRes.data.length > 0) {
    await db.collection('designers').doc(designerRes.data[0]._id).update({ data: filteredData })
  } else {
    const newDesigner = await initDesignerProfile(openid, user)
    await db.collection('designers').doc(newDesigner._id).update({ data: filteredData })
  }

  // 同步更新 users 集合基础信息
  const syncData = {}
  if (filteredData.name) syncData.nickname = filteredData.name
  if (filteredData.avatar) syncData.avatarUrl = filteredData.avatar
  if (Object.keys(syncData).length > 0) {
    syncData.updatedAt = Date.now()
    try {
      await db.collection('users').where({ _openid: openid }).update({ data: syncData })
    } catch (err) {
      console.warn('[designer_profile] 同步 users 失败:', err.message)
    }
  }

  return {
    success: true,
    code: 'OK',
    message: '更新成功'
  }
}
