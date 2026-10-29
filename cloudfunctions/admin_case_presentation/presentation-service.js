'use strict'

const {
  SCHEMA_VERSION,
  THEME,
  MIN_IMAGES,
  computeSourceHash,
  buildPresentationSummary,
  normalizeText,
  sanitizeDraft,
  validateDraft
} = require('./presentation-domain')

const COLLECTION = 'lighting_cases'

function extractDoc(result) {
  if (!result) return null
  return Array.isArray(result.data) ? result.data[0] : result.data
}

function serviceError(code, message, data) {
  return { ok: false, code, message, data: data || null }
}

function serviceSuccess(data, message) {
  return { ok: true, code: 'OK', message: message || '操作成功', data: data || null }
}

function caseSummary(caseDoc) {
  return {
    _id: caseDoc._id,
    title: caseDoc.title || '',
    city: caseDoc.city || '',
    spaceType: caseDoc.spaceType || '',
    services: Array.isArray(caseDoc.services) ? caseDoc.services : [],
    desc: caseDoc.desc || '',
    status: caseDoc.status || 'inactive',
    imageFileIds: Array.isArray(caseDoc.imageFileIds) ? caseDoc.imageFileIds : []
  }
}

function createPresentationService({ db, now = () => Date.now(), collection = COLLECTION, generator = null }) {
  async function readCase(caseId, database = db) {
    const id = normalizeText(caseId)
    if (!id) return null
    try {
      const result = await database.collection(collection).doc(id).get()
      return extractDoc(result)
    } catch (error) {
      return null
    }
  }

  async function mutateCase(caseId, mutator) {
    const id = normalizeText(caseId)
    if (!id) return serviceError('INVALID_PARAMS', '缺少 caseId')

    if (typeof db.runTransaction === 'function') {
      let outcome = null
      await db.runTransaction(async transaction => {
        const caseDoc = await readCase(id, transaction)
        if (!caseDoc) {
          outcome = serviceError('CASE_NOT_FOUND', '案例不存在')
          return
        }
        outcome = await mutator(caseDoc)
        if (outcome && outcome.ok && outcome.update) {
          await transaction.collection(collection).doc(id).update({ data: outcome.update })
        }
      })
      return outcome || serviceError('DB_ERROR', '事务未返回结果')
    }

    const caseDoc = await readCase(id)
    if (!caseDoc) return serviceError('CASE_NOT_FOUND', '案例不存在')
    const outcome = await mutator(caseDoc)
    if (outcome && outcome.ok && outcome.update) {
      await db.collection(collection).doc(id).update({ data: outcome.update })
    }
    return outcome
  }

  async function getPresentation(caseId) {
    const caseDoc = await readCase(caseId)
    if (!caseDoc) return serviceError('CASE_NOT_FOUND', '案例不存在')
    const presentation = caseDoc.presentation || {}
    return serviceSuccess({
      case: caseSummary(caseDoc),
      theme: presentation.theme || THEME,
      draft: presentation.draft || null,
      presentationSummary: buildPresentationSummary(caseDoc)
    }, '查询成功')
  }

  async function saveDraft({ caseId, draft: inputDraft, expectedRevision }) {
    return mutateCase(caseId, caseDoc => {
      const presentation = caseDoc.presentation || {}
      const currentRevision = Number(presentation.draft && presentation.draft.revision) || 0
      const expected = Number(expectedRevision)
      if (!Number.isInteger(expected) || expected !== currentRevision) {
        return serviceError('DRAFT_CONFLICT', '草稿已被其他操作更新，请重新加载', {
          expectedRevision: expected,
          currentRevision
        })
      }

      const sourceHash = computeSourceHash(caseDoc)
      const submittedSourceHash = normalizeText(inputDraft && inputDraft.sourceHash)
      if (submittedSourceHash && submittedSourceHash !== sourceHash) {
        return serviceError('VALIDATION_FAILED', '案例内容已经变化，请重新加载后再保存', {
          issues: [{ path: 'draft.sourceHash', code: 'SOURCE_CHANGED', message: '案例源内容已经变化' }]
        })
      }

      const timestamp = now()
      const sanitized = sanitizeDraft({
        ...(inputDraft || {}),
        revision: currentRevision + 1,
        sourceHash,
        generatedAt: Number(inputDraft && inputDraft.generatedAt) || timestamp,
        updatedAt: timestamp
      }, caseDoc)
      const issues = validateDraft(sanitized, caseDoc)
      if (issues.length) {
        return serviceError('VALIDATION_FAILED', '草稿校验失败', { issues })
      }

      const nextPresentation = {
        ...presentation,
        schemaVersion: SCHEMA_VERSION,
        theme: THEME,
        currentSourceHash: sourceHash,
        draft: sanitized
      }
      const nextCase = { ...caseDoc, presentation: nextPresentation }
      return {
        ...serviceSuccess({
          draft: sanitized,
          presentationSummary: buildPresentationSummary(nextCase)
        }, '草稿已保存'),
        update: { presentation: nextPresentation }
      }
    })
  }

  async function publish({ caseId, expectedRevision }) {
    return mutateCase(caseId, caseDoc => {
      const presentation = caseDoc.presentation || {}
      const draft = presentation.draft
      if (!draft) return serviceError('DRAFT_REQUIRED', '请先生成演示草稿')

      const currentRevision = Number(draft.revision) || 0
      const expected = Number(expectedRevision)
      if (!Number.isInteger(expected) || expected !== currentRevision) {
        return serviceError('DRAFT_CONFLICT', '草稿已被其他操作更新，请重新加载', {
          expectedRevision: expected,
          currentRevision
        })
      }

      const issues = validateDraft(draft, caseDoc)
      if (caseDoc.status !== 'active') {
        issues.unshift({ path: 'case.status', code: 'CASE_INACTIVE', message: '案例已下架，不能发布演示' })
      }
      if (!Array.isArray(caseDoc.imageFileIds) || caseDoc.imageFileIds.length < MIN_IMAGES) {
        if (!issues.some(issue => issue.code === 'MIN_IMAGES_REQUIRED')) {
          issues.unshift({ path: 'case.imageFileIds', code: 'MIN_IMAGES_REQUIRED', message: `至少需要 ${MIN_IMAGES} 张案例图片` })
        }
      }
      if (issues.length) return serviceError('VALIDATION_FAILED', '发布校验失败', { issues })

      const timestamp = now()
      const cleanDraft = sanitizeDraft(draft, caseDoc)
      const publishedVersion = Number(presentation.published && presentation.published.version) || 0
      const published = {
        version: publishedVersion + 1,
        sourceDraftRevision: cleanDraft.revision,
        sourceHash: computeSourceHash(caseDoc),
        publishedAt: timestamp,
        imageAnalyses: cleanDraft.imageAnalyses,
        slides: cleanDraft.slides
      }
      const nextPresentation = {
        ...presentation,
        schemaVersion: SCHEMA_VERSION,
        theme: THEME,
        currentSourceHash: published.sourceHash,
        draft: cleanDraft,
        published
      }
      const nextCase = { ...caseDoc, presentation: nextPresentation }
      return {
        ...serviceSuccess({
          version: published.version,
          publishedAt: timestamp,
          presentationSummary: buildPresentationSummary(nextCase)
        }, '演示已发布'),
        update: { presentation: nextPresentation }
      }
    })
  }

  async function generate({ caseId, force = false }) {
    if (!generator || typeof generator.generateDraft !== 'function') {
      return serviceError('AI_CONFIG_ERROR', 'AI 生成服务未配置')
    }
    const originalCase = await readCase(caseId)
    if (!originalCase) return serviceError('CASE_NOT_FOUND', '案例不存在')
    const imageCount = Array.isArray(originalCase.imageFileIds) ? originalCase.imageFileIds.length : 0
    if (imageCount < MIN_IMAGES) {
      return serviceError('MIN_IMAGES_REQUIRED', `至少需要 ${MIN_IMAGES} 张案例图片`)
    }
    const originalPresentation = originalCase.presentation || {}
    const originalRevision = Number(originalPresentation.draft && originalPresentation.draft.revision) || 0
    if (originalPresentation.draft && force !== true) {
      return serviceError('DRAFT_EXISTS_CONFIRM_REQUIRED', '重新生成会替换当前草稿，请确认后继续', {
        currentRevision: originalRevision
      })
    }

    let generated
    try {
      generated = await generator.generateDraft(originalCase)
    } catch (error) {
      return serviceError(error.code || 'AI_SERVICE_ERROR', error.message || '演示草稿生成失败', error.data)
    }

    const originalSourceHash = computeSourceHash(originalCase)
    return mutateCase(caseId, currentCase => {
      const currentPresentation = currentCase.presentation || {}
      const currentRevision = Number(currentPresentation.draft && currentPresentation.draft.revision) || 0
      if (currentRevision !== originalRevision || computeSourceHash(currentCase) !== originalSourceHash) {
        return serviceError('DRAFT_CONFLICT', '生成期间案例或草稿已经变化，请重新生成', {
          expectedRevision: originalRevision,
          currentRevision
        })
      }

      const timestamp = now()
      const draft = sanitizeDraft({
        ...generated.draft,
        revision: currentRevision + 1,
        sourceHash: originalSourceHash,
        generatedAt: timestamp,
        updatedAt: timestamp
      }, currentCase)
      const issues = validateDraft(draft, currentCase)
      if (issues.length) return serviceError('AI_INVALID_OUTPUT', '生成结果未通过结构校验', { issues })

      const nextPresentation = {
        ...currentPresentation,
        schemaVersion: SCHEMA_VERSION,
        theme: THEME,
        currentSourceHash: originalSourceHash,
        draft
      }
      const nextCase = { ...currentCase, presentation: nextPresentation }
      return {
        ...serviceSuccess({
          draft,
          warnings: generated.warnings || [],
          presentationSummary: buildPresentationSummary(nextCase)
        }, '演示草稿已生成'),
        update: { presentation: nextPresentation }
      }
    })
  }

  return { readCase, getPresentation, saveDraft, publish, generate, mutateCase }
}

module.exports = { createPresentationService, extractDoc, serviceError, serviceSuccess, caseSummary }
