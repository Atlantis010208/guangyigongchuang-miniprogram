'use strict'

function decodeAdminToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null
  try {
    const value = JSON.parse(Buffer.from(rawToken, 'base64').toString('utf8'))
    if (!value || Number(value.exp) <= Date.now() || Number(value.roles) !== 0 || !value.userId) return null
    return value
  } catch (_) {
    return null
  }
}

async function requireAdmin(event, cloud, db, _) {
  const token = decodeAdminToken(event && event._adminToken)
  if (token) return { ok: true, userId: token.userId, source: 'admin_token' }
  const context = cloud.getWXContext()
  const openid = context.OPENID || context.openid
  if (!openid) return { ok: false, code: 'FORBIDDEN', message: '无管理员权限' }
  const result = await db.collection('users')
    .where(_.and([_.or([{ _openid: openid }, { openid }]), { roles: 0 }, { isDelete: _.neq(1) }]))
    .limit(1)
    .get()
  const user = result.data && result.data[0]
  return user
    ? { ok: true, userId: user._id, source: 'miniprogram' }
    : { ok: false, code: 'FORBIDDEN', message: '无管理员权限' }
}

module.exports = { decodeAdminToken, requireAdmin }
