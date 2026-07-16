const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./common/admin_auth')
const { SPACE_TYPES } = require('./common/collection_form_domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })
const _ = db.command
const SUBMISSION_COLLECTION = 'collection_form_submissions'
const VERSION_COLLECTION = 'collection_form_versions'

function success(data) {
  return { success: true, code: 'OK', data }
}

function buildQuery(event) {
  const query = {}
  if (event.spaceType && SPACE_TYPES.includes(event.spaceType)) query.spaceType = event.spaceType
  if (event.version !== undefined && event.version !== null && event.version !== '') query.templateVersion = Number(event.version)
  if (event.startAt || event.endAt) {
    let command = event.startAt ? _.gte(Number(event.startAt)) : _.gte(0)
    if (event.endAt) command = command.and(_.lte(Number(event.endAt)))
    query.createdAt = command
  }
  if (event.keyword) {
    const keyword = String(event.keyword).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (keyword) query.searchText = db.RegExp({ regexp: keyword, options: 'i' })
  }
  return query
}

async function list(event) {
  const limit = Math.min(100, Math.max(1, Number(event.limit) || 20))
  const offset = Math.max(0, Number(event.offset) || 0)
  const query = buildQuery(event)
  const includeAnswers = Boolean(event.includeAnswers && event.spaceType && event.version !== undefined && event.version !== null)
  let dataQuery = db.collection(SUBMISSION_COLLECTION).where(query).orderBy('createdAt', 'desc').skip(offset).limit(limit)
  if (!includeAnswers) dataQuery = dataQuery.field({ answers: false, openid: false })
  const [countResult, dataResult] = await Promise.all([
    db.collection(SUBMISSION_COLLECTION).where(query).count(),
    dataQuery.get(),
  ])
  return success({
    list: dataResult.data || [],
    total: countResult.total || 0,
    pagination: { limit, offset, hasMore: offset + (dataResult.data || []).length < (countResult.total || 0) },
  })
}

async function attachTemporaryFileUrls(submission) {
  const fileIDs = []
  Object.values(submission.answers || {}).forEach((answer) => {
    if (!Array.isArray(answer)) return
    answer.forEach((file) => { if (file && typeof file.fileID === 'string') fileIDs.push(file.fileID) })
  })
  if (!fileIDs.length) return submission
  const result = await cloud.getTempFileURL({ fileList: [...new Set(fileIDs)] })
  const urlMap = new Map((result.fileList || []).map((file) => [file.fileID, file.tempFileURL || '']))
  const answers = { ...submission.answers }
  Object.entries(answers).forEach(([questionId, answer]) => {
    if (!Array.isArray(answer)) return
    answers[questionId] = answer.map((file) => file && file.fileID ? { ...file, tempFileURL: urlMap.get(file.fileID) || '' } : file)
  })
  return { ...submission, answers }
}
async function get(event) {
  if (!event.id) return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少提交记录 ID' }
  const submissionResult = await db.collection(SUBMISSION_COLLECTION).doc(event.id).get()
  if (!submissionResult.data) return { success: false, code: 'NOT_FOUND', errorMessage: '提交记录不存在' }
  const versionResult = await db.collection(VERSION_COLLECTION).doc(submissionResult.data.versionId).get()
  if (!versionResult.data) return { success: false, code: 'VERSION_NOT_FOUND', errorMessage: '提交对应的模板版本不存在' }
  const submission = await attachTemporaryFileUrls(submissionResult.data)
  return success({ submission, version: versionResult.data })
}

exports.main = async (event = {}) => {
  try {
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) return { success: false, code: authResult.errorCode, errorMessage: getErrorMessage(authResult.errorCode) }
    if (authResult.userType === 'designers') return { success: false, code: 'FORBIDDEN', errorMessage: '仅管理员可访问动态收集表管理功能' }
    if (event.action === 'list') return await list(event)
    if (event.action === 'get') return await get(event)
    return { success: false, code: 'INVALID_ACTION', errorMessage: '不支持的操作' }
  } catch (error) {
    console.error('[admin_collection_form_submissions]', error)
    return { success: false, code: error.code || 'SERVER_ERROR', errorMessage: error.message || '服务器错误' }
  }
}
