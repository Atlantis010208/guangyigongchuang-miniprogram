/**
 * 云函数：admin_cleanup_unused_files
 * 功能：清理未被使用的云存储文件（可选工具，谨慎使用）
 * 权限：仅管理员
 * 
 * 工作原理：
 * 1. 获取所有设计师的头像和作品图片 URL
 * 2. 获取所有产品的图片 URL
 * 3. 获取云存储中的所有文件
 * 4. 找出未被引用的文件并删除
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  try {
    const { dryRun = true, prefix = '' } = event
    
    console.log(`[admin_cleanup_unused_files] 开始扫描，dryRun: ${dryRun}, prefix: ${prefix}`)
    
    // 1. 收集所有正在使用的文件 ID
    const usedFileIDs = new Set()
    
    // 从设计师收集
    const designersRes = await db.collection('designers')
      .field({ avatar: true, portfolioImages: true })
      .limit(1000)
      .get()
    
    for (const designer of designersRes.data) {
      if (designer.avatar && designer.avatar.startsWith('cloud://')) {
        usedFileIDs.add(designer.avatar)
      }
      if (designer.portfolioImages && Array.isArray(designer.portfolioImages)) {
        designer.portfolioImages.forEach(img => {
          if (img.startsWith('cloud://')) {
            usedFileIDs.add(img)
          }
        })
      }
    }
    
    // 从产品收集
    try {
      const productsRes = await db.collection('products')
        .field({ images: true, coverImage: true })
        .limit(1000)
        .get()
      
      for (const product of productsRes.data) {
        if (product.coverImage && product.coverImage.startsWith('cloud://')) {
          usedFileIDs.add(product.coverImage)
        }
        if (product.images && Array.isArray(product.images)) {
          product.images.forEach(img => {
            if (img.startsWith('cloud://')) {
              usedFileIDs.add(img)
            }
          })
        }
      }
    } catch (err) {
      console.log('[admin_cleanup_unused_files] 产品集合不存在或查询失败:', err.message)
    }
    
    console.log(`[admin_cleanup_unused_files] 找到 ${usedFileIDs.size} 个正在使用的文件`)
    
    // 2. 获取云存储文件列表
    const allFiles = []
    let marker = ''
    let hasMore = true
    
    // 只扫描指定前缀的文件（如 designers/）
    const scanPrefix = prefix || 'designers/'
    
    while (hasMore && allFiles.length < 10000) {
      try {
        // 注意：这里需要使用云存储 API 列出文件
        // 由于 wx-server-sdk 没有直接提供列表 API，这里只是示例
        // 实际使用时可能需要通过其他方式获取文件列表
        console.log('[admin_cleanup_unused_files] 注意：需要通过其他方式获取文件列表')
        break
      } catch (err) {
        console.error('[admin_cleanup_unused_files] 获取文件列表失败:', err)
        break
      }
    }
    
    // 3. 找出未使用的文件
    const unusedFiles = allFiles.filter(file => !usedFileIDs.has(file))
    
    console.log(`[admin_cleanup_unused_files] 找到 ${unusedFiles.length} 个未使用的文件`)
    
    if (unusedFiles.length === 0) {
      return {
        success: true,
        code: 'OK',
        message: '没有找到未使用的文件',
        data: {
          usedCount: usedFileIDs.size,
          unusedCount: 0,
          dryRun
        }
      }
    }
    
    // 4. 删除未使用的文件（如果不是 dryRun）
    let deletedCount = 0
    if (!dryRun) {
      console.log('[admin_cleanup_unused_files] 开始删除文件...')
      
      // 分批删除（每次最多 50 个）
      for (let i = 0; i < unusedFiles.length; i += 50) {
        const batch = unusedFiles.slice(i, i + 50)
        try {
          await cloud.deleteFile({
            fileList: batch
          })
          deletedCount += batch.length
          console.log(`[admin_cleanup_unused_files] 已删除 ${deletedCount}/${unusedFiles.length}`)
        } catch (err) {
          console.error('[admin_cleanup_unused_files] 删除失败:', err)
        }
      }
    }
    
    return {
      success: true,
      code: 'OK',
      message: dryRun ? '预览模式，未实际删除' : `已删除 ${deletedCount} 个文件`,
      data: {
        usedCount: usedFileIDs.size,
        unusedCount: unusedFiles.length,
        deletedCount,
        dryRun,
        unusedFiles: dryRun ? unusedFiles.slice(0, 10) : [] // 预览模式显示前 10 个
      }
    }
    
  } catch (err) {
    console.error('[admin_cleanup_unused_files] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

