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
      action,
      productId,
      quantity = 1,
      cartItemId
    } = event

    // 验证必要参数
    if (!action) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    // 根据不同操作执行相应逻辑
    switch (action) {
      case 'get':
        return await getCartItems(OPENID)

      case 'add':
        return await addToCart(OPENID, productId, quantity)

      case 'update':
        return await updateCartItem(OPENID, cartItemId, quantity)

      case 'remove':
        return await removeFromCart(OPENID, cartItemId)

      case 'clear':
        return await clearCart(OPENID)

      case 'sync':
        return await syncCart(OPENID, event.cartItems || [])

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型',
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('购物车操作失败:', error)
    return {
      success: false,
      code: 'CART_OPERATION_ERROR',
      errorMessage: '购物车操作失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}

// 获取购物车商品
async function getCartItems(userId) {
  try {
    const cartResult = await db.collection('cart')
      .where({
        userId,
        isDelete: 0
      })
      .orderBy('createdAt', 'desc')
      .get()

    if (cartResult.data.length === 0) {
      return {
        success: true,
        code: 'OK',
        message: '购物车为空',
        data: {
          items: [],
          totalAmount: 0,
          totalQuantity: 0
        },
        timestamp: Date.now()
      }
    }

    // 获取商品详情
    const productIds = cartResult.data.map(item => item.productId)
    const productsResult = await db.collection('products')
      .where({
        _id: db.command.in(productIds),
        isDelete: 0,
        status: 'active'
      })
      .get()

    // 构建商品映射
    const productMap = {}
    productsResult.data.forEach(product => {
      productMap[product._id] = product
    })

    // 组装购物车数据
    const cartItems = []
    let totalAmount = 0
    let totalQuantity = 0

    for (const cartItem of cartResult.data) {
      const product = productMap[cartItem.productId]

      if (!product) {
        // 商品不存在，标记删除
        await db.collection('cart')
          .doc(cartItem._id)
          .update({
            data: {
              isDelete: 1,
              updatedAt: db.serverDate()
            }
          })
        continue
      }

      // 检查库存
      const isStockAvailable = product.stock >= cartItem.quantity

      const itemTotal = product.price * cartItem.quantity
      totalAmount += itemTotal
      totalQuantity += cartItem.quantity

      cartItems.push({
        cartItemId: cartItem._id,
        productId: product._id,
        name: product.name,
        description: product.description,
        price: product.price,
        originalPrice: product.originalPrice,
        quantity: cartItem.quantity,
        image: product.images && product.images.length > 0 ? product.images[0] : '',
        isStockAvailable,
        stock: product.stock,
        itemTotal,
        createdAt: cartItem.createdAt,
        updatedAt: cartItem.updatedAt
      })
    }

    return {
      success: true,
      code: 'OK',
      message: '获取购物车成功',
      data: {
        items: cartItems,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalQuantity,
        itemCount: cartItems.length
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('获取购物车失败:', error)
    throw error
  }
}

// 添加商品到购物车
async function addToCart(userId, productId, quantity) {
  try {
    if (!productId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少商品ID参数',
        timestamp: Date.now()
      }
    }

    if (quantity <= 0) {
      return {
        success: false,
        code: 'INVALID_QUANTITY',
        errorMessage: '商品数量必须大于0',
        timestamp: Date.now()
      }
    }

    // 检查商品是否存在且可购买
    const productResult = await db.collection('products')
      .doc(productId)
      .get()

    if (!productResult.data) {
      return {
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        errorMessage: '商品不存在',
        timestamp: Date.now()
      }
    }

    const product = productResult.data

    if (product.isDelete || product.status !== 'active') {
      return {
        success: false,
        code: 'PRODUCT_NOT_AVAILABLE',
        errorMessage: '商品已下架',
        timestamp: Date.now()
      }
    }

    if (product.stock <= 0) {
      return {
        success: false,
        code: 'PRODUCT_OUT_OF_STOCK',
        errorMessage: '商品库存不足',
        timestamp: Date.now()
      }
    }

    // 检查购物车中是否已存在该商品
    const existingItemResult = await db.collection('cart')
      .where({
        userId,
        productId,
        isDelete: 0
      })
      .get()

    const finalQuantity = Math.min(quantity, product.stock)

    if (existingItemResult.data.length > 0) {
      // 商品已存在，更新数量
      const existingItem = existingItemResult.data[0]
      const newQuantity = existingItem.quantity + finalQuantity

      if (newQuantity > product.stock) {
        return {
          success: false,
          code: 'INSUFFICIENT_STOCK',
          errorMessage: '库存不足，当前库存: ' + product.stock,
          timestamp: Date.now()
        }
      }

      await db.collection('cart')
        .doc(existingItem._id)
        .update({
          data: {
            quantity: newQuantity,
            updatedAt: db.serverDate()
          }
        })

      return {
        success: true,
        code: 'OK',
        message: '更新购物车商品数量成功',
        data: {
          cartItemId: existingItem._id,
          quantity: newQuantity
        },
        timestamp: Date.now()
      }

    } else {
      // 新增购物车商品
      const cartResult = await db.collection('cart').add({
        data: {
          userId,
          productId,
          quantity: finalQuantity,
          isDelete: 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })

      return {
        success: true,
        code: 'OK',
        message: '添加到购物车成功',
        data: {
          cartItemId: cartResult._id,
          quantity: finalQuantity
        },
        timestamp: Date.now()
      }
    }

  } catch (error) {
    console.error('添加到购物车失败:', error)
    throw error
  }
}

// 更新购物车商品数量
async function updateCartItem(userId, cartItemId, quantity) {
  try {
    if (!cartItemId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少购物车项ID参数',
        timestamp: Date.now()
      }
    }

    if (quantity <= 0) {
      return {
        success: false,
        code: 'INVALID_QUANTITY',
        errorMessage: '商品数量必须大于0',
        timestamp: Date.now()
      }
    }

    // 获取购物车商品
    const cartItemResult = await db.collection('cart')
      .doc(cartItemId)
      .get()

    if (!cartItemResult.data || cartItemResult.data.userId !== userId) {
      return {
        success: false,
        code: 'CART_ITEM_NOT_FOUND',
        errorMessage: '购物车商品不存在',
        timestamp: Date.now()
      }
    }

    // 获取商品信息检查库存
    const productResult = await db.collection('products')
      .doc(cartItemResult.data.productId)
      .get()

    if (!productResult.data) {
      return {
        success: false,
        code: 'PRODUCT_NOT_FOUND',
        errorMessage: '商品不存在',
        timestamp: Date.now()
      }
    }

    const product = productResult.data

    if (quantity > product.stock) {
      return {
        success: false,
        code: 'INSUFFICIENT_STOCK',
        errorMessage: '库存不足，当前库存: ' + product.stock,
        timestamp: Date.now()
      }
    }

    // 更新购物车商品数量
    await db.collection('cart')
      .doc(cartItemId)
      .update({
        data: {
          quantity,
          updatedAt: db.serverDate()
        }
      })

    return {
      success: true,
      code: 'OK',
      message: '更新购物车商品数量成功',
      data: {
        cartItemId,
        quantity
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('更新购物车商品数量失败:', error)
    throw error
  }
}

// 从购物车移除商品
async function removeFromCart(userId, cartItemId) {
  try {
    if (!cartItemId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少购物车项ID参数',
        timestamp: Date.now()
      }
    }

    // 验证购物车商品是否存在且属于当前用户
    const cartItemResult = await db.collection('cart')
      .doc(cartItemId)
      .get()

    if (!cartItemResult.data || cartItemResult.data.userId !== userId) {
      return {
        success: false,
        code: 'CART_ITEM_NOT_FOUND',
        errorMessage: '购物车商品不存在',
        timestamp: Date.now()
      }
    }

    // 删除购物车商品（软删除）
    await db.collection('cart')
      .doc(cartItemId)
      .update({
        data: {
          isDelete: 1,
          updatedAt: db.serverDate()
        }
      })

    return {
      success: true,
      code: 'OK',
      message: '移除购物车商品成功',
      data: {
        cartItemId
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('移除购物车商品失败:', error)
    throw error
  }
}

// 清空购物车
async function clearCart(userId) {
  try {
    // 批量更新购物车商品为删除状态
    await db.collection('cart')
      .where({
        userId,
        isDelete: 0
      })
      .update({
        data: {
          isDelete: 1,
          updatedAt: db.serverDate()
        }
      })

    return {
      success: true,
      code: 'OK',
      message: '清空购物车成功',
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('清空购物车失败:', error)
    throw error
  }
}

// 同步购物车（用于多设备同步）
async function syncCart(userId, cartItems) {
  try {
    if (!Array.isArray(cartItems)) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '购物车数据格式错误',
        timestamp: Date.now()
      }
    }

    // 清空现有购物车
    await clearCart(userId)

    // 重新添加购物车商品
    const syncResults = []

    for (const item of cartItems) {
      try {
        const result = await addToCart(userId, item.productId, item.quantity)
        if (result.success) {
          syncResults.push({
            productId: item.productId,
            success: true,
            quantity: item.quantity
          })
        } else {
          syncResults.push({
            productId: item.productId,
            success: false,
            errorMessage: result.errorMessage
          })
        }
      } catch (error) {
        syncResults.push({
          productId: item.productId,
          success: false,
          errorMessage: error.message
        })
      }
    }

    const successCount = syncResults.filter(r => r.success).length

    return {
      success: true,
      code: 'OK',
      message: `购物车同步完成，成功同步 ${successCount}/${cartItems.length} 件商品`,
      data: {
        syncResults,
        successCount,
        totalCount: cartItems.length
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('同步购物车失败:', error)
    throw error
  }
}