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
    // 验证管理员权限
    const hasPermission = await checkAdminPermission(OPENID)
    if (!hasPermission) {
      return {
        success: false,
        code: 'PERMISSION_DENIED',
        errorMessage: '没有管理员权限',
        timestamp: Date.now()
      }
    }

    const {
      name,
      description,
      categoryId,
      basePrice,
      originalPrice,
      images = [],
      skuConfig,
      specifications,
      stock,
      tags = [],
      seo = {}
    } = event

    // 验证必要参数
    if (!name || !categoryId || !basePrice) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少必要参数：商品名称、分类ID、基础价格',
        timestamp: Date.now()
      }
    }

    // 验证分类是否存在
    const categoryResult = await db.collection('categories')
      .doc(categoryId)
      .get()

    if (!categoryResult.data) {
      return {
        success: false,
        code: 'CATEGORY_NOT_FOUND',
        errorMessage: '商品分类不存在',
        timestamp: Date.now()
      }
    }

    // 生成商品ID
    const productId = `P${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    // 处理图片URL（如果是云存储ID，转换为HTTPS URL）
    const processedImages = await processImages(images)

    // 验证和处理SKU配置
    const processedSkuConfig = validateAndProcessSkuConfig(skuConfig)

    // 生成所有可能的SKU组合
    const skuCombinations = generateSkuCombinations(processedSkuConfig.variantGroups, basePrice)

    // 构建商品数据
    const productData = {
      productId,
      name,
      description: description || '',
      categoryId,
      price: basePrice,
      originalPrice: originalPrice || basePrice,
      images: processedImages,
      coverImage: processedImages.length > 0 ? processedImages[0] : '',

      // SKU配置
      skuConfig: processedSkuConfig,
      skuCombinations,

      // 商品规格
      specifications: specifications || processedSkuConfig.baseParams || [],

      // 库存管理
      stock: stock || 100,
      sales: 0,

      // 商品状态
      status: 'active',
      isDelete: 0,

      // 标签和SEO
      tags,
      seoTitle: seo.title || name,
      seoKeywords: seo.keywords || name,
      seoDescription: seo.description || description,

      // 时间戳
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // 保存到数据库
    const result = await db.collection('products').add({
      data: productData
    })

    // 更新分类商品计数
    await updateCategoryProductCount(categoryId, 1)

    return {
      success: true,
      code: 'OK',
      message: '商品添加成功',
      data: {
        productId,
        name,
        price: basePrice,
        skuCount: skuCombinations.length,
        createdAt: productData.createdAt
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('添加商品失败:', error)
    return {
      success: false,
      code: 'ADD_PRODUCT_ERROR',
      errorMessage: '添加商品失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 检查管理员权限
async function checkAdminPermission(openid) {
  try {
    const userResult = await db.collection('users')
      .where({
        _openid: openid,
        roles: db.command.in([0]), // 0 = 管理员
        isDelete: 0
      })
      .get()

    return userResult.data.length > 0
  } catch (error) {
    console.error('检查权限失败:', error)
    return false
  }
}

// 处理图片URL
async function processImages(images) {
  const processedImages = []

  for (const image of images) {
    if (typeof image === 'string') {
      // 如果是云存储ID格式，转换为HTTPS URL
      if (image.startsWith('cloud://')) {
        try {
          const result = await cloud.getTempFileURL({
            fileList: [image]
          })
          if (result.fileList && result.fileList[0] && result.fileList[0].tempFileURL) {
            processedImages.push(result.fileList[0].tempFileURL)
          }
        } catch (error) {
          console.warn('转换云存储图片URL失败:', error)
          processedImages.push(image) // 保持原样
        }
      } else {
        processedImages.push(image) // 已经是HTTPS URL
      }
    } else if (image && image.url) {
      // 如果是对象格式
      processedImages.push(image.url)
    }
  }

  return processedImages
}

// 验证和处理SKU配置
function validateAndProcessSkuConfig(skuConfig) {
  if (!skuConfig) {
    // 默认SKU配置
    return {
      variantGroups: [],
      baseParams: [],
      priceRules: {
        basePrice: 0,
        variantPriceAdjustments: {}
      }
    }
  }

  const { variantGroups = [], baseParams = [], priceRules = {} } = skuConfig

  // 处理规格组
  const processedVariantGroups = variantGroups.map(group => ({
    key: group.key || '',
    name: group.name || group.key || '',
    options: Array.isArray(group.options) ? group.options : [],
    required: group.required || false,
    priceMap: group.priceMap || {},
    priceDelta: group.priceDelta || {}
  }))

  // 处理基础参数
  const processedBaseParams = Array.isArray(baseParams) ? baseParams.map(param => ({
    key: param.key || '',
    value: param.value || '',
    unit: param.unit || '',
    important: param.important || false
  })) : []

  // 处理价格规则
  const processedPriceRules = {
    basePrice: priceRules.basePrice || 0,
    variantPriceAdjustments: priceRules.variantPriceAdjustments || {},
    minPrice: priceRules.minPrice || 0,
    maxPrice: priceRules.maxPrice || 0
  }

  return {
    variantGroups: processedVariantGroups,
    baseParams: processedBaseParams,
    priceRules: processedPriceRules
  }
}

// 生成所有可能的SKU组合
function generateSkuCombinations(variantGroups, basePrice) {
  if (!variantGroups || variantGroups.length === 0) {
    return [{
      skuId: 'DEFAULT',
      combinations: {},
      price: basePrice,
      stock: 100,
      status: 'active'
    }]
  }

  const combinations = []

  // 递归生成所有组合
  function generateCombinations(groups, index = 0, current = {}) {
    if (index >= groups.length) {
      // 计算价格
      const price = calculateSkuPrice(current, basePrice)

      // 生成SKU ID
      const skuId = Object.keys(current)
        .sort()
        .map(key => `${key}_${current[key]}`)
        .join('-')
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')

      combinations.push({
        skuId,
        combinations: { ...current },
        price,
        stock: 100, // 默认库存，后续可以单独设置
        status: 'active'
      })
      return
    }

    const group = groups[index]
    const { key, options } = group

    if (!options || options.length === 0) {
      generateCombinations(groups, index + 1, current)
    } else {
      for (const option of options) {
        current[key] = option
        generateCombinations(groups, index + 1, current)
      }
      delete current[key]
    }
  }

  generateCombinations(variantGroups)
  return combinations
}

// 计算SKU价格
function calculateSkuPrice(combinations, basePrice) {
  let price = basePrice

  // 这里可以根据不同的规格组合调整价格
  // 价格调整规则可以在SKU配置中定义

  Object.entries(combinations).forEach(([key, value]) => {
    // 示例：尺寸调整
    if (key === 'size') {
      const sizePrices = {
        '40cm': 0,
        '50cm': 100,
        '60cm': 200,
        '70cm': 300
      }
      price += sizePrices[value] || 0
    }

    // 示例：调光功能调整
    if (key === 'dimming') {
      const dimmingPrices = {
        '无': 0,
        '三段调光': 50,
        '无极调光': 100,
        '蓝牙Mesh': 150
      }
      price += dimmingPrices[value] || 0
    }

    // 示例：颜色调整
    if (key === 'color') {
      const colorPrices = {
        '白色': 0,
        '黑色': 50,
        '灰色': 30,
        '香槟金': 80
      }
      price += colorPrices[value] || 0
    }
  })

  return Math.max(price, 0)
}

// 更新分类商品计数
async function updateCategoryProductCount(categoryId, increment) {
  try {
    await db.collection('categories')
      .doc(categoryId)
      .update({
        data: {
          productCount: db.command.inc(increment),
          updatedAt: db.serverDate()
        }
      })
  } catch (error) {
    console.warn('更新分类商品计数失败:', error)
  }
}