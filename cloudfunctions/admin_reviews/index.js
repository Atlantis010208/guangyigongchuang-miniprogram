/**
 * 云函数：admin_reviews
 * 功能：客户评价 CRUD 管理
 * 权限：仅管理员
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTION = 'lighting_reviews'

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

function validateServices(services) {
  return Array.isArray(services) && services.length > 0 && services.every(s => typeof s === 'string' && s.trim())
}

function validateImageFileIds(ids) {
  return Array.isArray(ids) && ids.length >= 1 && ids.length <= 9 && ids.every(v => typeof v === 'string' && v.trim())
}

async function addReview(event) {
  const { imageFileIds, title, services, projectType, sortOrder } = event
  if (!validateImageFileIds(imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-9 张的字符串数组')
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return resp(false, 'INVALID_PARAMS', 'title 必填')
  }
  if (!validateServices(services)) {
    return resp(false, 'INVALID_PARAMS', 'services 必须为非空字符串数组')
  }
  if (!projectType || typeof projectType !== 'string' || !projectType.trim()) {
    return resp(false, 'INVALID_PARAMS', 'projectType 必填')
  }

  const now = Date.now()
  const doc = {
    imageFileIds,
    title: title.trim(),
    services,
    projectType: projectType.trim(),
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  const res = await db.collection(COLLECTION).add({ data: doc })
  return resp(true, 'OK', '新增成功', { _id: res._id })
}

async function updateReview(event) {
  const { _id } = event
  if (!_id) return resp(false, 'INVALID_PARAMS', '缺少 _id')

  const updateData = { updatedAt: Date.now() }
  const allow = ['imageFileIds', 'title', 'services', 'projectType', 'sortOrder', 'status']
  for (const key of allow) {
    if (event[key] !== undefined) updateData[key] = event[key]
  }

  if (updateData.imageFileIds && !validateImageFileIds(updateData.imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-9 张的字符串数组')
  }
  if (updateData.services && !validateServices(updateData.services)) {
    return resp(false, 'INVALID_PARAMS', 'services 必须为非空字符串数组')
  }

  try {
    const res = await db.collection(COLLECTION).doc(_id).update({ data: updateData })
    if (res.stats && res.stats.updated === 0) {
      return resp(false, 'NOT_FOUND', '记录不存在')
    }
    return resp(true, 'OK', '更新成功', { updated: res.stats ? res.stats.updated : 1 })
  } catch (e) {
    return resp(false, 'DB_ERROR', e.message || '数据库异常')
  }
}

async function deleteReview(event) {
  const { _id } = event
  if (!_id) return resp(false, 'INVALID_PARAMS', '缺少 _id')

  try {
    const res = await db.collection(COLLECTION).doc(_id).update({
      data: { status: 'inactive', updatedAt: Date.now() }
    })
    if (res.stats && res.stats.updated === 0) {
      return resp(false, 'NOT_FOUND', '记录不存在')
    }
    return resp(true, 'OK', '删除成功', { updated: res.stats ? res.stats.updated : 1 })
  } catch (e) {
    return resp(false, 'DB_ERROR', e.message || '数据库异常')
  }
}

async function listReviews(event) {
  const page = Math.max(1, parseInt(event.page || 1, 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize || 20, 10)))
  const status = event.status

  const where = {}
  if (status) where.status = status

  try {
    const countRes = await db.collection(COLLECTION).where(where).count()
    const total = countRes.total || 0

    const listRes = await db.collection(COLLECTION)
      .where(where)
      .orderBy('sortOrder', 'desc')
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return resp(true, 'OK', '查询成功', {
      items: listRes.data || [],
      total,
      page,
      pageSize
    })
  } catch (e) {
    return resp(false, 'DB_ERROR', e.message || '数据库异常')
  }
}

exports.main = async (event) => {
  try {
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return resp(false, authResult.errorCode || 'NO_PERMISSION', getErrorMessage(authResult.errorCode))
    }

    const { action } = event
    if (!action) return resp(false, 'MISSING_ACTION', '缺少 action 参数')

    switch (action) {
      case 'add': return await addReview(event)
      case 'update': return await updateReview(event)
      case 'delete': return await deleteReview(event)
      case 'list': return await listReviews(event)
      default: return resp(false, 'INVALID_ACTION', `不支持的操作类型: ${action}`)
    }
  } catch (e) {
    console.error('[admin_reviews] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
