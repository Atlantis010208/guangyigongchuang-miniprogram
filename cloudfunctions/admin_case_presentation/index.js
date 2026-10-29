'use strict'

const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin-auth')
const { createPresentationService } = require('./presentation-service')
const { createAiAdapter } = require('./ai-adapter')
const { createPresentationGenerator } = require('./presentation-generator')
const { createGenerationTaskService } = require('./presentation-generation-task')
const { createPreviewService } = require('./preview-service')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command

async function batchGetTempUrls(fileIds) {
  const result = await cloud.getTempFileURL({ fileList: fileIds })
  const map = new Map()
  ;(result.fileList || []).forEach(item => {
    const url = item.tempFileURL || item.download_url || item.downloadUrl
    if (item.fileID && url) map.set(item.fileID, url)
  })
  return map
}

const baseService = createPresentationService({ db })
const previewTtlMs = Number(process.env.CASE_PRESENTATION_PREVIEW_TTL_MS)
const previewService = createPreviewService({
  db,
  command,
  cloud,
  ...(Number.isFinite(previewTtlMs) && previewTtlMs > 0 ? { ttlMs: previewTtlMs } : {})
})
let generationService = null
function getGenerationService() {
  if (generationService) return generationService
  const aiAdapter = createAiAdapter()
  const generator = createPresentationGenerator({ aiAdapter, getTempUrls: batchGetTempUrls })
  generationService = createPresentationService({ db, generator })
  return generationService
}

let generationTaskService = null
function getGenerationTaskService() {
  if (generationTaskService) return generationTaskService
  generationTaskService = createGenerationTaskService({
    db,
    command,
    baseService,
    generationService: getGenerationService()
  })
  return generationTaskService
}

function isGenerationWorkerEvent(event) {
  const type = String(event && (event.Type || event.type) || '').toLowerCase()
  const triggerName = String(event && (event.TriggerName || event.triggerName) || '')
  return type === 'timer' && (!triggerName || triggerName === 'case_presentation_generation_worker')
}

function response(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

function fromService(result) {
  return response(result.ok, result.code, result.message, result.data)
}

exports.main = async (event = {}) => {
  try {
    if (isGenerationWorkerEvent(event)) {
      return fromService(await getGenerationTaskService().processNext())
    }

    const auth = await requireAdmin(db, command)
    if (!auth.ok) {
      return response(false, auth.errorCode || 'FORBIDDEN', getErrorMessage(auth.errorCode))
    }

    switch (event.action) {
      case 'get':
        return fromService(await baseService.getPresentation(event.caseId))
      case 'generate':
        return fromService(await getGenerationTaskService().enqueue({
          caseId: event.caseId,
          force: event.force === true,
          requestedBy: auth.user && auth.user._id
        }))
      case 'generationStatus':
        return fromService(await getGenerationTaskService().getStatus({
          caseId: event.caseId,
          taskId: event.taskId
        }))
      case 'saveDraft':
        return fromService(await baseService.saveDraft({
          caseId: event.caseId,
          draft: event.draft,
          expectedRevision: event.expectedRevision
        }))
      case 'publish':
        return fromService(await baseService.publish({
          caseId: event.caseId,
          expectedRevision: event.expectedRevision
        }))
      case 'previewCode':
        return fromService(await previewService.createPreviewCode({
          caseId: event.caseId,
          expectedRevision: event.expectedRevision,
          createdBy: auth.user && auth.user._id
        }))
      default:
        return response(false, 'INVALID_ACTION', `不支持的操作类型: ${event.action || ''}`)
    }
  } catch (error) {
    console.error('[admin_case_presentation] failed:', error)
    return response(false, 'SERVER_ERROR', error.message || '服务器异常')
  }
}
