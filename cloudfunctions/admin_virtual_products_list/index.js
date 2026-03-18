/**
 * 云函数：admin_virtual_products_list
 * 功能：虚拟商品列表查询（从 products 集合查询 type=virtual 的记录）
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
      console.log('[admin_virtual_products_list] 权限验证失败:', authResult.errorCode)
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
      filters = {},
      orderBy = 'createdAt',
      order = 'desc'
    } = event
    
    const { virtualCategory, deliveryType, status } = filters
    
    // 构建查询条件：固定 type=virtual
    let query = { 
      type: 'virtual',
      isDelete: _.neq(1)
    }
    
    // 虚拟商品细分类筛选
    if (virtualCategory) {
      query.virtualCategory = virtualCategory
    }
    
    // 交付方式筛选
    if (deliveryType) {
      query.deliveryType = deliveryType
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 关键词搜索（搜索商品名称）
    if (keyword) {
      query.name = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 并行获取总数和数据
    const [countRes, dataRes] = await Promise.all([
      db.collection('products').where(query).count(),
      db.collection('products')
        .where(query)
        .orderBy(orderBy, order)
        .skip(offset)
        .limit(Math.min(limit, 100))
        .get()
    ])
    
    // 格式化返回数据
    const virtualCategoryLabels = {
      design_service: '设计服务',
      data_tool: '资料工具',
      cad: 'CAD图纸',
      model: '3D模型',
      material: '材质贴图',
      calculation: '计算工具',
      other: '其他资源'
    }
    
    const deliveryTypeLabels = {
      download: '网盘下载',
      service: '服务交付'
    }
    
    const products = dataRes.data.map(product => ({
      ...product,
      virtualCategoryLabel: virtualCategoryLabels[product.virtualCategory] || product.virtualCategory || '未分类',
      deliveryTypeLabel: deliveryTypeLabels[product.deliveryType] || product.deliveryType || '未设置'
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
      message: '获取虚拟商品列表成功'
    }
    
  } catch (err) {
    console.error('[admin_virtual_products_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
