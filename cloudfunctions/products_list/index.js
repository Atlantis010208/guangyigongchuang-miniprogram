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

    // 处理商品图片URL
    for (let product of products) {
      if (product.images && product.images.length > 0) {
        try {
          const tempFileResult = await cloud.getTempFileURL({
            fileList: product.images
          })
          product.images = tempFileResult.fileList.map(file => file.tempFileURL)
        } catch (error) {
          console.warn('获取商品图片URL失败:', error)
          // 保持原始云文件ID
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