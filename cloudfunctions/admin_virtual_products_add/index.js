/**
 * 云函数：admin_virtual_products_add
 * 功能：新增虚拟商品（写入 products 集合，type=virtual）
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
      console.log('[admin_virtual_products_add] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { data } = event
    
    if (!data) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少商品数据' }
    }
    
    // 验证必填字段
    if (!data.name) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '商品名称为必填项' }
    }
    
    if (!data.virtualCategory) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '虚拟商品分类为必填项' }
    }
    
    if (!data.deliveryType) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '交付方式为必填项' }
    }
    
    // 生成唯一 productId
    const productId = `VP${Date.now()}`
    
    // 构建虚拟商品数据（写入 products 集合）
    const productData = {
      productId,
      name: data.name,
      description: data.description || '',
      price: data.price || 0,
      originalPrice: data.originalPrice || null,
      images: data.images || [],
      detailImages: data.detailImages || [],
      category: data.category || '',         // 关联 categories 集合
      virtualCategory: data.virtualCategory, // 虚拟商品细分类
      type: 'virtual',                       // 固定为 virtual
      deliveryType: data.deliveryType,       // download / service
      tags: data.tags || [],
      stock: data.stock !== undefined ? data.stock : -1,  // -1 表示无限库存
      sales: 0,
      rating: 0,
      ratingCount: 0,
      viewCount: 0,
      status: data.status || 'inactive',
      isDelete: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      // ========== 虚拟内容交付配置 ==========
      virtualContent: {
        // 网盘下载类
        driveLink: data.virtualContent?.driveLink || '',
        drivePassword: data.virtualContent?.drivePassword || '',
        driveContent: data.virtualContent?.driveContent || '',
        driveAltContact: data.virtualContent?.driveAltContact || '',
        // 服务交付类
        contactWechat: data.virtualContent?.contactWechat || '',
        serviceDescription: data.virtualContent?.serviceDescription || '',
      },
      
      // ========== 小程序详情页扩展字段 ==========
      fixedSpecs: data.fixedSpecs || [],
      variantGroups: data.variantGroups || [],
      contentList: data.contentList || [],
      skuPricing: data.skuPricing || [],
    }
    
    // 添加到 products 集合
    const result = await db.collection('products').add({
      data: productData
    })
    
    // 如果指定了分类，更新分类的商品计数
    if (data.category) {
      try {
        await db.collection('categories').doc(data.category).update({
          data: { productCount: _.inc(1) }
        })
      } catch (e) {
        console.warn('[admin_virtual_products_add] 更新分类计数失败:', e.message)
      }
    }
    
    console.log(`[admin_virtual_products_add] Admin: ${authResult.user._id}, Added virtual product: ${result._id}`)
    
    return {
      success: true,
      code: 'OK',
      data: {
        _id: result._id,
        productId,
      },
      message: '虚拟商品添加成功'
    }
    
  } catch (err) {
    console.error('[admin_virtual_products_add] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
