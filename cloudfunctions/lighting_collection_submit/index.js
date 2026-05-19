const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = (ctx && (ctx.OPENID || ctx.openid)) || ''

    const db = cloud.database()
    const col = db.collection('lighting_collections')

    // 集合不存在时自动创建
    try {
      await col.count()
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message || '').includes('collection not exists') || (e.message || '').includes('not exist'))) {
        try { await db.createCollection('lighting_collections') } catch (_) {}
      } else {
        throw e
      }
    }

    const params = (event && event.params) ? event.params : {}
    const now = Date.now()

    const addRes = await col.add({
      data: {
        params,
        openid,
        userId: (event && event.userId) || openid,
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      }
    })

    return { success: true, code: 'OK', id: addRes._id }
  } catch (err) {
    return {
      success: false,
      code: 'COLLECTION_SUBMIT_FAILED',
      errorMessage: (err && err.message) ? err.message : 'unknown error'
    }
  }
}
