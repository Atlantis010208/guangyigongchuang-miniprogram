/**
 * 云函数：admin_courses_list
 * 功能：课程列表查询
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
      console.log('[admin_courses_list] 权限验证失败:', authResult.errorCode)
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
      level,
      status,
      category,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 难度筛选
    if (level) {
      query.level = level
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 分类筛选
    if (category) {
      query.category = category
    }
    
    // 关键词搜索
    if (keyword) {
      query.title = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 获取总数
    const countRes = await db.collection('courses').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('courses')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 格式化返回数据
    const courses = dataRes.data.map(course => ({
      ...course,
      levelLabel: {
        beginner: '入门',
        intermediate: '进阶',
        advanced: '高级'
      }[course.level] || course.level,
      statusLabel: {
        draft: '草稿',
        published: '已发布',
        offline: '已下架'
      }[course.status] || course.status
    }))
    
    return {
      success: true,
      code: 'OK',
      data: courses,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取课程列表成功'
    }
    
  } catch (err) {
    console.error('[admin_courses_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
