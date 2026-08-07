/**
 * 云函数：admin_cases
 * 功能：落地案例 CRUD 管理
 * 权限：仅管理员
 *
 * 支持操作：
 *   - add: 新增案例
 *   - update: 更新案例
 *   - delete: 逻辑删除（status=inactive）
 *   - list: 分页列表
 *   - stats: 案例状态统计
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTION = 'lighting_cases'

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

function validateOfficialAccountUrl(url) {
  if (url === undefined || url === null || url === '') return true
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return true
  // 必须是 http/https 协议，且建议是公众号文章域名
  return /^https?:\/\/.+/i.test(trimmed)
}

// 项目概况字段（城市 / 面积 / 风格）均为选填短文本，仅在详情页拼成一行展示
const PROFILE_FIELDS = ['city', 'area', 'style']
const PROFILE_FIELD_MAX_LENGTH = 30

function validateProfileField(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  return value.trim().length <= PROFILE_FIELD_MAX_LENGTH
}

function normalizeProfileField(value) {
  return (value === undefined || value === null) ? '' : String(value).trim()
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildCaseWhere(event) {
  const conditions = []
  if (event.status === 'active' || event.status === 'inactive') {
    conditions.push({ status: event.status })
  }

  const keyword = typeof event.keyword === 'string' ? event.keyword.trim().slice(0, 60) : ''
  if (keyword) {
    const regex = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    conditions.push(_.or([
      { title: regex },
      { desc: regex },
      { services: regex }
    ]))
  }

  if (conditions.length === 0) return {}
  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

async function addCase(event) {
  const { imageFileIds, title, services, desc, sortOrder, officialAccountUrl, city, area, style } = event
  if (!validateImageFileIds(imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-9 张的字符串数组')
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return resp(false, 'INVALID_PARAMS', 'title 必填')
  }
  if (!validateServices(services)) {
    return resp(false, 'INVALID_PARAMS', 'services 必须为非空字符串数组')
  }
  if (!desc || typeof desc !== 'string' || !desc.trim()) {
    return resp(false, 'INVALID_PARAMS', 'desc 必填')
  }
  if (!validateOfficialAccountUrl(officialAccountUrl)) {
    return resp(false, 'INVALID_PARAMS', 'officialAccountUrl 必须是合法的 http(s) 链接')
  }
  for (const field of PROFILE_FIELDS) {
    if (!validateProfileField(event[field])) {
      return resp(false, 'INVALID_PARAMS', `${field} 必须为 ${PROFILE_FIELD_MAX_LENGTH} 字以内的字符串`)
    }
  }

  const now = Date.now()
  const doc = {
    imageFileIds,
    title: title.trim(),
    services,
    desc: desc.trim(),
    city: normalizeProfileField(city),
    area: normalizeProfileField(area),
    style: normalizeProfileField(style),
    officialAccountUrl: (officialAccountUrl || '').toString().trim(),
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  const res = await db.collection(COLLECTION).add({ data: doc })
  return resp(true, 'OK', '新增成功', { _id: res._id })
}

async function updateCase(event) {
  const { _id } = event
  if (!_id) {
    return resp(false, 'INVALID_PARAMS', '缺少 _id')
  }

  const updateData = { updatedAt: Date.now() }
  const allow = ['imageFileIds', 'title', 'services', 'desc', 'sortOrder', 'status', 'officialAccountUrl', ...PROFILE_FIELDS]
  for (const key of allow) {
    if (event[key] !== undefined) updateData[key] = event[key]
  }

  if (updateData.imageFileIds && !validateImageFileIds(updateData.imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为 1-9 张的字符串数组')
  }
  if (updateData.services && !validateServices(updateData.services)) {
    return resp(false, 'INVALID_PARAMS', 'services 必须为非空字符串数组')
  }
  if (updateData.officialAccountUrl !== undefined && !validateOfficialAccountUrl(updateData.officialAccountUrl)) {
    return resp(false, 'INVALID_PARAMS', 'officialAccountUrl 必须是合法的 http(s) 链接')
  }
  if (typeof updateData.officialAccountUrl === 'string') {
    updateData.officialAccountUrl = updateData.officialAccountUrl.trim()
  }
  for (const field of PROFILE_FIELDS) {
    if (updateData[field] === undefined) continue
    if (!validateProfileField(updateData[field])) {
      return resp(false, 'INVALID_PARAMS', `${field} 必须为 ${PROFILE_FIELD_MAX_LENGTH} 字以内的字符串`)
    }
    updateData[field] = normalizeProfileField(updateData[field])
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

async function deleteCase(event) {
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

async function listCases(event) {
  const page = Math.max(1, parseInt(event.page || 1, 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize || 20, 10)))
  const where = buildCaseWhere(event)

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

async function statsCases() {
  try {
    const [totalRes, activeRes, inactiveRes] = await Promise.all([
      db.collection(COLLECTION).count(),
      db.collection(COLLECTION).where({ status: 'active' }).count(),
      db.collection(COLLECTION).where({ status: 'inactive' }).count()
    ])

    return resp(true, 'OK', '统计成功', {
      total: totalRes.total || 0,
      active: activeRes.total || 0,
      inactive: inactiveRes.total || 0
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
      case 'add': return await addCase(event)
      case 'update': return await updateCase(event)
      case 'delete': return await deleteCase(event)
      case 'list': return await listCases(event)
      case 'stats': return await statsCases()
      default: return resp(false, 'INVALID_ACTION', `不支持的操作类型: ${action}`)
    }
  } catch (e) {
    console.error('[admin_cases] 异常:', e)
    return resp(false, 'SERVER_ERROR', e.message || '服务器异常')
  }
}
