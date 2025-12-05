const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) ? (ctx.OPENID || ctx.openid) : ''
    if (!openid) return { success: false, errorMessage: 'missing openid' }
    const form = (event && event.form) || {}
    const designerId = (event && event.designerId) || ''
    const designerName = (event && event.designerName) || ''
    const db = cloud.database()
    const usersCol = db.collection('users')
    const apptCol = db.collection('appointments')
    let userId = ''
    try {
      const q = await usersCol.where({ _openid: openid }).limit(1).get()
      const u = q && q.data && q.data[0] ? q.data[0] : null
      userId = u && u._id ? u._id : ''
    } catch (_) {}
    const doc = {
      userId,
      designerId,
      designerName,
      spaceType: form.spaceType || '',
      area: form.area || '',
      budget: form.budget || '',
      contactType: form.contactType || '',
      contact: form.contact || '',
      remark: form.remark || '',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const addRes = await apptCol.add({ data: doc })
    const _id = addRes && addRes._id ? addRes._id : ''
    let saved = doc
    if (_id) {
      const r = await apptCol.doc(_id).get()
      saved = r && r.data ? r.data : Object.assign({ _id }, doc)
    }
    return { success: true, appointment: saved }
  } catch (e) {
    return { success: false, errorMessage: e && e.message ? e.message : 'unknown error' }
  }
}
