/**
 * 云函数：admin_products_list
 * 功能：商品列表查询
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
      console.log('[admin_products_list] 权限验证失败:', authResult.errorCode)
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
      categoryId,
      status,
      minPrice,
      maxPrice,
      lowStock = false,
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 分类筛选
    if (categoryId) {
      query.categoryId = categoryId
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 价格范围筛选
    if (minPrice !== undefined || maxPrice !== undefined) {
      if (minPrice !== undefined && maxPrice !== undefined) {
        query.price = _.gte(minPrice).and(_.lte(maxPrice))
      } else if (minPrice !== undefined) {
        query.price = _.gte(minPrice)
      } else {
        query.price = _.lte(maxPrice)
      }
    }
    
    // 低库存筛选（库存<10）
    if (lowStock) {
      query.stock = _.lt(10)
    }
    
    // 关键词搜索（商品名称）
    if (keyword) {
      query.name = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 获取总数
    const countRes = await db.collection('products').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('products')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 格式化返回数据，添加库存预警标记
    const products = dataRes.data.map(product => ({
      ...product,
      lowStockWarning: product.stock < 10,
      stockStatus: product.stock === 0 ? 'out' : product.stock < 10 ? 'low' : 'normal'
    }))
    
    return {
      success: true,
      code: 'OK',
      data: products,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取商品列表成功'
    }
    
  } catch (err) {
    console.error('[admin_products_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
