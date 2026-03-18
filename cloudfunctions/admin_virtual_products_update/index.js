/**
 * 云函数：admin_virtual_products_update
 * 功能：更新虚拟商品（更新 products 集合中 type=virtual 的记录）
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
      console.log('[admin_virtual_products_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少商品ID' }
    }
    
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 构建更新数据
    const updateData = {
      updatedAt: Date.now()
    }
    
    // 允许更新的字段
    const allowedFields = [
      'name', 'description', 'price', 'originalPrice',
      'images', 'detailImages', 'category', 'virtualCategory',
      'deliveryType', 'tags', 'stock', 'status', 'isDelete',
      // 虚拟内容交付配置
      'virtualContent',
      // 小程序详情页扩展字段
      'fixedSpecs', 'variantGroups', 'contentList',
      // SKU 定价
      'skuPricing'
    ]
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })
    
    // 执行更新（验证目标商品确实是虚拟商品）
    // 先查询确认
    let targetProduct = null
    try {
      const checkRes = await db.collection('products').doc(id).get()
      targetProduct = checkRes.data
    } catch (e) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '商品不存在' }
    }
    
    if (!targetProduct) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '商品不存在' }
    }
    
    if (targetProduct.type !== 'virtual') {
      return { success: false, code: 'INVALID_TYPE', errorMessage: '该商品不是虚拟商品，无法通过此接口更新' }
    }
    
    // 执行更新
    const result = await db.collection('products')
      .doc(id)
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return { success: false, code: 'UPDATE_FAILED', errorMessage: '更新失败' }
    }
    
    console.log(`[admin_virtual_products_update] Admin: ${authResult.user._id}, Updated virtual product: ${id}`)
    
    return {
      success: true,
      code: 'OK',
      data: { updated: result.stats.updated },
      message: '虚拟商品更新成功'
    }
    
  } catch (err) {
    console.error('[admin_virtual_products_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
