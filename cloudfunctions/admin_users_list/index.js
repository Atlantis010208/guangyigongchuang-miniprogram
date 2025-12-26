/**
 * 云函数：admin_users_list
 * 功能：用户列表查询
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_users_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    console.log('[admin_users_list] 认证成功:', {
      authType: authResult.authType,
      userId: authResult.user?._id
    })
    
    const {
      limit = 20,
      offset = 0,
      keyword = '',
      filters = {},
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 从 filters 中提取角色筛选（兼容旧版参数）
    const role = event.role !== undefined ? event.role : filters.role
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 角色筛选
    if (typeof role === 'number') {
      query.roles = role
    }
    
    // 状态筛选
    if (filters.status !== undefined) {
      if (filters.status === 0) {
        query.isDelete = _.neq(1)
      } else if (filters.status === 1) {
        query.isDelete = 1
      }
    }
    
    // 关键词搜索（昵称或手机号）
    if (keyword) {
      query = _.and([
        query,
        _.or([
          { nickname: db.RegExp({ regexp: keyword, options: 'i' }) },
          { phoneNumber: db.RegExp({ regexp: keyword, options: 'i' }) },
          { username: db.RegExp({ regexp: keyword, options: 'i' }) },
          { email: db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      ])
    }
    
    // 获取总数
    const countRes = await db.collection('users').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('users')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 格式化返回数据
    const users = dataRes.data.map(user => ({
      _id: user._id,
      _openid: user._openid,
      username: user.username || '',
      nickname: user.nickname || '未设置',
      avatarUrl: user.avatarUrl || '',
      phoneNumber: user.phoneNumber || '',
      email: user.email || '',
      roles: user.roles ?? 1,
      rolesLabel: ['管理员', '普通用户', '设计师'][user.roles] || '普通用户',
      isDelete: user.isDelete || 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt
    }))
    
    return {
      success: true,
      code: 'OK',
      data: users,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取用户列表成功'
    }
    
  } catch (err) {
    console.error('[admin_users_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
