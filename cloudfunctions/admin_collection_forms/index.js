const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./common/admin_auth')
const {
  SPACE_TYPES,
  SPACE_TYPE_LABELS,
  createEmptyTemplate,
  normalizeTemplate,
  validateTemplate,
} = require('./common/collection_form_domain')
const { getFormTemplate } = require('./common/fallback_template')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })

const TEMPLATE_COLLECTION = 'collection_form_templates'
const VERSION_COLLECTION = 'collection_form_versions'
const SUBMISSION_COLLECTION = 'collection_form_submissions'

class ServiceError extends Error {
  constructor(code, message, data) {
    super(message)
    this.code = code
    this.data = data
  }
}

function templateDocId(spaceType) {
  return `collection_form_template_${spaceType}`
}

function fallbackVersionId(spaceType) {
  return `collection_form_fallback_${spaceType}_v1`
}

function publishedVersionId(spaceType, version) {
  return `collection_form_version_${spaceType}_v${version}`
}

function assertSpaceType(spaceType) {
  if (!SPACE_TYPES.includes(spaceType)) throw new ServiceError('INVALID_SPACE_TYPE', '空间类型无效')
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    const message = String(error && error.message || '')
    if (error && (error.errCode === -502005 || message.includes('not exist') || message.includes('collection not exists'))) {
      await db.createCollection(name).catch((createError) => {
        const createMessage = String(createError && createError.message || '')
        if (!createMessage.includes('already exist')) throw createError
      })
      return
    }
    throw error
  }
}

function adminId(authResult) {
  return authResult && authResult.user && authResult.user._id || ''
}

function success(data, message = '') {
  return { success: true, code: 'OK', data, message }
}

async function initialize(authResult) {
  await Promise.all([
    ensureCollection(TEMPLATE_COLLECTION),
    ensureCollection(VERSION_COLLECTION),
    ensureCollection(SUBMISSION_COLLECTION),
  ])
  const now = Date.now()
  const operatorId = adminId(authResult)
  const initialized = []

  for (const spaceType of SPACE_TYPES) {
    const docId = templateDocId(spaceType)
    const current = await db.collection(TEMPLATE_COLLECTION).doc(docId).get()
    if (!current.data) {
      const draft = createEmptyTemplate(spaceType)
      await db.collection(TEMPLATE_COLLECTION).doc(docId).set({ data: {
        spaceType,
        label: SPACE_TYPE_LABELS[spaceType],
        draft,
        draftRevision: 1,
        publishedVersion: null,
        publishedVersionId: null,
        createdAt: now,
        createdBy: operatorId,
        updatedAt: now,
        updatedBy: operatorId,
      } })
      initialized.push(spaceType)
    }

    const fallbackId = fallbackVersionId(spaceType)
    const fallbackCurrent = await db.collection(VERSION_COLLECTION).doc(fallbackId).get()
    if (!fallbackCurrent.data) {
      const template = normalizeTemplate(getFormTemplate(spaceType), spaceType)
      await db.collection(VERSION_COLLECTION).doc(fallbackId).set({ data: {
        templateId: template.id,
        spaceType,
        version: 0,
        schemaVersion: 1,
        source: 'builtin',
        template,
        publishedAt: now,
        publishedBy: operatorId,
      } })
    }
  }
  return success({ initialized, templates: await listTemplates() }, '初始化完成')
}

async function listTemplates() {
  let rows = []
  try {
    const result = await db.collection(TEMPLATE_COLLECTION).where({ spaceType: db.command.in(SPACE_TYPES) }).get()
    rows = result.data || []
  } catch (error) {
    const message = String(error && error.message || '')
    if (!(error && (error.errCode === -502005 || message.includes('not exist')))) throw error
  }
  const rowMap = new Map(rows.map((row) => [row.spaceType, row]))
  return SPACE_TYPES.map((spaceType) => {
    const row = rowMap.get(spaceType)
    if (!row) return {
      _id: templateDocId(spaceType),
      spaceType,
      label: SPACE_TYPE_LABELS[spaceType],
      initialized: false,
      draftRevision: 0,
      publishedVersion: null,
      publishedVersionId: null,
    }
    return {
      _id: row._id,
      spaceType,
      label: row.label || SPACE_TYPE_LABELS[spaceType],
      initialized: true,
      title: row.draft && row.draft.title || '',
      moduleCount: row.draft && row.draft.modules ? row.draft.modules.length : 0,
      questionCount: row.draft && row.draft.modules
        ? row.draft.modules.reduce((sum, module) => sum + module.questions.length, 0) : 0,
      draftRevision: row.draftRevision || 0,
      publishedVersion: row.publishedVersion == null ? null : row.publishedVersion,
      publishedVersionId: row.publishedVersionId || null,
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || '',
    }
  })
}

async function getTemplateHeader(spaceType) {
  assertSpaceType(spaceType)
  const result = await db.collection(TEMPLATE_COLLECTION).doc(templateDocId(spaceType)).get()
  if (!result.data) throw new ServiceError('NOT_INITIALIZED', '该空间类型尚未初始化')
  return result.data
}

async function saveDraft(event, authResult) {
  const { spaceType, draft, expectedRevision } = event
  assertSpaceType(spaceType)
  const errors = validateTemplate({ ...(draft || {}), spaceType }, { forPublish: false })
  const normalized = normalizeTemplate(draft, spaceType)
  if (errors.length) throw new ServiceError('INVALID_TEMPLATE', '草稿结构无效', { errors })
  const docId = templateDocId(spaceType)
  const now = Date.now()
  const operatorId = adminId(authResult)

  const result = await db.runTransaction(async (transaction) => {
    const current = await transaction.collection(TEMPLATE_COLLECTION).doc(docId).get()
    if (!current.data) throw new ServiceError('NOT_INITIALIZED', '该空间类型尚未初始化')
    const revision = current.data.draftRevision || 0
    if (Number(expectedRevision) !== revision) throw new ServiceError('CONFLICT', '草稿已被其他管理员更新')
    const nextRevision = revision + 1
    await transaction.collection(TEMPLATE_COLLECTION).doc(docId).update({ data: {
      draft: normalized,
      draftRevision: nextRevision,
      updatedAt: now,
      updatedBy: operatorId,
    } })
    return { draft: normalized, draftRevision: nextRevision, updatedAt: now }
  })
  return success(await getTemplateHeader(spaceType), '草稿已保存')
}

async function publish(event, authResult) {
  const { spaceType, expectedRevision } = event
  assertSpaceType(spaceType)
  if (event.draft) {
    const requestedErrors = validateTemplate({ ...event.draft, spaceType }, { forPublish: true })
    if (requestedErrors.length) throw new ServiceError('INVALID_TEMPLATE', '发布前请修正表单配置', { errors: requestedErrors })
  }
  const requestedDraft = event.draft ? normalizeTemplate(event.draft, spaceType) : null
  const docId = templateDocId(spaceType)
  const now = Date.now()
  const operatorId = adminId(authResult)

  const result = await db.runTransaction(async (transaction) => {
    const current = await transaction.collection(TEMPLATE_COLLECTION).doc(docId).get()
    if (!current.data) throw new ServiceError('NOT_INITIALIZED', '该空间类型尚未初始化')
    const revision = current.data.draftRevision || 0
    if (Number(expectedRevision) !== revision) throw new ServiceError('CONFLICT', '草稿已被其他管理员更新')
    const snapshot = requestedDraft || normalizeTemplate(current.data.draft, spaceType)
    const errors = validateTemplate(snapshot, { forPublish: true })
    if (errors.length) throw new ServiceError('INVALID_TEMPLATE', '发布前请修正表单配置', { errors })
    const version = (current.data.publishedVersion || 0) + 1
    const versionId = publishedVersionId(spaceType, version)
    const existingVersion = await transaction.collection(VERSION_COLLECTION).doc(versionId).get()
    if (existingVersion.data) throw new ServiceError('VERSION_EXISTS', '目标版本已存在，禁止覆盖历史发布快照')
    await transaction.collection(VERSION_COLLECTION).doc(versionId).set({ data: {
      templateId: snapshot.id,
      spaceType,
      version,
      schemaVersion: 1,
      source: 'published',
      template: snapshot,
      publishedAt: now,
      publishedBy: operatorId,
    } })
    await transaction.collection(TEMPLATE_COLLECTION).doc(docId).update({ data: {
      draft: snapshot,
      draftRevision: revision + 1,
      publishedVersion: version,
      publishedVersionId: versionId,
      publishedAt: now,
      publishedBy: operatorId,
      updatedAt: now,
      updatedBy: operatorId,
    } })
    return { version, versionId, publishedAt: now }
  })
  return success(result, `已发布 v${result.version}`)
}

async function listVersions(event) {
  const { spaceType, limit = 20, offset = 0 } = event
  assertSpaceType(spaceType)
  const query = { spaceType, source: 'published' }
  const [countResult, dataResult] = await Promise.all([
    db.collection(VERSION_COLLECTION).where(query).count(),
    db.collection(VERSION_COLLECTION).where(query).orderBy('version', 'desc')
      .skip(Math.max(0, Number(offset) || 0)).limit(Math.min(100, Math.max(1, Number(limit) || 20)))
      .field({ template: false }).get(),
  ])
  return success({ list: dataResult.data || [], total: countResult.total || 0 })
}

async function getVersion(event) {
  if (!event.versionId) throw new ServiceError('INVALID_PARAMS', '缺少版本 ID')
  const result = await db.collection(VERSION_COLLECTION).doc(event.versionId).get()
  if (!result.data || result.data.source !== 'published') throw new ServiceError('NOT_FOUND', '版本不存在')
  return success(result.data)
}

exports.main = async (event = {}) => {
  try {
    const authResult = await requireAdmin(db, db.command)
    if (!authResult.ok) return { success: false, code: authResult.errorCode, errorMessage: getErrorMessage(authResult.errorCode) }
    if (authResult.userType === 'designers') return { success: false, code: 'FORBIDDEN', errorMessage: '仅管理员可访问动态收集表管理功能' }
    switch (event.action) {
      case 'initialize': return await initialize(authResult)
      case 'list': return success(await listTemplates())
      case 'getDraft': return success(await getTemplateHeader(event.spaceType))
      case 'saveDraft': return await saveDraft(event, authResult)
      case 'publish': return await publish(event, authResult)
      case 'listVersions': return await listVersions(event)
      case 'getVersion': return await getVersion(event)
      default: throw new ServiceError('INVALID_ACTION', '不支持的操作')
    }
  } catch (error) {
    console.error('[admin_collection_forms]', error)
    return {
      success: false,
      code: error.code || 'SERVER_ERROR',
      errorMessage: error.message || '服务器错误',
      data: error.data,
    }
  }
}
