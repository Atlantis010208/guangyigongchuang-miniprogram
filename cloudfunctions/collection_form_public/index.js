const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const { getFormTemplate } = require('./common/form-template')
const {
  SPACE_TYPES,
  SPACE_TYPE_LABELS,
  normalizeTemplate,
  validateTemplate,
  sanitizeSubmission,
  buildSubmissionSummary,
  validateFileReferences,
} = require('./common/collection_form_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })

const TEMPLATE_COLLECTION = 'collection_form_templates'
const VERSION_COLLECTION = 'collection_form_versions'
const SUBMISSION_COLLECTION = 'collection_form_submissions'
const DRAFT_COLLECTION = 'collection_form_drafts'
const MAX_DRAFT_BYTES = 256 * 1024
const MAX_LIST_LIMIT = 50
// 与 PDF 导出函数保持一致；版本变化会让历史旧版 PDF 自动进入重新生成流程。
const PDF_RENDER_VERSION = 6

function templateDocId(spaceType) {
  return `collection_form_template_${spaceType}`
}

function fallbackVersionId(spaceType) {
  return `collection_form_fallback_${spaceType}_v1`
}

function response(success, code, data, errorMessage) {
  return { success, code, data, errorMessage }
}

function assertSpaceType(spaceType) {
  if (!SPACE_TYPES.includes(spaceType)) {
    const error = new Error('空间类型无效')
    error.code = 'INVALID_SPACE_TYPE'
    throw error
  }
}

function assertIdentity() {
  const wxContext = cloud.getWXContext() || {}
  const openid = wxContext.OPENID || wxContext.openid || ''
  if (!openid) {
    const error = new Error('无法识别当前微信用户')
    error.code = 'MISSING_IDENTITY'
    throw error
  }
  return openid
}

function assertRequestId(requestId) {
  const safeRequestId = String(requestId || '')
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(safeRequestId)) {
    const error = new Error('提交请求 ID 无效')
    error.code = 'INVALID_REQUEST_ID'
    throw error
  }
  return safeRequestId
}

function hashId(prefix, parts) {
  const digest = crypto.createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32)
  return `${prefix}_${digest}`
}

function submissionDocId(openid, requestId) {
  return hashId('cfs', [openid, requestId])
}

function draftDocId(openid, spaceType, versionId) {
  return hashId('cfd', [openid, spaceType, versionId || fallbackVersionId(spaceType)])
}

function cloneJson(value, fallback) {
  try {
    if (value === undefined) return fallback
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return fallback
  }
}

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value || {}), 'utf8')
}

function normalizePosition(position) {
  const source = position && typeof position === 'object' ? position : {}
  const view = ['overview', 'module', 'question', 'review'].includes(source.view) ? source.view : 'overview'
  const moduleIndex = Math.max(0, Math.floor(Number(source.moduleIndex) || 0))
  const questionIndex = Math.max(0, Math.floor(Number(source.questionIndex) || 0))
  return { view, moduleIndex, questionIndex }
}

function normalizeDraftAnswers(answers) {
  const normalized = cloneJson(answers && typeof answers === 'object' ? answers : {}, {})
  if (byteSize(normalized) > MAX_DRAFT_BYTES) {
    const error = new Error('草稿内容过大，请减少上传记录或文本长度')
    error.code = 'DRAFT_TOO_LARGE'
    throw error
  }
  return normalized
}

function buildBuiltinVersion(spaceType) {
  const template = normalizeTemplate(getFormTemplate(spaceType), spaceType)
  return {
    _id: fallbackVersionId(spaceType),
    templateId: template.id,
    version: template.version || 1,
    source: 'builtin',
    spaceType,
    template,
  }
}

async function listTypes() {
  const types = await Promise.all(SPACE_TYPES.map(async (spaceType) => {
    const result = await db.collection(TEMPLATE_COLLECTION).doc(templateDocId(spaceType)).get().catch(() => ({ data: null }))
    const draftTitle = result.data && result.data.draft && result.data.draft.title
    const title = typeof draftTitle === 'string' && draftTitle.trim()
      ? draftTitle.trim().slice(0, 50)
      : SPACE_TYPE_LABELS[spaceType]
    return { spaceType, title }
  }))
  return response(true, 'OK', { types })
}

async function getPublished(spaceType) {
  assertSpaceType(spaceType)
  const header = await db.collection(TEMPLATE_COLLECTION).doc(templateDocId(spaceType)).get().catch(() => ({ data: null }))
  const publishedVersionId = header.data && header.data.publishedVersionId
  if (publishedVersionId) {
    const versionResult = await db.collection(VERSION_COLLECTION).doc(publishedVersionId).get().catch(() => ({ data: null }))
    if (versionResult.data && versionResult.data.source === 'published') {
      const template = normalizeTemplate(versionResult.data.template, spaceType)
      const errors = validateTemplate(template, { forPublish: true })
      if (errors.length) return response(false, 'INVALID_TEMPLATE', { errors }, '已发布模板结构无效')
      return response(true, 'OK', {
        template: {
          ...template,
          version: versionResult.data.version,
          versionId: versionResult.data._id,
          source: 'published',
        },
        publishedAt: versionResult.data.publishedAt,
      })
    }
  }

  const builtin = buildBuiltinVersion(spaceType)
  return response(true, 'OK', {
    template: {
      ...builtin.template,
      version: builtin.version,
      versionId: builtin._id,
      source: 'builtin',
    },
    publishedAt: null,
  })
}

async function loadSubmissionVersion(spaceType, versionId) {
  assertSpaceType(spaceType)
  const safeVersionId = versionId || fallbackVersionId(spaceType)
  const result = await db.collection(VERSION_COLLECTION).doc(safeVersionId).get().catch(() => ({ data: null }))
  if (result.data && result.data.spaceType === spaceType) return result.data
  if (!versionId || safeVersionId === fallbackVersionId(spaceType)) return buildBuiltinVersion(spaceType)
  const error = new Error('提交所用模板版本不存在')
  error.code = 'VERSION_NOT_FOUND'
  throw error
}

async function findUser(openid) {
  if (!openid) return null
  const result = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => ({ data: [] }))
  return result.data && result.data[0] || null
}

async function saveDraft(event) {
  const { spaceType, versionId, answers, position, requestId } = event
  assertSpaceType(spaceType)
  const openid = assertIdentity()
  const version = await loadSubmissionVersion(spaceType, versionId)
  const now = Date.now()
  const docId = draftDocId(openid, spaceType, version._id || versionId || fallbackVersionId(spaceType))
  const existing = await db.collection(DRAFT_COLLECTION).doc(docId).get().catch(() => ({ data: null }))
  const safeAnswers = normalizeDraftAnswers(answers)
  const safeRequestId = requestId ? assertRequestId(requestId) : ''
  const record = {
    openid,
    requestId: safeRequestId,
    templateId: version.templateId || (version.template && version.template.id) || '',
    versionId: version._id || versionId || fallbackVersionId(spaceType),
    version: version.version || 0,
    templateSource: version.source || 'published',
    spaceType,
    answers: safeAnswers,
    position: normalizePosition(position),
    status: 'draft',
    createdAt: existing.data && existing.data.createdAt || now,
    updatedAt: now,
  }
  await db.collection(DRAFT_COLLECTION).doc(docId).set({ data: record })
  return response(true, 'OK', { id: docId, updatedAt: now })
}

async function getDraft(event) {
  const { spaceType, versionId } = event
  assertSpaceType(spaceType)
  const openid = assertIdentity()
  const version = await loadSubmissionVersion(spaceType, versionId)
  const docId = draftDocId(openid, spaceType, version._id || versionId || fallbackVersionId(spaceType))
  const result = await db.collection(DRAFT_COLLECTION).doc(docId).get().catch(() => ({ data: null }))
  const draft = result.data && result.data.openid === openid ? result.data : null
  return response(true, 'OK', { draft })
}

async function clearDraft(event) {
  const { spaceType, versionId } = event
  assertSpaceType(spaceType)
  const openid = assertIdentity()
  const version = await loadSubmissionVersion(spaceType, versionId)
  const docId = draftDocId(openid, spaceType, version._id || versionId || fallbackVersionId(spaceType))
  await db.collection(DRAFT_COLLECTION).doc(docId).remove().catch(() => null)
  return response(true, 'OK', { id: docId })
}

async function submit(event) {
  const { spaceType, versionId, answers, requestId } = event
  assertSpaceType(spaceType)
  const safeRequestId = assertRequestId(requestId)
  const openid = assertIdentity()

  const version = await loadSubmissionVersion(spaceType, versionId)
  const template = normalizeTemplate(version.template, spaceType)
  const templateErrors = version.source === 'builtin' ? [] : validateTemplate(template, { forPublish: true })
  if (templateErrors.length) return response(false, 'INVALID_TEMPLATE', { errors: templateErrors }, '模板版本无效')
  const sanitized = sanitizeSubmission(template, answers)
  if (sanitized.errors.length) return response(false, 'INVALID_ANSWERS', { errors: sanitized.errors }, '请检查填写内容')
  const fileErrors = validateFileReferences(template, sanitized.answers, safeRequestId)
  if (fileErrors.length) return response(false, 'INVALID_FILES', { errors: fileErrors }, '上传文件记录无效')

  const docId = submissionDocId(openid, safeRequestId)
  const user = await findUser(openid)
  const now = Date.now()
  const summary = buildSubmissionSummary(template, sanitized.answers)
  const record = {
    requestId: safeRequestId,
    templateId: version.templateId || template.id,
    versionId: version._id || versionId || fallbackVersionId(spaceType),
    version: version.version || 0,
    templateVersionId: version._id || versionId || fallbackVersionId(spaceType),
    templateVersion: version.version || 0,
    templateSource: version.source || 'published',
    // 保存提交时的完整模板快照，保证历史 PDF 不受后续模板发布影响。
    template: cloneJson(template, null),
    spaceType,
    answers: sanitized.answers,
    projectSummary: summary,
    openid,
    userId: user && user._id || null,
    userNickname: user && (user.nickname || user.nickName || user.name) || '',
    searchText: `${summary} ${user && (user.nickname || user.nickName || user.name) || ''}`.trim(),
    status: 'submitted',
    pdfStatus: 'pending',
    pdfFileID: '',
    pdfFileName: '',
    pdfGeneratedAt: null,
    pdfError: '',
    pdfVersion: 0,
    createdAt: now,
    updatedAt: now,
  }
  const transactionResult = await db.runTransaction(async (transaction) => {
    const existing = await transaction.collection(SUBMISSION_COLLECTION).doc(docId).get()
    if (existing.data) return { duplicate: true, submittedAt: existing.data.createdAt }
    await transaction.collection(SUBMISSION_COLLECTION).doc(docId).set({ data: record })
    return { duplicate: false, submittedAt: now }
  })
  await clearDraft({ spaceType, versionId: version._id || versionId || fallbackVersionId(spaceType) }).catch(() => null)
  return response(true, 'OK', { id: docId, ...transactionResult })
}

async function listSubmissions(event) {
  const openid = assertIdentity()
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(Number(event.limit) || 20)))
  const result = await db.collection(SUBMISSION_COLLECTION)
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
    .catch(() => ({ data: [] }))
  const submissions = (result.data || []).map((item) => ({
    id: item._id,
    requestId: item.requestId,
    spaceType: item.spaceType,
    projectSummary: item.projectSummary || '',
    status: item.status || 'submitted',
    pdfStatus: item.pdfStatus === 'ready' && item.pdfVersion !== PDF_RENDER_VERSION ? 'pending' : (item.pdfStatus || 'pending'),
    pdfFileID: item.pdfFileID || '',
    pdfFileName: item.pdfFileName || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }))
  return response(true, 'OK', { submissions })
}

async function getSubmission(event) {
  const openid = assertIdentity()
  const id = String(event.id || '')
  if (!/^cfs_[a-f0-9]{32}$/.test(id)) return response(false, 'INVALID_ID', null, '提交记录 ID 无效')
  const result = await db.collection(SUBMISSION_COLLECTION).doc(id).get().catch(() => ({ data: null }))
  if (!result.data || result.data.openid !== openid) return response(false, 'NOT_FOUND', null, '提交记录不存在')
  return response(true, 'OK', { submission: result.data })
}

function publicPdfStatus(record) {
  return {
    id: record._id,
    requestId: record.requestId,
    pdfStatus: record.pdfStatus === 'ready' && record.pdfVersion !== PDF_RENDER_VERSION ? 'pending' : (record.pdfStatus || 'pending'),
    pdfFileID: record.pdfFileID || '',
    pdfFileName: record.pdfFileName || '',
    pdfGeneratedAt: record.pdfGeneratedAt || null,
    pdfError: record.pdfError || '',
    pdfVersion: record.pdfVersion || 0,
    createdAt: record.createdAt || null,
  }
}

async function getPdfStatus(event) {
  const openid = assertIdentity()
  const id = String(event.id || '')
  if (!/^cfs_[a-f0-9]{32}$/.test(id)) return response(false, 'INVALID_ID', null, '提交记录 ID 无效')
  const result = await db.collection(SUBMISSION_COLLECTION).doc(id).get().catch(() => ({ data: null }))
  if (!result.data || result.data.openid !== openid) return response(false, 'NOT_FOUND', null, '提交记录不存在')
  return response(true, 'OK', { submission: publicPdfStatus(result.data) })
}

async function requestPdf(event) {
  const openid = assertIdentity()
  const id = String(event.id || '')
  if (!/^cfs_[a-f0-9]{32}$/.test(id)) return response(false, 'INVALID_ID', null, '提交记录 ID 无效')
  const result = await db.collection(SUBMISSION_COLLECTION).doc(id).get().catch(() => ({ data: null }))
  if (!result.data || result.data.openid !== openid) return response(false, 'NOT_FOUND', null, '提交记录不存在')
  const current = result.data.pdfStatus === 'ready' && result.data.pdfVersion === PDF_RENDER_VERSION ? 'ready' : 'pending'
  if (current !== 'ready') {
    await db.collection(SUBMISSION_COLLECTION).doc(id).update({ data: {
      pdfStatus: 'pending', pdfError: '', updatedAt: Date.now(),
    } }).catch(() => null)
  }
  return response(true, 'OK', { submission: publicPdfStatus({ ...result.data, pdfStatus: current === 'ready' ? 'ready' : 'pending', pdfError: '' }) })
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'listTypes') return await listTypes()
    if (event.action === 'getPublished') return await getPublished(event.spaceType)
    if (event.action === 'saveDraft') return await saveDraft(event)
    if (event.action === 'getDraft') return await getDraft(event)
    if (event.action === 'clearDraft') return await clearDraft(event)
    if (event.action === 'submit') return await submit(event)
    if (event.action === 'listSubmissions') return await listSubmissions(event)
    if (event.action === 'getSubmission') return await getSubmission(event)
    if (event.action === 'getPdfStatus') return await getPdfStatus(event)
    if (event.action === 'requestPdf') return await requestPdf(event)
    return response(false, 'INVALID_ACTION', null, '不支持的操作')
  } catch (error) {
    console.error('[collection_form_public]', error)
    return response(false, error.code || 'SERVER_ERROR', error.data, error.message || '服务器错误')
  }
}

module.exports.__private__ = {
  PDF_RENDER_VERSION,
  fallbackVersionId,
  submissionDocId,
  draftDocId,
  normalizePosition,
  normalizeDraftAnswers,
}
