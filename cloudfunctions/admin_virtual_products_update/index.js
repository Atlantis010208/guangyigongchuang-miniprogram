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
      'courseId', // 课程类虚拟商品关联的 courses.courseId
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
    
    // 已发布的小程序仍读取迁移前的 toolkits。仅按迁移关联同步，
    // 与主商品同事务提交，避免后台提示成功而订单继续展示旧发货内容。
    let result
    if (data.virtualContent !== undefined && targetProduct._migratedFrom === 'toolkits' && targetProduct._originalToolkitId) {
      if (!data.virtualContent || typeof data.virtualContent !== 'object' || Array.isArray(data.virtualContent)) {
        return { success: false, code: 'INVALID_PARAMS', errorMessage: '发货配置格式错误' }
      }
      result = await db.runTransaction(async tx => {
        const latest = (await tx.collection('products').doc(id).get()).data
        if (!latest || latest.type !== 'virtual' || latest._migratedFrom !== 'toolkits' || !latest._originalToolkitId) {
          throw new Error('商品迁移关联已变更，请刷新重试')
        }
        const legacyPatch = { updatedAt: updateData.updatedAt }
        for (const key of ['driveLink', 'drivePassword', 'driveContent', 'driveAltContact']) {
          if (Object.prototype.hasOwnProperty.call(data.virtualContent, key)) {
            legacyPatch[key] = data.virtualContent[key] || ''
          }
        }
        await tx.collection('toolkits').doc(latest._originalToolkitId).get()
        const updated = await tx.collection('products').doc(id).update({ data: updateData })
        await tx.collection('toolkits').doc(latest._originalToolkitId).update({ data: legacyPatch })
        return updated
      })
    } else {
      result = await db.collection('products').doc(id).update({ data: updateData })
    }
    
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
