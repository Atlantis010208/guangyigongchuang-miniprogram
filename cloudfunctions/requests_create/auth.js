const cloud = require('wx-server-sdk')

const getUserByOpenId = async () => {
  const ctx = cloud.getWXContext()
  const openid = ctx && ctx.OPENID ? ctx.OPENID : ctx && ctx.openid ? ctx.openid : ''
  if (!openid) return { ok: false, code: 'MISSING_OPENID' }
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
  return { ok: true, openid, user }
}

const requireRole = async (roles) => {
  const res = await getUserByOpenId()
  if (!res.ok) return res
  const user = res.user
  const roleValue = user && typeof user.roles === 'number' ? user.roles : 1
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (allowed.indexOf(roleValue) === -1) return { ok: false, code: 'FORBIDDEN' }
  return { ok: true, openid: res.openid, user }
}

module.exports = { getUserByOpenId, requireRole }
