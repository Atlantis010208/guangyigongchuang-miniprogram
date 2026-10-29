/**
 * 管理员身份验证模块
 * 支持两种认证方式：
 * 1. 微信小程序端：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 的 getUserInfo() 获取 customUserId
 * 
 * 使用方法：
 * 1. 将此文件复制到云函数目录
 * 2. 在 package.json 中添加 "@cloudbase/node-sdk": "^3.0.0" 依赖
 * 3. 在 index.js 中引入并调用 requireAdmin(event)
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
 * 
 * @returns {object|null} { source, openid, uid, customUserId }
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
      
      // customUserId 是创建 ticket 时传入的值（用户的 _id）
      if (userInfo && (userInfo.uid || userInfo.customUserId)) {
        return {
          source: 'web_custom_login',
          openid: null,
          uid: userInfo.uid,
          customUserId: userInfo.customUserId  // 这是用户的 _id
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
 * 
 * @param {object} caller - getCallerIdentity() 的返回值
 * @param {object} db - 数据库实例
 * @param {object} _ - db.command
 * @returns {object} { ok, user, errorCode, errorMessage }
 */
async function verifyAdmin(caller, db, _) {
  if (!caller) {
    return { ok: false, errorCode: 'MISSING_IDENTITY', errorMessage: '缺少用户身份信息' }
  }
  
  let user = null
  let userType = null
  
  if (caller.source === 'miniprogram') {
    // 小程序：通过 openid 查询用户
    const userRes = await db.collection('users')
      .where({ _openid: caller.openid, isDelete: _.neq(1) })
      .limit(1)
      .get()
    
    if (userRes.data && userRes.data.length > 0) {
      user = userRes.data[0]
      userType = 'users'
    }
  } else if (caller.source === 'web_custom_login') {
    // Web 端：通过 customUserId（用户的 _id）依次查询三个集合
    
    // 1. 先查询 admin_accounts 集合（管理员）
    try {
      const adminRes = await db.collection('admin_accounts').doc(caller.customUserId).get()
      if (adminRes.data) {
        user = adminRes.data
        userType = 'admin_accounts'
        console.log('[admin_auth] 在 admin_accounts 找到用户')
      }
    } catch (e) {
      console.log('[admin_auth] admin_accounts 查询:', e.message)
    }
    
    // 2. 如果未找到，查询 designers 集合（设计师）
    if (!user) {
      try {
        const designerRes = await db.collection('designers').doc(caller.customUserId).get()
        if (designerRes.data) {
          user = designerRes.data
          userType = 'designers'
          console.log('[admin_auth] 在 designers 找到用户')
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
          console.log('[admin_auth] 在 users 找到用户')
        }
      } catch (e) {
        console.log('[admin_auth] users 查询:', e.message)
      }
    }
  } else {
    return { ok: false, errorCode: 'UNKNOWN_SOURCE', errorMessage: '未知的调用来源' }
  }
  
  // 检查是否找到用户
  if (!user) {
    return { ok: false, errorCode: 'USER_NOT_FOUND', errorMessage: '用户不存在' }
  }
  
  // 检查账号是否被禁用
  if (user.isDelete === 1) {
    return { ok: false, errorCode: 'USER_DISABLED', errorMessage: '账号已被禁用' }
  }
  
  // 权限验证（兼容不同的角色字段）
  // - admin_accounts: 默认是管理员，无需检查 roles
  // - designers: hasAccount=true 表示有后台权限
  // - users: roles=0 表示管理员
  if (userType === 'admin_accounts') {
    // 管理员账号，直接通过
    console.log('[admin_auth] 管理员账号验证通过')
  } else if (userType === 'designers') {
    // 设计师账号，检查 hasAccount
    if (!user.hasAccount) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无后台登录权限' }
    }
    console.log('[admin_auth] 设计师账号验证通过')
  } else if (userType === 'users') {
    // 旧版管理员，检查 roles
    if (user.roles !== 0) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无管理员权限' }
    }
    console.log('[admin_auth] 用户管理员验证通过')
  }
  
  return { ok: true, user, userType, authType: caller.source }
}

/**
 * 要求管理员权限
 * 这是对外的主要接口，整合了获取身份和验证权限的逻辑
 * 
 * @param {object} db - 数据库实例
 * @param {object} _ - db.command
 * @returns {object} { ok, user, errorCode, errorMessage, authType }
 */
async function requireAdmin(db, _) {
  const caller = getCallerIdentity()
  return await verifyAdmin(caller, db, _)
}

/**
 * 要求后台权限（支持管理员和设计师）
 * 用于仪表盘等需要支持设计师访问的接口
 * 
 * @param {object} db - 数据库实例
 * @param {object} _ - db.command
 * @returns {object} { ok, user, roles, designerId, errorCode, errorMessage }
 */
async function requireBackendAuth(db, _) {
  const caller = getCallerIdentity()
  
  if (!caller) {
    return { ok: false, errorCode: 'MISSING_IDENTITY', errorMessage: '缺少用户身份信息' }
  }
  
  let user = null
  let userType = null
  let roles = null // 0=管理员, 1=设计师
  let designerId = null
  
  if (caller.source === 'miniprogram') {
    // 小程序：通过 openid 查询用户
    const userRes = await db.collection('users')
      .where({ _openid: caller.openid, isDelete: _.neq(1) })
      .limit(1)
      .get()
    
    if (userRes.data && userRes.data.length > 0) {
      user = userRes.data[0]
      userType = 'users'
      roles = user.roles
    }
  } else if (caller.source === 'web_custom_login') {
    // Web 端：通过 customUserId（用户的 _id）依次查询三个集合
    
    // 1. 先查询 admin_accounts 集合（管理员）
    try {
      const adminRes = await db.collection('admin_accounts').doc(caller.customUserId).get()
      if (adminRes.data) {
        user = adminRes.data
        userType = 'admin_accounts'
        roles = 0 // 管理员
        console.log('[admin_auth] 在 admin_accounts 找到用户（管理员）')
      }
    } catch (e) {
      console.log('[admin_auth] admin_accounts 查询:', e.message)
    }
    
    // 2. 如果未找到，查询 designers 集合（设计师）
    if (!user) {
      try {
        const designerRes = await db.collection('designers').doc(caller.customUserId).get()
        if (designerRes.data) {
          user = designerRes.data
          userType = 'designers'
          roles = 1 // 设计师
          designerId = designerRes.data._id
          console.log('[admin_auth] 在 designers 找到用户（设计师）')
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
          roles = userRes.data.roles
          console.log('[admin_auth] 在 users 找到用户')
        }
      } catch (e) {
        console.log('[admin_auth] users 查询:', e.message)
      }
    }
  } else {
    return { ok: false, errorCode: 'UNKNOWN_SOURCE', errorMessage: '未知的调用来源' }
  }
  
  // 检查是否找到用户
  if (!user) {
    return { ok: false, errorCode: 'USER_NOT_FOUND', errorMessage: '用户不存在' }
  }
  
  // 检查账号是否被禁用
  if (user.isDelete === 1) {
    return { ok: false, errorCode: 'USER_DISABLED', errorMessage: '账号已被禁用' }
  }
  
  // 权限验证（管理员和设计师都允许）
  if (userType === 'admin_accounts') {
    // 管理员账号，直接通过
    console.log('[admin_auth] 管理员账号验证通过 (requireBackendAuth)')
  } else if (userType === 'designers') {
    // 设计师账号，检查 hasAccount
    if (!user.hasAccount) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无后台登录权限' }
    }
    console.log('[admin_auth] 设计师账号验证通过 (requireBackendAuth)')
  } else if (userType === 'users') {
    // 旧版管理员，检查 roles (0=管理员, 1=设计师 都允许)
    if (roles !== 0 && roles !== 1) {
      return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无后台访问权限' }
    }
    console.log('[admin_auth] 用户验证通过 (requireBackendAuth), roles:', roles)
  }
  
  return { 
    ok: true, 
    user, 
    userType, 
    authType: caller.source,
    roles,
    designerId
  }
}

/**
 * 返回友好的错误信息
 * 
 * @param {string} code - 错误码
 * @returns {string} 错误消息
 */
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
  requireBackendAuth,
  getErrorMessage,
  ENV_ID
}

