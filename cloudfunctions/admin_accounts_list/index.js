/**
 * 云函数：admin_accounts_list
 * 功能：获取后台账号列表（管理员 + 设计师）
 * 权限：仅管理员（roles=0）
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_accounts_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      keyword = '',
      roles,  // 0=管理员, 1=设计师
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    const accounts = []
    let adminTotal = 0
    let designerTotal = 0
    
    // ========== 1. 查询 admin_accounts 集合（管理员）==========
    if (roles === undefined || roles === 0) {
      let adminQuery = {}
      
      if (keyword) {
        adminQuery = _.or([
          { username: db.RegExp({ regexp: keyword, options: 'i' }) },
          { name: db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      }
      
      // 获取管理员总数
      const adminCountRes = await db.collection('admin_accounts').where(adminQuery).count()
      adminTotal = adminCountRes.total
      
      // 获取管理员列表
      const adminRes = await db.collection('admin_accounts')
        .where(adminQuery)
        .orderBy(orderBy, order)
        .skip(roles === 0 ? offset : 0)
        .limit(roles === 0 ? Math.min(limit, 100) : 100)
        .get()
      
      adminRes.data.forEach(admin => {
        accounts.push({
          _id: admin._id,
          accountType: 'admin',
          username: admin.username,
          name: admin.name,
          roles: 0,
          rolesLabel: '管理员',
          isDelete: admin.isDelete || 0,
          statusLabel: admin.isDelete === 1 ? '已停用' : '正常',
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt,
          lastLoginAt: admin.lastLoginAt,
          createdBy: admin.createdBy
        })
      })
    }
    
    // ========== 2. 查询 designers 集合（已开通账号的设计师）==========
    if (roles === undefined || roles === 1) {
      let designerQuery = { hasAccount: true }
      
      if (keyword) {
        designerQuery = _.and([
          { hasAccount: true },
          _.or([
            { username: db.RegExp({ regexp: keyword, options: 'i' }) },
            { name: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        ])
      }
      
      // 获取设计师总数
      const designerCountRes = await db.collection('designers').where(designerQuery).count()
      designerTotal = designerCountRes.total
      
      // 获取设计师列表
      const designerRes = await db.collection('designers')
        .where(designerQuery)
        .orderBy(orderBy === 'createdAt' ? 'createdAt' : orderBy, order)
        .skip(roles === 1 ? offset : 0)
        .limit(roles === 1 ? Math.min(limit, 100) : 100)
        .get()
      
      designerRes.data.forEach(designer => {
        accounts.push({
          _id: designer._id,
          accountType: 'designer',
          designerId: designer._id,
          username: designer.username,
          name: designer.name,
          avatar: designer.avatar,
          rating: designer.rating,
          roles: 1,
          rolesLabel: '设计师',
          isDelete: designer.isDelete || 0,
          statusLabel: designer.isDelete === 1 ? '已停用' : '正常',
          createdAt: designer.createdAt,
          updatedAt: designer.updatedAt,
          lastLoginAt: designer.lastLoginAt
        })
      })
    }
    
    // 排序（如果同时查询两种类型）
    if (roles === undefined) {
      accounts.sort((a, b) => {
        const aTime = a.createdAt || 0
        const bTime = b.createdAt || 0
        return order === 'desc' ? bTime - aTime : aTime - bTime
      })
    }
    
    // 分页处理（如果同时查询两种类型）
    const total = adminTotal + designerTotal
    const pagedAccounts = roles === undefined 
      ? accounts.slice(offset, offset + limit)
      : accounts
    
    return {
      success: true,
      code: 'OK',
      data: pagedAccounts,
      total: total,
      pagination: {
        limit,
        offset,
        hasMore: offset + pagedAccounts.length < total
      },
      message: '获取账号列表成功'
    }
    
  } catch (err) {
    console.error('[admin_accounts_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

