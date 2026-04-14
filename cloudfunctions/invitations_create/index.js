/**
 * 云函数：invitations_create
 * 业主创建邀请，邀请设计师接单
 * 
 * @param {object} event
 * @param {string} event.designerId - 目标设计师ID（必填）
 * @param {string} [event.requestId] - 指定关联需求ID（可选，不传则自动查询）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 邀请过期时间：72小时
const EXPIRE_DURATION_MS = 72 * 60 * 60 * 1000

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  const { designerId, requestId } = event

  if (!designerId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少设计师ID' }
  }

  try {
    // 1. 获取业主身份
    const ownerUserId = await getUserId(openid)
    if (!ownerUserId) {
      return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在，请先登录' }
    }

    // 2. 验证设计师存在
    const designer = await getDesigner(designerId)
    if (!designer) {
      return { success: false, code: 'DESIGNER_NOT_FOUND', message: '设计师不存在' }
    }

    // 3. 确定关联需求
    if (requestId) {
      // 指定了需求，校验归属
      return await createWithRequest(openid, ownerUserId, designer, requestId)
    } else {
      // 未指定需求，自动查询业主待处理需求
      return await autoMatchAndCreate(openid, ownerUserId, designer)
    }

  } catch (err) {
    console.error('[invitations_create] 错误:', err)
    return { success: false, code: 'SERVER_ERROR', message: err.message || '服务器错误' }
  }
}

/**
 * 获取用户ID
 */
async function getUserId(openid) {
  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
    return (res.data && res.data.length > 0) ? res.data[0]._id : ''
  } catch (err) {
    console.error('[invitations_create] 获取用户ID失败:', err)
    return ''
  }
}

/**
 * 获取设计师信息
 */
async function getDesigner(designerId) {
  try {
    const res = await db.collection('designers').doc(designerId).get()
    return res.data || null
  } catch (err) {
    return null
  }
}

/**
 * 查询业主待处理需求（status=submitted 且未分配设计师）
 */
async function getPendingRequests(ownerUserId, openid) {
  const condition = {
    isDelete: _.neq(1),
    status: 'submitted',
    designerId: _.or(_.exists(false), _.eq(''), _.eq(null))
  }

  // 优先用 userId，兼容 openid
  const query1 = { ...condition, userId: ownerUserId }
  let res = await db.collection('requests').where(query1)
    .orderBy('createdAt', 'desc').limit(10)
    .field({ _id: true, orderNo: true, space: true, area: true, budget: true, params: true, createdAt: true })
    .get()

  if (!res.data || res.data.length === 0) {
    const query2 = { ...condition, _openid: openid }
    res = await db.collection('requests').where(query2)
      .orderBy('createdAt', 'desc').limit(10)
      .field({ _id: true, orderNo: true, space: true, area: true, budget: true, params: true, createdAt: true })
      .get()
  }

  // 展平 params 字段
  return (res.data || []).map(r => {
    const p = r.params || {}
    return {
      _id: r._id,
      orderNo: r.orderNo || '',
      space: r.space || p.space || '',
      area: r.area || p.area || '',
      budget: r.budget || p.budget || '',
      title: `${r.space || p.space || ''}灯光设计需求`
    }
  })
}

/**
 * 自动匹配需求并创建邀请
 */
async function autoMatchAndCreate(openid, ownerUserId, designer) {
  const requests = await getPendingRequests(ownerUserId, openid)

  if (requests.length === 0) {
    return {
      success: false,
      code: 'NO_REQUEST',
      message: '您还没有发布照明需求，是否先去发布？',
      data: { needPublish: true }
    }
  }

  if (requests.length === 1) {
    // 仅1个需求，直接创建
    return await doCreateInvitation(openid, ownerUserId, designer, requests[0])
  }

  // 多个需求，返回列表让前端选择
  return {
    success: false,
    code: 'NEED_SELECT_REQUEST',
    message: '请选择要关联的需求',
    data: { needSelectRequest: true, requests }
  }
}

/**
 * 指定需求创建邀请
 */
async function createWithRequest(openid, ownerUserId, designer, requestId) {
  // 查询需求，校验归属（兼容 _id 和 orderNo）
  let request
  try {
    const res = await db.collection('requests').doc(requestId).get()
    request = res.data
  } catch (err) {
    // doc() 查不到，可能传的是 orderNo，按 orderNo 再查一次
    request = null
  }

  if (!request) {
    try {
      const res2 = await db.collection('requests').where({ orderNo: requestId }).limit(1).get()
      request = (res2.data && res2.data.length > 0) ? res2.data[0] : null
    } catch (err2) {
      console.error('[invitations_create] orderNo查询失败:', err2)
    }
  }

  if (!request) {
    return { success: false, code: 'REQUEST_NOT_FOUND', message: '需求不存在' }
  }

  // 校验需求归属
  const isOwner = request.userId === ownerUserId || request._openid === openid
  if (!isOwner) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此需求' }
  }

  // 校验需求状态
  if (request.status !== 'submitted') {
    return { success: false, code: 'REQUEST_NOT_AVAILABLE', message: '该需求已被接单或已关闭' }
  }

  if (request.designerId) {
    return { success: false, code: 'REQUEST_TAKEN', message: '该需求已有设计师接单' }
  }

  const p = request.params || {}
  const summary = {
    _id: request._id,
    orderNo: request.orderNo || '',
    space: request.space || p.space || '',
    area: request.area || p.area || '',
    budget: request.budget || p.budget || '',
    title: `${request.space || p.space || ''}灯光设计需求`
  }

  return await doCreateInvitation(openid, ownerUserId, designer, summary)
}

/**
 * 执行创建邀请
 */
async function doCreateInvitation(openid, ownerUserId, designer, requestSummary) {
  const designerId = designer._id
  const requestId = requestSummary._id

  // 防重复：同需求+同设计师 且状态为 pending
  const existRes = await db.collection('invitations').where({
    requestId,
    designerId,
    status: 'pending'
  }).count()

  if (existRes.total > 0) {
    return {
      success: false,
      code: 'DUPLICATE_INVITE',
      message: '您已邀请该设计师，请耐心等待回复'
    }
  }

  const now = Date.now()
  const designerOpenid = designer._openid || designer.openid || ''

  const doc = {
    _openid: openid,
    ownerUserId,
    designerId,
    designerOpenid,
    designerName: designer.name || '',
    requestId,
    requestOrderNo: requestSummary.orderNo || '',
    requestSummary: {
      space: requestSummary.space || '',
      area: requestSummary.area || '',
      budget: requestSummary.budget || '',
      title: requestSummary.title || ''
    },
    status: 'pending',
    inviteMessage: '',
    rejectReason: '',
    createdAt: now,
    expireAt: now + EXPIRE_DURATION_MS,
    updatedAt: now
  }

  const addRes = await db.collection('invitations').add({ data: doc })
  const invitationId = addRes._id

  console.log(`[invitations_create] 邀请创建成功: ${invitationId}, 设计师: ${designer.name}, 需求: ${requestSummary.orderNo}`)

  // 发送订阅消息通知设计师（非致命）
  try {
    if (designerOpenid) {
      const nowDate = new Date(now)
      const pad = n => (n < 10 ? '0' + n : '' + n)
      const timeStr = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())} ${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}:${pad(nowDate.getSeconds())}`

      await cloud.openapi.subscribeMessage.send({
        touser: designerOpenid,
        templateId: 'bxor0x4ZJ_JoEnPct2ieOZ1tGcMuzNZrceQonfMhkFI',
        page: `pages/designer-invites/designer-invites`,
        data: {
          character_string1: { value: String(requestSummary.orderNo || invitationId).slice(0, 32) },
          short_thing12: { value: (requestSummary.space || '灯光设计').slice(0, 10) },
          thing8: { value: '您收到一条新的设计邀请，请尽快查看' },
          time6: { value: timeStr }
        }
      })
      console.log(`[invitations_create] 通知设计师成功: ${designerOpenid}`)
    }
  } catch (msgErr) {
    console.warn('[invitations_create] 发送通知失败（非致命）:', msgErr.errCode, msgErr.errMsg || msgErr.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '邀请已发送',
    data: {
      invitationId,
      designerName: designer.name || '',
      requestTitle: requestSummary.title || ''
    }
  }
}
