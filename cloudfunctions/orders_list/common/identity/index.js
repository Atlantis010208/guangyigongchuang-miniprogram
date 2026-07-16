const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

let nodeAuth = null

function getNodeAuth() {
  if (nodeAuth) return nodeAuth

  try {
    const tcb = require('@cloudbase/node-sdk')
    const app = tcb.init({ env: process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7' })
    nodeAuth = app.auth()
    return nodeAuth
  } catch (error) {
    console.warn('[identity] node auth unavailable:', error && error.message ? error.message : error)
    return null
  }
}

function readWxContext() {
  try {
    const context = cloud.getWXContext()
    return context || {}
  } catch (error) {
    console.warn('[identity] getWXContext failed:', error && error.message ? error.message : error)
    return {}
  }
}

function readNodeUserInfo() {
  const auth = getNodeAuth()
  if (!auth || typeof auth.getUserInfo !== 'function') return {}

  try {
    return auth.getUserInfo() || {}
  } catch (error) {
    console.warn('[identity] getUserInfo failed:', error && error.message ? error.message : error)
    return {}
  }
}

function normalizeUserId(user) {
  if (!user) return ''
  return user._id || user.userId || user.openid || user._openid || user.webUid || ''
}

async function findUserByOpenid(openid) {
  if (!openid) return null

  const whereRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (whereRes.data && whereRes.data[0]) return whereRes.data[0]

  const openidRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  if (openidRes.data && openidRes.data[0]) return openidRes.data[0]

  try {
    const docRes = await db.collection('users').doc(openid).get()
    return docRes && docRes.data ? docRes.data : null
  } catch (_) {
    return null
  }
}

async function findUserByWebUid(webUid) {
  if (!webUid) return null

  const docRes = await db.collection('users')
    .where({
      webCustomUserId: webUid,
    })
    .limit(2)
    .get()

  if (docRes.data && docRes.data.length > 1) {
    return { conflict: true }
  }

  if (docRes.data && docRes.data[0]) return docRes.data[0]

  const res = await db.collection('users')
    .where({ webUid })
    .limit(2)
    .get()

  if (res.data && res.data.length > 1) {
    return { conflict: true }
  }

  if (res.data && res.data[0]) return res.data[0]

  try {
    const byDocId = await db.collection('users').doc(webUid).get()
    return byDocId && byDocId.data ? byDocId.data : null
  } catch (_) {
    return null
  }
}

function disabled(user) {
  return user && (user.isDelete === 1 || user.disabled === true || user.status === 'disabled')
}

function success(identity) {
  return { ok: true, identity }
}

function failure(code, errorMessage, error) {
  return {
    ok: false,
    code,
    errorMessage,
    error,
  }
}

async function resolveIdentity() {
  try {
    const wxContext = readWxContext()
    const openid = wxContext.OPENID || wxContext.openid || wxContext.openId || ''

    if (openid) {
      const user = await findUserByOpenid(openid)
      if (disabled(user)) return failure('USER_DISABLED', 'User disabled')

      return success({
        platform: 'wechat_miniprogram',
        openid,
        webUid: user && user.webUid ? user.webUid : undefined,
        userId: normalizeUserId(user) || openid,
        user: user || undefined,
      })
    }

    const userInfo = readNodeUserInfo()
    const webUid = userInfo.customUserId || userInfo.uid || ''

    if (webUid) {
      const user = await findUserByWebUid(webUid)
      if (user && user.conflict) return failure('IDENTITY_CONFLICT', 'Multiple users mapped to the same webUid')
      if (disabled(user)) return failure('USER_DISABLED', 'User disabled')

      return success({
        platform: 'web',
        openid: user && (user._openid || user.openid) ? user._openid || user.openid : undefined,
        webUid,
        userId: normalizeUserId(user) || webUid,
        user: user || undefined,
      })
    }

    return failure('UNAUTHENTICATED', 'Unauthenticated')
  } catch (error) {
    return failure('DB_ERROR', error && error.message ? error.message : 'Database error', error)
  }
}

module.exports = {
  resolveIdentity,
  findUserByOpenid,
  findUserByWebUid,
}
