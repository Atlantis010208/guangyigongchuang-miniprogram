/**
 * 云函数：designers_list
 * 功能：设计师列表查询（小程序端）
 * 
 * @param {object} event - 请求参数
 * @param {object} event.filters - 筛选条件
 * @param {string} event.filters.spaceType - 空间类型筛选
 * @param {number} event.filters.minRating - 最低评分
 * @param {boolean} event.filters.hasCalcExp - 照度计算认证
 * @param {string} event.sortBy - 排序字段（rating/projects/price/experience）
 * @param {number} event.page - 页码（从1开始）
 * @param {number} event.pageSize - 每页数量
 * @param {string} event.keyword - 搜索关键词（按姓名模糊搜索）
 * @returns {object} { success, items, total }
 */
const cloud = require('wx-server-sdk')

// 使用动态环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  const col = db.collection('designers')
  
  // 解析参数
  const filters = (event && event.filters) || {}
  const sortBy = (event && event.sortBy) || 'rating'
  const page = (event && event.page) || 1
  const pageSize = (event && event.pageSize) || 20
  const keyword = (event && event.keyword) || ''
  const skip = Math.max(0, (page - 1) * pageSize)
  
  // 构建查询条件
  let conditions = {
    isDelete: _.neq(1)  // 过滤已删除的设计师
  }
  
  // 空间类型筛选（使用 spaceType 数组字段）
  const spaceType = String(filters.spaceType || '').trim()
  if (spaceType) {
    conditions.spaceType = spaceType  // MongoDB 数组包含查询
  }
  
  // 最低评分筛选
  const minRating = Number(filters.minRating || 0)
  if (minRating > 0) {
    conditions.rating = _.gte(minRating)
  }
  
  // 照度计算认证筛选（修复字段名：hasCalcExp）
  if (filters.hasCalcExp) {
    conditions.hasCalcExp = true
  }
  
  // 关键词搜索（按姓名模糊匹配）
  if (keyword) {
    conditions.name = db.RegExp({ regexp: keyword, options: 'i' })
  }
  
  // 排序字段映射（修复：使用正确的数据库字段名）
  const orderFieldMap = {
    'rating': 'rating',
    'projects': 'projects',      // 修复：projects 而非 projectCount
    'price': 'price',            // 修复：price 而非 pricePerSqm
    'experience': 'experience'
  }
  const orderField = orderFieldMap[sortBy] || 'rating'
  
  // 价格升序，其他降序
  const order = sortBy === 'price' ? 'asc' : 'desc'
  
  try {
    // 获取总数
    const countRes = await col.where(conditions).count()
    const total = countRes.total || 0
    
    // 获取数据
    const res = await col
      .where(conditions)
      .orderBy(orderField, order)
      .skip(skip)
      .limit(Math.min(pageSize, 100))
      .get()
    
    const items = (res && res.data) ? res.data : []
    
    return { 
      success: true, 
      items,
      total,
      pagination: {
        page,
        pageSize,
        hasMore: skip + items.length < total
      }
    }
  } catch (err) {
    console.error('[designers_list] 查询失败:', err)
    return {
      success: false,
      items: [],
      total: 0,
      errorMessage: err.message || '查询失败'
    }
  }
}
