const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) return { success: false, code: 'MISSING_OPENID', errorMessage: 'missing openid' }

    const order = event && event.order ? event.order : {}
    const now = Date.now()
    const orderNo = String(order.orderNo || `O${now}`)
    const doc = {
      ...order,
      orderNo,
      userId: openid,  // 强制使用 openid，确保与支付验证时的查询条件一致
      _openid: openid, // 添加 _openid 字段，确保查询时能匹配到
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
    const db = cloud.database()
    const col = db.collection('orders')
    try { await col.count() } catch (e) { if (e && (e.errCode === -502005 || (e.message || '').includes('collection not exists'))) { try { await db.createCollection('orders') } catch (_) {} } else { throw e } }
    const addRes = await col.add({ data: doc })
    const id = addRes && addRes._id ? addRes._id : ''
    const saved = id ? (await col.doc(id).get()).data : doc
    return { success: true, code: 'OK', data: saved }
  } catch (err) {
    return { success: false, code: 'ORDERS_CREATE_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}

