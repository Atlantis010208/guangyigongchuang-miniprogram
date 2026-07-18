const crypto = require('crypto')
const cloud = require('wx-server-sdk')
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
  const header = await db.collection(TEMPLATE_COLLECTION).doc(templateDocId(spaceType)).get()
  if (!header.data || !header.data.publishedVersionId) {
    return response(false, 'NOT_PUBLISHED', null, '该空间类型尚未发布后台模板')
  }
  const versionResult = await db.collection(VERSION_COLLECTION).doc(header.data.publishedVersionId).get()
  if (!versionResult.data || versionResult.data.source !== 'published') {
    return response(false, 'NOT_PUBLISHED', null, '已发布版本不存在')
  }
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

async function loadSubmissionVersion(spaceType, versionId) {
  const safeVersionId = versionId || fallbackVersionId(spaceType)
  const result = await db.collection(VERSION_COLLECTION).doc(safeVersionId).get()
  if (!result.data || result.data.spaceType !== spaceType) {
    const error = new Error('提交所用模板版本不存在')
    error.code = 'VERSION_NOT_FOUND'
    throw error
  }
  return result.data
}

async function findUser(openid) {
  if (!openid) return null
  const result = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => ({ data: [] }))
  return result.data && result.data[0] || null
}

function submissionDocId(openid, requestId) {
  const digest = crypto.createHash('sha256').update(`${openid}:${requestId}`).digest('hex').slice(0, 32)
  return `cfs_${digest}`
}

async function submit(event) {
  const { spaceType, versionId, answers, requestId } = event
  assertSpaceType(spaceType)
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(String(requestId || ''))) {
    return response(false, 'INVALID_REQUEST_ID', null, '提交请求 ID 无效')
  }
  const wxContext = cloud.getWXContext() || {}
  const openid = wxContext.OPENID || wxContext.openid || ''
  if (!openid) return response(false, 'MISSING_IDENTITY', null, '无法识别当前微信用户')

  const version = await loadSubmissionVersion(spaceType, versionId)
  const template = normalizeTemplate(version.template, spaceType)
  const templateErrors = validateTemplate(template, { forPublish: true })
  if (templateErrors.length) return response(false, 'INVALID_TEMPLATE', { errors: templateErrors }, '模板版本无效')
  const sanitized = sanitizeSubmission(template, answers)
  if (sanitized.errors.length) return response(false, 'INVALID_ANSWERS', { errors: sanitized.errors }, '请检查填写内容')
  const fileErrors = validateFileReferences(template, sanitized.answers, requestId)
  if (fileErrors.length) return response(false, 'INVALID_FILES', { errors: fileErrors }, '上传文件记录无效')

  const docId = submissionDocId(openid, requestId)
  const user = await findUser(openid)
  const now = Date.now()
  const summary = buildSubmissionSummary(template, sanitized.answers)
  const record = {
    requestId,
    templateId: version.templateId || template.id,
    versionId: version._id || versionId || fallbackVersionId(spaceType),
    version: version.version || 0,
    templateVersionId: version._id || versionId || fallbackVersionId(spaceType),
    templateVersion: version.version || 0,
    templateSource: version.source || 'published',
    spaceType,
    answers: sanitized.answers,
    projectSummary: summary,
    openid,
    userId: user && user._id || null,
    userNickname: user && (user.nickname || user.nickName || user.name) || '',
    searchText: `${summary} ${user && (user.nickname || user.nickName || user.name) || ''}`.trim(),
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  }
  const transactionResult = await db.runTransaction(async (transaction) => {
    const existing = await transaction.collection(SUBMISSION_COLLECTION).doc(docId).get()
    if (existing.data) return { duplicate: true, submittedAt: existing.data.createdAt }
    await transaction.collection(SUBMISSION_COLLECTION).doc(docId).set({ data: record })
    return { duplicate: false, submittedAt: now }
  })
  return response(true, 'OK', { id: docId, ...transactionResult })
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'listTypes') return await listTypes()
    if (event.action === 'getPublished') return await getPublished(event.spaceType)
    if (event.action === 'submit') return await submit(event)
    return response(false, 'INVALID_ACTION', null, '不支持的操作')
  } catch (error) {
    console.error('[collection_form_public]', error)
    return response(false, error.code || 'SERVER_ERROR', error.data, error.message || '服务器错误')
  }
}
