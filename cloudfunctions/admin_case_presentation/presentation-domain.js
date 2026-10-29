'use strict'

const crypto = require('crypto')

const SCHEMA_VERSION = 1
const THEME = 'dark-gallery-v1'
const MIN_IMAGES = 3
const MIN_SLIDES = 5
const MAX_SLIDES = 12
const TITLE_MAX = 28
const BODY_MAX = 110
const STRATEGY_ITEM_BODY_MAX = 42

const SLIDE_TYPES = Object.freeze([
  'cover',
  'concept',
  'strategy',
  'space',
  'split',
  'closing'
])

const SLIDE_LAYOUTS = Object.freeze([
  'cover-full',
  'image-top-copy-bottom',
  'strategy-image70',
  'space-overlay',
  'split-editorial',
  'closing-full'
])

const ALLOWED_LAYOUTS_BY_TYPE = Object.freeze({
  cover: ['cover-full'],
  concept: ['image-top-copy-bottom', 'space-overlay'],
  strategy: ['strategy-image70'],
  space: ['image-top-copy-bottom', 'space-overlay'],
  split: ['split-editorial'],
  closing: ['closing-full']
})

const DEFAULT_DOMINANT_COLOR = '#24221F'
const COLOR_PATTERN = /^#[0-9A-F]{6}$/

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeText).filter(Boolean)
}

function textLength(value) {
  return Array.from(normalizeText(value)).length
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
  const payload = JSON.stringify(normalizeCaseSource(caseDoc))
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
}

function getCurrentSourceHash(caseDoc = {}) {
  const stored = normalizeText(caseDoc.presentation && caseDoc.presentation.currentSourceHash)
  return stored || computeSourceHash(caseDoc)
}

function hasUnpublishedDraft(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  const draft = presentation.draft
  const published = presentation.published
  if (!draft) return false
  if (!published) return true
  return Number(draft.revision) !== Number(published.sourceDraftRevision)
}

function derivePresentationStatus(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  const draft = presentation.draft
  const published = presentation.published

  if (!draft && !published) return 'none'
  if (published && normalizeText(published.sourceHash) !== getCurrentSourceHash(caseDoc)) return 'stale'
  if (draft && (!published || hasUnpublishedDraft(caseDoc))) return 'draft'
  return published ? 'published' : 'none'
}

function buildPresentationSummary(caseDoc = {}) {
  const presentation = caseDoc.presentation || {}
  const draft = presentation.draft
  const published = presentation.published
  return {
    status: derivePresentationStatus(caseDoc),
    hasDraft: Boolean(draft),
    hasPublishedVersion: Boolean(published),
    hasUnpublishedDraft: hasUnpublishedDraft(caseDoc),
    draftRevision: draft && Number.isInteger(Number(draft.revision)) ? Number(draft.revision) : null,
    publishedVersion: published && Number.isInteger(Number(published.version)) ? Number(published.version) : null,
    publishedAt: published && Number.isFinite(Number(published.publishedAt)) ? Number(published.publishedAt) : null
  }
}

function getTargetSlideCount(imageCount) {
  const count = Math.max(0, Number.parseInt(imageCount, 10) || 0)
  if (count < MIN_IMAGES) return 0
  if (count === 3) return 5
  if (count === 4) return 6
  if (count === 5) return 7
  return Math.min(MAX_SLIDES, Math.max(6, count + 1))
}

function normalizeColor(value) {
  const color = normalizeText(value).toUpperCase()
  return COLOR_PATTERN.test(color) ? color : DEFAULT_DOMINANT_COLOR
}

function normalizeFocal(value) {
  const x = Number(value && value.x)
  const y = Number(value && value.y)
  return {
    x: Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5,
    y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 0.5
  }
}

function sanitizeStrategyItems(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 3).map(item => ({
    title: normalizeText(item && item.title),
    body: normalizeText(item && item.body)
  }))
}

function sanitizeSlide(value = {}, index = 0) {
  const type = SLIDE_TYPES.includes(value.type) ? value.type : 'space'
  const allowedLayouts = ALLOWED_LAYOUTS_BY_TYPE[type]
  const layout = allowedLayouts.includes(value.layout) ? value.layout : allowedLayouts[0]
  const imageFileIds = normalizeStringArray(value.imageFileIds).slice(0, 2)
  const inputFocals = value.imageFocals && typeof value.imageFocals === 'object' ? value.imageFocals : {}
  const imageFocals = {}
  imageFileIds.forEach(fileId => {
    imageFocals[fileId] = normalizeFocal(inputFocals[fileId])
  })

  return {
    id: normalizeText(value.id) || `slide-${index + 1}`,
    type,
    layout,
    sectionNo: normalizeText(value.sectionNo),
    imageFileIds,
    imageFocals,
    label: normalizeText(value.label),
    title: normalizeText(value.title),
    body: normalizeText(value.body),
    strategyItems: sanitizeStrategyItems(value.strategyItems),
    dominantColor: normalizeColor(value.dominantColor)
  }
}

function sanitizeImageAnalyses(value, validImageFileIds) {
  if (!Array.isArray(value)) return []
  const valid = new Set(normalizeStringArray(validImageFileIds))
  const seen = new Set()
  return value.reduce((items, item) => {
    const fileId = normalizeText(item && item.fileId)
    if (!valid.has(fileId) || seen.has(fileId)) return items
    seen.add(fileId)
    const recommendedLayout = SLIDE_LAYOUTS.includes(item.recommendedLayout)
      ? item.recommendedLayout
      : 'space-overlay'
    items.push({
      fileId,
      spaceLabel: normalizeText(item.spaceLabel),
      description: normalizeText(item.description),
      focal: normalizeFocal(item.focal),
      recommendedLayout,
      dominantColor: normalizeColor(item.dominantColor)
    })
    return items
  }, [])
}

function sanitizeDraft(value = {}, caseDoc = {}) {
  const imageFileIds = normalizeStringArray(caseDoc.imageFileIds)
  return {
    revision: Number.isInteger(Number(value.revision)) ? Number(value.revision) : 0,
    sourceHash: normalizeText(value.sourceHash) || computeSourceHash(caseDoc),
    generatedAt: Number.isFinite(Number(value.generatedAt)) ? Number(value.generatedAt) : Date.now(),
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
    imageAnalyses: sanitizeImageAnalyses(value.imageAnalyses, imageFileIds),
    slides: Array.isArray(value.slides) ? value.slides.map(sanitizeSlide) : [],
    generationMeta: {
      model: normalizeText(value.generationMeta && value.generationMeta.model),
      promptVersion: normalizeText(value.generationMeta && value.generationMeta.promptVersion),
      warnings: normalizeStringArray(value.generationMeta && value.generationMeta.warnings).slice(0, 20)
    }
  }
}

function addIssue(issues, path, code, message) {
  issues.push({ path, code, message })
}

function focalEquals(a, b) {
  if (!a || !b) return false
  return Math.abs(Number(a.x) - Number(b.x)) < 0.001 && Math.abs(Number(a.y) - Number(b.y)) < 0.001
}

function validateSlides(rawSlides, validImageFileIds) {
  const issues = []
  const slides = Array.isArray(rawSlides) ? rawSlides : []
  const validImages = new Set(normalizeStringArray(validImageFileIds))

  if (slides.length < MIN_SLIDES || slides.length > MAX_SLIDES) {
    addIssue(issues, 'slides', 'SLIDE_COUNT', `演示必须包含 ${MIN_SLIDES}-${MAX_SLIDES} 幕`)
  }

  const idSet = new Set()
  const typeCounts = Object.fromEntries(SLIDE_TYPES.map(type => [type, 0]))

  slides.forEach((slide, index) => {
    const path = `slides[${index}]`
    if (!slide || typeof slide !== 'object') {
      addIssue(issues, path, 'INVALID_SLIDE', '幻灯片必须是对象')
      return
    }

    const id = normalizeText(slide.id)
    if (!id) addIssue(issues, `${path}.id`, 'REQUIRED', '缺少幻灯片 id')
    if (idSet.has(id)) addIssue(issues, `${path}.id`, 'DUPLICATE_ID', '幻灯片 id 不能重复')
    if (id) idSet.add(id)

    const type = normalizeText(slide.type)
    if (!SLIDE_TYPES.includes(type)) {
      addIssue(issues, `${path}.type`, 'INVALID_TYPE', '幻灯片类型无效')
    } else {
      typeCounts[type] += 1
      const allowed = ALLOWED_LAYOUTS_BY_TYPE[type]
      if (!allowed.includes(slide.layout)) {
        addIssue(issues, `${path}.layout`, 'INVALID_LAYOUT', `${type} 不允许使用当前版式`)
      }
    }

    const images = normalizeStringArray(slide.imageFileIds)
    if (images.length < 1 || images.length > 2) {
      addIssue(issues, `${path}.imageFileIds`, 'IMAGE_COUNT', '每幕必须包含 1-2 张图片')
    }
    if (type === 'split' && images.length !== 2) {
      addIssue(issues, `${path}.imageFileIds`, 'SPLIT_IMAGE_COUNT', '双图版式必须包含 2 张图片')
    }
    images.forEach(fileId => {
      if (!validImages.has(fileId)) {
        addIssue(issues, `${path}.imageFileIds`, 'FOREIGN_IMAGE', '幻灯片引用了不属于当前案例的图片')
      }
      const focal = slide.imageFocals && slide.imageFocals[fileId]
      const x = Number(focal && focal.x)
      const y = Number(focal && focal.y)
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        addIssue(issues, `${path}.imageFocals.${fileId}`, 'INVALID_FOCAL', '裁切焦点必须位于 0-1 范围内')
      }
    })

    const title = normalizeText(slide.title)
    if (type !== 'closing' && !title) addIssue(issues, `${path}.title`, 'REQUIRED', '缺少标题')
    if (textLength(title) > TITLE_MAX) addIssue(issues, `${path}.title`, 'TEXT_TOO_LONG', `标题最多 ${TITLE_MAX} 字`)
    if (textLength(slide.body) > BODY_MAX) addIssue(issues, `${path}.body`, 'TEXT_TOO_LONG', `正文最多 ${BODY_MAX} 字`)

    if (type === 'strategy') {
      const items = Array.isArray(slide.strategyItems) ? slide.strategyItems : []
      if (items.length < 1 || items.length > 3) {
        addIssue(issues, `${path}.strategyItems`, 'STRATEGY_COUNT', '策略页必须包含 1-3 项策略')
      }
      items.forEach((item, itemIndex) => {
        if (!normalizeText(item && item.title)) {
          addIssue(issues, `${path}.strategyItems[${itemIndex}].title`, 'REQUIRED', '策略项缺少标题')
        }
        if (!normalizeText(item && item.body)) {
          addIssue(issues, `${path}.strategyItems[${itemIndex}].body`, 'REQUIRED', '策略项缺少说明')
        }
        if (textLength(item && item.body) > STRATEGY_ITEM_BODY_MAX) {
          addIssue(issues, `${path}.strategyItems[${itemIndex}].body`, 'TEXT_TOO_LONG', `策略说明最多 ${STRATEGY_ITEM_BODY_MAX} 字`)
        }
      })
    }

    if (!COLOR_PATTERN.test(normalizeText(slide.dominantColor).toUpperCase())) {
      addIssue(issues, `${path}.dominantColor`, 'INVALID_COLOR', '主色必须为 #RRGGBB')
    }
  })

  if (typeCounts.cover !== 1) addIssue(issues, 'slides', 'COVER_COUNT', '必须且只能有 1 个封面')
  if (typeCounts.concept < 1) addIssue(issues, 'slides', 'CONCEPT_REQUIRED', '至少需要 1 个设计理念页')
  if (typeCounts.strategy < 1) addIssue(issues, 'slides', 'STRATEGY_REQUIRED', '至少需要 1 个灯光策略页')
  if (typeCounts.space + typeCounts.split < 1) addIssue(issues, 'slides', 'SPACE_REQUIRED', '至少需要 1 个空间叙事页')
  if (typeCounts.closing !== 1) addIssue(issues, 'slides', 'CLOSING_COUNT', '必须且只能有 1 个收尾页')
  if (slides[0] && slides[0].type !== 'cover') addIssue(issues, 'slides[0].type', 'COVER_ORDER', '第一幕必须为封面')
  if (slides.length && slides[slides.length - 1].type !== 'closing') {
    addIssue(issues, `slides[${slides.length - 1}].type`, 'CLOSING_ORDER', '最后一幕必须为收尾页')
  }

  for (let index = 1; index < slides.length; index += 1) {
    const previous = slides[index - 1]
    const current = slides[index]
    const bothWorkSlides = previous && current && !['cover', 'closing'].includes(previous.type) && !['cover', 'closing'].includes(current.type)
    const previousMain = previous && normalizeStringArray(previous.imageFileIds)[0]
    const currentMain = current && normalizeStringArray(current.imageFileIds)[0]
    if (bothWorkSlides && previousMain && previousMain === currentMain) {
      addIssue(issues, `slides[${index}].imageFileIds`, 'ADJACENT_REPEAT', '相邻作品幕不能重复同一主图')
    }
  }

  const cover = slides.find(slide => slide && slide.type === 'cover')
  const closing = slides.find(slide => slide && slide.type === 'closing')
  const shared = cover && closing && normalizeStringArray(cover.imageFileIds)[0]
  if (shared && shared === normalizeStringArray(closing.imageFileIds)[0]) {
    const coverFocal = cover.imageFocals && cover.imageFocals[shared]
    const closingFocal = closing.imageFocals && closing.imageFocals[shared]
    if (focalEquals(coverFocal, closingFocal)) {
      addIssue(issues, 'slides', 'REUSED_CROP', '封面与收尾复用同图时必须使用不同裁切焦点')
    }
  }

  return issues
}

function validateDraft(draft, caseDoc = {}) {
  const issues = []
  const imageFileIds = normalizeStringArray(caseDoc.imageFileIds)
  if (imageFileIds.length < MIN_IMAGES) {
    addIssue(issues, 'case.imageFileIds', 'MIN_IMAGES_REQUIRED', `至少需要 ${MIN_IMAGES} 张案例图片`)
  }
  if (!draft || typeof draft !== 'object') {
    addIssue(issues, 'draft', 'DRAFT_REQUIRED', '缺少演示草稿')
    return issues
  }
  if (normalizeText(draft.sourceHash) !== computeSourceHash(caseDoc)) {
    addIssue(issues, 'draft.sourceHash', 'SOURCE_CHANGED', '草稿对应的案例内容已经变化，请重新生成或保存')
  }
  return issues.concat(validateSlides(draft.slides, imageFileIds))
}

function stripJsonCodeFence(value) {
  const raw = normalizeText(value)
  const match = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : raw
}

function extractBalancedJsonCandidates(value) {
  const raw = normalizeText(value)
  const candidates = []
  let start = -1
  let stack = []
  let inString = false
  let escaped = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{' || char === '[') {
      if (start === -1) start = index
      stack.push(char)
      continue
    }
    if ((char === '}' || char === ']') && stack.length) {
      const opener = stack[stack.length - 1]
      if ((opener === '{' && char !== '}') || (opener === '[' && char !== ']')) {
        start = -1
        stack = []
        continue
      }
      stack.pop()
      if (stack.length === 0 && start !== -1) {
        candidates.push(raw.slice(start, index + 1))
        start = -1
      }
    }
  }
  return candidates
}

function parseAiJson(value) {
  if (value && typeof value === 'object') return value
  const clean = stripJsonCodeFence(value)
  if (!clean) throw new Error('AI 返回为空')
  try {
    return JSON.parse(clean)
  } catch (error) {
    for (const candidate of extractBalancedJsonCandidates(clean)) {
      try {
        return JSON.parse(candidate)
      } catch (candidateError) {
        // Continue until a complete JSON object/array is found.
      }
    }
    throw error
  }
}

module.exports = {
  SCHEMA_VERSION,
  THEME,
  MIN_IMAGES,
  MIN_SLIDES,
  MAX_SLIDES,
  TITLE_MAX,
  BODY_MAX,
  STRATEGY_ITEM_BODY_MAX,
  SLIDE_TYPES,
  SLIDE_LAYOUTS,
  ALLOWED_LAYOUTS_BY_TYPE,
  DEFAULT_DOMINANT_COLOR,
  normalizeText,
  normalizeStringArray,
  textLength,
  normalizeCaseSource,
  computeSourceHash,
  getCurrentSourceHash,
  hasUnpublishedDraft,
  derivePresentationStatus,
  buildPresentationSummary,
  getTargetSlideCount,
  normalizeColor,
  normalizeFocal,
  sanitizeSlide,
  sanitizeImageAnalyses,
  sanitizeDraft,
  validateSlides,
  validateDraft,
  stripJsonCodeFence,
  extractBalancedJsonCandidates,
  parseAiJson
}
