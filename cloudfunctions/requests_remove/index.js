const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) return { success: false, code: 'MISSING_OPENID', errorMessage: 'missing openid' }

    const id = String((event && event.id) || '')
    const orderNo = String((event && event.orderNo) || '')
    if (!id && !orderNo) return { success: false, code: 'MISSING_ID_OR_ORDER_NO', errorMessage: 'missing id or orderNo' }

    const db = cloud.database()
    const col = db.collection('requests')
    let res
    if (id) {
      res = await col.doc(id).update({ data: { isDelete: 1, updatedAt: Date.now() } })
    } else {
      res = await col.where({ orderNo }).update({ data: { isDelete: 1, updatedAt: Date.now() } })
    }
    return { success: true, code: 'OK', data: { updated: res && res.stats ? res.stats.updated : 0 } }
  } catch (err) {
    return { success: false, code: 'REQUESTS_REMOVE_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}

