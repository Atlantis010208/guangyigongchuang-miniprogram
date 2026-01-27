/**
 * 云函数：admin_toolkit_whitelist_list
 * 功能：分页查询工具包白名单，支持筛选和搜索
 * 权限：仅管理员
 * 
 * 入参：
 *   - limit: 每页数量，默认 20
 *   - offset: 偏移量，默认 0
 *   - status: 状态筛选（pending/activated/all），默认 all
 *   - phone: 手机号搜索（模糊匹配）
 *   - source: 来源筛选
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - data: ToolkitWhitelistRecord[]
 *   - total: 总数
 *   - stats: { totalCount, pendingCount, activatedCount, activationRate }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 手机号脱敏处理
 * @param {string} phone 手机号
 * @returns {string} 脱敏后的手机号（如 138****5678）
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone
  return phone.substring(0, 3) + '****' + phone.substring(7)
}

/**
 * 格式化时间戳（自动转换为北京时间 UTC+8）
 * @param {number} ts 时间戳
 * @returns {string} 格式化后的时间
 */
function formatTime(ts) {
  if (!ts) return '-'
  // 云函数服务器使用 UTC 时区，需要手动转换为北京时间（UTC+8）
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  try {
    // 1. 验证管理员权限
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      status = 'all',
      phone,
      source
    } = event
    
    // 2. 构建查询条件
    const where = {}
    
    // 状态筛选
    if (status && status !== 'all') {
      where.status = status
    }
    
    // 来源筛选
    if (source) {
      where.source = source
    }
    
    // 手机号搜索（模糊匹配）
    if (phone) {
      where.phone = db.RegExp({
        regexp: phone.replace(/\*/g, ''),
        options: 'i'
      })
    }
    
    // 3. 查询统计数据
    const [totalRes, pendingRes, activatedRes] = await Promise.all([
      db.collection('toolkit_whitelist').count(),
      db.collection('toolkit_whitelist').where({ status: 'pending' }).count(),
      db.collection('toolkit_whitelist').where({ status: 'activated' }).count()
    ])
    
    const totalCount = totalRes.total || 0
    const pendingCount = pendingRes.total || 0
    const activatedCount = activatedRes.total || 0
    const activationRate = totalCount > 0 
      ? ((activatedCount / totalCount) * 100).toFixed(1) 
      : '0.0'
    
    // 4. 查询符合条件的总数
    const countRes = await db.collection('toolkit_whitelist')
      .where(where)
      .count()
    const filteredTotal = countRes.total || 0
    
    // 5. 分页查询数据
    const listRes = await db.collection('toolkit_whitelist')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 6. 格式化数据
    const data = listRes.data.map(item => ({
      _id: item._id,
      phone: item.phone,
      phoneDisplay: maskPhone(item.phone),
      toolkitId: item.toolkitId,
      toolkitName: item.toolkitName || '灯光设计工具包',
      status: item.status,
      statusLabel: item.status === 'activated' ? '已激活' : '待激活',
      source: item.source || '-',
      activatedAt: item.activatedAt,
      activatedAtDisplay: formatTime(item.activatedAt),
      activatedUserId: item.activatedUserId,
      orderId: item.orderId,
      orderNo: item.orderNo,
      createdAt: item.createdAt,
      createdAtDisplay: formatTime(item.createdAt),
      createdBy: item.createdBy
    }))
    
    // 7. 返回结果
    return {
      success: true,
      code: 'OK',
      data,
      total: filteredTotal,
      stats: {
        totalCount,
        pendingCount,
        activatedCount,
        activationRate
      },
      pagination: {
        limit,
        offset,
        hasMore: offset + data.length < filteredTotal
      }
    }
    
  } catch (err) {
    console.error('[admin_toolkit_whitelist_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
