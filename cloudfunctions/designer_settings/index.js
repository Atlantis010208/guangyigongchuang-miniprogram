/**
 * 设计师设置管理云函数
 * 支持操作：
 *   get_notifications     获取通知设置
 *   update_notifications  更新通知设置
 *   get_privacy           获取隐私设置
 *   update_privacy        更新隐私设置
 *   get_security_info     获取账号安全信息（只读）
 *   logout                退出登录（使会话立即失效）
 *
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型
 * @param {object} [event.settings] - 设置对象（update_* 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 通知设置默认值
const DEFAULT_NOTIFICATIONS = {
  notifyNewDemand: true,
  notifyOrderProgress: true,
  notifySystem: false,
  dndMode: false
}

// 允许更新的通知字段（全部为布尔值）
const ALLOWED_NOTIFICATION_FIELDS = ['notifyNewDemand', 'notifyOrderProgress', 'notifySystem', 'dndMode']

// 隐私设置默认值
const DEFAULT_PRIVACY = {
  publicPortfolio: true,
  allowConsult: true,
  showRating: false
}

// 允许更新的隐私字段（全部为布尔值）
const ALLOWED_PRIVACY_FIELDS = ['publicPortfolio', 'allowConsult', 'showRating']

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  const { action } = event

  try {
    switch (action) {
      case 'get_notifications':
        return await getNotifications(openid)
      case 'update_notifications':
        return await updateNotifications(openid, event.settings)
      case 'get_privacy':
        return await getPrivacy(openid)
      case 'update_privacy':
        return await updatePrivacy(openid, event.settings)
      case 'get_security_info':
        return await getSecurityInfo(openid)
      case 'logout':
        return await logout(openid)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作类型: ${action}` }
    }
  } catch (err) {
    console.error('[designer_settings] 操作失败:', err)
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
 * 验证用户为设计师，返回 user 文档
 */
async function verifyDesigner(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!res.data || res.data.length === 0) throw new Error('USER_NOT_FOUND')
  const user = res.data[0]
  if (user.roles !== 2 && user.roles !== 0) throw new Error('NOT_DESIGNER')
  return user
}

/**
 * 验证用户存在（不校验角色，供 logout 使用）
 */
async function verifyUser(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!res.data || res.data.length === 0) throw new Error('USER_NOT_FOUND')
  return res.data[0]
}

/**
 * 获取通知设置
 */
async function getNotifications(openid) {
  const user = await verifyDesigner(openid)

  // 合并默认值与已存储的设置
  const stored = (user.notificationSettings && typeof user.notificationSettings === 'object')
    ? user.notificationSettings
    : {}

  const settings = { ...DEFAULT_NOTIFICATIONS, ...stored }

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: settings
  }
}

/**
 * 获取隐私设置
 */
async function getPrivacy(openid) {
  const user = await verifyDesigner(openid)
  const stored = (user.privacySettings && typeof user.privacySettings === 'object')
    ? user.privacySettings
    : {}
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: { ...DEFAULT_PRIVACY, ...stored }
  }
}

/**
 * 更新隐私设置
 */
async function updatePrivacy(openid, settings) {
  if (!settings || typeof settings !== 'object') {
    return { success: false, code: 'MISSING_PARAM', message: '缺少设置数据' }
  }

  await verifyDesigner(openid)

  const updateData = {}
  let hasValidField = false

  ALLOWED_PRIVACY_FIELDS.forEach(field => {
    if (settings[field] !== undefined) {
      if (typeof settings[field] !== 'boolean') {
        throw new Error(`字段 ${field} 必须为布尔值`)
      }
      updateData[`privacySettings.${field}`] = settings[field]
      hasValidField = true
    }
  })

  if (!hasValidField) {
    return { success: false, code: 'NO_VALID_FIELDS', message: '没有可更新的有效字段' }
  }

  updateData['updatedAt'] = Date.now()
  await db.collection('users').where({ _openid: openid }).update({ data: updateData })

  return { success: true, code: 'OK', message: '设置已保存' }
}

/**
 * 获取账号安全信息（手机号脱敏、微信绑定、实名认证）
 */
async function getSecurityInfo(openid) {
  const user = await verifyDesigner(openid)

  // 手机号脱敏：保留前3位和后4位
  const phone = user.purePhoneNumber || user.phoneNumber || ''
  const maskedPhone = phone.length >= 7
    ? phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
    : '未绑定'

  // 微信绑定状态
  const wechatBound = user._openid ? '已绑定' : '未绑定'

  // 查询实名认证状态
  let realNameVerified = '未认证'
  try {
    const designerRes = await db.collection('designers')
      .where({ _openid: openid })
      .limit(1)
      .get()
    if (designerRes.data && designerRes.data.length > 0 && designerRes.data[0].realNameVerified === true) {
      realNameVerified = '已认证'
    }
  } catch (e) {
    // 查询失败不影响主流程，保持默认「未认证」
  }

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: { maskedPhone, wechatBound, realNameVerified }
  }
}

/**
 * 退出登录：将 loginExpireAt 设为当前时间，使旧 token 立即失效
 */
async function logout(openid) {
  await verifyUser(openid)
  await db.collection('users').where({ _openid: openid }).update({
    data: { loginExpireAt: Date.now() }
  })
  return { success: true, code: 'OK', message: '退出成功' }
}

/**
 * 更新通知设置
 */
async function updateNotifications(openid, settings) {
  if (!settings || typeof settings !== 'object') {
    return { success: false, code: 'MISSING_PARAM', message: '缺少设置数据' }
  }

  await verifyDesigner(openid)

  // 只允许更新白名单内的布尔字段
  const updateData = {}
  let hasValidField = false

  ALLOWED_NOTIFICATION_FIELDS.forEach(field => {
    if (settings[field] !== undefined) {
      if (typeof settings[field] !== 'boolean') {
        throw new Error(`字段 ${field} 必须为布尔值`)
      }
      updateData[`notificationSettings.${field}`] = settings[field]
      hasValidField = true
    }
  })

  if (!hasValidField) {
    return { success: false, code: 'NO_VALID_FIELDS', message: '没有可更新的有效字段' }
  }

  updateData['updatedAt'] = Date.now()

  await db.collection('users').where({ _openid: openid }).update({ data: updateData })

  return {
    success: true,
    code: 'OK',
    message: '设置已保存'
  }
}
