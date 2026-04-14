/**
 * 设计师需求大厅云函数
 * 支持操作：list / detail / accept / collect / uncollect / check_collect
 *
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型
 * @param {number} [event.page] - 页码，默认1（list 时使用）
 * @param {number} [event.pageSize] - 每页数量，默认20（list 时使用）
 * @param {string} [event.spaceType] - 空间类型筛选（list 时使用）
 * @param {string} [event.requestId] - 需求ID（detail / accept 时必填）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 需求分类映射
const CATEGORY_MAP = {
  residential: '住宅设计',
  commercial: '商业设计',
  office: '办公设计',
  hotel: '酒店设计',
  custom: '个性需求定制',
  selection: '选配服务',
  publish: '设计需求',
  optimize: '方案优化',
  full: '全案设计',
  light_experience: '光环境体验',
  site_survey: '现场勘测',
  design_consultation: '设计咨询',
  installation: '安装服务',
  other: '其他服务'
}

// 加急标签（7天内创建）
const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000
// 即将过期（超过30天仍 submitted）
const EXPIRE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  const { action } = event

  try {
    switch (action) {
      case 'list':
        return await listDemands(openid, event)
      case 'detail':
        return await getDemandDetail(openid, event.requestId)
      case 'accept':
        return await acceptDemand(openid, event.requestId)
      case 'collect':
        return await collectDemand(openid, event.requestId)
      case 'uncollect':
        return await uncollectDemand(openid, event.requestId)
      case 'check_collect':
        return await checkCollect(openid, event.requestId)
      case 'count':
        return await countDemands(openid, event)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作类型: ${action}` }
    }
  } catch (err) {
    console.error('[designer_demands] 操作失败:', err)
    if (err.message === 'NOT_DESIGNER') {
      return { success: false, code: 'NOT_DESIGNER', message: '当前账号不是设计师身份' }
    }
    if (err.message === 'USER_NOT_FOUND') {
      return { success: false, code: 'NOT_FOUND', message: '用户不存在，请先登录' }
    }
    return { success: false, code: 'SERVER_ERROR', message: err.message || '服务器错误' }
  }
}

/**
 * 验证用户为设计师，返回 user 和 designer
 */
async function verifyDesigner(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) throw new Error('USER_NOT_FOUND')
  const user = userRes.data[0]
  if (user.roles !== 2 && user.roles !== 0) throw new Error('NOT_DESIGNER')

  const designerRes = await db.collection('designers')
    .where(_.or([{ _openid: openid }, { openid: openid }]))
    .limit(1)
    .get()
  const designer = (designerRes.data && designerRes.data.length > 0) ? designerRes.data[0] : null
  return { user, designer }
}

/**
 * 为需求列表项添加计算标签字段
 */
function enrichDemand(item) {
  // 业主发布需求时，space/budget/area/service/stage 等字段嵌套在 params 中
  // 需要展平到顶层，前端直接读取顶层字段
  if (item.params && typeof item.params === 'object') {
    const p = item.params
    if (!item.space && p.space) item.space = p.space
    if (!item.budget && p.budget) item.budget = p.budget
    if (!item.area && p.area) item.area = p.area
    if (!item.service && p.service) item.service = p.service
    if (!item.stage && p.stage) item.stage = p.stage
    if (!item.share && p.share) item.share = p.share
    if (!item.coCreate && p.coCreate) item.coCreate = p.coCreate
    if (!item.note && p.note) item.note = p.note
  }

  // stage 字段修正：requests_create 默认设 stage='publish'，优先使用 params 中用户填的值
  if (item.stage === 'publish' && item.params && item.params.stage) {
    item.stage = item.params.stage
  }

  // 生成展示标题
  if (!item.title && item.space) {
    item.title = `${item.space}灯光设计需求`
  }

  const now = Date.now()
  const createdAt = item.createdAt || 0
  const age = now - createdAt

  const isNew = age < NEW_THRESHOLD_MS
  const isExpiringSoon = age > EXPIRE_THRESHOLD_MS

  // 优先级标签
  let tagType = ''
  let tagText = ''
  if (item.priority === 'urgent' || item.isUrgent) {
    tagType = 'urgent'
    tagText = '加急'
  } else if (isNew) {
    tagType = 'new'
    tagText = '新发布'
  } else if (isExpiringSoon) {
    tagType = 'expiring'
    tagText = '即将过期'
  }

  // 相对时间文本
  let timeText = ''
  const minutes = Math.floor(age / 60000)
  const hours = Math.floor(age / 3600000)
  const days = Math.floor(age / 86400000)
  if (minutes < 1) {
    timeText = '刚刚'
  } else if (minutes < 60) {
    timeText = `${minutes}分钟前`
  } else if (hours < 24) {
    timeText = `${hours}小时前`
  } else {
    timeText = `${days}天前发布`
  }

  // 预算格式化
  let budgetText = item.budget
  if (typeof item.budget === 'number') {
    budgetText = '¥' + item.budget.toLocaleString()
  }

  return {
    ...item,
    categoryText: CATEGORY_MAP[item.category] || item.category || '设计需求',
    isNew,
    isExpiringSoon,
    tagType,
    tagText,
    timeText,
    budget: budgetText
  }
}

/**
 * 轻量查询可接单需求总数（用于轮询检测新需求）
 */
async function countDemands(openid, event) {
  const condition = {
    status: 'submitted',
    isDelete: _.neq(1),
    designerId: _.exists(false)
  }
  const countRes = await db.collection('requests').where(condition).count()
  return {
    success: true,
    code: 'OK',
    data: { total: countRes.total || 0 }
  }
}

/**
 * 获取需求列表（可接单的，未被设计师接单）
 */
async function listDemands(openid, event) {
  const { page = 1, pageSize = 20, spaceType } = event

  await verifyDesigner(openid)

  // 构建查询条件
  const condition = {
    status: 'submitted',
    isDelete: _.neq(1),
    designerId: _.exists(false)
  }

  // 空间类型筛选（requests 集合用 space 字段）
  if (spaceType && spaceType !== 'all') {
    if (spaceType === 'other') {
      condition.space = _.nin(['住宅', '商业', '办公'])
    } else {
      condition.space = spaceType
    }
  }

  const countRes = await db.collection('requests').where(condition).count()
  const total = countRes.total || 0

  const skip = (page - 1) * pageSize
  const res = await db.collection('requests')
    .where(condition)
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .field({
      // 不返回客户敏感字段
      contact: false,
      _openid: false
    })
    .get()

  const list = (res.data || []).map(enrichDemand)

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: { list, total, page, pageSize, hasMore: skip + list.length < total }
  }
}

/**
 * 获取需求详情（不含客户联系方式）
 */
async function getDemandDetail(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少需求ID' }
  }

  await verifyDesigner(openid)

  let demand
  try {
    const res = await db.collection('requests').doc(requestId).get()
    demand = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '需求不存在' }
  }

  if (!demand || demand.isDelete === 1) {
    return { success: false, code: 'NOT_FOUND', message: '需求不存在或已删除' }
  }

  // 不返回客户联系方式
  const safeData = { ...demand }
  delete safeData.contact
  delete safeData._openid

  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: enrichDemand(safeData)
  }
}

/**
 * 接单（防并发：使用条件更新）
 */
async function acceptDemand(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少需求ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在，请先完善个人资料' }
  }

  // 先读取当前状态
  let demand
  try {
    const res = await db.collection('requests').doc(requestId).get()
    demand = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '需求不存在' }
  }

  if (!demand) {
    return { success: false, code: 'NOT_FOUND', message: '需求不存在' }
  }
  if (demand.isDelete === 1) {
    return { success: false, code: 'NOT_FOUND', message: '需求已下架' }
  }
  if (demand.status !== 'submitted') {
    if (demand.designerId === designer._id) {
      return { success: false, code: 'ALREADY_MINE', message: '您已接过此单' }
    }
    return { success: false, code: 'ALREADY_TAKEN', message: '该需求已被接单或已关闭' }
  }
  if (demand.designerId) {
    if (demand.designerId === designer._id) {
      return { success: false, code: 'ALREADY_MINE', message: '您已接过此单' }
    }
    return { success: false, code: 'ALREADY_TAKEN', message: '该需求已被其他设计师接单' }
  }

  const now = Date.now()

  // 条件更新：只有 status='submitted' 且 designerId 不存在时才成功（防并发）
  const updateResult = await db.collection('requests')
    .where({ _id: requestId, status: 'submitted', designerId: _.exists(false) })
    .update({
      data: {
        status: 'review',
        designerId: designer._id,
        designerOpenid: openid,
        acceptedAt: now,
        updatedAt: now
      }
    })

  if (!updateResult.stats || updateResult.stats.updated === 0) {
    return { success: false, code: 'ALREADY_TAKEN', message: '该需求刚刚被其他设计师接单，请选择其他需求' }
  }

  // 创建接单记录
  try {
    await db.collection('designer_orders').add({
      data: {
        _openid: openid,
        designerId: designer._id,
        requestId,
        requestOrderNo: demand.orderNo || '',
        clientOpenid: demand._openid || '',
        status: 'active',
        acceptedAt: now,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (err) {
    console.warn('[designer_demands] 创建接单记录失败:', err.message)
  }

  console.log(`[designer_demands] 接单成功: requestId=${requestId}, designerId=${designer._id}`)

  // 抢单成功后，清理该需求的所有 pending 邀请（标记为 conflict）
  try {
    const conflictResult = await db.collection('invitations').where({
      requestId,
      status: 'pending'
    }).update({
      data: { status: 'conflict', updatedAt: now }
    })
    if (conflictResult.stats && conflictResult.stats.updated > 0) {
      console.log(`[designer_demands] 已清理 ${conflictResult.stats.updated} 条 pending 邀请`)
    }
  } catch (conflictErr) {
    console.warn('[designer_demands] 清理邀请失败（非致命）:', conflictErr.message)
  }

  // 发送订阅消息通知业主：已接单
  try {
    let userOpenid = ''
    if (demand.userId) {
      try {
        const userRes = await db.collection('users').doc(demand.userId).field({ _openid: true }).get()
        userOpenid = (userRes.data && userRes.data._openid) || ''
      } catch (e) {
        console.warn('[designer_demands] 查询业主openid失败:', e.message)
      }
    }
    if (!userOpenid) {
      userOpenid = demand._openid || ''
    }
    if (userOpenid) {
      const orderNo = demand.orderNo || requestId
      const serviceName = (demand.params && demand.params.space) || demand.space || '灯光设计'
      const designerName = designer.name || designer.nickname || '设计师'
      const pad = n => (n < 10 ? '0' + n : '' + n)
      const d = new Date(now)
      const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

      await cloud.openapi.subscribeMessage.send({
        touser: userOpenid,
        templateId: 'bxor0x4ZJ_JoEnPct2ieOYRzGWrM2imsmrZtiX5NHE0',
        page: `pages/request/progress/progress?id=${orderNo}`,
        data: {
          character_string1: { value: String(orderNo) },
          short_thing12: { value: serviceName.slice(0, 10) },
          thing9: { value: designerName.slice(0, 20) },
          thing8: { value: '设计师已接单，将尽快与您联系' }
        }
      })
      console.log(`[designer_demands] 接单通知发送成功: touser=${userOpenid}`)
    } else {
      console.warn('[designer_demands] 无法获取业主openid，跳过发送接单通知')
    }
  } catch (msgErr) {
    console.warn('[designer_demands] 发送接单通知失败（非致命）:', msgErr.errCode, msgErr.errMsg || msgErr.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '接单成功！请及时联系客户',
    data: { requestId, designerId: designer._id, acceptedAt: now }
  }
}

/**
 * 收藏需求（幂等：已存在则直接返回成功）
 */
async function collectDemand(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少需求ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  const existing = await db.collection('designer_favorites')
    .where({ designerId: designer._id, requestId })
    .count()

  if (existing.total > 0) {
    return { success: true, code: 'OK', message: '已收藏', data: { requestId } }
  }

  await db.collection('designer_favorites').add({
    data: {
      _openid: openid,
      designerId: designer._id,
      requestId,
      createdAt: Date.now()
    }
  })

  return { success: true, code: 'OK', message: '收藏成功', data: { requestId } }
}

/**
 * 取消收藏需求
 */
async function uncollectDemand(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少需求ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  await db.collection('designer_favorites')
    .where({ designerId: designer._id, requestId })
    .remove()

  return { success: true, code: 'OK', message: '已取消收藏', data: { requestId } }
}

/**
 * 查询需求是否已收藏
 */
async function checkCollect(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少需求ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: true, code: 'OK', data: { isCollected: false } }
  }

  const res = await db.collection('designer_favorites')
    .where({ designerId: designer._id, requestId })
    .count()

  return {
    success: true,
    code: 'OK',
    message: '查询成功',
    data: { isCollected: res.total > 0 }
  }
}
