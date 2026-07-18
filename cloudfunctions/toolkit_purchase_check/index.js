/**
 * 云函数：toolkit_purchase_check
 * 功能：检查用户是否有权限使用工具包
 * 权限来源：
 *   1. 直接购买工具包
 *   2. 购买课程（课程用户自动获得工具包使用权限）
 *   3. 通过工具包白名单激活
 *   4. 通过课程白名单激活（自动获得工具包权限）
 * 
 * 权限：公开（未登录返回 isPurchased: false）
 * 
 * 参数：
 * - toolkitId: 工具包 ID（可选，默认为 'TK_DEFAULT_001'）
 * 
 * 返回：
 * - success: true/false
 * - code: 'OK' | 'INVALID_PARAMS' | 'SERVER_ERROR'
 * - data: { isPurchased: boolean, purchasedAt?: Date, orderId?: string, source?: string }
 *   source 值说明：
 *   - 'toolkit_order': 直接购买工具包
 *   - 'course_order': 通过购买课程获得权限
 *   - 'toolkit_whitelist': 通过工具包白名单激活
 *   - 'course_whitelist': 通过课程白名单激活
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_TOOLKIT_ID = 'TK_DEFAULT_001'

function normalizeId(value) {
  return String(value || '').trim().toLowerCase()
}

function buildToolkitAliasSet(toolkitId) {
  const ids = new Set()
  const add = (value) => {
    const normalized = normalizeId(value)
    if (!normalized) return
    ids.add(normalized)
    ids.add(normalized.replace(/^vp_/, ''))
    ids.add(`vp_${normalized}`)
  }

  add(toolkitId)
  add(DEFAULT_TOOLKIT_ID)
  add('toolkit')

  return ids
}

function isToolkitItem(item = {}, order = {}, toolkitAliases) {
  const idFields = [
    item.id,
    item.productId,
    item.toolkitId,
    item._id,
    order.toolkitId,
    order.productId
  ].map(normalizeId).filter(Boolean)

  if (idFields.some(id => toolkitAliases.has(id))) return true

  const category = normalizeId(item.category || order.category)
  const type = normalizeId(item.type || order.type)
  if (category === 'toolkit' || type === 'toolkit') return true

  if (idFields.some(id => id.startsWith('tk') || id.includes('toolkit') || id.includes('tk_default_001'))) {
    return true
  }

  const name = String(item.name || item.title || order.title || order.name || '').toLowerCase()
  return name.includes('工具包') || name.includes('toolkit')
}

async function queryPaidOrdersByUser(openid) {
  const paidStatus = _.in(['paid', 'completed'])
  const baseQuery = {
    status: paidStatus,
    isDelete: _.neq(1)
  }
  const pageSize = 100
  const maxPages = 10
  const byId = new Map()

  const fetchPage = (field, offset) => db.collection('orders')
    .where({ ...baseQuery, [field]: openid })
    .field({
      _id: true,
      orderNo: true,
      userId: true,
      _openid: true,
      paidAt: true,
      createdAt: true,
      params: true,
      items: true,
      category: true,
      type: true,
      toolkitId: true,
      productId: true,
      source: true
    })
    .skip(offset)
    .limit(pageSize)
    .get()

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize
    const [openidRes, userIdRes] = await Promise.all([
      fetchPage('_openid', offset),
      fetchPage('userId', offset)
    ])

    const batch = [...(openidRes.data || []), ...(userIdRes.data || [])]
    batch.forEach(order => {
      const key = order._id || order.orderNo
      if (key && !byId.has(key)) byId.set(key, order)
    })

    if ((openidRes.data || []).length < pageSize && (userIdRes.data || []).length < pageSize) {
      break
    }
  }

  return Array.from(byId.values())
}

exports.main = async (event) => {
  const startTime = Date.now()
  
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    
    const { toolkitId = DEFAULT_TOOLKIT_ID } = event
    const toolkitAliases = buildToolkitAliasSet(toolkitId)
    
    console.log('[toolkit_purchase_check] 开始检查权限:', {
      OPENID: OPENID ? `${OPENID.substring(0, 10)}...` : 'null',
      toolkitId
    })
    
    // 1. 如果用户未登录，直接返回未购买
    if (!OPENID) {
      console.log('[toolkit_purchase_check] 用户未登录，返回未购买')
      return {
        success: true,
        code: 'OK',
        data: { isPurchased: false },
        message: '用户未登录'
      }
    }
    
    // 2. 查询用户已支付订单，再在订单明细里识别工具包。
    // 不能先限定 category='toolkit'：照度页和部分商城路径曾把工具包订单写成 mall/goods。
    const paidOrders = await queryPaidOrdersByUser(OPENID)
    
    console.log('[toolkit_purchase_check] 查询已支付订单数量:', paidOrders.length)
    
    // 打印订单摘要用于调试，避免把地址等订单参数写入日志。
    if (paidOrders.length > 0) {
      console.log('[toolkit_purchase_check] 已支付订单摘要:', paidOrders.map(order => ({
        orderNo: order.orderNo,
        category: order.category,
        type: order.type,
        itemCount: (((order.params || {}).items) || order.items || []).length
      })))
    }
    
    // 3. 检查订单中是否包含目标工具包
    for (const order of paidOrders) {
      // 获取订单商品列表（兼容不同数据结构）
      const items = (order.params && order.params.items) || order.items || []
      
      for (const item of items) {
        if (isToolkitItem(item, order, toolkitAliases)) {
          const purchasedAt = order.paidAt || order.createdAt
          const orderId = order.orderNo || order._id
          
          // 判断权限来源：工具包订单还是工具包白名单
          const source = order.source === 'whitelist' ? 'toolkit_whitelist' : 'toolkit_order'
          
          console.log('[toolkit_purchase_check] 找到已购买订单:', {
            orderId,
            purchasedAt,
            source,
            耗时: Date.now() - startTime + 'ms'
          })
          
          return {
            success: true,
            code: 'OK',
            data: {
              isPurchased: true,
              purchasedAt,
              orderId,
              source
            },
            message: source === 'toolkit_whitelist' 
              ? '用户通过工具包白名单获得使用权限' 
              : '用户已购买工具包'
          }
        }
      }
      
      // 如果订单本身就是工具包（没有 items 的情况）
      if (items.length === 0 && isToolkitItem({}, order, toolkitAliases)) {
        const purchasedAt = order.paidAt || order.createdAt
        const orderId = order.orderNo || order._id
        
        // 判断权限来源
        const source = order.source === 'whitelist' ? 'toolkit_whitelist' : 'toolkit_order'
        
        console.log('[toolkit_purchase_check] 找到工具包订单（无items）:', {
          orderId,
          purchasedAt,
          source,
          耗时: Date.now() - startTime + 'ms'
        })
        
        return {
          success: true,
          code: 'OK',
          data: {
            isPurchased: true,
            purchasedAt,
            orderId,
            source
          },
          message: source === 'toolkit_whitelist' 
            ? '用户通过工具包白名单获得使用权限' 
            : '用户已购买工具包'
        }
      }
    }
    
    // 4. 检查用户是否购买了课程（课程用户自动获得工具包使用权限）
    // 根据业务规则：购买课程可以使用工具包
    console.log('[toolkit_purchase_check] 开始检查课程订单...')
    
    const courseOrdersRes = await db.collection('orders')
      .where({
        _openid: OPENID,
        category: 'course',
        status: _.in(['paid', 'completed']),
        isDelete: _.neq(1)
      })
      .field({
        _id: true,
        orderNo: true,
        paidAt: true,
        createdAt: true,
        source: true // 用于识别是否来自白名单
      })
      .limit(1)  // 只需要检查是否存在，查一条即可
      .get()
    
    console.log('[toolkit_purchase_check] 查询课程订单数量:', courseOrdersRes.data.length)
    
    if (courseOrdersRes.data.length > 0) {
      const courseOrder = courseOrdersRes.data[0]
      const purchasedAt = courseOrder.paidAt || courseOrder.createdAt
      const orderId = courseOrder.orderNo || courseOrder._id
      
      // 判断权限来源：课程订单还是课程白名单
      const source = courseOrder.source === 'whitelist' ? 'course_whitelist' : 'course_order'
      
      console.log('[toolkit_purchase_check] 用户有课程权限，自动获得工具包使用权:', {
        orderId,
        purchasedAt,
        source,
        耗时: Date.now() - startTime + 'ms'
      })
      
      return {
        success: true,
        code: 'OK',
        data: {
          isPurchased: true,
          purchasedAt,
          orderId,
          source
        },
        message: source === 'course_whitelist' 
          ? '用户通过课程白名单获得工具包使用权限' 
          : '用户通过购买课程获得工具包使用权限'
      }
    }
    
    // 5. 未找到任何匹配的订单，返回未购买
    console.log('[toolkit_purchase_check] 未找到购买记录，返回未购买, 耗时:', Date.now() - startTime + 'ms')
    
    return {
      success: true,
      code: 'OK',
      data: { isPurchased: false },
      message: '用户未购买工具包'
    }
    
  } catch (err) {
    console.error('[toolkit_purchase_check] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误',
      data: { isPurchased: false }
    }
  }
}

