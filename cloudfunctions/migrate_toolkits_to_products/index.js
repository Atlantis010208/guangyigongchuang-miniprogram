/**
 * 云函数：migrate_toolkits_to_products
 * 功能：一次性迁移，将 toolkits 集合中的数据迁移到 products 集合
 * 注意：此云函数无需权限验证，仅用于一次性数据迁移
 * 
 * 字段映射关系：
 * toolkits.title        → products.name
 * toolkits.toolkitId    → products.productId (保留原ID便于追溯)
 * toolkits.category     → products.virtualCategory (工具包分类映射)
 * toolkits.cover        → products.images[0] (封面图作为第一张轮播图)
 * toolkits.driveLink 等 → products.virtualContent (网盘交付信息)
 * toolkits.salesCount   → products.sales
 * 新增字段：type='virtual', deliveryType='download'
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { dryRun = false } = event // dryRun=true 时只预览不实际写入
    
    // 1. 查询所有 toolkits 数据（未删除的）
    // 云数据库单次最多返回100条，需要分批查询
    let allToolkits = []
    let offset = 0
    const batchSize = 100
    
    while (true) {
      const res = await db.collection('toolkits')
        .where({ isDelete: _.neq(1) })
        .skip(offset)
        .limit(batchSize)
        .get()
      
      allToolkits = allToolkits.concat(res.data)
      
      if (res.data.length < batchSize) break
      offset += batchSize
    }
    
    console.log(`[migrate] 共查询到 ${allToolkits.length} 条工具包数据`)
    
    if (allToolkits.length === 0) {
      return {
        success: true,
        message: '没有需要迁移的数据',
        migrated: 0
      }
    }
    
    // 2. 检查是否已有迁移过的数据（防止重复迁移）
    const existingCheck = await db.collection('products')
      .where({
        type: 'virtual',
        _migratedFrom: 'toolkits'
      })
      .count()
    
    if (existingCheck.total > 0 && !event.force) {
      return {
        success: false,
        message: `已有 ${existingCheck.total} 条迁移数据存在，如需重新迁移请传入 force=true`,
        existingCount: existingCheck.total
      }
    }
    
    // 3. 转换数据
    const productsToInsert = allToolkits.map(toolkit => {
      // 构建 images 数组：封面图 + 原有轮播图
      let images = []
      if (toolkit.images && toolkit.images.length > 0) {
        images = [...toolkit.images]
      } else if (toolkit.cover) {
        images = [toolkit.cover]
      }
      
      return {
        // 基础信息
        productId: `VP_${toolkit.toolkitId || toolkit._id}`, // 加前缀区分
        name: toolkit.title || '未命名商品',
        description: toolkit.description || '',
        price: toolkit.price || 0,
        originalPrice: toolkit.originalPrice || null,
        images: images,
        detailImages: toolkit.detailImages || [],
        category: '',  // toolkits 没有关联 categories 集合，留空
        virtualCategory: toolkit.category || 'other', // cad/model/material/calculation/other
        type: 'virtual',
        deliveryType: 'download', // 工具包统一为网盘下载类型
        tags: toolkit.tags || [],
        stock: -1, // 虚拟商品无限库存
        sales: toolkit.salesCount || 0,
        rating: toolkit.rating || 0,
        ratingCount: toolkit.ratingCount || 0,
        viewCount: 0,
        status: toolkit.status || 'inactive',
        isDelete: 0,
        createdAt: toolkit.createdAt || Date.now(),
        updatedAt: Date.now(),
        
        // 虚拟内容交付配置
        virtualContent: {
          driveLink: toolkit.driveLink || '',
          drivePassword: toolkit.drivePassword || '',
          driveContent: toolkit.driveContent || '',
          driveAltContact: toolkit.driveAltContact || '',
          contactWechat: '',
          serviceDescription: '',
        },
        
        // 扩展字段
        fixedSpecs: (toolkit.params || []).map(p => ({
          key: p.key || '',
          label: p.key || '',
          value: p.value || ''
        })),
        variantGroups: toolkit.variantGroups || [],
        contentList: toolkit.contentList || [],
        
        // 迁移标记（用于追溯和防重复）
        _migratedFrom: 'toolkits',
        _originalToolkitId: toolkit._id,
        _migratedAt: Date.now()
      }
    })
    
    // 4. 如果是 dryRun 模式，只返回预览
    if (dryRun) {
      return {
        success: true,
        message: `预览模式：将迁移 ${productsToInsert.length} 条数据`,
        dryRun: true,
        sampleData: productsToInsert.slice(0, 3), // 只返回前3条预览
        totalCount: productsToInsert.length
      }
    }
    
    // 5. 批量写入 products 集合
    let successCount = 0
    let failCount = 0
    const errors = []
    
    for (const product of productsToInsert) {
      try {
        await db.collection('products').add({ data: product })
        successCount++
      } catch (err) {
        failCount++
        errors.push({
          name: product.name,
          productId: product.productId,
          error: err.message
        })
        console.error(`[migrate] 写入失败: ${product.name}`, err.message)
      }
    }
    
    console.log(`[migrate] 迁移完成: 成功 ${successCount}, 失败 ${failCount}`)
    
    return {
      success: true,
      message: `迁移完成：成功 ${successCount} 条，失败 ${failCount} 条`,
      migrated: successCount,
      failed: failCount,
      errors: errors.length > 0 ? errors : undefined
    }
    
  } catch (err) {
    console.error('[migrate] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '迁移失败'
    }
  }
}
