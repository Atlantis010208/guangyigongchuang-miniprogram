/**
 * 收据管理云函数
 * 支持操作：list（获取列表）、detail（获取详情）、delete（删除）、export（导出）
 * 
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：list / detail / delete / export
 * @param {string} [event.receiptId] - 收据ID（detail、delete 时必填）
 * @param {number} [event.page] - 页码，默认1（list 时使用）
 * @param {number} [event.pageSize] - 每页数量，默认20（list 时使用）
 * @param {string} [event.startDate] - 开始日期筛选（list 时使用）
 * @param {string} [event.endDate] - 结束日期筛选（list 时使用）
 * @param {string} [event.keyword] - 关键词搜索（list 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 收据类型定义
const RECEIPT_TYPES = {
  purchase: { text: '购买', icon: 'shopping' },
  service: { text: '服务', icon: 'service' },
  subscription: { text: '订阅', icon: 'subscription' },
  refund: { text: '退款', icon: 'refund' },
  other: { text: '其他', icon: 'other' }
}

// 收据状态定义
const RECEIPT_STATUS = {
  normal: { text: '正常', color: '#34c759' },
  cancelled: { text: '已作废', color: '#8e8e93' },
  refunded: { text: '已退款', color: '#ff9500' }
}

exports.main = async (event, context) => {
  // 获取用户身份
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: '用户身份验证失败'
    }
  }

  // 获取用户ID
  const userId = await getUserId(openid)
  
  const { action } = event

  try {
    switch (action) {
      case 'list':
        return await getReceiptList(userId, openid, event)
      case 'detail':
        return await getReceiptDetail(userId, openid, event)
      case 'delete':
        return await deleteReceipt(userId, openid, event)
      case 'export':
        return await exportReceipts(userId, openid, event)
      case 'stats':
        return await getReceiptStats(userId, openid, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('收据操作失败:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务器错误'
    }
  }
}

/**
 * 获取用户ID
 * @param {string} openid - 用户openid
 * @returns {string} 用户ID
 */
async function getUserId(openid) {
  try {
    const usersCol = db.collection('users')
    const res = await usersCol.where({ _openid: openid }).limit(1).get()
    if (res.data && res.data.length > 0) {
      return res.data[0]._id
    }
    return ''
  } catch (err) {
    console.error('获取用户ID失败:', err)
    return ''
  }
}

/**
 * 获取收据列表
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 收据列表
 */
async function getReceiptList(userId, openid, event) {
  const { page = 1, pageSize = 20, startDate, endDate, keyword, type } = event
  
  await ensureCollection('receipts')
  
  const col = db.collection('receipts')
  
  // 构建查询条件
  let conditions = []
  
  // 用户归属条件
  if (userId) {
    conditions.push(_.or([
      { userId: userId },
      { _openid: openid }
    ]))
  } else {
    conditions.push({ _openid: openid })
  }
  
  // 不查询已删除的记录
  conditions.push(_.or([
    { isDeleted: _.neq(true) },
    { isDeleted: _.exists(false) }
  ]))
  
  // 日期范围筛选
  if (startDate) {
    conditions.push({ createdAt: _.gte(new Date(startDate).getTime()) })
  }
  if (endDate) {
    // 结束日期加一天，包含当天
    const endTime = new Date(endDate)
    endTime.setDate(endTime.getDate() + 1)
    conditions.push({ createdAt: _.lt(endTime.getTime()) })
  }
  
  // 类型筛选
  if (type && RECEIPT_TYPES[type]) {
    conditions.push({ type: type })
  }
  
  // 关键词搜索（标题或订单号）
  if (keyword) {
    conditions.push(_.or([
      { title: db.RegExp({ regexp: keyword, options: 'i' }) },
      { orderNo: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }
  
  // 组合查询条件
  const whereCondition = conditions.length > 0 ? _.and(conditions) : {}
  
  // 查询总数
  const countRes = await col.where(whereCondition).count()
  const total = countRes.total || 0
  
  // 分页查询
  const skip = (page - 1) * pageSize
  const res = await col
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()
  
  // 处理收据数据
  const receipts = (res.data || []).map(item => formatReceipt(item))
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: {
      list: receipts,
      total,
      page,
      pageSize,
      hasMore: skip + receipts.length < total
    }
  }
}

/**
 * 获取收据详情
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 收据详情
 */
async function getReceiptDetail(userId, openid, event) {
  const { receiptId } = event
  
  if (!receiptId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少收据ID'
    }
  }
  
  const col = db.collection('receipts')
  
  // 尝试通过 _id 查询
  let res
  try {
    res = await col.doc(receiptId).get()
  } catch (err) {
    // 如果 doc 查询失败，尝试用 where 查询
    const whereRes = await col.where({ 
      _id: receiptId,
      _openid: openid 
    }).limit(1).get()
    
    if (whereRes.data && whereRes.data.length > 0) {
      res = { data: whereRes.data[0] }
    }
  }
  
  if (!res || !res.data) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '收据不存在'
    }
  }
  
  const receipt = res.data
  
  // 验证归属权
  const isOwner = receipt.userId === userId || receipt._openid === openid
  if (!isOwner) {
    return {
      success: false,
      code: 'FORBIDDEN',
      message: '无权查看此收据'
    }
  }
  
  // 检查是否已删除
  if (receipt.isDeleted) {
    return {
      success: false,
      code: 'DELETED',
      message: '收据已删除'
    }
  }
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: formatReceipt(receipt, true)
  }
}

/**
 * 删除收据（软删除）
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function deleteReceipt(userId, openid, event) {
  const { receiptId } = event
  
  if (!receiptId) {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少收据ID'
    }
  }
  
  const col = db.collection('receipts')
  
  // 查询收据
  const res = await col.doc(receiptId).get()
  
  if (!res.data) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: '收据不存在'
    }
  }
  
  const receipt = res.data
  
  // 验证归属权
  const isOwner = receipt.userId === userId || receipt._openid === openid
  if (!isOwner) {
    return {
      success: false,
      code: 'FORBIDDEN',
      message: '无权删除此收据'
    }
  }
  
  // 软删除
  await col.doc(receiptId).update({
    data: {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  
  console.log(`收据已删除: ${receiptId}, 用户: ${openid}`)
  
  return {
    success: true,
    code: 'OK',
    message: '删除成功'
  }
}

/**
 * 导出收据（生成汇总数据）
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 导出数据
 */
async function exportReceipts(userId, openid, event) {
  const { startDate, endDate, format = 'json' } = event
  
  const col = db.collection('receipts')
  
  // 构建查询条件
  let conditions = []
  
  if (userId) {
    conditions.push(_.or([
      { userId: userId },
      { _openid: openid }
    ]))
  } else {
    conditions.push({ _openid: openid })
  }
  
  conditions.push(_.or([
    { isDeleted: _.neq(true) },
    { isDeleted: _.exists(false) }
  ]))
  
  if (startDate) {
    conditions.push({ createdAt: _.gte(new Date(startDate).getTime()) })
  }
  if (endDate) {
    const endTime = new Date(endDate)
    endTime.setDate(endTime.getDate() + 1)
    conditions.push({ createdAt: _.lt(endTime.getTime()) })
  }
  
  const whereCondition = conditions.length > 0 ? _.and(conditions) : {}
  
  // 获取所有符合条件的收据（最多1000条）
  const res = await col
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get()
  
  const receipts = res.data || []
  
  // 计算统计数据
  let totalAmount = 0
  let refundAmount = 0
  const typeStats = {}
  
  receipts.forEach(item => {
    const amount = parseFloat(item.amount) || 0
    
    if (item.status === 'refunded') {
      refundAmount += amount
    } else if (item.status !== 'cancelled') {
      totalAmount += amount
    }
    
    const type = item.type || 'other'
    if (!typeStats[type]) {
      typeStats[type] = { count: 0, amount: 0 }
    }
    typeStats[type].count++
    if (item.status !== 'cancelled' && item.status !== 'refunded') {
      typeStats[type].amount += amount
    }
  })
  
  return {
    success: true,
    code: 'OK',
    message: '导出成功',
    data: {
      receipts: receipts.map(item => formatReceipt(item)),
      summary: {
        totalCount: receipts.length,
        totalAmount: totalAmount.toFixed(2),
        refundAmount: refundAmount.toFixed(2),
        netAmount: (totalAmount - refundAmount).toFixed(2),
        typeStats,
        dateRange: {
          start: startDate || '不限',
          end: endDate || '不限'
        }
      }
    }
  }
}

/**
 * 获取收据统计
 * @param {string} userId - 用户ID
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 统计数据
 */
async function getReceiptStats(userId, openid, event) {
  const { year, month } = event
  
  const col = db.collection('receipts')
  
  // 构建查询条件
  let conditions = []
  
  if (userId) {
    conditions.push(_.or([
      { userId: userId },
      { _openid: openid }
    ]))
  } else {
    conditions.push({ _openid: openid })
  }
  
  conditions.push(_.or([
    { isDeleted: _.neq(true) },
    { isDeleted: _.exists(false) }
  ]))
  
  // 时间筛选
  if (year) {
    const startTime = new Date(year, month ? month - 1 : 0, 1).getTime()
    const endTime = month 
      ? new Date(year, month, 0, 23, 59, 59).getTime()
      : new Date(year, 11, 31, 23, 59, 59).getTime()
    
    conditions.push({ createdAt: _.gte(startTime) })
    conditions.push({ createdAt: _.lte(endTime) })
  }
  
  const whereCondition = conditions.length > 0 ? _.and(conditions) : {}
  
  // 获取数据
  const res = await col.where(whereCondition).get()
  const receipts = res.data || []
  
  // 统计
  let totalAmount = 0
  let totalCount = 0
  const monthlyStats = {}
  
  receipts.forEach(item => {
    if (item.status !== 'cancelled') {
      const amount = parseFloat(item.amount) || 0
      totalAmount += item.status === 'refunded' ? -amount : amount
      totalCount++
      
      // 按月统计
      const date = new Date(item.createdAt)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { count: 0, amount: 0 }
      }
      monthlyStats[monthKey].count++
      monthlyStats[monthKey].amount += item.status === 'refunded' ? -amount : amount
    }
  })
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: {
      totalCount,
      totalAmount: totalAmount.toFixed(2),
      monthlyStats
    }
  }
}

/**
 * 格式化收据数据
 * @param {object} receipt - 原始收据数据
 * @param {boolean} includeDetail - 是否包含详细信息
 * @returns {object} 格式化后的收据
 */
function formatReceipt(receipt, includeDetail = false) {
  const type = receipt.type || 'other'
  const status = receipt.status || 'normal'
  
  const formatted = {
    id: receipt._id,
    title: receipt.title || '收据',
    amount: receipt.amount || '0.00',
    date: formatDate(receipt.createdAt || receipt.date),
    type,
    typeText: RECEIPT_TYPES[type]?.text || '其他',
    status,
    statusText: RECEIPT_STATUS[status]?.text || '正常',
    statusColor: RECEIPT_STATUS[status]?.color || '#34c759',
    orderNo: receipt.orderNo || ''
  }
  
  if (includeDetail) {
    formatted.items = receipt.items || []
    formatted.paymentMethod = receipt.paymentMethod || '未知'
    formatted.remark = receipt.remark || ''
    formatted.storeName = receipt.storeName || ''
    formatted.storeAddress = receipt.storeAddress || ''
    formatted.createdAt = receipt.createdAt
    formatted.updatedAt = receipt.updatedAt
  }
  
  return formatted
}

/**
 * 格式化日期
 * @param {number|string|Date} timestamp - 时间戳或日期
 * @returns {string} 格式化的日期字符串
 */
function formatDate(timestamp) {
  if (!timestamp) return ''
  
  // 如果已经是格式化的字符串
  if (typeof timestamp === 'string' && timestamp.includes('-')) {
    return timestamp
  }
  
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return ''
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}`
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
