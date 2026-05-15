/**
 * 管理员身份验证模块
 * 支持两种认证方式：
 * 1. 微信小程序端：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 的 getUserInfo() 获取 customUserId
 */

const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')

// 环境 ID
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'

// 初始化 Node SDK（用于获取 Web 端自定义登录的身份）
let nodeApp = null
try {
  nodeApp = cloudbase.init({ env: ENV_ID })
} catch (e) {
  console.warn('[admin_auth] 初始化 Node SDK 失败:', e.message)
}

/**
 * 获取调用者身份信息
 * 同时支持微信小程序和 Web 端自定义登录
 */
function getCallerIdentity() {
  // 方式1：微信小程序调用 - 通过 wx-server-sdk 获取 OPENID
  const wxCtx = cloud.getWXContext()
  if (wxCtx && (wxCtx.OPENID || wxCtx.openid)) {
    return {
      source: 'miniprogram',
      openid: wxCtx.OPENID || wxCtx.openid,
      userId: null,
      customUserId: null
    }
  }

  // 方式2：Web 端自定义登录 - 通过 @cloudbase/node-sdk 获取 customUserId
  if (nodeApp) {
    try {
      const nodeAuth = nodeApp.auth()
      const userInfo = nodeAuth.getUserInfo()

      if (userInfo && (userInfo.uid || userInfo.customUserId)) {
        return {
          source: 'web_custom_login',
          openid: null,
          uid: userInfo.uid,
          customUserId: userInfo.customUserId
        }
      }
    } catch (e) {
      console.log('[admin_auth] Node SDK getUserInfo:', e.message)
    }
  }

  return null
}

/**
 * 验证管理员权限
 */
async function verifyAdmin(caller, db, _) {
  if (!caller) {
    return { ok: false, errorCode: 'MISSING_IDENTITY', errorMessage: '缺少用户身份信息' }
  }

  let user = null
  let userType = null

  if (caller.source === 'miniprogram') {
    const userRes = await db.collection('users')
      .where({ _openid: caller.openid, isDelete: _.neq(1) })
      .limit(1)
      .get()

    if (userRes.data && userRes.data.length > 0) {
      user = userRes.data[0]
      userType = 'users'
    }
  } else if (caller.source === 'web_custom_login') {
    // 1. 先查询 admin_accounts 集合
    try {
      const adminRes = await db.collection('admin_accounts').doc(caller.customUserId).get()
      if (adminRes.data) {
        user = adminRes.data
        userType = 'admin_accounts'
      }
    } catch (e) {
      console.log('[admin_auth] admin_accounts 查询:', e.message)
    }

    // 2. 如果未找到，查询 designers 集合
    if (!user) {
      try {
        const designerRes = await db.collection('designers').doc(caller.customUserId).get()
        if (designerRes.data) {
          user = designerRes.data
          userType = 'designers'
        }
      } catch (e) {
        console.log('[admin_auth] designers 查询:', e.message)
      }
    }

    // 3. 如果仍未找到，查询 users 集合（兼容旧管理员）
    if (!user) {
      try {
        const userRes = await db.collection('users').doc(caller.customUserId).get()
        if (userRes.data) {
          user = userRes.data
          userType = 'users'
        }
      } catch (e) {
        console.log('[admin_auth] users 查询:', e.message)
      }
    }
  } else {
    return { ok: false, errorCode: 'UNKNOWN_SOURCE', errorMessage: '未知的调用来源' }
  }

  if (!user) {
    return { ok: false, errorCode: 'USER_NOT_FOUND', errorMessage: '用户不存在' }
  }

  if (user.isDelete === 1) {
    return { ok: false, errorCode: 'USER_DISABLED', errorMessage: '账号已被禁用' }
  }

  if (userType === 'admin_accounts') {
    // 管理员账号，直接通过
  } else if (userType === 'designers') {
    if (!user.hasAccount) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无后台登录权限' }
    }
    // 设计师默认无管理员权限（仅 requireBackendAuth 允许设计师）
    return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '设计师无会员管理权限' }
  } else if (userType === 'users') {
    if (user.roles !== 0) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无管理员权限' }
    }
  }

  return { ok: true, user, userType, authType: caller.source }
}

async function requireAdmin(db, _) {
  const caller = getCallerIdentity()
  return await verifyAdmin(caller, db, _)
}

function getErrorMessage(code) {
  const errorMessages = {
    'MISSING_IDENTITY': '缺少用户身份信息，请重新登录',
    'MISSING_OPENID': '缺少用户身份信息，请重新登录',
    'UNKNOWN_SOURCE': '未知的调用来源',
    'USER_NOT_FOUND': '用户不存在',
    'USER_DISABLED': '账号已被禁用',
    'FORBIDDEN': '无管理员权限',
    'NOT_ADMIN': '无管理员权限',
    'AUTH_FAILED': '认证失败'
  }
  return errorMessages[code] || '认证失败'
}

module.exports = {
  getCallerIdentity,
  verifyAdmin,
  requireAdmin,
  getErrorMessage,
  ENV_ID
}
