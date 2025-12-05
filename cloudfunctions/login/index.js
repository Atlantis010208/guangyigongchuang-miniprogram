const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && ctx.OPENID ? ctx.OPENID : ctx && ctx.openid ? ctx.openid : ''
    if (!openid) {
      return { success: false, code: 'MISSING_OPENID', errorMessage: 'missing openid' }
    }

    const profile = event && event.profile ? event.profile : {}
    const nickname = profile.nickName || profile.nickname || ''
    const avatarUrl = profile.avatarUrl || ''

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
        throw e
      }
    }

    let user
    if (q && q.data && q.data.length) {
      user = q.data[0]
      const needUpdate = (nickname && !user.nickname) || (avatarUrl && !user.avatarUrl)
      if (needUpdate) {
        await col.doc(user._id).update({ data: { nickname, avatarUrl, updatedAt: Date.now() } })
        const refreshed = await col.doc(user._id).get()
        user = refreshed && refreshed.data ? refreshed.data : user
      }
      if (!('roles' in user)) {
        await col.doc(user._id).update({ data: { roles: 1, updatedAt: Date.now() } })
        const refreshed2 = await col.doc(user._id).get()
        user = refreshed2 && refreshed2.data ? refreshed2.data : user
      }
    } else {
      const addRes = await col.add({ data: {
        nickname,
        avatarUrl,
        phoneNumber: '',
        roles: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      } })
      const docId = addRes && addRes._id ? addRes._id : ''
      if (docId) {
        const d = await col.doc(docId).get()
        user = d && d.data ? d.data : { _id: docId, nickname, avatarUrl, phoneNumber: '' }
      } else {
        user = { nickname, avatarUrl, phoneNumber: '' }
      }
    }

    return { success: true, code: 'OK', openid, user }
  } catch (err) {
    return { success: false, code: 'LOGIN_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}
