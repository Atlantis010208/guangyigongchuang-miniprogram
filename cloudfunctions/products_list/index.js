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
    const {
      page = 1,
      pageSize = 20,
      category,
      minPrice,
      maxPrice,
      keyword,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = event

    // 构建查询条件
    let query = {
      isDelete: 0,
      status: 'active'
    }

    // 分类筛选
    if (category) {
      query.category = category
    }

    // 价格区间筛选
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {}
      if (minPrice !== undefined) {
        query.price.$gte = Number(minPrice)
      }
      if (maxPrice !== undefined) {
        query.price.$lte = Number(maxPrice)
      }
    }

    // 关键词搜索
    if (keyword) {
      query.$or = [
        { name: db.RegExp({ regexp: keyword, options: 'i' }) },
        { description: db.RegExp({ regexp: keyword, options: 'i' }) },
        { tags: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]
    }

    // 计算分页偏移量
    const skip = (Number(page) - 1) * Number(pageSize)

    // 获取总数
    const countResult = await db.collection('products')
      .where(query)
      .count()

    const total = countResult.total

    // 获取商品列表
    const productsResult = await db.collection('products')
      .where(query)
      .orderBy(sortBy, sortOrder)
      .skip(skip)
      .limit(Number(pageSize))
      .get()

    const products = productsResult.data

    // 处理商品图片URL - 智能处理不同格式的图片
    for (let product of products) {
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
    }

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        products,
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / Number(pageSize))
        }
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('查询商品列表失败:', error)
    return {
      success: false,
      code: 'QUERY_PRODUCTS_ERROR',
      errorMessage: '查询商品列表失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}