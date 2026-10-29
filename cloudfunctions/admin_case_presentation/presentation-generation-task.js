'use strict'

const crypto = require('crypto')
const { MIN_IMAGES, buildPresentationSummary, normalizeText } = require('./presentation-domain')
const { serviceError, serviceSuccess } = require('./presentation-service')

const COLLECTION = 'lighting_cases'
const ACTIVE_STATUSES = new Set(['pending', 'running'])
const DEFAULT_LEASE_MS = 10 * 60 * 1000

function createTaskId() {
  return crypto.randomBytes(12).toString('hex')
}

function publicTask(task) {
  return {
    taskId: task.id,
    status: task.status,
    stage: task.stage || '',
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  }
}

function createGenerationTaskService({
  db,
  command,
  baseService,
  generationService,
  now = () => Date.now(),
  randomId = createTaskId,
  leaseMs = DEFAULT_LEASE_MS,
  collection = COLLECTION
}) {
  if (!db || !baseService || !generationService) throw new Error('生成任务服务缺少依赖')

  async function enqueue({ caseId, force = false, requestedBy = '' }) {
    return baseService.mutateCase(caseId, caseDoc => {
      const imageCount = Array.isArray(caseDoc.imageFileIds) ? caseDoc.imageFileIds.length : 0
      if (imageCount < MIN_IMAGES) {
        return serviceError('MIN_IMAGES_REQUIRED', `至少需要 ${MIN_IMAGES} 张案例图片`)
      }
      const presentation = caseDoc.presentation || {}
      const existing = presentation.generationTask
      if (existing && ACTIVE_STATUSES.has(existing.status)) {
        return serviceSuccess(publicTask(existing), '生成任务正在进行')
      }
      if (presentation.draft && force !== true) {
        return serviceError('DRAFT_EXISTS_CONFIRM_REQUIRED', '重新生成会替换当前草稿，请确认后继续', {
          currentRevision: Number(presentation.draft.revision) || 0
        })
      }

      const timestamp = now()
      const task = {
        id: randomId(),
        caseId: normalizeText(caseId),
        force: force === true,
        requestedBy: normalizeText(requestedBy),
        status: 'pending',
        stage: 'queued',
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: 0,
        finishedAt: 0,
        leaseExpiresAt: 0,
        warnings: [],
        errorCode: '',
        errorMessage: ''
      }
      return {
        ...serviceSuccess(publicTask(task), '生成任务已进入队列'),
        update: { presentation: { ...presentation, generationTask: task } }
      }
    })
  }

  async function getStatus({ caseId, taskId }) {
    const caseDoc = await baseService.readCase(caseId)
    if (!caseDoc) return serviceError('CASE_NOT_FOUND', '案例不存在')
    const presentation = caseDoc.presentation || {}
    const task = presentation.generationTask
    if (!task || task.id !== normalizeText(taskId)) return serviceError('GENERATION_TASK_NOT_FOUND', '生成任务不存在')
    if (task.status === 'failed') {
      return serviceError(task.errorCode || 'AI_SERVICE_ERROR', task.errorMessage || '演示草稿生成失败', {
        ...publicTask(task),
        status: 'failed'
      })
    }
    if (task.status === 'succeeded') {
      if (!presentation.draft) return serviceError('DRAFT_REQUIRED', '生成任务已完成但草稿不存在')
      return serviceSuccess({
        ...publicTask(task),
        status: 'succeeded',
        draft: presentation.draft,
        warnings: Array.isArray(task.warnings) ? task.warnings : [],
        presentationSummary: buildPresentationSummary(caseDoc)
      }, '演示草稿已生成')
    }
    return serviceSuccess(publicTask(task), '生成任务处理中')
  }

  async function findCandidate() {
    // 案例量很小，直接扫描可避免给嵌套任务字段额外创建数据库索引。
    const result = await db.collection(collection).limit(100).get()
    const cases = Array.isArray(result.data) ? result.data : []
    const pending = cases.find(caseDoc => (
      caseDoc.presentation &&
      caseDoc.presentation.generationTask &&
      caseDoc.presentation.generationTask.status === 'pending'
    ))
    if (pending) return pending
    const timestamp = now()
    return cases.find(caseDoc => {
      const task = caseDoc.presentation && caseDoc.presentation.generationTask
      return task && task.status === 'running' && Number(task.leaseExpiresAt) < timestamp
    }) || null
  }

  async function claim(caseId, taskId) {
    return baseService.mutateCase(caseId, caseDoc => {
      const presentation = caseDoc.presentation || {}
      const task = presentation.generationTask
      const timestamp = now()
      const claimable = task && task.id === taskId && (
        task.status === 'pending' || (task.status === 'running' && Number(task.leaseExpiresAt) < timestamp)
      )
      if (!claimable) return serviceError('GENERATION_TASK_BUSY', '生成任务已被其他实例处理')
      const runningTask = {
        ...task,
        status: 'running',
        stage: 'generating',
        startedAt: Number(task.startedAt) || timestamp,
        updatedAt: timestamp,
        leaseExpiresAt: timestamp + leaseMs
      }
      return {
        ...serviceSuccess({ caseId: caseDoc._id, ...publicTask(runningTask), force: runningTask.force }, '生成任务已领取'),
        update: { presentation: { ...presentation, generationTask: runningTask } }
      }
    })
  }

  async function finish({ caseId, taskId, result }) {
    return baseService.mutateCase(caseId, caseDoc => {
      const presentation = caseDoc.presentation || {}
      const task = presentation.generationTask
      if (!task || task.id !== taskId) return serviceError('GENERATION_TASK_NOT_FOUND', '生成任务不存在')
      const timestamp = now()
      const succeeded = Boolean(result && result.ok)
      const finishedTask = {
        ...task,
        status: succeeded ? 'succeeded' : 'failed',
        stage: succeeded ? 'completed' : 'failed',
        updatedAt: timestamp,
        finishedAt: timestamp,
        leaseExpiresAt: 0,
        warnings: succeeded && Array.isArray(result.data && result.data.warnings) ? result.data.warnings : [],
        resultRevision: succeeded ? Number(result.data && result.data.draft && result.data.draft.revision) || 0 : 0,
        errorCode: succeeded ? '' : result && result.code || 'AI_SERVICE_ERROR',
        errorMessage: succeeded ? '' : result && result.message || '演示草稿生成失败'
      }
      return {
        ...serviceSuccess({ caseId, ...publicTask(finishedTask) }, succeeded ? '生成任务完成' : '生成任务失败'),
        update: { presentation: { ...presentation, generationTask: finishedTask } }
      }
    })
  }

  async function processNext() {
    const candidate = await findCandidate()
    if (!candidate || !candidate.presentation || !candidate.presentation.generationTask) {
      return serviceSuccess({ status: 'idle' }, '没有待处理生成任务')
    }
    const task = candidate.presentation.generationTask
    const claimed = await claim(candidate._id, task.id)
    if (!claimed.ok) return serviceSuccess({ status: 'busy' }, claimed.message)

    let generationResult
    try {
      generationResult = await generationService.generate({ caseId: candidate._id, force: claimed.data.force === true })
    } catch (error) {
      generationResult = serviceError(error.code || 'AI_SERVICE_ERROR', error.message || '演示草稿生成失败')
    }
    return finish({ caseId: candidate._id, taskId: task.id, result: generationResult })
  }

  return { enqueue, getStatus, processNext, findCandidate, claim, finish }
}

module.exports = {
  createGenerationTaskService,
  createTaskId,
  publicTask,
  DEFAULT_LEASE_MS
}
