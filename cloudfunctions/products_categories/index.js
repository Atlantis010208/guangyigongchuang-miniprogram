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
    const { action = 'list' } = event

    switch (action) {
      case 'list':
        return await getCategories()
      case 'tree':
        return await getCategoryTree()
      case 'detail':
        return await getCategoryDetail(event.categoryId)
      case 'stats':
        return await getCategoryStats()
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '无效的操作类型',
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('商品分类操作失败:', error)
    return {
      success: false,
      code: 'CATEGORIES_ERROR',
      errorMessage: '商品分类操作失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 获取分类列表
async function getCategories() {
  const categoriesResult = await db.collection('categories')
    .where({
      isDelete: 0,
      status: 'active'
    })
    .orderBy('sort', 'asc')
    .orderBy('createdAt', 'asc')
    .get()

  // 处理分类图标
  const categories = categoriesResult.data
  for (let category of categories) {
    if (category.icon) {
      try {
        const tempFileResult = await cloud.getTempFileURL({
          fileList: [category.icon]
        })
        category.iconUrl = tempFileResult.fileList[0].tempFileURL
      } catch (error) {
        console.warn('获取分类图标失败:', error)
        category.iconUrl = category.icon
      }
    }
  }

  return {
    success: true,
    code: 'OK',
    message: '查询成功',
    data: {
      categories
    },
    timestamp: Date.now()
  }
}

// 获取分类树结构
async function getCategoryTree() {
  const categoriesResult = await db.collection('categories')
    .where({
      isDelete: 0,
      status: 'active'
    })
    .orderBy('sort', 'asc')
    .orderBy('createdAt', 'asc')
    .get()

  const allCategories = categoriesResult.data

  // 构建树结构
  const rootCategories = allCategories.filter(cat => !cat.parentId)
  const buildTree = (parentId = null) => {
    return allCategories
      .filter(cat => cat.parentId === parentId)
      .map(cat => ({
        ...cat,
        children: buildTree(cat._id)
      }))
  }

  const categoryTree = buildTree()

  return {
    success: true,
    code: 'OK',
    message: '查询成功',
    data: {
      categoryTree
    },
    timestamp: Date.now()
  }
}

// 获取分类详情
async function getCategoryDetail(categoryId) {
  if (!categoryId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少分类ID参数',
      timestamp: Date.now()
    }
  }

  const categoryResult = await db.collection('categories')
    .where({
      _id: categoryId,
      isDelete: 0,
      status: 'active'
    })
    .get()

  if (categoryResult.data.length === 0) {
    return {
      success: false,
      code: 'CATEGORY_NOT_FOUND',
      errorMessage: '分类不存在',
      timestamp: Date.now()
    }
  }

  const category = categoryResult.data[0]

  // 处理分类图标
  if (category.icon) {
    try {
      const tempFileResult = await cloud.getTempFileURL({
        fileList: [category.icon]
      })
      category.iconUrl = tempFileResult.fileList[0].tempFileURL
    } catch (error) {
      console.warn('获取分类图标失败:', error)
      category.iconUrl = category.icon
    }
  }

  // 获取该分类下的商品数量
  const productCountResult = await db.collection('products')
    .where({
      category: categoryId,
      isDelete: 0,
      status: 'active'
    })
    .count()

  category.productCount = productCountResult.total

  return {
    success: true,
    code: 'OK',
    message: '查询成功',
    data: {
      category
    },
    timestamp: Date.now()
  }
}

// 获取分类统计信息
async function getCategoryStats() {
  const aggregateResult = await db.collection('products')
    .aggregate()
    .match({
      isDelete: 0,
      status: 'active'
    })
    .group({
      _id: '$category',
      count: db.command.sum(1),
      totalSales: db.command.sum('$sales'),
      avgPrice: db.command.avg('$price')
    })
    .sort({
      count: -1
    })
    .end()

  const stats = aggregateResult.list

  // 获取分类名称
  for (let stat of stats) {
    const categoryResult = await db.collection('categories')
      .where({
        _id: stat._id,
        isDelete: 0
      })
      .field({
        name: true,
        icon: true
      })
      .get()

    if (categoryResult.data.length > 0) {
      stat.categoryName = categoryResult.data[0].name
      stat.icon = categoryResult.data[0].icon
    }
  }

  return {
    success: true,
    code: 'OK',
    message: '查询成功',
    data: {
      stats
    },
    timestamp: Date.now()
  }
}