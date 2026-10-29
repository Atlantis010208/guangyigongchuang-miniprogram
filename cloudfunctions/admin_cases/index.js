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
const {
  createPresentationShell,
  mapCaseForAdminList
} = require('./presentation-summary')
const {
  coordinatesMatchCountry,
  hasValidCoordinates
} = require('./country-geography')
const { COUNTRY_OPTIONS } = require('./country-options')

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
  return Array.isArray(ids) && ids.length >= 1 && ids.every(v => typeof v === 'string' && v.trim())
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
const SPACE_TYPE_MAX_LENGTH = 30
const TEXT_FIELD_LIMITS = {
  titleEn: 100,
  subtitleZh: 80,
  subtitleEn: 120,
  summaryEn: 320,
  cityEn: 60,
  projectTypeEn: 80
}
const WEBSITE_FIELDS = Object.keys(TEXT_FIELD_LIMITS)
function validateProfileField(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  return value.trim().length <= PROFILE_FIELD_MAX_LENGTH
}

function normalizeProfileField(value) {
  return (value === undefined || value === null) ? '' : String(value).trim()
}

function validateSpaceType(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  return value.trim().length <= SPACE_TYPE_MAX_LENGTH
}

function normalizeSpaceType(value) {
  return (value === undefined || value === null) ? '' : String(value).trim()
}

function normalizeTextField(value) {
  return (value === undefined || value === null) ? '' : String(value).trim()
}

function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

function normalizeOptionalBoolean(value) {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false
  }
  return Boolean(value)
}

function getCountryMeta(countryCode) {
  return COUNTRY_OPTIONS[normalizeCountryCode(countryCode)] || null
}

function applyCountryMeta(data) {
  const countryCode = normalizeCountryCode(data.countryCode)
  const country = getCountryMeta(countryCode)
  data.countryCode = country ? country.countryCode : countryCode
  data.countryZh = country ? country.countryZh : ''
  data.countryEn = country ? country.countryEn : ''
  data.region = country ? country.region : ''
  data.scope = country ? country.scope : ''
}

function validateWebsiteFields(data) {
  for (const field of WEBSITE_FIELDS) {
    if (data[field] !== undefined && String(data[field] || '').trim().length > TEXT_FIELD_LIMITS[field]) {
      return `${field} 必须为 ${TEXT_FIELD_LIMITS[field]} 字以内的字符串`
    }
  }

  if (data.countryCode) {
    const code = normalizeCountryCode(data.countryCode)
    if (!getCountryMeta(code)) return 'countryCode 不在国家字典中'
  }

  if (data.lat !== undefined) {
    const lat = normalizeOptionalNumber(data.lat)
    if (Number.isNaN(lat) || (lat !== null && (lat < -90 || lat > 90))) return 'lat 必须为 -90 到 90 之间的数字'
    data.lat = lat
  }
  if (data.lng !== undefined) {
    const lng = normalizeOptionalNumber(data.lng)
    if (Number.isNaN(lng) || (lng !== null && (lng < -180 || lng > 180))) return 'lng 必须为 -180 到 180 之间的数字'
    data.lng = lng
  }
  if (
    data.countryCode &&
    hasValidCoordinates(data.lat, data.lng) &&
    !coordinatesMatchCountry(data.countryCode, data.lat, data.lng)
  ) {
    return '经纬度不在所选国家范围内'
  }
  if (data.year !== undefined) {
    const year = normalizeOptionalNumber(data.year)
    const currentYear = new Date().getFullYear() + 1
    if (Number.isNaN(year) || (year !== null && (!Number.isInteger(year) || year < 1900 || year > currentYear))) {
      return `year 必须为 1900 到 ${currentYear} 之间的整数`
    }
    data.year = year
  }

  if (data.featured !== undefined) data.featured = normalizeOptionalBoolean(data.featured)
  if (data.websiteVisible !== undefined) data.websiteVisible = normalizeOptionalBoolean(data.websiteVisible)

  if (data.countryCode !== undefined) applyCountryMeta(data)
  if (data.websiteVisible === false) data.featured = false

  for (const field of WEBSITE_FIELDS) {
    if (data[field] !== undefined) data[field] = normalizeTextField(data[field])
  }
  return ''
}

function hasText(value) {
  return Boolean(value && String(value).trim())
}

function getWebsitePublishIssues(data) {
  const issues = []
  if (!Array.isArray(data.imageFileIds) || data.imageFileIds.length < 1) issues.push('至少 1 张图片')
  if (!hasText(data.title)) issues.push('中文标题')
  if (!hasText(data.desc)) issues.push('中文简介')
  if (!hasText(data.countryCode)) issues.push('国家')
  if (!hasText(data.city)) issues.push('中文城市')
  if (!hasValidCoordinates(data.lat, data.lng)) {
    issues.push('经纬度')
  } else if (!coordinatesMatchCountry(data.countryCode, data.lat, data.lng)) {
    issues.push('坐标与国家不匹配')
  }
  return issues
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildCaseWhere(event) {
  const conditions = []
  if (event.status === 'active' || event.status === 'inactive') {
    conditions.push({ status: event.status })
  }
  if (event.websiteVisible !== undefined) {
    conditions.push({ websiteVisible: normalizeOptionalBoolean(event.websiteVisible) })
  }
  if (event.featured !== undefined) {
    conditions.push({ featured: normalizeOptionalBoolean(event.featured) })
  }
  const countryCode = normalizeCountryCode(event.countryCode)
  if (countryCode) {
    conditions.push({ countryCode })
  }
  if (typeof event.region === 'string' && event.region.trim()) {
    conditions.push({ region: event.region.trim() })
  }
  if (event.scope === 'china' || event.scope === 'international') {
    conditions.push({ scope: event.scope })
  }
  if (event.year !== undefined && event.year !== null && event.year !== '') {
    const year = Number(event.year)
    if (Number.isInteger(year)) conditions.push({ year })
  }
  if (typeof event.spaceType === 'string' && event.spaceType.trim()) {
    conditions.push({ spaceType: event.spaceType.trim() })
  }

  const keyword = typeof event.keyword === 'string' ? event.keyword.trim().slice(0, 60) : ''
  if (keyword) {
    const regex = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    conditions.push(_.or([
      { title: regex },
      { titleEn: regex },
      { subtitleZh: regex },
      { subtitleEn: regex },
      { desc: regex },
      { summaryEn: regex },
      { spaceType: regex },
      { projectTypeEn: regex },
      { countryCode: regex },
      { city: regex },
      { cityEn: regex },
      { services: regex }
    ]))
  }

  if (conditions.length === 0) return {}
  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

async function addCase(event) {
  const {
    imageFileIds, title, services, desc, sortOrder, officialAccountUrl, spaceType, city, area, style,
    titleEn, subtitleZh, subtitleEn, summaryEn, countryCode, cityEn, projectTypeEn,
    year, featured, websiteVisible, lat, lng
  } = event
  if (!validateImageFileIds(imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为至少 1 张图片的字符串数组')
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
  if (!validateSpaceType(spaceType)) {
    return resp(false, 'INVALID_PARAMS', `spaceType 必须为 ${SPACE_TYPE_MAX_LENGTH} 字以内的字符串`)
  }
  for (const field of PROFILE_FIELDS) {
    if (!validateProfileField(event[field])) {
      return resp(false, 'INVALID_PARAMS', `${field} 必须为 ${PROFILE_FIELD_MAX_LENGTH} 字以内的字符串`)
    }
  }
  const websiteData = {
    titleEn: titleEn || '',
    subtitleZh: subtitleZh || '',
    subtitleEn: subtitleEn || '',
    summaryEn: summaryEn || '',
    countryCode: countryCode || '',
    cityEn: cityEn || '',
    projectTypeEn: projectTypeEn || '',
    year: year === undefined ? null : year,
    lat: lat === undefined ? null : lat,
    lng: lng === undefined ? null : lng,
    featured: normalizeOptionalBoolean(featured) || false,
    websiteVisible: normalizeOptionalBoolean(websiteVisible) || false
  }
  const websiteError = validateWebsiteFields(websiteData)
  if (websiteError) return resp(false, 'INVALID_PARAMS', websiteError)
  if (websiteData.featured && websiteData.scope !== 'international') {
    return resp(false, 'INVALID_PARAMS', '只有海外案例可以设置为海外精选')
  }
  if (websiteData.featured && !websiteData.websiteVisible) {
    return resp(false, 'INVALID_PARAMS', '海外精选必须先开启官网展示')
  }

  const now = Date.now()
  const doc = {
    imageFileIds,
    title: title.trim(),
    services,
    spaceType: normalizeSpaceType(spaceType),
    desc: desc.trim(),
    city: normalizeProfileField(city),
    area: normalizeProfileField(area),
    style: normalizeProfileField(style),
    officialAccountUrl: (officialAccountUrl || '').toString().trim(),
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    status: 'active',
    ...websiteData,
    createdAt: now,
    updatedAt: now
  }
  if (
    hasValidCoordinates(doc.lat, doc.lng) &&
    !coordinatesMatchCountry(doc.countryCode, doc.lat, doc.lng)
  ) {
    return resp(false, 'INVALID_PARAMS', '经纬度不在所选国家范围内')
  }
  doc.presentation = createPresentationShell(doc)
  if (doc.websiteVisible) {
    const issues = getWebsitePublishIssues(doc)
    if (issues.length) return resp(false, 'WEBSITE_INCOMPLETE', `官网发布资料还缺：${issues.join('、')}`, { issues })
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
  const allow = [
    'imageFileIds', 'title', 'services', 'spaceType', 'desc', 'sortOrder', 'status', 'officialAccountUrl',
    'titleEn', 'subtitleZh', 'subtitleEn', 'summaryEn', 'countryCode', 'cityEn',
    'projectTypeEn', 'year', 'featured', 'websiteVisible', 'lat', 'lng',
    ...PROFILE_FIELDS
  ]
  for (const key of allow) {
    if (event[key] !== undefined) updateData[key] = event[key]
  }

  if (updateData.imageFileIds && !validateImageFileIds(updateData.imageFileIds)) {
    return resp(false, 'INVALID_PARAMS', 'imageFileIds 必须为至少 1 张图片的字符串数组')
  }
  if (updateData.services && !validateServices(updateData.services)) {
    return resp(false, 'INVALID_PARAMS', 'services 必须为非空字符串数组')
  }
  if (updateData.officialAccountUrl !== undefined && !validateOfficialAccountUrl(updateData.officialAccountUrl)) {
    return resp(false, 'INVALID_PARAMS', 'officialAccountUrl 必须是合法的 http(s) 链接')
  }
  if (updateData.spaceType !== undefined && !validateSpaceType(updateData.spaceType)) {
    return resp(false, 'INVALID_PARAMS', `spaceType 必须为 ${SPACE_TYPE_MAX_LENGTH} 字以内的字符串`)
  }
  if (updateData.spaceType !== undefined) {
    updateData.spaceType = normalizeSpaceType(updateData.spaceType)
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
  const websiteError = validateWebsiteFields(updateData)
  if (websiteError) return resp(false, 'INVALID_PARAMS', websiteError)

  try {
    const currentRes = await db.collection(COLLECTION).doc(_id).get()
    const currentDoc = Array.isArray(currentRes.data) ? currentRes.data[0] : currentRes.data
    const nextDoc = { ...(currentDoc || {}), ...updateData }
    if (nextDoc.countryCode !== undefined) applyCountryMeta(nextDoc)
    if (
      hasValidCoordinates(nextDoc.lat, nextDoc.lng) &&
      !coordinatesMatchCountry(nextDoc.countryCode, nextDoc.lat, nextDoc.lng)
    ) {
      return resp(false, 'INVALID_PARAMS', '经纬度不在所选国家范围内')
    }
    if (nextDoc.featured && nextDoc.scope !== 'international') {
      return resp(false, 'INVALID_PARAMS', '只有海外案例可以设置为海外精选')
    }
    if (nextDoc.featured && !nextDoc.websiteVisible) {
      return resp(false, 'INVALID_PARAMS', '海外精选必须先开启官网展示')
    }
    if (nextDoc.websiteVisible) {
      const issues = getWebsitePublishIssues(nextDoc)
      if (issues.length) {
        return resp(false, 'WEBSITE_INCOMPLETE', `官网发布资料还缺：${issues.join('、')}`, { issues })
      }
    }
    updateData.presentation = createPresentationShell(nextDoc, currentDoc && currentDoc.presentation)
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
      items: (listRes.data || []).map(mapCaseForAdminList),
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
