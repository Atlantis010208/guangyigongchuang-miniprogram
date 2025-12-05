const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const { requireRole } = require('./auth')

exports.main = async (event) => {
  try {
    const guard = await requireRole([0,1,2])
    if (!guard.ok) return { success: false, code: 'FORBIDDEN' }
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) return { success: false, code: 'MISSING_OPENID', errorMessage: 'missing openid' }

    const req = event && event.request ? event.request : {}
    const now = Date.now()
    const orderNo = String(req.orderNo || `R${now}`)
    const doc = {
      ...req,
      orderNo,
      userId: req.userId || openid,
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
    const db = cloud.database()
    const col = db.collection('requests')
    try { await col.count() } catch (e) { if (e && (e.errCode === -502005 || (e.message || '').includes('collection not exists'))) { try { await db.createCollection('requests') } catch (_) {} } else { throw e } }
    const addRes = await col.add({ data: doc })
    const id = addRes && addRes._id ? addRes._id : ''
    const saved = id ? (await col.doc(id).get()).data : doc
    return { success: true, code: 'OK', data: saved }
  } catch (err) {
    return { success: false, code: 'REQUESTS_CREATE_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}

