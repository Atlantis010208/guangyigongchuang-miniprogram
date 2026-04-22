/**
 * 云函数：admin_delivery
 * 功能：设计服务交付标准 CRUD 管理
 * 权限：仅管理员
 *
 * 支持操作：
 *   - add: 新增交付标准
 *   - update: 更新交付标准
 *   - delete: 逻辑删除（status=inactive）
 *   - list: 分页列表
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTION = 'lighting_delivery'

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function validateImageFileId(id) {
  return isNonEmptyString(id) && /^cloud:\/\//i.test(id.trim())
}

function validateImageFileIds(ids) {
  return Array.isArray(ids)
    && ids.length >= 1
    && ids.length <= 10
    && ids.every(v => validateImageFileId(v))
}

function isHexColor(v) {
  if (!v) return true
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())
}

function normalizeOptionalString(v) {
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v.trim() : ''
}

async function addItem(event) {
  const { imageFileIds, title, phase, period, desc, sortOrder } = event
  if (!validateImageFileIds(imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-10 张的 cloud:// 字符串数组')
  }
  if (!isNonEmptyString(title)) return resp(false, 'INVALID_PARAMS', 'title 必填')
  if (!isNonEmptyString(phase)) return resp(false, 'INVALID_PARAMS', 'phase 必填')
  if (!isNonEmptyString(period)) return resp(false, 'INVALID_PARAMS', 'period 必填')
  if (!isNonEmptyString(desc)) return resp(false, 'INVALID_PARAMS', 'desc 必填')

  const colorFields = ['phaseColor', 'phaseTextColor', 'periodColor', 'periodTextColor']
  for (const key of colorFields) {
    if (event[key] && !isHexColor(event[key])) {
      return resp(false, 'INVALID_PARAMS', `${key} 必须是合法 HEX 颜色值`)
    }
  }

  const now = Date.now()
  const trimmedIds = imageFileIds.map(v => v.trim())
  const doc = {
    imageFileIds: trimmedIds,
    imageFileId: trimmedIds[0], // 兼容旧字段，首张作为封面
    title: title.trim(),
    phase: phase.trim(),
    period: period.trim(),
    desc: desc.trim(),
    phaseColor: normalizeOptionalString(event.phaseColor),
    phaseTextColor: normalizeOptionalString(event.phaseTextColor),
    periodColor: normalizeOptionalString(event.periodColor),
    periodTextColor: normalizeOptionalString(event.periodTextColor),
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  const res = await db.collection(COLLECTION).add({ data: doc })
  return resp(true, 'OK', '新增成功', { _id: res._id })
}

async function updateItem(event) {
  const { _id } = event
  if (!_id) return resp(false, 'INVALID_PARAMS', '缺少 _id')

  const updateData = { updatedAt: Date.now() }
  const allow = [
    'imageFileIds', 'title', 'phase', 'period', 'desc',
    'phaseColor', 'phaseTextColor', 'periodColor', 'periodTextColor',
    'sortOrder', 'status'
  ]
  for (const key of allow) {
    if (event[key] !== undefined) updateData[key] = event[key]
  }

  if (updateData.imageFileIds !== undefined) {
    if (!validateImageFileIds(updateData.imageFileIds)) {
      return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-10 张的 cloud:// 字符串数组')
    }
    updateData.imageFileIds = updateData.imageFileIds.map(v => v.trim())
    updateData.imageFileId = updateData.imageFileIds[0] // 同步兼容字段
  }
  const colorFields = ['phaseColor', 'phaseTextColor', 'periodColor', 'periodTextColor']
  for (const key of colorFields) {
    if (updateData[key] !== undefined && updateData[key] !== '' && !isHexColor(updateData[key])) {
      return resp(false, 'INVALID_PARAMS', `${key} 必须是合法 HEX 颜色值`)
    }
  }

  // 字符串字段去空格
  for (const key of ['title', 'phase', 'period', 'desc', 'phaseColor', 'phaseTextColor', 'periodColor', 'periodTextColor']) {
    if (typeof updateData[key] === 'string') updateData[key] = updateData[key].trim()
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

async function deleteItem(event) {
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

async function listItems(event) {
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
      case 'add': return await addItem(event)
      case 'update': return await updateItem(event)
      case 'delete': return await deleteItem(event)
      case 'list': return await listItems(event)
      default: return resp(false, 'INVALID_ACTION', `不支持的操作类型: ${action}`)
    }
  } catch (e) {
    console.error('[admin_delivery] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
