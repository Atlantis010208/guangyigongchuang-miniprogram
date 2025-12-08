/**
 * 购物车操作云函数
 * 支持操作：get（获取列表）、add（添加）、update（更新数量）、remove（移除）、
 *          batch_remove（批量移除）、clear（清空）、sync（同步）
 * 
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型
 * @param {string} [event.productId] - 商品ID
 * @param {object} [event.product] - 完整商品信息（add 时使用）
 * @param {number} [event.quantity] - 数量
 * @param {string} [event.cartItemId] - 购物车项ID
 * @param {array} [event.cartItemIds] - 购物车项ID数组（batch_remove 时使用）
 * @param {array} [event.cartItems] - 购物车商品数组（sync 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: '用户身份验证失败'
    }
  }

  const { action } = event

  try {
    switch (action) {
      case 'get':
        return await getCartItems(openid, event)
      case 'add':
        return await addToCart(openid, event)
      case 'update':
        return await updateCartItem(openid, event)
      case 'remove':
        return await removeFromCart(openid, event)
      case 'batch_remove':
        return await batchRemoveFromCart(openid, event)
      case 'clear':
        return await clearCart(openid)
      case 'sync':
        return await syncCart(openid, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('购物车操作失败:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务器错误'
    }
  }
}

/**
 * 获取购物车商品列表
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 购物车列表
 */
async function getCartItems(openid, event) {
  await ensureCollection('cart')
  
  const col = db.collection('cart')
  
  // 查询用户购物车
  const res = await col
    .where({
      _openid: openid,
      isDeleted: _.neq(true)
    })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  
  const cartItems = res.data || []
  
  // 处理图片链接
  const processedItems = await processImageUrls(cartItems)
  
  // 计算总价和总数量
  let totalAmount = 0
  let totalQuantity = 0
  
  processedItems.forEach(item => {
    const price = parseFloat(item.price) || 0
    const quantity = parseInt(item.quantity) || 1
    totalAmount += price * quantity
    totalQuantity += quantity
  })
  
  // 格式化返回数据
  const items = processedItems.map(item => ({
    id: item.productId || item._id,
    cartItemId: item._id,
    name: item.name || '',
    price: item.price || 0,
    image: item.image || '',
    quantity: item.quantity || 1,
    specs: item.specs || {},
    _key: item._key || item._id,
    createdAt: item.createdAt
  }))
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: {
      items,
      totalAmount: totalAmount.toFixed(2),
      totalQuantity,
      itemCount: items.length
    }
  }
}

/**
 * 添加商品到购物车
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function addToCart(openid, event) {
  const { product, quantity = 1 } = event
  
  if (!product || !product.id) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少商品信息'
    }
  }
  
  if (quantity <= 0) {
    return {
      success: false,
      code: 'INVALID_QUANTITY',
      message: '商品数量必须大于0'
    }
  }
  
  await ensureCollection('cart')
  
  const col = db.collection('cart')
  
  // 生成唯一 key（基于商品ID和规格）
  const specsKey = product.specs ? JSON.stringify(product.specs) : ''
  const uniqueKey = `${product.id}_${specsKey}_${Date.now()}`
  
  // 检查是否已存在相同商品（相同ID和规格）
  const existingRes = await col
    .where({
      _openid: openid,
      productId: product.id,
      specsKey: specsKey,
      isDeleted: _.neq(true)
    })
    .limit(1)
    .get()
  
  if (existingRes.data && existingRes.data.length > 0) {
    // 商品已存在，更新数量
    const existingItem = existingRes.data[0]
    const newQuantity = (existingItem.quantity || 1) + quantity
    
    await col.doc(existingItem._id).update({
      data: {
        quantity: newQuantity,
        updatedAt: Date.now()
      }
    })
    
    return {
      success: true,
      code: 'OK',
      message: '已更新购物车商品数量',
      data: {
        cartItemId: existingItem._id,
        quantity: newQuantity,
        isUpdate: true
      }
    }
  }
  
  // 新增购物车商品
  const cartItem = {
    _openid: openid,
    productId: product.id,
    name: product.name || '',
    price: product.price || 0,
    image: product.image || '',
    quantity: quantity,
    specs: product.specs || {},
    specsKey: specsKey,
    _key: uniqueKey,
    isDeleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  const addRes = await col.add({ data: cartItem })
  
  console.log(`添加商品到购物车: ${product.id}, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: '已添加到购物车',
    data: {
      cartItemId: addRes._id,
      _key: uniqueKey,
      quantity: quantity,
      isUpdate: false
    }
  }
}

/**
 * 更新购物车商品数量
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function updateCartItem(openid, event) {
  const { cartItemId, productId, quantity } = event
  
  // 支持通过 cartItemId 或 productId 更新
  const itemId = cartItemId || productId
  
  if (!itemId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少商品ID'
    }
  }
  
  if (quantity === undefined || quantity < 0) {
    return {
      success: false,
      code: 'INVALID_QUANTITY',
      message: '商品数量无效'
    }
  }
  
  const col = db.collection('cart')
  
  // 如果数量为0，执行删除
  if (quantity === 0) {
    return await removeFromCart(openid, { cartItemId: itemId, productId: itemId })
  }
  
  // 查找购物车项
  let cartItem = null
  
  // 先尝试通过 _id 查找
  try {
    const res = await col.doc(itemId).get()
    if (res.data && res.data._openid === openid) {
      cartItem = res.data
    }
  } catch (err) {
    // _id 查找失败，尝试通过 productId 查找
  }
  
  // 如果没找到，尝试通过 productId 查找
  if (!cartItem) {
    const res = await col.where({
      _openid: openid,
      productId: itemId,
      isDeleted: _.neq(true)
    }).limit(1).get()
    
    if (res.data && res.data.length > 0) {
      cartItem = res.data[0]
    }
  }
  
  if (!cartItem) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '购物车商品不存在'
    }
  }
  
  // 更新数量
  await col.doc(cartItem._id).update({
    data: {
      quantity: quantity,
      updatedAt: Date.now()
    }
  })
  
  return {
    success: true,
    code: 'OK',
    message: '更新成功',
    data: {
      cartItemId: cartItem._id,
      quantity
    }
  }
}

/**
 * 从购物车移除商品
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function removeFromCart(openid, event) {
  const { cartItemId, productId } = event
  const itemId = cartItemId || productId
  
  if (!itemId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少商品ID'
    }
  }
  
  const col = db.collection('cart')
  
  // 查找购物车项
  let cartItem = null
  
  // 先尝试通过 _id 查找
  try {
    const res = await col.doc(itemId).get()
    if (res.data && res.data._openid === openid) {
      cartItem = res.data
    }
  } catch (err) {
    // 继续尝试其他方式
  }
  
  // 如果没找到，尝试通过 productId 查找
  if (!cartItem) {
    const res = await col.where({
      _openid: openid,
      productId: itemId,
      isDeleted: _.neq(true)
    }).limit(1).get()
    
    if (res.data && res.data.length > 0) {
      cartItem = res.data[0]
    }
  }
  
  if (!cartItem) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '购物车商品不存在'
    }
  }
  
  // 软删除
  await col.doc(cartItem._id).update({
    data: {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  
  console.log(`从购物车移除商品: ${cartItem._id}, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: '已从购物车移除'
  }
}

/**
 * 批量从购物车移除商品
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function batchRemoveFromCart(openid, event) {
  const { cartItemIds, productIds, keys } = event
  
  // 支持多种ID格式
  const ids = cartItemIds || productIds || keys || []
  
  if (!ids || ids.length === 0) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少要删除的商品ID'
    }
  }
  
  const col = db.collection('cart')
  
  // 批量更新为删除状态
  // 通过 _id 或 _key 或 productId 匹配
  const updateRes = await col.where({
    _openid: openid,
    isDeleted: _.neq(true),
    _: _.or([
      { _id: _.in(ids) },
      { _key: _.in(ids) },
      { productId: _.in(ids) }
    ])
  }).update({
    data: {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  
  console.log(`批量删除购物车商品: ${ids.length} 个, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: `已删除 ${updateRes.stats?.updated || 0} 件商品`,
    data: {
      deletedCount: updateRes.stats?.updated || 0
    }
  }
}

/**
 * 清空购物车
 * @param {string} openid - 用户openid
 * @returns {object} 操作结果
 */
async function clearCart(openid) {
  const col = db.collection('cart')
  
  // 批量软删除
  const updateRes = await col.where({
    _openid: openid,
    isDeleted: _.neq(true)
  }).update({
    data: {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  
  console.log(`清空购物车, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: '购物车已清空',
    data: {
      deletedCount: updateRes.stats?.updated || 0
    }
  }
}

/**
 * 同步购物车（本地数据同步到云端）
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function syncCart(openid, event) {
  const { cartItems } = event
  
  if (!Array.isArray(cartItems)) {
    return {
      success: false,
      code: 'INVALID_PARAM',
      message: '购物车数据格式错误'
    }
  }
  
  // 先清空云端购物车
  await clearCart(openid)
  
  // 逐个添加商品
  const results = []
  
  for (const item of cartItems) {
    try {
      const result = await addToCart(openid, {
        product: {
          id: item.id || item.productId,
          name: item.name,
          price: item.price,
          image: item.image,
          specs: item.specs
        },
        quantity: item.quantity || 1
      })
      
      results.push({
        productId: item.id || item.productId,
        success: result.success,
        message: result.message
      })
    } catch (err) {
      results.push({
        productId: item.id || item.productId,
        success: false,
        message: err.message
      })
    }
  }
  
  const successCount = results.filter(r => r.success).length
  
  return {
    success: true,
    code: 'OK',
    message: `同步完成，成功 ${successCount}/${cartItems.length} 件`,
    data: {
      results,
      successCount,
      totalCount: cartItems.length
    }
  }
}

/**
 * 处理图片链接（将 cloud:// 转换为临时链接）
 * @param {array} items - 购物车项数组
 * @returns {array} 处理后的数组
 */
async function processImageUrls(items) {
  if (!items || items.length === 0) return items
  
  // 收集所有 cloud:// 开头的图片
  const cloudFileIds = items
    .map(item => item.image)
    .filter(url => url && typeof url === 'string' && url.startsWith('cloud://'))
  
  if (cloudFileIds.length === 0) return items
  
  try {
    // 批量获取临时链接
    const res = await cloud.getTempFileURL({
      fileList: [...new Set(cloudFileIds)] // 去重
    })
    
    // 构建映射
    const urlMap = {}
    if (res.fileList) {
      res.fileList.forEach(file => {
        if (file.tempFileURL) {
          urlMap[file.fileID] = file.tempFileURL
        }
      })
    }
    
    // 替换图片链接
    return items.map(item => {
      if (item.image && urlMap[item.image]) {
        return { ...item, image: urlMap[item.image] }
      }
      return item
    })
  } catch (err) {
    console.error('处理图片链接失败:', err)
    return items
  }
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (err) {
    if (err.errCode === -502005) {
      console.log(`集合 ${collectionName} 不存在，请在云开发控制台创建`)
    }
  }
}
