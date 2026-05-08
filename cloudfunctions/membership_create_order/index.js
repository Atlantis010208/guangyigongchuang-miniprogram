/**
 * 云函数：membership_create_order
 *
 * 职责：
 * 1. 校验 skuId 合法性（必须在 MEMBERSHIP_SKUS 表内）
 * 2. 从硬编码 SKU 表读取价格（前端无法篡改）
 * 3. 创建 orders 文档（category='membership'，订单号 M 开头）
 * 4. 返回 orderNo 供前端调用 wxpayFunctions.wxpay_order 发起支付
 *
 * 配套文档：specs/membership_center/design.md §4.2
 */
const cloud = require('wx-server-sdk')
const { MEMBERSHIP_SKUS } = require('./sku')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/**
 * 生成会员订单号（M 开头，区别于普通订单 O / 押金订单 DEP）
 */
function generateOrderNo() {
  const ts = Date.now()
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `M${ts}${rand}`
}

/**
 * 确保 orders 集合存在
 */
async function ensureOrdersCollection() {
  try {
    await db.collection('orders').count()
  } catch (e) {
    const isMissing = e && (e.errCode === -502005 || (e.message || '').indexOf('collection not exists') !== -1)
    if (isMissing) {
      try { await db.createCollection('orders') } catch (_) {}
    } else {
      throw e
    }
  }
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid

    // 1. 鉴权
    if (!OPENID) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        errorMessage: '请先登录后再开通会员'
      }
    }

    // 2. 校验 skuId
    const { skuId } = event || {}
    if (!skuId || typeof skuId !== 'string') {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少 skuId 参数'
      }
    }

    const sku = MEMBERSHIP_SKUS[skuId]
    if (!sku) {
      console.warn('[membership_create_order] 非法 skuId:', skuId)
      return {
        success: false,
        code: 'INVALID_SKU',
        errorMessage: 'SKU 不存在或已下架'
      }
    }

    // 3. 创建订单
    await ensureOrdersCollection()

    const orderNo = generateOrderNo()
    const now = Date.now()

    const orderDoc = {
      orderNo,
      userId: OPENID, // 与现有 wxpay_order 校验逻辑一致（按 userId 查询）
      _openid: OPENID,
      category: 'membership',
      skuId: sku.skuId,
      params: {
        totalAmount: sku.price, // 单位：元
        items: [
          {
            id: sku.skuId,
            name: sku.name,
            price: sku.price,
            quantity: 1,
            category: 'membership',
            skuId: sku.skuId,
            duration: sku.durationDays,
            targetLevel: sku.targetLevel
          }
        ]
      },
      status: 'pending_payment',
      paid: false,
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }

    const addRes = await db.collection('orders').add({ data: orderDoc })

    console.log('[membership_create_order] 订单创建成功:', {
      orderNo,
      _id: addRes._id,
      skuId: sku.skuId,
      amount: sku.price,
      OPENID: `${OPENID.substring(0, 10)}***`
    })

    return {
      success: true,
      code: 'OK',
      data: {
        orderNo,
        amount: sku.price,
        skuId: sku.skuId,
        skuName: sku.name,
        durationDays: sku.durationDays
      }
    }
  } catch (err) {
    console.error('[membership_create_order] 异常:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: (err && err.message) || '创建会员订单失败'
    }
  }
}
