/**
 * 云函数：invitations_operations
 * 邀请查询与状态变更
 * 
 * 支持 action：
 * - list_by_owner：业主查询发出的邀请
 * - list_by_designer：设计师查询收到的邀请
 * - count_pending：设计师未处理邀请计数
 * - accept：设计师接受邀请
 * - reject：设计师拒绝邀请
 * - cancel：业主取消邀请
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 邀请过期时间：72小时
const EXPIRE_DURATION_MS = 72 * 60 * 60 * 1000

// 邀请状态配置
const INVITE_STATUS = {
  pending: { text: '待回应', color: '#2563EB' },
  accepted: { text: '已接受', color: '#16A34A' },
  rejected: { text: '已拒绝', color: '#4B5563' },
  cancelled: { text: '已取消', color: '#4B5563' },
  expired: { text: '已过期', color: '#4B5563' },
  conflict: { text: '已冲突', color: '#9333EA' }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return { success: false, code: 'AUTH_FAILED', message: '用户身份验证失败' }
  }

  const { action } = event

  try {
    switch (action) {
      case 'list_by_owner':
        return await listByOwner(openid, event)
      case 'list_by_designer':
        return await listByDesigner(openid, event)
      case 'count_pending':
        return await countPending(openid)
      case 'accept':
        return await acceptInvitation(openid, event)
      case 'reject':
        return await rejectInvitation(openid, event)
      case 'cancel':
        return await cancelInvitation(openid, event)
      default:
        return { success: false, code: 'INVALID_ACTION', message: `不支持的操作: ${action}` }
    }
  } catch (err) {
    console.error('[invitations_operations] 错误:', err)
    return { success: false, code: 'SERVER_ERROR', message: err.message || '服务器错误' }
  }
}

// ==================== 辅助函数 ====================

async function getUserId(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  return (res.data && res.data.length > 0) ? res.data[0]._id : ''
}

async function getDesignerByOpenid(openid) {
  const res = await db.collection('designers')
    .where(_.or([{ _openid: openid }, { openid: openid }]))
    .limit(1).get()
  return (res.data && res.data.length > 0) ? res.data[0] : null
}

/**
 * 懒更新过期邀请：将超时的 pending 邀请标记为 expired
 */
async function lazyExpireInvitations(condition) {
  const now = Date.now()
  try {
    await db.collection('invitations').where({
      ...condition,
      status: 'pending',
      expireAt: _.lt(now)
    }).update({
      data: { status: 'expired', updatedAt: now }
    })
  } catch (err) {
    console.warn('[invitations_operations] 懒过期更新失败:', err.message)
  }
}

/**
 * 格式化邀请列表
 */
function formatInvitation(item) {
  const statusInfo = INVITE_STATUS[item.status] || { text: item.status, color: '#8e8e93' }
  
  // 计算相对时间
  const age = Date.now() - (item.createdAt || 0)
  const minutes = Math.floor(age / 60000)
  const hours = Math.floor(age / 3600000)
  const days = Math.floor(age / 86400000)
  let timeText = ''
  if (minutes < 1) timeText = '刚刚'
  else if (minutes < 60) timeText = `${minutes}分钟前`
  else if (hours < 24) timeText = `${hours}小时前`
  else timeText = `${days}天前`

  return {
    ...item,
    id: item._id,
    statusText: statusInfo.text,
    statusColor: statusInfo.color,
    timeText,
    // 确保 requestSummary 有值
    requestSummary: item.requestSummary || { space: '', area: '', budget: '', title: '灯光设计需求' }
  }
}

// ==================== 业主查询发出的邀请 ====================

async function listByOwner(openid, event) {
  const { page = 1, pageSize = 20, status } = event
  const ownerUserId = await getUserId(openid)

  if (!ownerUserId) {
    return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在' }
  }

  // 懒过期
  await lazyExpireInvitations({ ownerUserId })

  // 构建查询
  let condition = { ownerUserId }
  if (status && INVITE_STATUS[status]) {
    condition.status = status
  }

  const countRes = await db.collection('invitations').where(condition).count()
  const total = countRes.total || 0
  const skip = (page - 1) * pageSize

  const res = await db.collection('invitations').where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip).limit(pageSize).get()

  // 批量查设计师头像
  const designerIds = [...new Set((res.data || []).filter(i => i.designerId).map(i => i.designerId))]
  let designersMap = {}
  if (designerIds.length > 0) {
    try {
      const dRes = await db.collection('designers').where({ _id: _.in(designerIds) })
        .field({ _id: true, name: true, avatar: true, rating: true }).get()
      dRes.data.forEach(d => { designersMap[d._id] = d })
    } catch (err) {
      console.warn('[invitations_operations] 查询设计师信息失败:', err.message)
    }
  }

  const list = (res.data || []).map(item => {
    const d = designersMap[item.designerId] || {}
    return formatInvitation({
      ...item,
      designerName: item.designerName || d.name || '',
      designerAvatar: d.avatar || '',
      designerRating: d.rating || 0
    })
  })

  return {
    success: true, code: 'OK', message: '获取成功',
    data: { list, total, page, pageSize, hasMore: skip + list.length < total }
  }
}

// ==================== 设计师查询收到的邀请 ====================

async function listByDesigner(openid, event) {
  const { page = 1, pageSize = 20, status } = event

  const designer = await getDesignerByOpenid(openid)
  if (!designer) {
    return { success: false, code: 'NOT_DESIGNER', message: '设计师档案不存在' }
  }

  // 懒过期
  await lazyExpireInvitations({ designerId: designer._id })

  let condition = { designerId: designer._id }
  if (status && INVITE_STATUS[status]) {
    condition.status = status
  }

  const countRes = await db.collection('invitations').where(condition).count()
  const total = countRes.total || 0
  const skip = (page - 1) * pageSize

  const res = await db.collection('invitations').where(condition)
    .orderBy('createdAt', 'desc')
    .skip(skip).limit(pageSize).get()

  const list = (res.data || []).map(formatInvitation)

  return {
    success: true, code: 'OK', message: '获取成功',
    data: { list, total, page, pageSize, hasMore: skip + list.length < total }
  }
}

// ==================== 设计师未处理邀请计数 ====================

async function countPending(openid) {
  const designer = await getDesignerByOpenid(openid)
  if (!designer) {
    return { success: true, code: 'OK', data: { count: 0 } }
  }

  // 懒过期
  await lazyExpireInvitations({ designerId: designer._id })

  const countRes = await db.collection('invitations').where({
    designerId: designer._id,
    status: 'pending'
  }).count()

  return {
    success: true, code: 'OK',
    data: { count: countRes.total || 0 }
  }
}

// ==================== 设计师接受邀请 ====================

async function acceptInvitation(openid, event) {
  const { invitationId } = event
  if (!invitationId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少邀请ID' }
  }

  // 验证设计师身份
  const designer = await getDesignerByOpenid(openid)
  if (!designer) {
    return { success: false, code: 'NOT_DESIGNER', message: '设计师档案不存在' }
  }

  // 查询邀请
  let invitation
  try {
    const res = await db.collection('invitations').doc(invitationId).get()
    invitation = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '邀请不存在' }
  }

  if (!invitation) {
    return { success: false, code: 'NOT_FOUND', message: '邀请不存在' }
  }

  // 验证归属
  if (invitation.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此邀请' }
  }

  // 检查状态
  if (invitation.status !== 'pending') {
    return { success: false, code: 'INVALID_STATUS', message: `邀请状态为"${INVITE_STATUS[invitation.status]?.text || invitation.status}"，无法接受` }
  }

  // 检查过期
  if (Date.now() > invitation.expireAt) {
    await db.collection('invitations').doc(invitationId).update({
      data: { status: 'expired', updatedAt: Date.now() }
    })
    return { success: false, code: 'EXPIRED', message: '邀请已过期' }
  }

  const storedRequestId = invitation.requestId
  const now = Date.now()

  // 先通过 _id 查询 request，如果找不到则尝试 orderNo（兼容旧数据）
  let realRequestId = storedRequestId
  try {
    await db.collection('requests').doc(storedRequestId).get()
  } catch (err) {
    // _id 不存在，尝试按 orderNo 查
    const fallback = await db.collection('requests').where({ orderNo: storedRequestId }).limit(1).get()
    if (fallback.data && fallback.data.length > 0) {
      realRequestId = fallback.data[0]._id
      console.log(`[invitations_operations] requestId 兼容: orderNo=${storedRequestId} → _id=${realRequestId}`)
    }
  }

  // 防并发：条件更新 request（只有 status=submitted 且无 designerId 时才成功）
  const updateResult = await db.collection('requests')
    .where({
      _id: realRequestId,
      status: 'submitted',
      designerId: _.or(_.exists(false), _.eq(''), _.eq(null))
    })
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
    // 需求已被接单，标记冲突
    await db.collection('invitations').doc(invitationId).update({
      data: { status: 'conflict', updatedAt: now }
    })
    return { success: false, code: 'REQUEST_TAKEN', message: '该需求已被其他设计师接单' }
  }

  const requestId = realRequestId

  // 更新邀请状态为 accepted
  await db.collection('invitations').doc(invitationId).update({
    data: { status: 'accepted', respondedAt: now, updatedAt: now }
  })

  // 清理同需求的其他 pending 邀请（兼容 _id 和 orderNo 两种存储格式）
  try {
    const cleanCondition = {
      requestId: storedRequestId !== realRequestId ? _.in([realRequestId, storedRequestId]) : realRequestId,
      status: 'pending',
      _id: _.neq(invitationId)
    }
    await db.collection('invitations').where(cleanCondition).update({
      data: { status: 'conflict', updatedAt: now }
    })
  } catch (err) {
    console.warn('[invitations_operations] 清理其他邀请失败:', err.message)
  }

  // 创建 designer_orders 记录
  try {
    await db.collection('designer_orders').add({
      data: {
        _openid: openid,
        designerId: designer._id,
        requestId,
        requestOrderNo: invitation.requestOrderNo || '',
        clientOpenid: invitation._openid || '',
        status: 'active',
        source: 'invitation',
        invitationId,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (err) {
    console.warn('[invitations_operations] 创建接单记录失败:', err.message)
  }

  // 通知业主（非致命）
  try {
    const ownerOpenid = invitation._openid
    if (ownerOpenid) {
      await cloud.openapi.subscribeMessage.send({
        touser: ownerOpenid,
        templateId: 'bxor0x4ZJ_JoEnPct2ieOYRzGWrM2imsmrZtiX5NHE0',
        page: `pages/request/progress/progress?id=${invitation.requestOrderNo || requestId}`,
        data: {
          character_string1: { value: String(invitation.requestOrderNo || requestId).slice(0, 32) },
          short_thing12: { value: (invitation.requestSummary?.space || '灯光设计').slice(0, 10) },
          thing9: { value: (designer.name || '设计师').slice(0, 20) },
          thing8: { value: '设计师已接受您的邀请，将尽快与您联系' }
        }
      })
    }
  } catch (msgErr) {
    console.warn('[invitations_operations] 通知业主失败（非致命）:', msgErr.errCode, msgErr.errMsg || msgErr.message)
  }

  console.log(`[invitations_operations] 接受邀请成功: ${invitationId}, 设计师: ${designer.name}, 需求: ${requestId}`)

  return {
    success: true, code: 'OK', message: '已接受邀请，请尽快联系业主',
    data: { invitationId, requestId, designerId: designer._id }
  }
}

// ==================== 设计师拒绝邀请 ====================

async function rejectInvitation(openid, event) {
  const { invitationId, reason } = event
  if (!invitationId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少邀请ID' }
  }

  const designer = await getDesignerByOpenid(openid)
  if (!designer) {
    return { success: false, code: 'NOT_DESIGNER', message: '设计师档案不存在' }
  }

  let invitation
  try {
    const res = await db.collection('invitations').doc(invitationId).get()
    invitation = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '邀请不存在' }
  }

  if (!invitation || invitation.designerId !== designer._id) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此邀请' }
  }

  if (invitation.status !== 'pending') {
    return { success: false, code: 'INVALID_STATUS', message: '该邀请已处理' }
  }

  const now = Date.now()
  await db.collection('invitations').doc(invitationId).update({
    data: {
      status: 'rejected',
      rejectReason: reason || '',
      respondedAt: now,
      updatedAt: now
    }
  })

  // 通知业主（非致命）
  try {
    const ownerOpenid = invitation._openid
    if (ownerOpenid) {
      await cloud.openapi.subscribeMessage.send({
        touser: ownerOpenid,
        templateId: 'bxor0x4ZJ_JoEnPct2ieOYRzGWrM2imsmrZtiX5NHE0',
        page: `pages/designers/list/list`,
        data: {
          character_string1: { value: String(invitation.requestOrderNo || invitationId).slice(0, 32) },
          short_thing12: { value: (invitation.requestSummary?.space || '灯光设计').slice(0, 10) },
          thing9: { value: (designer.name || '设计师').slice(0, 20) },
          thing8: { value: '设计师暂时无法接单，建议选择其他设计师' }
        }
      })
    }
  } catch (msgErr) {
    console.warn('[invitations_operations] 通知业主失败（非致命）:', msgErr.errCode, msgErr.errMsg || msgErr.message)
  }

  console.log(`[invitations_operations] 拒绝邀请: ${invitationId}, 设计师: ${designer.name}`)

  return { success: true, code: 'OK', message: '已婉拒邀请' }
}

// ==================== 业主取消邀请 ====================

async function cancelInvitation(openid, event) {
  const { invitationId } = event
  if (!invitationId) {
    return { success: false, code: 'MISSING_PARAM', message: '缺少邀请ID' }
  }

  const ownerUserId = await getUserId(openid)

  let invitation
  try {
    const res = await db.collection('invitations').doc(invitationId).get()
    invitation = res.data
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '邀请不存在' }
  }

  if (!invitation) {
    return { success: false, code: 'NOT_FOUND', message: '邀请不存在' }
  }

  // 验证归属
  const isOwner = invitation.ownerUserId === ownerUserId || invitation._openid === openid
  if (!isOwner) {
    return { success: false, code: 'FORBIDDEN', message: '无权操作此邀请' }
  }

  if (invitation.status !== 'pending') {
    return { success: false, code: 'INVALID_STATUS', message: '仅待回应的邀请可以取消' }
  }

  const now = Date.now()
  await db.collection('invitations').doc(invitationId).update({
    data: { status: 'cancelled', updatedAt: now }
  })

  console.log(`[invitations_operations] 取消邀请: ${invitationId}`)

  return { success: true, code: 'OK', message: '邀请已取消' }
}
