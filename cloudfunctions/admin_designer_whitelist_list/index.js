/**
 * 云函数：admin_designer_whitelist_list
 * 功能：分页查询设计师白名单，支持筛选和搜索
 * 权限：仅管理员
 * 
 * 入参：
 *   - limit: 每页数量，默认 20
 *   - offset: 偏移量，默认 0
 *   - status: 状态筛选（active/disabled/all），默认 all
 *   - phone: 手机号搜索（模糊匹配）
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - data: DesignerWhitelistRecord[]
 *   - total: 总数
 *   - stats: { totalCount, activeCount, disabledCount }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 手机号脱敏处理
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone
  return phone.substring(0, 3) + '****' + phone.substring(7)
}

/**
 * 格式化时间戳（自动转换为北京时间 UTC+8）
 */
function formatTime(ts) {
  if (!ts) return '-'
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
      phone
    } = event
    
    // 2. 构建查询条件
    const where = {}
    
    // 状态筛选
    if (status && status !== 'all') {
      where.status = status
    }
    
    // 手机号搜索（模糊匹配）
    if (phone) {
      where.phone = db.RegExp({
        regexp: phone.replace(/\*/g, ''),
        options: 'i'
      })
    }
    
    // 3. 查询统计数据
    const [totalRes, activeRes, disabledRes] = await Promise.all([
      db.collection('designer_whitelist').count(),
      db.collection('designer_whitelist').where({ status: 'active' }).count(),
      db.collection('designer_whitelist').where({ status: 'disabled' }).count()
    ])
    
    const totalCount = totalRes.total || 0
    const activeCount = activeRes.total || 0
    const disabledCount = disabledRes.total || 0
    
    // 4. 查询符合条件的总数
    const countRes = await db.collection('designer_whitelist')
      .where(where)
      .count()
    const filteredTotal = countRes.total || 0
    
    // 5. 分页查询数据
    const listRes = await db.collection('designer_whitelist')
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
      name: item.name || '',
      status: item.status,
      statusLabel: item.status === 'active' ? '启用' : '停用',
      remark: item.remark || '',
      createdAt: item.createdAt,
      createdAtDisplay: formatTime(item.createdAt),
      updatedAt: item.updatedAt,
      updatedAtDisplay: formatTime(item.updatedAt),
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
        activeCount,
        disabledCount
      },
      pagination: {
        limit,
        offset,
        hasMore: offset + data.length < filteredTotal
      }
    }
    
  } catch (err) {
    console.error('[admin_designer_whitelist_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
