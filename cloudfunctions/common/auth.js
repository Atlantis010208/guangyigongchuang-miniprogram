/**
 * 通用认证模块
 * 支持两种认证方式：
 * 1. 小程序端：通过 OPENID（cloud.getWXContext()）
 * 2. Web 后台：通过 Admin Token（event._adminToken）
 */
const cloud = require('wx-server-sdk')

/**
 * 解析 Admin Token
 * @param {string} token Base64 编码的 token
 * @returns {object|null} 解析后的 token 对象
 */
const parseAdminToken = (token) => {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch (e) {
    console.warn('[auth] Admin token 解析失败:', e.message)
    return null
  }
}

/**
 * 验证 Admin Token
 * @param {object} event 云函数事件对象
 * @returns {object} { ok: boolean, openid?: string, userId?: string, code?: string }
 */
const verifyAdminToken = async (event) => {
  const adminToken = event && event._adminToken
  const adminUserId = event && event._adminUserId
  const adminOpenid = event && event._adminOpenid

  if (!adminToken) {
    return { ok: false, code: 'NO_ADMIN_TOKEN' }
  }

  // 解析 token
  const parsed = parseAdminToken(adminToken)
  if (!parsed) {
    return { ok: false, code: 'INVALID_ADMIN_TOKEN' }
  }

  // 检查是否过期
  if (Date.now() >= parsed.exp) {
    return { ok: false, code: 'ADMIN_TOKEN_EXPIRED' }
  }

  // 检查是否是管理员
  if (parsed.roles !== 0) {
    return { ok: false, code: 'NOT_ADMIN' }
  }

  // 验证用户 ID 匹配
  if (adminUserId && parsed.userId !== adminUserId) {
    return { ok: false, code: 'USER_ID_MISMATCH' }
  }

  // 查询用户确认身份
  const db = cloud.database()
  let user = null
  try {
    const userRes = await db.collection('users').doc(parsed.userId).get()
    user = userRes && userRes.data ? userRes.data : null
  } catch (e) {
    console.warn('[auth] 查询用户失败:', e.message)
  }

  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND' }
  }

  if (user.isDelete === 1) {
    return { ok: false, code: 'USER_DISABLED' }
  }

  if (user.roles !== 0) {
    return { ok: false, code: 'NOT_ADMIN' }
  }

  return {
    ok: true,
    openid: user._openid || adminOpenid,
    userId: parsed.userId,
    user
  }
}

/**
 * 根据 OPENID 获取用户
 * 优先使用 Admin Token，其次使用 OPENID
 * @param {object} event 云函数事件对象（可选，用于获取 admin token）
 */
const getUserByOpenId = async (event) => {
  // 首先尝试 Admin Token 验证
  if (event && event._adminToken) {
    const adminResult = await verifyAdminToken(event)
    if (adminResult.ok) {
      return {
        ok: true,
        openid: adminResult.openid,
        user: adminResult.user,
        authType: 'admin_token'
      }
    }
    // Admin Token 验证失败，继续尝试 OPENID
  }

  // 使用 OPENID 验证
  const ctx = cloud.getWXContext()
  const openid = ctx && ctx.OPENID ? ctx.OPENID : ctx && ctx.openid ? ctx.openid : ''
  
  if (!openid) {
    return { ok: false, code: 'MISSING_OPENID' }
  }
  
  const db = cloud.database()
  const col = db.collection('users')
  let q
  try {
    q = await col.where({ _openid: openid }).limit(1).get()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try { await db.createCollection('users') } catch (_) {}
      q = await col.where({ _openid: openid }).limit(1).get()
    } else {
      return { ok: false, code: 'DB_ERROR', error: e }
    }
  }
  const user = q && q.data && q.data.length ? q.data[0] : null
  return { ok: true, openid, user, authType: 'openid' }
}

/**
 * 要求特定角色
 * @param {number|number[]} roles 允许的角色（0=管理员，1=普通用户，2=设计师）
 * @param {object} event 云函数事件对象（可选，用于获取 admin token）
 */
const requireRole = async (roles, event) => {
  const res = await getUserByOpenId(event)
  if (!res.ok) return res
  const user = res.user
  const roleValue = user && typeof user.roles === 'number' ? user.roles : 1
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (allowed.indexOf(roleValue) === -1) return { ok: false, code: 'FORBIDDEN' }
  return { ok: true, openid: res.openid, user, authType: res.authType }
}

/**
 * 要求管理员权限
 * 简化的管理员验证方法
 * @param {object} event 云函数事件对象
 */
const requireAdmin = async (event) => {
  return requireRole(0, event)
}

module.exports = { 
  getUserByOpenId, 
  requireRole, 
  requireAdmin,
  verifyAdminToken,
  parseAdminToken
}
