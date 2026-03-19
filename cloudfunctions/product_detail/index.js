// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { OPENID } = wxContext

  try {
    const { productId } = event

    if (!productId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少商品ID参数',
        timestamp: Date.now()
      }
    }

    // 查询商品详情 - 同时支持 _id 和 productId 两种查询方式
    let productResult = await db.collection('products')
      .where({
        _id: productId,
        isDelete: _.neq(1),
        status: 'active'
      })
      .get()

    // 如果用 _id 查不到，尝试用 productId 字段查询
    if (productResult.data.length === 0) {
      productResult = await db.collection('products')
        .where({
          productId: productId,
          isDelete: _.neq(1),
          status: 'active'
        })
        .get()
    }

    if (productResult.data.length === 0) {
      return {
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        errorMessage: '商品不存在或已下架',
        timestamp: Date.now()
      }
    }

    const product = productResult.data[0]
    const actualDocId = product._id
    const isVirtual = product.type === 'virtual'

    // 并行执行：浏览量更新 + 推荐商品查询 + 虚拟商品已购检查
    const parallelTasks = [
      // 任务1：增加商品浏览次数
      db.collection('products').doc(actualDocId).update({
        data: {
          viewCount: _.inc(1),
          updatedAt: db.serverDate()
        }
      }).catch(err => console.warn('更新浏览次数失败:', err)),

      // 任务2：获取相关推荐商品
      db.collection('products')
        .where({
          category: product.category,
          _id: _.neq(actualDocId),
          isDelete: 0,
          status: 'active'
        })
        .orderBy('sales', 'desc')
        .limit(6)
        .get()
    ]

    // 任务3（可选）：虚拟商品已购检查
    if (isVirtual && OPENID) {
      parallelTasks.push(
        db.collection('user_purchases')
          .where({
            userId: OPENID,
            productId: product.productId || actualDocId,
            status: 'active'
          })
          .limit(1)
          .get()
          .catch(() => ({ data: [] }))
      )
    }

    const results = await Promise.all(parallelTasks)
    const recommendationsResult = results[1]
    const purchaseResult = isVirtual && OPENID ? results[2] : null

    // 批量处理所有图片的 cloud:// → 临时URL 转换
    const recommendations = recommendationsResult.data || []
    await batchProcessAllImages(product, recommendations)

    // 推荐商品设置 coverImage
    recommendations.forEach(item => {
      if (item.images && item.images.length > 0) {
        item.coverImage = item.images[0]
      }
    })

    // 处理固定规格参数分组
    let groupedFixedSpecs = null
    if (product.fixedSpecs && Array.isArray(product.fixedSpecs) && product.fixedSpecs.length > 0) {
      groupedFixedSpecs = {
        optical: [],
        electrical: [],
        physical: [],
        functional: []
      }
      
      product.fixedSpecs.forEach(spec => {
        const group = spec.group || 'physical'
        const processedSpec = { ...spec }
        if (Array.isArray(processedSpec.value)) {
          processedSpec.value = processedSpec.value.join(' / ')
        } else if (typeof processedSpec.value === 'string') {
          processedSpec.value = processedSpec.value.replace(/、/g, ' / ')
        }
        
        if (groupedFixedSpecs[group]) {
          groupedFixedSpecs[group].push(processedSpec)
        } else {
          groupedFixedSpecs.physical.push(processedSpec)
        }
      })
      
      // 移除空分组
      Object.keys(groupedFixedSpecs).forEach(key => {
        if (groupedFixedSpecs[key].length === 0) {
          delete groupedFixedSpecs[key]
        }
      })
    }

    // 构建返回数据
    const productData = {
      ...product,
      groupedFixedSpecs
    }

    // 虚拟商品：根据已购状态决定是否返回联系方式/下载信息
    let purchaseInfo = null
    if (isVirtual) {
      const hasPurchased = purchaseResult && purchaseResult.data && purchaseResult.data.length > 0

      if (hasPurchased) {
        const purchaseRecord = purchaseResult.data[0]
        purchaseInfo = {
          hasPurchased: true,
          purchaseTime: purchaseRecord.purchaseTime,
          status: purchaseRecord.status
        }

        // 已购买：返回虚拟内容（联系方式 / 下载信息）
        if (product.deliveryType === 'service' && product.virtualContent) {
          purchaseInfo.contactInfo = product.virtualContent
        } else if (product.deliveryType === 'download' && product.virtualContent) {
          purchaseInfo.downloadInfo = {
            fileType: product.virtualContent.fileType,
            fileSize: product.virtualContent.fileSize,
            version: product.virtualContent.version,
            downloadCount: purchaseRecord.downloadCount || 0,
            maxDownloads: purchaseRecord.maxDownloads || 999
          }
          // 转换下载文件的 cloud:// URL
          if (product.virtualContent.fileId && product.virtualContent.fileId.startsWith('cloud://')) {
            try {
              const tempRes = await cloud.getTempFileURL({ fileList: [product.virtualContent.fileId] })
              if (tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
                purchaseInfo.downloadInfo.downloadUrl = tempRes.fileList[0].tempFileURL
              }
            } catch (e) {
              console.warn('获取下载链接失败:', e)
            }
          } else if (product.virtualContent.downloadUrl) {
            purchaseInfo.downloadInfo.downloadUrl = product.virtualContent.downloadUrl
          }
        }
      } else {
        purchaseInfo = { hasPurchased: false }
      }

      // 未购买时，不返回 virtualContent 中的敏感内容
      delete productData.virtualContent
    }

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        product: productData,
        recommendations,
        purchaseInfo
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('查询商品详情失败:', error)
    return {
      success: false,
      code: 'QUERY_PRODUCT_DETAIL_ERROR',
      errorMessage: '查询商品详情失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

/**
 * 批量处理主商品和推荐商品的所有图片
 * 将所有 cloud:// 图片汇总后一次性调用 getTempFileURL
 */
async function batchProcessAllImages(product, recommendations) {
  const cloudFileIdSet = new Set()

  // 收集主商品轮播图
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach(img => {
      if (typeof img === 'string' && img.startsWith('cloud://')) {
        cloudFileIdSet.add(img)
      }
    })
  }

  // 收集主商品详情图（虚拟商品）
  if (product.detailImages && Array.isArray(product.detailImages)) {
    product.detailImages.forEach(img => {
      if (typeof img === 'string' && img.startsWith('cloud://')) {
        cloudFileIdSet.add(img)
      }
    })
  }

  // 收集推荐商品首图
  recommendations.forEach(item => {
    if (item.images && item.images.length > 0) {
      const firstImg = item.images[0]
      if (typeof firstImg === 'string' && firstImg.startsWith('cloud://')) {
        cloudFileIdSet.add(firstImg)
      }
    }
  })

  if (cloudFileIdSet.size === 0) return

  try {
    const tempFileResult = await cloud.getTempFileURL({
      fileList: Array.from(cloudFileIdSet)
    })

    // 构建映射表
    const urlMap = {}
    if (tempFileResult.fileList) {
      tempFileResult.fileList.forEach(file => {
        if (file.fileID && file.tempFileURL) {
          urlMap[file.fileID] = file.tempFileURL
        }
      })
    }

    // 回填主商品轮播图
    if (product.images && Array.isArray(product.images)) {
      product.images = product.images.map(img => {
        if (typeof img === 'string' && img.startsWith('cloud://') && urlMap[img]) {
          return urlMap[img]
        }
        return img
      })
    }

    // 回填主商品详情图
    if (product.detailImages && Array.isArray(product.detailImages)) {
      product.detailImages = product.detailImages.map(img => {
        if (typeof img === 'string' && img.startsWith('cloud://') && urlMap[img]) {
          return urlMap[img]
        }
        return img
      })
    }

    // 回填推荐商品图片
    recommendations.forEach(item => {
      if (item.images && item.images.length > 0) {
        item.images = item.images.map(img => {
          if (typeof img === 'string' && img.startsWith('cloud://') && urlMap[img]) {
            return urlMap[img]
          }
          return img
        })
      }
    })
  } catch (error) {
    console.warn('批量获取图片URL失败:', error)
  }
}
