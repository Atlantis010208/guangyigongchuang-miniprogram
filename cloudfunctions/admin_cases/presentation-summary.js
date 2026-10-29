'use strict'

const crypto = require('crypto')

const SCHEMA_VERSION = 1
const THEME = 'dark-gallery-v1'

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function normalizeCaseSource(caseDoc = {}) {
  return {
    imageFileIds: normalizeStringArray(caseDoc.imageFileIds),
    title: normalizeText(caseDoc.title),
    city: normalizeText(caseDoc.city),
    spaceType: normalizeText(caseDoc.spaceType),
    services: normalizeStringArray(caseDoc.services),
    desc: normalizeText(caseDoc.desc)
  }
}

function computeSourceHash(caseDoc = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizeCaseSource(caseDoc)), 'utf8').digest('hex')
}

function getCurrentSourceHash(caseDoc = {}) {
  return normalizeText(caseDoc.presentation && caseDoc.presentation.currentSourceHash) || computeSourceHash(caseDoc)
}

function hasUnpublishedDraft(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  if (!presentation.draft) return false
  if (!presentation.published) return true
  return Number(presentation.draft.revision) !== Number(presentation.published.sourceDraftRevision)
}

function derivePresentationStatus(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  if (!presentation.draft && !presentation.published) return 'none'
  if (presentation.published && normalizeText(presentation.published.sourceHash) !== getCurrentSourceHash(caseDoc)) return 'stale'
  if (presentation.draft && (!presentation.published || hasUnpublishedDraft(caseDoc))) return 'draft'
  return presentation.published ? 'published' : 'none'
}

function buildPresentationSummary(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  return {
    status: derivePresentationStatus(caseDoc),
    hasDraft: Boolean(presentation.draft),
    hasPublishedVersion: Boolean(presentation.published),
    hasUnpublishedDraft: hasUnpublishedDraft(caseDoc),
    draftRevision: presentation.draft && Number.isInteger(Number(presentation.draft.revision))
      ? Number(presentation.draft.revision)
      : null,
    publishedVersion: presentation.published && Number.isInteger(Number(presentation.published.version))
      ? Number(presentation.published.version)
      : null,
    publishedAt: presentation.published && Number.isFinite(Number(presentation.published.publishedAt))
      ? Number(presentation.published.publishedAt)
      : null
  }
}

function createPresentationShell(caseDoc = {}, previousPresentation) {
  return {
    ...(previousPresentation && typeof previousPresentation === 'object' ? previousPresentation : {}),
    schemaVersion: SCHEMA_VERSION,
    theme: THEME,
    currentSourceHash: computeSourceHash(caseDoc)
  }
}

function mapCaseForAdminList(caseDoc = {}) {
  const { presentation, ...publicFields } = caseDoc
  return {
    ...publicFields,
    presentationSummary: buildPresentationSummary({ ...caseDoc, presentation })
  }
}

module.exports = {
  SCHEMA_VERSION,
  THEME,
  normalizeCaseSource,
  computeSourceHash,
  getCurrentSourceHash,
  hasUnpublishedDraft,
  derivePresentationStatus,
  buildPresentationSummary,
  createPresentationShell,
  mapCaseForAdminList
}

