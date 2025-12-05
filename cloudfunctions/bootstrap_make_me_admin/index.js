const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async () => {
  try {
    const db = cloud.database()
    let hasAdmin = false
    try {
      const r = await db.collection('users').where({ roles: 0 }).limit(1).get()
      hasAdmin = !!(r && r.data && r.data.length)
    } catch (_) {}
    if (hasAdmin) return { success: false, code: 'FORBIDDEN' }
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) return { success: false, code: 'MISSING_OPENID' }
    const col = db.collection('users')
    let u = null
    try {
      const q = await col.where({ _openid: openid }).limit(1).get()
      u = q && q.data && q.data[0] ? q.data[0] : null
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message || '').includes('collection not exists'))) {
        try { await db.createCollection('users') } catch (_) {}
      } else { throw e }
    }
    if (u && u._id) {
      await col.doc(u._id).update({ data: { roles: 0, updatedAt: Date.now() } })
      const d = await col.doc(u._id).get()
      return { success: true, code: 'OK', user: d && d.data ? d.data : { _id: u._id, roles: 0 } }
    } else {
      const addRes = await col.add({ data: { roles: 0, nickname: '', avatarUrl: '', phoneNumber: '', createdAt: Date.now(), updatedAt: Date.now() } })
      const id = addRes && addRes._id ? addRes._id : ''
      if (id) {
        const d = await col.doc(id).get()
        return { success: true, code: 'OK', user: d && d.data ? d.data : { _id: id, roles: 0 } }
      }
      return { success: true, code: 'OK' }
    }
  } catch (err) {
    return { success: false, code: 'BOOTSTRAP_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}

