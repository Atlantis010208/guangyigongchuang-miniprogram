// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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
        isDelete: db.command.neq(1),
        status: 'active'
      })
      .get()

    // 如果用 _id 查不到，尝试用 productId 字段查询
    if (productResult.data.length === 0) {
      productResult = await db.collection('products')
        .where({
          productId: productId,
          isDelete: db.command.neq(1),
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

    // 处理商品图片URL - 智能处理不同格式的图片
    if (product.images && product.images.length > 0) {
      try {
        // 分类处理不同格式的图片
        const cloudFileIds = [] // cloud:// 格式的文件ID
        const cloudFileIndexes = [] // 对应的索引位置
        const processedImages = [...product.images] // 复制原始数组

        product.images.forEach((image, index) => {
          if (typeof image === 'string') {
            if (image.startsWith('cloud://')) {
              // 云文件ID，需要转换为临时URL
              cloudFileIds.push(image)
              cloudFileIndexes.push(index)
            }
            // 其他格式（https://、data:image/ 等）保持原样
          }
        })

        // 只对 cloud:// 格式的文件ID调用 getTempFileURL
        if (cloudFileIds.length > 0) {
          const tempFileResult = await cloud.getTempFileURL({
            fileList: cloudFileIds
          })
          
          // 将转换后的临时URL填回对应位置
          tempFileResult.fileList.forEach((file, i) => {
            const originalIndex = cloudFileIndexes[i]
            if (file.tempFileURL) {
              processedImages[originalIndex] = file.tempFileURL
            }
            // 如果转换失败，保持原始的 cloud:// URL
          })
        }

        product.images = processedImages
      } catch (error) {
        console.warn('获取商品图片URL失败:', error)
        // 保持原始图片数据
      }
    }

    // 增加商品浏览次数
    await db.collection('products')
      .doc(productId)
      .update({
        data: {
          viewCount: db.command.inc(1),
          updatedAt: db.serverDate()
        }
      })

    // 获取相关推荐商品（同分类下的其他商品）
    const recommendationsResult = await db.collection('products')
      .where({
        category: product.category,
        _id: db.command.neq(productId),
        isDelete: 0,
        status: 'active'
      })
      .orderBy('sales', 'desc')
      .orderBy('rating', 'desc')
      .limit(6)
      .get()

    // 处理推荐商品图片 - 智能处理不同格式的图片
    const recommendations = recommendationsResult.data
    for (let item of recommendations) {
      if (item.images && item.images.length > 0) {
        const firstImage = item.images[0]
        if (typeof firstImage === 'string') {
          if (firstImage.startsWith('cloud://')) {
            // 只对 cloud:// 格式调用转换
            try {
              const tempFileResult = await cloud.getTempFileURL({
                fileList: [firstImage]
              })
              if (tempFileResult.fileList[0] && tempFileResult.fileList[0].tempFileURL) {
                item.coverImage = tempFileResult.fileList[0].tempFileURL
              } else {
                item.coverImage = firstImage
              }
            } catch (error) {
              console.warn('获取推荐商品图片失败:', error)
              item.coverImage = firstImage
            }
          } else {
            // 已经是 HTTPS URL 或其他格式，直接使用
            item.coverImage = firstImage
          }
        }
      }
    }

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
        // 处理值格式：统一用 " / " 分隔
        const processedSpec = { ...spec }
        if (Array.isArray(processedSpec.value)) {
          // 数组值：用 " / " 连接
          processedSpec.value = processedSpec.value.join(' / ')
        } else if (typeof processedSpec.value === 'string') {
          // 字符串值：将"、"替换为 " / "
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

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        product: {
          ...product,
          // 新增：分组后的固定规格 (便于前端展示)
          groupedFixedSpecs
        },
        recommendations
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