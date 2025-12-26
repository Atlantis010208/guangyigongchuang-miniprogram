/**
 * 云函数：admin_designers_list
 * 功能：设计师列表查询
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
      console.log('[admin_designers_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    console.log('[admin_designers_list] 认证成功:', {
      authType: authResult.authType,
      userId: authResult.user?._id
    })
    
    const {
      limit = 20,
      offset = 0,
      keyword = '',
      spaceType,
      minRating,
      hasCalcExp,
      includeDeleted = false,  // 新增：是否包含已停用的设计师
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    // 管理后台可以通过 includeDeleted=true 查看所有设计师（包括已停用的）
    let query = includeDeleted ? {} : { isDelete: _.neq(1) }
    
    // 空间类型筛选
    if (spaceType) {
      query.spaceType = spaceType
    }
    
    // 最低评分筛选
    if (typeof minRating === 'number') {
      query.rating = _.gte(minRating)
    }
    
    // 照度计算经验筛选
    if (typeof hasCalcExp === 'boolean') {
      query.hasCalcExp = hasCalcExp
    }
    
    // 关键词搜索（姓名）
    if (keyword) {
      query.name = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 获取总数
    const countRes = await db.collection('designers').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('designers')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    return {
      success: true,
      code: 'OK',
      data: dataRes.data,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取设计师列表成功'
    }
    
  } catch (err) {
    console.error('[admin_designers_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
