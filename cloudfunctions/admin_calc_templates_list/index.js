/**
 * 云函数：admin_calc_templates_list
 * 功能：计算模板列表查询
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
      console.log('[admin_calc_templates_list] 权限验证失败:', authResult.errorCode)
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
      type,
      spaceType,
      isPublic,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 类型筛选（system/user）
    if (type) {
      query.type = type
    }
    
    // 空间类型筛选
    if (spaceType) {
      query.spaceType = spaceType
    }
    
    // 公开状态筛选
    if (typeof isPublic === 'boolean') {
      query.isPublic = isPublic
    }
    
    // 关键词搜索
    if (keyword) {
      query.title = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 获取总数
    const countRes = await db.collection('calc_templates').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('calc_templates')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 格式化返回数据
    const templates = dataRes.data.map(template => ({
      ...template,
      typeLabel: template.type === 'system' ? '系统模板' : '用户模板',
      spaceTypeLabel: {
        residential: '住宅照明',
        commercial: '商业照明',
        office: '办公照明',
        hotel: '酒店照明'
      }[template.spaceType] || template.spaceType
    }))
    
    return {
      success: true,
      code: 'OK',
      data: templates,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取计算模板列表成功'
    }
    
  } catch (err) {
    console.error('[admin_calc_templates_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
