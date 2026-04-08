/**
 * 设计师我的项目管理云函数
 * 支持操作：list（项目列表）、detail（项目详情）、update_step（更新工作流阶段）
 *
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：list / detail / update_step
 * @param {number} [event.page] - 页码，默认1（list 时使用）
 * @param {number} [event.pageSize] - 每页数量，默认20（list 时使用）
 * @param {string} [event.statusFilter] - 状态筛选：all/ongoing/completed（list 时使用）
 * @param {string} [event.requestId] - 需求ID（detail / update_step 时必填）
 * @param {string} [event.stepKey] - 步骤 key（update_step 时必填）
 * @param {boolean} [event.done] - 步骤完成状态（update_step 时必填）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 前端 tab → 数据库 status 映射
const STATUS_FILTER_MAP = {
  all: null,
  ongoing: 'review',
  pending: 'pending',
  design: 'design',
  completed: 'done'
}

// 状态文本映射
const STATUS_TEXT_MAP = {
  submitted: '待接单',
  review: '进行中',
  pending: '待确认',
  design: '设计中',
  verifying: '待验收',
  done: '已完成',
  completed: '已完成',
  cancelled: '已取消'
}

// 分类名称映射
const CATEGORY_MAP = {
  residential: '住宅设计', commercial: '商业设计', office: '办公设计',
  hotel: '酒店设计', custom: '个性需求定制', selection: '选配服务',
  publish: '设计需求', optimize: '方案优化', full: '全案设计',
  light_experience: '光环境体验', site_survey: '现场勘测',
  design_consultation: '设计咨询', installation: '安装服务', other: '其他服务'
}

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
        return await listProjects(openid, event)
      case 'detail':
        return await getProjectDetail(openid, event.requestId)
      case 'update_step':
        return await updateProjectStep(openid, event.requestId, event.stepKey, event.done)
      case 'submit_verify':
        return await submitVerify(openid, event.requestId)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作类型: ${action}` }
    }
  } catch (err) {
    console.error('[designer_projects] 操作失败:', err)
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
 * 为项目添加展示字段
 */
function enrichProject(item) {
  // 展平 params
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

  // 修正 stage
  if (item.stage === 'publish' && item.params && item.params.stage) {
    item.stage = item.params.stage
  }

  // 生成 title
  if (!item.title) {
    if (item.space) {
      item.title = `${item.space}灯光设计方案`
    } else {
      item.title = '灯光设计方案'
    }
  }

  // 提取客户信息
  let clientInfo = null
  if (item.userNickname || item.userPhone) {
    clientInfo = {
      nickname: item.userNickname || '客户',
      phone: item.userPhone || ''
    }
  } else if (item.contact) {
    clientInfo = {
      nickname: item.contact.name || '客户',
      phone: item.contact.phone || ''
    }
  }

  // 计算进度
  let progress = 0
  let currentStepText = '已提交'
  if (item.steps && Array.isArray(item.steps) && item.steps.length > 0) {
    const total = item.steps.length
    const doneCount = item.steps.filter(s => s.done).length
    progress = Math.round((doneCount / total) * 100)
    
    // 寻找最后一个 done 的 step，或者第一个没 done 的
    for (let i = item.steps.length - 1; i >= 0; i--) {
      if (item.steps[i].done) {
        currentStepText = item.steps[i].label
        break
      }
    }
  }

  // 时间格式化
  const now = Date.now()
  const updatedAt = item.updatedAt || item.createdAt || now
  const age = now - updatedAt
  let timeText = ''
  
  const minutes = Math.floor(age / 60000)
  const hours = Math.floor(age / 3600000)
  const days = Math.floor(age / 86400000)
  
  if (minutes < 1) {
    timeText = '刚刚更新'
  } else if (minutes < 60) {
    timeText = `${minutes}分钟前更新`
  } else if (hours < 24) {
    timeText = `${hours}小时前更新`
  } else if (days === 1) {
    timeText = '昨天更新'
  } else if (days < 30) {
    timeText = `${days}天前更新`
  } else {
    const date = new Date(updatedAt)
    timeText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return {
    ...item,
    clientInfo,
    progress,
    currentStepText,
    timeText,
    statusText: STATUS_TEXT_MAP[item.status] || item.status || '未知',
    categoryText: CATEGORY_MAP[item.category] || item.category || '设计需求'
  }
}

/**
 * 获取设计师已接项目列表
 */
async function listProjects(openid, event) {
  const { page = 1, pageSize = 20, statusFilter = 'all' } = event

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return {
      success: true, code: 'OK', message: '获取成功',
      data: { list: [], total: 0, page, pageSize, hasMore: false }
    }
  }

  // 构建查询条件
  const condition = {
    designerId: designer._id,
    isDelete: _.neq(1)
  }

  const dbStatus = STATUS_FILTER_MAP[statusFilter]
  if (dbStatus) {
    if (statusFilter === 'ongoing') {
      // 进行中包含 review 和 design 两个状态
      condition.status = _.in(['review', 'design'])
    } else {
      condition.status = dbStatus
    }
  }

  const countRes = await db.collection('requests').where(condition).count()
  const total = countRes.total || 0

  const skip = (page - 1) * pageSize
  const res = await db.collection('requests')
    .where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .field({
      // 列表不返回完整联系方式，只返回展示所需字段
      _openid: false
    })
    .get()

  const list = (res.data || []).map(enrichProject)

  return {
    success: true, code: 'OK', message: '获取成功',
    data: { list, total, page, pageSize, hasMore: skip + list.length < total }
  }
}

/**
 * 获取项目详情（含客户联系方式）
 */
async function getProjectDetail(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少项目ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  let demand
  try {
    const res = await db.collection('requests').doc(requestId).get()
    demand = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '项目不存在' }
  }

  if (!demand) {
    return { success: false, code: 'NOT_FOUND', message: '项目不存在' }
  }

  // 验证归属：只有接单的设计师可查看详情
  if (demand.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权查看此项目' }
  }

  return {
    success: true, code: 'OK', message: '获取成功',
    data: enrichProject(demand)
  }
}

/**
 * 更新项目工作流阶段
 */
async function updateProjectStep(openid, requestId, stepKey, done) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少项目ID' }
  }
  if (!stepKey) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少步骤key' }
  }
  if (typeof done !== 'boolean') {
    return { success: false, code: 'MISSING_PARAM', message: 'done 字段必须为布尔值' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  let demand
  try {
    const res = await db.collection('requests').doc(requestId).get()
    demand = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '项目不存在' }
  }

  if (!demand || demand.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此项目' }
  }

  // 更新 steps 数组中对应的步骤
  const steps = Array.isArray(demand.steps) ? [...demand.steps] : []
  const stepIndex = steps.findIndex(s => s.key === stepKey)

  if (stepIndex === -1) {
    return { success: false, code: 'NOT_FOUND', message: `步骤 ${stepKey} 不存在` }
  }

  steps[stepIndex] = { ...steps[stepIndex], done, updatedAt: Date.now() }

  const now = Date.now()
  const updateData = { steps, updatedAt: now }

  // 判断所有步骤是否均已完成
  const allDone = steps.every(s => s.done === true)
  if (allDone && demand.status !== 'done') {
    updateData.status = 'done'
    updateData.completedAt = now
  }

  await db.collection('requests').doc(requestId).update({ data: updateData })

  // 若项目自动标记为完成，更新设计师完成项目计数
  if (allDone && demand.status !== 'done') {
    try {
      await db.collection('designers').doc(designer._id).update({
        data: { projects: _.inc(1), updatedAt: now }
      })
      // 同步更新 designer_orders 记录状态
      await db.collection('designer_orders')
        .where({ requestId, designerId: designer._id })
        .update({ data: { status: 'completed', completedAt: now, updatedAt: now } })
    } catch (err) {
      console.warn('[designer_projects] 更新完成计数失败:', err.message)
    }
  }

  return {
    success: true, code: 'OK', message: done ? '步骤已完成' : '步骤已重置',
    data: { steps, allDone, status: updateData.status || demand.status }
  }
}

/**
 * 设计师提交验收
 */
async function submitVerify(openid, requestId) {
  if (!requestId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少项目ID' }
  }

  const { designer } = await verifyDesigner(openid)
  if (!designer) {
    return { success: false, code: 'NOT_FOUND', message: '设计师档案不存在' }
  }

  let demand
  try {
    const res = await db.collection('requests').doc(requestId).get()
    demand = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '项目不存在' }
  }

  if (!demand || demand.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此项目' }
  }

  if (demand.status !== 'review' && demand.status !== 'design') {
    return { success: false, code: 'INVALID_STATUS', message: '当前项目状态不允许提交验收' }
  }

  if (demand.designerConfirmed === true) {
    return { success: false, code: 'ALREADY_SUBMITTED', message: '已提交验收，请勿重复操作' }
  }

  const now = Date.now()
  await db.collection('requests').doc(requestId).update({
    data: {
      status: 'verifying',
      designerConfirmed: true,
      verifySubmittedAt: now,
      updatedAt: now
    }
  })

  // 同步更新 designer_orders 记录
  try {
    await db.collection('designer_orders')
      .where({ requestId, designerId: designer._id })
      .update({ data: { status: 'verifying', updatedAt: now } })
  } catch (err) {
    console.warn('[designer_projects] 更新接单记录状态失败:', err.message)
  }

  console.log(`[designer_projects] 提交验收成功: requestId=${requestId}, designerId=${designer._id}`)

  // 发送订阅消息通知业主
  try {
    // demand.userId 存的是 users 集合的 _id，需要反查获取 _openid
    let userOpenid = ''
    if (demand.userId) {
      try {
        const userRes = await db.collection('users').doc(demand.userId).field({ _openid: true }).get()
        userOpenid = (userRes.data && userRes.data._openid) || ''
      } catch (e) {
        console.warn('[designer_projects] 查询业主openid失败:', e.message)
      }
    }
    if (!userOpenid) {
      userOpenid = demand._openid || ''
    }
    if (userOpenid) {
      const orderNo = demand.orderNo || requestId
      const space = (demand.params && demand.params.space) || demand.space || '灯光设计'
      const serviceName = space + '方案'
      const timeStr = formatTime(now)

      await cloud.openapi.subscribeMessage.send({
        touser: userOpenid,
        templateId: 'f9PDbOaLcS43cOSGq2rkto8q5Ik4gxzBT7RAtorK8GI',
        page: `pages/request/progress/progress?id=${orderNo}`,
        data: {
          character_string1: { value: String(orderNo) },
          thing4: { value: serviceName.slice(0, 20) },
          phrase5: { value: '待验收' },
          time8: { value: timeStr },
          thing10: { value: '设计师已完成设计，请确认验收' }
        }
      })
      console.log(`[designer_projects] 订阅消息发送成功: touser=${userOpenid}`)
    } else {
      console.warn('[designer_projects] 无法获取业主openid，跳过发送订阅消息')
    }
  } catch (msgErr) {
    // 订阅消息发送失败不影响主流程
    console.warn('[designer_projects] 发送订阅消息失败（非致命）:', msgErr.errCode, msgErr.errMsg || msgErr.message)
  }

  return {
    success: true, code: 'OK', message: '已提交验收，等待客户确认',
    data: { status: 'verifying', designerConfirmed: true }
  }
}

/**
 * 格式化时间戳为 yyyy-MM-dd HH:mm:ss
 */
function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
