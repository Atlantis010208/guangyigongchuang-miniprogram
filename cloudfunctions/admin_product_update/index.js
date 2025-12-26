/**
 * 云函数：admin_product_update
 * 功能：更新商品
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_product_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode),
        timestamp: Date.now()
      }
    }

    const {
      productId,
      updateData,
      action = 'update' // update, status, stock, delete
    } = event

    if (!productId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少商品ID参数',
        timestamp: Date.now()
      }
    }

    // 查询商品是否存在
    const productResult = await db.collection('products')
      .where({
        productId,
        isDelete: 0
      })
      .get()

    if (productResult.data.length === 0) {
      return {
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        errorMessage: '商品不存在',
        timestamp: Date.now()
      }
    }

    const product = productResult.data[0]

    switch (action) {
      case 'update':
        return await updateProduct(product, updateData)

      case 'status':
        return await updateProductStatus(product, updateData)

      case 'stock':
        return await updateProductStock(product, updateData)

      case 'delete':
        return await deleteProduct(product)

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型',
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('更新商品失败:', error)
    return {
      success: false,
      code: 'UPDATE_PRODUCT_ERROR',
      errorMessage: '更新商品失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 更新商品基本信息
async function updateProduct(product, updateData) {
  try {
    const {
      name,
      description,
      categoryId,
      basePrice,
      originalPrice,
      images,
      skuConfig,
      specifications,
      stock,
      tags,
      seo,
      // 新增：灯具专业参数字段
      brand,
      model,
      categoryParams,
      fixedSpecs
    } = updateData

    // 构建更新数据
    const dataToUpdate = { updatedAt: new Date() }

    if (name !== undefined) dataToUpdate.name = name
    if (description !== undefined) dataToUpdate.description = description
    if (basePrice !== undefined) dataToUpdate.price = basePrice
    if (originalPrice !== undefined) dataToUpdate.originalPrice = originalPrice
    if (stock !== undefined) dataToUpdate.stock = stock
    if (tags !== undefined) dataToUpdate.tags = tags

    // 更新分类
    if (categoryId !== undefined && categoryId !== product.categoryId) {
      // 验证新分类是否存在
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

      dataToUpdate.categoryId = categoryId

      // 更新分类商品计数
      await updateCategoryProductCount(product.categoryId, -1)
      await updateCategoryProductCount(categoryId, 1)
    }

    // 处理图片更新
    if (images !== undefined) {
      const processedImages = await processImages(images)
      dataToUpdate.images = processedImages
      dataToUpdate.coverImage = processedImages.length > 0 ? processedImages[0] : ''
    }

    // 更新SKU配置
    if (skuConfig !== undefined) {
      const processedSkuConfig = validateAndProcessSkuConfig(skuConfig)
      const skuCombinations = generateSkuCombinations(processedSkuConfig.variantGroups, basePrice || product.price)

      dataToUpdate.skuConfig = processedSkuConfig
      dataToUpdate.skuCombinations = skuCombinations
    }

    // 更新规格参数
    if (specifications !== undefined) {
      dataToUpdate.specifications = Array.isArray(specifications)
        ? specifications.map(spec => ({
            key: spec.key || '',
            value: spec.value || '',
            unit: spec.unit || '',
            important: spec.important || false
          }))
        : []
    }

    // 更新SEO信息
    if (seo !== undefined) {
      dataToUpdate.seoTitle = seo.title || name || product.name
      dataToUpdate.seoKeywords = seo.keywords || name || product.name
      dataToUpdate.seoDescription = seo.description || description || product.description
    }

    // ========== 新增：更新灯具专业参数字段 ==========
    
    // 更新品牌
    if (brand !== undefined) {
      dataToUpdate.brand = brand
    }
    
    // 更新型号
    if (model !== undefined) {
      dataToUpdate.model = model
    }
    
    // 更新分类参数数据
    if (categoryParams !== undefined) {
      dataToUpdate.categoryParams = categoryParams
    }
    
    // 更新固定规格参数
    if (fixedSpecs !== undefined) {
      dataToUpdate.fixedSpecs = Array.isArray(fixedSpecs) ? fixedSpecs.map(spec => ({
        key: spec.key || '',
        label: spec.label || '',
        value: spec.value,
        unit: spec.unit || '',
        group: spec.group || 'physical',
        important: spec.important || false
      })) : []
    }

    // 执行更新
    await db.collection('products')
      .doc(product._id)
      .update({
        data: dataToUpdate
      })

    return {
      success: true,
      code: 'OK',
      message: '商品更新成功',
      data: {
        productId: product.productId,
        updatedAt: dataToUpdate.updatedAt
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('更新商品基本信息失败:', error)
    throw error
  }
}

// 更新商品状态
async function updateProductStatus(product, updateData) {
  try {
    const { status } = updateData

    if (!['active', 'inactive', 'out_of_stock'].includes(status)) {
      return {
        success: false,
        code: 'INVALID_STATUS',
        errorMessage: '无效的商品状态',
        timestamp: Date.now()
      }
    }

    await db.collection('products')
      .doc(product._id)
      .update({
        data: {
          status,
          updatedAt: new Date()
        }
      })

    return {
      success: true,
      code: 'OK',
      message: '商品状态更新成功',
      data: {
        productId: product.productId,
        status,
        updatedAt: new Date()
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('更新商品状态失败:', error)
    throw error
  }
}

// 更新商品库存
async function updateProductStock(product, updateData) {
  try {
    const { stock, skuId, operation = 'set' } = updateData // set, add, subtract

    let finalStock = stock

    if (operation === 'add') {
      finalStock = product.stock + (stock || 0)
    } else if (operation === 'subtract') {
      finalStock = Math.max(product.stock - (stock || 0), 0)
    }

    if (finalStock < 0) {
      return {
        success: false,
        code: 'INVALID_STOCK',
        errorMessage: '库存不能为负数',
        timestamp: Date.now()
      }
    }

    const updateData = {
      stock: finalStock,
      updatedAt: new Date()
    }

    // 如果库存为0，自动更新状态
    if (finalStock === 0 && product.status === 'active') {
      updateData.status = 'out_of_stock'
    } else if (finalStock > 0 && product.status === 'out_of_stock') {
      updateData.status = 'active'
    }

    // 更新特定SKU库存（如果提供）
    if (skuId && product.skuCombinations) {
      const skuIndex = product.skuCombinations.findIndex(sku => sku.skuId === skuId)
      if (skuIndex !== -1) {
        const updatedSkuCombinations = [...product.skuCombinations]
        updatedSkuCombinations[skuIndex] = {
          ...updatedSkuCombinations[skuIndex],
          stock: finalStock
        }
        updateData.skuCombinations = updatedSkuCombinations
      }
    }

    await db.collection('products')
      .doc(product._id)
      .update({
        data: updateData
      })

    return {
      success: true,
      code: 'OK',
      message: '库存更新成功',
      data: {
        productId: product.productId,
        stock: finalStock,
        operation,
        updatedAt: new Date()
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('更新库存失败:', error)
    throw error
  }
}

// 删除商品
async function deleteProduct(product) {
  try {
    await db.collection('products')
      .doc(product._id)
      .update({
        data: {
          isDelete: 1,
          status: 'deleted',
          updatedAt: new Date()
        }
      })

    // 更新分类商品计数
    await updateCategoryProductCount(product.categoryId, -1)

    return {
      success: true,
      code: 'OK',
      message: '商品删除成功',
      data: {
        productId: product.productId,
        deletedAt: new Date()
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('删除商品失败:', error)
    throw error
  }
}

// 注意：权限验证已移至 admin_auth 模块

// 处理图片URL
// 注意：直接存储 cloud:// 格式的云文件ID，不转换为临时URL
// 在查询时（如 products_list）再转换为临时URL，避免URL过期问题
async function processImages(images) {
  const processedImages = []

  for (const image of images) {
    if (typeof image === 'string') {
      // 直接存储 cloud:// 格式，或者其他格式（HTTPS URL、Base64）
      processedImages.push(image)
    } else if (image && image.url) {
      // 如果是对象格式，提取 URL
      processedImages.push(image.url)
    }
  }

  return processedImages
}

function validateAndProcessSkuConfig(skuConfig) {
  if (!skuConfig) {
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

  const processedVariantGroups = variantGroups.map(group => ({
    key: group.key || '',
    name: group.name || group.key || '',
    options: Array.isArray(group.options) ? group.options : [],
    required: group.required || false,
    priceMap: group.priceMap || {},
    priceDelta: group.priceDelta || {}
  }))

  const processedBaseParams = Array.isArray(baseParams) ? baseParams.map(param => ({
    key: param.key || '',
    value: param.value || '',
    unit: param.unit || '',
    important: param.important || false
  })) : []

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

  function generateCombinations(groups, index = 0, current = {}) {
    if (index >= groups.length) {
      const price = calculateSkuPrice(current, basePrice)
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
        stock: 100,
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

function calculateSkuPrice(combinations, basePrice) {
  let price = basePrice

  Object.entries(combinations).forEach(([key, value]) => {
    if (key === 'size') {
      const sizePrices = {
        '40cm': 0,
        '50cm': 100,
        '60cm': 200,
        '70cm': 300
      }
      price += sizePrices[value] || 0
    }

    if (key === 'dimming') {
      const dimmingPrices = {
        '无': 0,
        '三段调光': 50,
        '无极调光': 100,
        '蓝牙Mesh': 150
      }
      price += dimmingPrices[value] || 0
    }

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