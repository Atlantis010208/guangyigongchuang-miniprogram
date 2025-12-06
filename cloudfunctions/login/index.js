/**
 * 云函数 login
 * 功能：用户登录，获取 openid/unionId，创建或更新用户记录
 * 
 * 入参：
 *   - profile: { nickName, avatarUrl } 可选，用户基本信息
 *   - verifyOnly: boolean 可选，仅验证模式（不创建新用户，检查登录是否有效）
 * 
 * 返回：
 *   - success: boolean
 *   - code: 状态码 (OK/MISSING_OPENID/USER_NOT_FOUND/LOGIN_EXPIRED/LOGIN_FAILED)
 *   - openid: 用户 openid
 *   - unionId: 用户 unionId（如果有）
 *   - user: 用户文档
 *   - loginTime: 登录时间戳
 *   - expireTime: 登录过期时间戳（一天后）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 登录有效期：1天（毫秒）
const LOGIN_EXPIRE_DURATION = 24 * 60 * 60 * 1000

exports.main = async (event) => {
  try {
    // 获取微信上下文，包含 openid 和 unionId
    const ctx = cloud.getWXContext()
    const openid = ctx.OPENID || ctx.openid || ''
    const unionId = ctx.UNIONID || ctx.unionid || ''

    if (!openid) {
      return { 
        success: false, 
        code: 'MISSING_OPENID', 
        errorMessage: '无法获取用户身份标识' 
      }
    }

    // 是否仅验证模式（不创建新用户）
    const verifyOnly = event && event.verifyOnly === true

    // 获取传入的用户资料（可选）
    const profile = event && event.profile ? event.profile : {}
    const nickname = profile.nickName || profile.nickname || ''
    const avatarUrl = profile.avatarUrl || ''

    const db = cloud.database()
    const col = db.collection('users')

    // 尝试查询用户，如果集合不存在则自动创建
    let existingUser = null
    try {
      const queryRes = await col.where({ _openid: openid }).limit(1).get()
      if (queryRes && queryRes.data && queryRes.data.length) {
        existingUser = queryRes.data[0]
      }
    } catch (e) {
      // 集合不存在，尝试创建
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try { 
          await db.createCollection('users') 
          console.log('已自动创建 users 集合')
        } catch (createErr) {
          console.warn('创建 users 集合失败（可能已存在）', createErr)
        }
      } else {
        throw e
      }
    }

    const now = Date.now()
    const loginTime = now
    const expireTime = now + LOGIN_EXPIRE_DURATION

    let user

    // 仅验证模式：检查用户是否存在且登录未过期
    if (verifyOnly) {
      if (!existingUser) {
        console.log('验证失败：用户记录不存在', { openid })
        return {
          success: false,
          code: 'USER_NOT_FOUND',
          errorMessage: '用户记录不存在，请重新登录'
        }
      }

      // 检查云端记录的登录是否过期
      if (existingUser.loginExpireAt && now >= existingUser.loginExpireAt) {
        console.log('验证失败：云端登录已过期', { openid, expireAt: existingUser.loginExpireAt })
        return {
          success: false,
          code: 'LOGIN_EXPIRED',
          errorMessage: '登录已过期，请重新登录'
        }
      }

      // 验证通过，更新最后活跃时间并延长有效期
      await col.doc(existingUser._id).update({ 
        data: { 
          lastLoginAt: now,
          loginExpireAt: expireTime,
          updatedAt: now
        } 
      })

      const refreshed = await col.doc(existingUser._id).get()
      user = refreshed && refreshed.data ? refreshed.data : existingUser

      console.log('登录验证成功:', { openid, userId: user._id })

      return {
        success: true,
        code: 'OK',
        openid,
        unionId: unionId || '',
        user,
        loginTime,
        expireTime
      }
    }

    // 正常登录模式
    if (existingUser) {
      // 用户已存在，更新登录信息
      const updateData = {
        updatedAt: now,
        lastLoginAt: now,
        loginExpireAt: expireTime
      }
      
      // 仅在未设置时更新 nickname 和 avatarUrl
      if (nickname && !existingUser.nickname) {
        updateData.nickname = nickname
      }
      if (avatarUrl && !existingUser.avatarUrl) {
        updateData.avatarUrl = avatarUrl
      }
      // 更新 unionId（如果之前没有）
      if (unionId && !existingUser.unionId) {
        updateData.unionId = unionId
      }
      // 确保 roles 字段存在
      if (!('roles' in existingUser)) {
        updateData.roles = 1
      }

      await col.doc(existingUser._id).update({ data: updateData })
      
      // 重新获取更新后的用户文档
      const refreshed = await col.doc(existingUser._id).get()
      user = refreshed && refreshed.data ? refreshed.data : existingUser
      // 确保 _id 字段存在
      if (!user._id) {
        user._id = existingUser._id
      }
    } else {
      // 新用户，创建记录
      // 注意：显式设置 _openid 字段，确保后续查询能找到
      const newUserData = {
        _openid: openid,  // 显式设置 _openid，确保查询时能匹配
        nickname: nickname,
        avatarUrl: avatarUrl,
        phoneNumber: '',
        unionId: unionId,
        roles: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        loginExpireAt: expireTime
      }

      console.log('创建新用户，openid:', openid)

      const addRes = await col.add({ data: newUserData })
      const docId = addRes && addRes._id ? addRes._id : ''
      
      console.log('新用户创建成功，docId:', docId)
      
      if (docId) {
        const docRes = await col.doc(docId).get()
        user = docRes && docRes.data ? { ...docRes.data, _id: docId } : { _id: docId, _openid: openid, ...newUserData }
      } else {
        user = { _openid: openid, ...newUserData }
      }
    }

    console.log('用户登录成功:', { openid, unionId: unionId || '无', userId: user._id || '无' })

    return { 
      success: true, 
      code: 'OK', 
      openid,
      unionId: unionId || '',
      user,
      loginTime,
      expireTime
    }
  } catch (err) {
    console.error('登录云函数执行失败:', err)
    return { 
      success: false, 
      code: 'LOGIN_FAILED', 
      errorMessage: err && err.message ? err.message : '登录失败，请重试' 
    }
  }
}
