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

    // 查询商品详情
    const productResult = await db.collection('products')
      .where({
        _id: productId,
        isDelete: 0,
        status: 'active'
      })
      .get()

    if (productResult.data.length === 0) {
      return {
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        errorMessage: '商品不存在或已下架',
        timestamp: Date.now()
      }
    }

    const product = productResult.data[0]

    // 处理商品图片URL
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

    // 处理推荐商品图片
    const recommendations = recommendationsResult.data
    for (let item of recommendations) {
      if (item.images && item.images.length > 0) {
        try {
          const tempFileResult = await cloud.getTempFileURL({
            fileList: [item.images[0]] // 只处理第一张图片
          })
          item.coverImage = tempFileResult.fileList[0].tempFileURL
        } catch (error) {
          console.warn('获取推荐商品图片失败:', error)
          item.coverImage = item.images[0]
        }
      }
    }

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        product,
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