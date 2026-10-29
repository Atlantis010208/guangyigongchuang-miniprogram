/**
 * Cloud function: lighting_cases_list
 * Read-only case list/detail API for the Mini Program and public website.
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { COUNTRY_OPTIONS } = require('./country-options')
const { coordinatesMatchCountry } = require('./country-geography')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTION = 'lighting_cases'
const PREVIEW_TOKEN_COLLECTION = 'case_presentation_preview_tokens'
const WEBSITE_IMAGE_FALLBACK = '/image/guangyi-logo.png'

const SPACE_TYPE_ORDER = Object.freeze([
  '\u4f4f\u5b85\u7a7a\u95f4',
  '\u5546\u4e1a\u7a7a\u95f4',
  '\u529e\u516c\u7a7a\u95f4',
  '\u9152\u5e97\u7a7a\u95f4',
  '\u9910\u996e\u7a7a\u95f4',
  '\u6587\u65c5\u7a7a\u95f4',
  '\u516c\u5171\u7a7a\u95f4',
  '\u6237\u5916\u666f\u89c2',
  '\u8fd0\u52a8\u573a\u9986',
  '\u5176\u4ed6',
])

const SPACE_TYPE_ALIASES = Object.freeze({
  residential: '\u4f4f\u5b85\u7a7a\u95f4',
  home: '\u4f4f\u5b85\u7a7a\u95f4',
  house: '\u4f4f\u5b85\u7a7a\u95f4',
  villa: '\u4f4f\u5b85\u7a7a\u95f4',
  '\u4f4f\u5b85': '\u4f4f\u5b85\u7a7a\u95f4',
  '\u79c1\u5b85': '\u4f4f\u5b85\u7a7a\u95f4',
  '\u5bb6\u5c45': '\u4f4f\u5b85\u7a7a\u95f4',
  commercial: '\u5546\u4e1a\u7a7a\u95f4',
  business: '\u5546\u4e1a\u7a7a\u95f4',
  retail: '\u5546\u4e1a\u7a7a\u95f4',
  shop: '\u5546\u4e1a\u7a7a\u95f4',
  store: '\u5546\u4e1a\u7a7a\u95f4',
  '\u5546\u4e1a': '\u5546\u4e1a\u7a7a\u95f4',
  '\u5546\u94fa': '\u5546\u4e1a\u7a7a\u95f4',
  '\u5e97\u94fa': '\u5546\u4e1a\u7a7a\u95f4',
  office: '\u529e\u516c\u7a7a\u95f4',
  '\u529e\u516c': '\u529e\u516c\u7a7a\u95f4',
  '\u5199\u5b57\u697c': '\u529e\u516c\u7a7a\u95f4',
  hotel: '\u9152\u5e97\u7a7a\u95f4',
  hospitality: '\u9152\u5e97\u7a7a\u95f4',
  resort: '\u9152\u5e97\u7a7a\u95f4',
  '\u9152\u5e97': '\u9152\u5e97\u7a7a\u95f4',
  '\u6c11\u5bbf': '\u9152\u5e97\u7a7a\u95f4',
  restaurant: '\u9910\u996e\u7a7a\u95f4',
  dining: '\u9910\u996e\u7a7a\u95f4',
  cafe: '\u9910\u996e\u7a7a\u95f4',
  '\u9910\u996e': '\u9910\u996e\u7a7a\u95f4',
  '\u9910\u5385': '\u9910\u996e\u7a7a\u95f4',
  '\u5496\u5561': '\u9910\u996e\u7a7a\u95f4',
  culture: '\u6587\u65c5\u7a7a\u95f4',
  tourism: '\u6587\u65c5\u7a7a\u95f4',
  '\u6587\u65c5': '\u6587\u65c5\u7a7a\u95f4',
  '\u5c55\u5385': '\u6587\u65c5\u7a7a\u95f4',
  '\u5c55\u9986': '\u6587\u65c5\u7a7a\u95f4',
  public: '\u516c\u5171\u7a7a\u95f4',
  '\u516c\u5171': '\u516c\u5171\u7a7a\u95f4',
  outdoor: '\u6237\u5916\u666f\u89c2',
  landscape: '\u6237\u5916\u666f\u89c2',
  '\u6237\u5916': '\u6237\u5916\u666f\u89c2',
  '\u666f\u89c2': '\u6237\u5916\u666f\u89c2',
  sport: '\u8fd0\u52a8\u573a\u9986',
  stadium: '\u8fd0\u52a8\u573a\u9986',
  '\u8fd0\u52a8': '\u8fd0\u52a8\u573a\u9986',
  '\u573a\u9986': '\u8fd0\u52a8\u573a\u9986',
  other: '\u5176\u4ed6',
  '\u5176\u4ed6': '\u5176\u4ed6',
})

const LEGACY_CATEGORY = Object.freeze({
  '\u4f4f\u5b85\u7a7a\u95f4': 'residential',
  '\u5546\u4e1a\u7a7a\u95f4': 'commercial',
  '\u529e\u516c\u7a7a\u95f4': 'commercial',
  '\u9152\u5e97\u7a7a\u95f4': 'hotel',
  '\u9910\u996e\u7a7a\u95f4': 'commercial',
  '\u6587\u65c5\u7a7a\u95f4': 'commercial',
  '\u516c\u5171\u7a7a\u95f4': 'commercial',
  '\u6237\u5916\u666f\u89c2': 'commercial',
  '\u8fd0\u52a8\u573a\u9986': 'commercial',
  '\u5176\u4ed6': 'all',
})

const REGION_LABELS = Object.freeze({
  china: { labelZh: '中国', labelEn: 'China' },
  'asia-pacific': { labelZh: '亚太', labelEn: 'Asia Pacific' },
  europe: { labelZh: '欧洲', labelEn: 'Europe' },
  'middle-east': { labelZh: '中东', labelEn: 'Middle East' },
  'north-america': { labelZh: '北美', labelEn: 'North America' },
  'latin-america': { labelZh: '拉丁美洲', labelEn: 'Latin America' },
  africa: { labelZh: '非洲', labelEn: 'Africa' }
})

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now(),
  }
}

function hasPublishedPresentation(item) {
  const published = item && item.presentation && item.presentation.published
  const slides = published && published.slides
  return Boolean(
    published &&
    Array.isArray(slides) &&
    slides.length >= 5 &&
    slides[0] && slides[0].type === 'cover' &&
    slides[slides.length - 1] && slides[slides.length - 1].type === 'closing'
  )
}

function hashPreviewToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex')
}

function normalizeSpaceType(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === 'all' || raw === '\u5168\u90e8') return ''
  if (SPACE_TYPE_ORDER.includes(raw)) return raw

  const lower = raw.toLowerCase()
  if (SPACE_TYPE_ALIASES[lower]) return SPACE_TYPE_ALIASES[lower]
  if (SPACE_TYPE_ALIASES[raw]) return SPACE_TYPE_ALIASES[raw]

  for (const key of Object.keys(SPACE_TYPE_ALIASES)) {
    if (lower.includes(String(key).toLowerCase())) {
      return SPACE_TYPE_ALIASES[key]
    }
  }

  return raw.slice(0, 30)
}

function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
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

function hasText(value) {
  return Boolean(value && String(value).trim())
}

function isWebsitePublishable(item) {
  return Boolean(
    item &&
    item.status === 'active' &&
    item.websiteVisible === true &&
    Array.isArray(item.imageFileIds) &&
    item.imageFileIds.length > 0 &&
    hasText(item.title) &&
    hasText(item.desc) &&
    hasText(item.city) &&
    hasText(item.countryCode) &&
    getCountryMeta(item.countryCode) &&
    coordinatesMatchCountry(item.countryCode, item.lat, item.lng)
  )
}

function inferSpaceType(item = {}) {
  const direct = normalizeSpaceType(item.spaceType || item.category)
  if (direct) return direct

  const fields = [
    item.caseType,
    item.scene,
    item.space,
    item.type,
    item.title,
    item.desc,
    item.city,
    item.style,
  ]
  if (Array.isArray(item.services)) fields.push(...item.services)
  if (Array.isArray(item.tags)) fields.push(...item.tags)

  const text = fields
    .filter(value => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase()

  for (const key of Object.keys(SPACE_TYPE_ALIASES)) {
    if (text.includes(String(key).toLowerCase())) {
      return SPACE_TYPE_ALIASES[key]
    }
  }

  return '\u5176\u4ed6'
}

function getSpaceTypeLabel(spaceType) {
  const value = String(spaceType || '').trim()
  if (value.endsWith('\u7a7a\u95f4')) return value.slice(0, -2)
  return value || '\u5176\u4ed6'
}

function buildSpaceTypeStats(items) {
  const counts = new Map()
  for (const item of items) {
    const spaceType = inferSpaceType(item)
    counts.set(spaceType, (counts.get(spaceType) || 0) + 1)
  }

  const ordered = []
  for (const value of SPACE_TYPE_ORDER) {
    if (counts.has(value)) {
      ordered.push({
        value,
        label: getSpaceTypeLabel(value),
        count: counts.get(value),
      })
      counts.delete(value)
    }
  }

  for (const value of counts.keys()) {
    ordered.push({
      value,
      label: getSpaceTypeLabel(value),
      count: counts.get(value),
    })
  }

  return ordered
}

async function batchGetTempUrls(fileIds) {
  const map = new Map()
  if (!fileIds || !fileIds.length) return map

  const CHUNK = 50
  for (let i = 0; i < fileIds.length; i += CHUNK) {
    const chunk = fileIds.slice(i, i + CHUNK)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      if (res.fileList) {
        for (const item of res.fileList) {
          const fileUrl = item.tempFileURL || item.download_url || item.downloadUrl
          if (item.fileID && fileUrl) {
            map.set(item.fileID, fileUrl)
          }
        }
      }
    } catch (e) {
      console.error('[lighting_cases_list] getTempFileURL failed:', e)
    }
  }
  return map
}

function mapCase(item, urlMap) {
  const fileIds = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
  const spaceType = inferSpaceType(item)
  return {
    _id: item._id,
    category: LEGACY_CATEGORY[spaceType] || item.category || 'all',
    spaceType,
    spaceTypeLabel: getSpaceTypeLabel(spaceType),
    imageFileIds: fileIds,
    imageUrls: fileIds.map(fid => urlMap.get(fid) || '').filter(Boolean),
    title: item.title || '',
    services: Array.isArray(item.services) ? item.services : [],
    desc: item.desc || '',
    city: item.city || '',
    area: item.area || '',
    style: item.style || '',
    officialAccountUrl: item.officialAccountUrl || '',
    sortOrder: item.sortOrder || 0,
    presentationAvailable: item.status === 'active' && hasPublishedPresentation(item),
  }
}

function collectPresentationImageFileIds(slides) {
  const fileIds = []
  const seen = new Set()
  ;(Array.isArray(slides) ? slides : []).forEach(slide => {
    ;(Array.isArray(slide && slide.imageFileIds) ? slide.imageFileIds : []).forEach(fileId => {
      if (fileId && !seen.has(fileId)) {
        seen.add(fileId)
        fileIds.push(fileId)
      }
    })
  })
  return fileIds
}

function mapPublicSlide(slide, urlMap) {
  const imageFileIds = Array.isArray(slide.imageFileIds) ? slide.imageFileIds.filter(Boolean).slice(0, 2) : []
  return {
    id: String(slide.id || ''),
    type: String(slide.type || ''),
    layout: String(slide.layout || ''),
    sectionNo: String(slide.sectionNo || ''),
    imageFileIds,
    imageUrls: imageFileIds.map(fileId => urlMap.get(fileId) || ''),
    imageFocals: slide.imageFocals && typeof slide.imageFocals === 'object' ? slide.imageFocals : {},
    label: String(slide.label || ''),
    title: String(slide.title || ''),
    body: String(slide.body || ''),
    strategyItems: Array.isArray(slide.strategyItems)
      ? slide.strategyItems.slice(0, 3).map(item => ({ title: String(item.title || ''), body: String(item.body || '') }))
      : [],
    dominantColor: /^#[0-9A-F]{6}$/i.test(String(slide.dominantColor || ''))
      ? String(slide.dominantColor).toUpperCase()
      : '#24221F'
  }
}

async function readCaseById(id) {
  try {
    const result = await db.collection(COLLECTION).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  } catch (error) {
    return null
  }
}

async function buildPresentationResponse(caseDoc, presentation, options = {}) {
  const slides = Array.isArray(presentation && presentation.slides) ? presentation.slides : []
  const urlMap = await batchGetTempUrls(collectPresentationImageFileIds(slides))
  return {
    case: {
      id: caseDoc._id,
      title: caseDoc.title || '',
      city: caseDoc.city || '',
      spaceType: caseDoc.spaceType || ''
    },
    theme: caseDoc.presentation && caseDoc.presentation.theme || 'dark-gallery-v1',
    version: options.version || null,
    draftRevision: options.draftRevision || null,
    preview: options.preview === true,
    slides: slides.map(slide => mapPublicSlide(slide, urlMap))
  }
}

async function getPublishedPresentation(event) {
  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) return resp(false, 'INVALID_PARAMS', '缺少案例 id')
  const caseDoc = await readCaseById(id)
  if (!caseDoc || caseDoc.status !== 'active') {
    return resp(false, 'NOT_FOUND', '案例不存在或已下架')
  }
  if (!hasPublishedPresentation(caseDoc)) {
    return resp(false, 'NO_PUBLISHED_PRESENTATION', '该案例暂无已发布的沉浸演示')
  }
  const published = caseDoc.presentation.published
  return resp(true, 'OK', '查询成功', await buildPresentationResponse(caseDoc, published, {
    version: Number(published.version) || 1
  }))
}

async function getPreviewPresentation(event) {
  const token = typeof event.token === 'string' ? event.token.trim() : ''
  if (!token) return resp(false, 'INVALID_PARAMS', '缺少预览凭证')
  let tokenRecord = null
  try {
    const result = await db.collection(PREVIEW_TOKEN_COLLECTION)
      .where({ tokenHash: hashPreviewToken(token) })
      .limit(1)
      .get()
    tokenRecord = result.data && result.data[0]
  } catch (error) {
    console.warn('[lighting_cases_list] preview token lookup failed:', error.message)
  }
  if (!tokenRecord || Number(tokenRecord.expiresAt) <= Date.now()) {
    return resp(false, 'PREVIEW_EXPIRED', '预览凭证已失效，请在后台重新生成')
  }

  const caseDoc = await readCaseById(String(tokenRecord.caseId || ''))
  const draft = caseDoc && caseDoc.presentation && caseDoc.presentation.draft
  if (!caseDoc || !draft || Number(draft.revision) !== Number(tokenRecord.draftRevision)) {
    return resp(false, 'PREVIEW_EXPIRED', '草稿已经变化，请在后台重新生成预览码')
  }

  if (tokenRecord._id) {
    db.collection(PREVIEW_TOKEN_COLLECTION).doc(tokenRecord._id).update({ data: { usedAt: Date.now() } })
      .catch(() => {})
  }
  return resp(true, 'OK', '查询成功', await buildPresentationResponse(caseDoc, draft, {
    draftRevision: Number(draft.revision),
    preview: true
  }))
}

function mapWebsiteCase(item, urlMap) {
  const fileIds = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
  const images = fileIds.map(fid => urlMap.get(fid) || '').filter(Boolean)
  const country = getCountryMeta(item.countryCode)

  return {
    id: item._id,
    titleZh: item.title || '',
    titleEn: item.titleEn || item.title || '',
    subtitleZh: item.subtitleZh || '',
    subtitleEn: item.subtitleEn || item.subtitleZh || '',
    countryZh: item.countryZh || country.countryZh,
    countryEn: item.countryEn || country.countryEn,
    countryCode: country.countryCode,
    cityZh: item.city || '',
    cityEn: item.cityEn || '',
    region: item.region || country.region,
    scope: item.scope || country.scope,
    lat: item.lat,
    lng: item.lng,
    projectTypeZh: item.spaceType || '',
    projectTypeEn: item.projectTypeEn || '',
    year: item.year,
    cover: images[0] || WEBSITE_IMAGE_FALLBACK,
    images: images.length ? images : [WEBSITE_IMAGE_FALLBACK],
    summaryZh: item.desc || '',
    summaryEn: item.summaryEn || item.desc || '',
    featured: item.featured === true,
    order: typeof item.sortOrder === 'number' ? item.sortOrder : 0
  }
}

function matchesWebsiteKeyword(item, keyword) {
  if (!keyword) return true
  const normalized = keyword.toLowerCase()
  const country = getCountryMeta(item.countryCode)
  const fields = [
    item.title,
    item.titleEn,
    item.subtitleZh,
    item.subtitleEn,
    item.desc,
    item.summaryEn,
    item.spaceType,
    item.projectTypeEn,
    item.city,
    item.cityEn,
    item.countryCode,
    item.countryZh,
    item.countryEn,
    country && country.countryZh,
    country && country.countryEn
  ]
  return fields
    .filter(value => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function normalizeWebsiteQuery(event) {
  const limitRaw = parseInt(event.limit || 80, 10)
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 80))
  const countryCode = normalizeCountryCode(event.countryCode)
  const region = typeof event.region === 'string' ? event.region.trim() : ''
  const scope = event.scope === 'china' || event.scope === 'international' ? event.scope : ''
  const keyword = typeof event.keyword === 'string' ? event.keyword.trim().slice(0, 60) : ''
  const featured = event.featured === undefined ? undefined : normalizeBoolean(event.featured)
  return { limit, countryCode, region, scope, keyword, featured }
}

function parseHttpBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  if (typeof body !== 'string') return {}
  try {
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    return {}
  }
}

function normalizeIncomingEvent(rawEvent = {}) {
  const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : {}
  const query = event.queryStringParameters && typeof event.queryStringParameters === 'object'
    ? event.queryStringParameters
    : {}
  const body = parseHttpBody(event.body)
  return {
    ...event,
    ...query,
    ...body,
  }
}

function buildWebsiteWhere(query) {
  const conditions = [{ status: 'active' }, { websiteVisible: true }]
  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

function collectImageFileIds(items) {
  const fileIds = []
  const seen = new Set()
  for (const item of items) {
    const ids = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
    for (const fid of ids) {
      if (fid && !seen.has(fid)) {
        seen.add(fid)
        fileIds.push(fid)
      }
    }
  }
  return fileIds
}

function countBy(items, getKey) {
  const counts = new Map()
  for (const item of items) {
    const key = getKey(item)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function buildWebsiteFilters(items) {
  const scopeCounts = countBy(items, item => item.scope)
  const regionCounts = countBy(items, item => item.region)
  const countryCounts = countBy(items, item => normalizeCountryCode(item.countryCode))

  return {
    scopes: ['china', 'international']
      .filter(value => scopeCounts.has(value))
      .map(value => ({ value, count: scopeCounts.get(value) })),
    regions: Object.keys(REGION_LABELS)
      .filter(value => regionCounts.has(value))
      .map(value => ({ value, ...REGION_LABELS[value], count: regionCounts.get(value) })),
    countries: Object.keys(COUNTRY_OPTIONS)
      .filter(countryCode => countryCounts.has(countryCode))
      .map(countryCode => ({
        countryCode,
        countryZh: COUNTRY_OPTIONS[countryCode].countryZh,
        countryEn: COUNTRY_OPTIONS[countryCode].countryEn,
        count: countryCounts.get(countryCode)
      }))
  }
}

async function getActiveItems(fetchLimit) {
  const res = await db.collection(COLLECTION)
    .where({ status: 'active' })
    .orderBy('sortOrder', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(fetchLimit)
    .get()

  return res.data || []
}

async function getWebsiteCases(event) {
  const query = normalizeWebsiteQuery(event)
  const listRes = await db.collection(COLLECTION)
    .where(buildWebsiteWhere(query))
    .limit(100)
    .get()

  const publishable = (listRes.data || [])
    .filter(isWebsitePublishable)
    .filter(item => !query.countryCode || normalizeCountryCode(item.countryCode) === query.countryCode)
    .filter(item => !query.region || item.region === query.region)
    .filter(item => !query.scope || item.scope === query.scope)
    .filter(item => query.featured === undefined || item.featured === query.featured)
    .filter(item => matchesWebsiteKeyword(item, query.keyword))
    .sort((a, b) => {
      const orderDiff = (typeof b.sortOrder === 'number' ? b.sortOrder : 0) - (typeof a.sortOrder === 'number' ? a.sortOrder : 0)
      if (orderDiff) return orderDiff
      return (typeof b.createdAt === 'number' ? b.createdAt : 0) - (typeof a.createdAt === 'number' ? a.createdAt : 0)
    })
    .slice(0, query.limit)

  const urlMap = await batchGetTempUrls(collectImageFileIds(publishable))
  const items = publishable
    .map(item => mapWebsiteCase(item, urlMap))
    .filter(item => item.cover && item.images.length > 0)
  const featured = items.filter(item => item.featured).slice(0, 8)

  return resp(true, 'OK', '\u67e5\u8be2\u6210\u529f', {
    items,
    featured,
    total: items.length,
    filters: buildWebsiteFilters(publishable)
  })
}

async function getCaseDetail(event) {
  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) {
    return resp(false, 'INVALID_PARAMS', '\u7f3a\u5c11\u6848\u4f8b id')
  }

  let doc = null
  try {
    doc = await readCaseById(id)
  } catch (e) {
    console.warn('[lighting_cases_list] case not found:', id, e.message)
    return resp(false, 'NOT_FOUND', '\u6848\u4f8b\u4e0d\u5b58\u5728\u6216\u5df2\u4e0b\u67b6')
  }

  if (!doc || doc.status !== 'active') {
    return resp(false, 'NOT_FOUND', '\u6848\u4f8b\u4e0d\u5b58\u5728\u6216\u5df2\u4e0b\u67b6')
  }

  const urlMap = await batchGetTempUrls(
    Array.isArray(doc.imageFileIds) ? doc.imageFileIds : []
  )
  return resp(true, 'OK', '\u67e5\u8be2\u6210\u529f', { item: mapCase(doc, urlMap) })
}

exports.main = async (rawEvent = {}) => {
  const event = normalizeIncomingEvent(rawEvent)
  try {
    if (event.action === 'detail') {
      return await getCaseDetail(event)
    }
    if (event.action === 'presentation') {
      return await getPublishedPresentation(event)
    }
    if (event.action === 'presentationPreview') {
      return await getPreviewPresentation(event)
    }
    if (event.channel === 'website') {
      return await getWebsiteCases(event)
    }

    const limitRaw = parseInt(event.limit || 20, 10)
    const limit = Math.min(50, Math.max(1, limitRaw))
    const requestedSpaceType = normalizeSpaceType(event.spaceType || event.category)
    const items = await getActiveItems(100)
    const spaceTypes = buildSpaceTypeStats(items)
    const filtered = requestedSpaceType
      ? items.filter(item => inferSpaceType(item) === requestedSpaceType).slice(0, limit)
      : items.slice(0, limit)

    const allFileIds = []
    const seen = new Set()
    for (const item of filtered) {
      const ids = Array.isArray(item.imageFileIds) ? item.imageFileIds : []
      for (const fid of ids) {
        if (fid && !seen.has(fid)) {
          seen.add(fid)
          allFileIds.push(fid)
        }
      }
    }

    const urlMap = await batchGetTempUrls(allFileIds)
    const enriched = filtered.map(item => mapCase(item, urlMap))

    return resp(true, 'OK', '\u67e5\u8be2\u6210\u529f', {
      items: enriched,
      spaceTypes,
      activeSpaceType: requestedSpaceType,
      total: filtered.length,
    })
  } catch (e) {
    console.error('[lighting_cases_list] failed:', e)
    return resp(false, 'SERVER_ERROR', e.message || '\u670d\u52a1\u5668\u5f02\u5e38')
  }
}
