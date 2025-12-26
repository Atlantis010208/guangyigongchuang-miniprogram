/**
 * 云函数：admin_designers_add
 * 功能：新增设计师
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 的 getUserInfo() 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 初始化 Node SDK（用于获取 Web 端自定义登录的身份）
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'
const nodeApp = cloudbase.init({ env: ENV_ID })

/**
 * 获取调用者身份信息
 * 同时支持微信小程序和 Web 端自定义登录
 * 
 * @returns {object} { source, openid, userId, customUserId }
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
    console.log('[getCallerIdentity] Node SDK getUserInfo:', e.message)
  }
  
  return null
}

/**
 * 验证管理员权限
 * 
 * @param {object} caller - getCallerIdentity() 的返回值
 * @returns {object} { ok, user, errorCode, errorMessage }
 */
async function verifyAdmin(caller) {
  if (!caller) {
    return { ok: false, errorCode: 'MISSING_IDENTITY', errorMessage: '缺少用户身份信息' }
  }
  
  let userRes
  
  if (caller.source === 'miniprogram') {
    // 小程序：通过 openid 查询用户
    userRes = await db.collection('users')
      .where({ _openid: caller.openid, isDelete: _.neq(1) })
      .limit(1)
      .get()
  } else if (caller.source === 'web_custom_login') {
    // Web 端：通过 customUserId（用户的 _id）查询用户
    try {
      const docRes = await db.collection('users').doc(caller.customUserId).get()
      userRes = { data: docRes.data ? [docRes.data] : [] }
    } catch (e) {
      console.log('[verifyAdmin] 查询用户失败:', e.message)
      userRes = { data: [] }
    }
  } else {
    return { ok: false, errorCode: 'UNKNOWN_SOURCE', errorMessage: '未知的调用来源' }
  }
  
  if (!userRes.data || !userRes.data.length) {
    return { ok: false, errorCode: 'USER_NOT_FOUND', errorMessage: '用户不存在' }
  }
  
  const user = userRes.data[0]
  
  if (user.isDelete === 1) {
    return { ok: false, errorCode: 'USER_DISABLED', errorMessage: '账号已被禁用' }
  }
  
  if (user.roles !== 0) {
    return { ok: false, errorCode: 'FORBIDDEN', errorMessage: '无管理员权限' }
  }
  
  return { ok: true, user }
}

exports.main = async (event) => {
  try {
    // 获取调用者身份
    const caller = getCallerIdentity()
    console.log('[admin_designers_add] Caller:', JSON.stringify(caller))
    
    // 验证管理员权限
    const authResult = await verifyAdmin(caller)
    if (!authResult.ok) {
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: authResult.errorMessage 
      }
    }
    
    const adminUser = authResult.user
    console.log('[admin_designers_add] Admin verified:', adminUser._id)
    
    const { data } = event
    
    if (!data) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少设计师数据' }
    }
    
    // 验证必填字段
    if (!data.name) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '设计师姓名为必填项' }
    }
    
    // 构建设计师数据
    const designerData = {
      name: data.name,
      title: data.title || '',
      avatar: data.avatar || '',
      rating: data.rating || 0,
      projects: data.projects || 0,
      price: data.price || 0,
      experience: data.experience || 0,
      specialties: data.specialties || [],
      hasCalcExp: data.hasCalcExp || false,
      spaceType: data.spaceType || [],
      bio: data.bio || '',
      certifications: data.certifications || [],
      portfolioImages: data.portfolioImages || [],
      isDelete: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    // 添加设计师
    const result = await db.collection('designers').add({
      data: designerData
    })
    
    console.log(`[admin_designers_add] Admin: ${adminUser._id}, Added designer: ${result._id}`)
    
    return {
      success: true,
      code: 'OK',
      data: {
        _id: result._id,
        ...designerData
      },
      message: '设计师添加成功'
    }
    
  } catch (err) {
    console.error('[admin_designers_add] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
