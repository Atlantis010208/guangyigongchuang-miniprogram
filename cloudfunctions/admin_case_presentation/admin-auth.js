'use strict'

const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'

let nodeApp = null
try {
  nodeApp = cloudbase.init({ env: ENV_ID })
} catch (error) {
  console.warn('[admin_case_presentation/auth] Node SDK init failed:', error.message)
}

function getCallerIdentity() {
  const wxContext = cloud.getWXContext()
  if (wxContext && (wxContext.OPENID || wxContext.openid)) {
    return { source: 'miniprogram', openid: wxContext.OPENID || wxContext.openid }
  }

  if (nodeApp) {
    try {
      const userInfo = nodeApp.auth().getUserInfo()
      if (userInfo && (userInfo.customUserId || userInfo.uid)) {
        return {
          source: 'web_custom_login',
          customUserId: userInfo.customUserId || userInfo.uid,
          uid: userInfo.uid || ''
        }
      }
    } catch (error) {
      console.warn('[admin_case_presentation/auth] getUserInfo failed:', error.message)
    }
  }
  return null
}

async function getById(db, collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  } catch (error) {
    return null
  }
}

async function verifyAdmin(caller, db, command) {
  if (!caller) return { ok: false, errorCode: 'MISSING_IDENTITY' }

  if (caller.source === 'miniprogram') {
    const result = await db.collection('users')
      .where({ _openid: caller.openid, isDelete: command.neq(1) })
      .limit(1)
      .get()
    const user = result.data && result.data[0]
    if (!user) return { ok: false, errorCode: 'USER_NOT_FOUND' }
    if (user.roles !== 0) return { ok: false, errorCode: 'FORBIDDEN' }
    return { ok: true, user, userType: 'users', authType: caller.source }
  }

  if (caller.source === 'web_custom_login') {
    const id = caller.customUserId
    const admin = await getById(db, 'admin_accounts', id)
    if (admin && admin.isDelete !== 1) {
      return { ok: true, user: admin, userType: 'admin_accounts', authType: caller.source }
    }
    const designer = await getById(db, 'designers', id)
    if (designer && designer.isDelete !== 1 && designer.hasAccount) {
      return { ok: true, user: designer, userType: 'designers', authType: caller.source }
    }
    const legacy = await getById(db, 'users', id)
    if (legacy && legacy.isDelete !== 1 && legacy.roles === 0) {
      return { ok: true, user: legacy, userType: 'users', authType: caller.source }
    }
    return { ok: false, errorCode: admin || designer || legacy ? 'FORBIDDEN' : 'USER_NOT_FOUND' }
  }

  return { ok: false, errorCode: 'UNKNOWN_SOURCE' }
}

async function requireAdmin(db, command) {
  return verifyAdmin(getCallerIdentity(), db, command)
}

function getErrorMessage(code) {
  const messages = {
    MISSING_IDENTITY: '缺少用户身份信息，请重新登录',
    UNKNOWN_SOURCE: '未知的调用来源',
    USER_NOT_FOUND: '用户不存在',
    FORBIDDEN: '无管理员权限'
  }
  return messages[code] || '认证失败'
}

module.exports = { requireAdmin, verifyAdmin, getCallerIdentity, getErrorMessage, ENV_ID }

