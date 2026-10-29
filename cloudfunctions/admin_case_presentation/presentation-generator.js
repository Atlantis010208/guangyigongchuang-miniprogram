'use strict'

const {
  THEME,
  MIN_IMAGES,
  computeSourceHash,
  getTargetSlideCount,
  normalizeText,
  normalizeFocal,
  normalizeColor,
  sanitizeImageAnalyses,
  sanitizeDraft,
  validateDraft
} = require('./presentation-domain')

class PresentationGenerationError extends Error {
  constructor(code, message, data, cause) {
    super(message)
    this.name = 'PresentationGenerationError'
    this.code = code
    this.data = data || null
    this.cause = cause
  }
}

function clipText(value, max, warnings, field) {
  const text = normalizeText(value)
  const chars = Array.from(text)
  if (chars.length <= max) return text
  warnings.push(`${field} 已截断为 ${max} 字`)
  return chars.slice(0, max).join('')
}

function chunks(items, size) {
  const output = []
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size))
  return output
}

function normalizeAnalysisResult(raw, batch, warnings) {
  const list = raw && Array.isArray(raw.images) ? raw.images : []
  return batch.map(input => {
    const match = list.find(item => Number(item && item.imageIndex) === input.imageIndex) || {}
    if (!match.spaceLabel) warnings.push(`图片 ${input.imageIndex + 1} 未识别空间标签，已使用“空间”`)
    return {
      fileId: input.fileId,
      spaceLabel: clipText(match.spaceLabel || '空间', 12, warnings, `图片 ${input.imageIndex + 1} 标签`),
      description: clipText(match.description || '光线与空间材质形成层次', 48, warnings, `图片 ${input.imageIndex + 1} 描述`),
      focal: normalizeFocal(match.focal),
      recommendedLayout: ['space-overlay', 'image-top-copy-bottom'].includes(match.recommendedLayout)
        ? match.recommendedLayout
        : 'space-overlay',
      dominantColor: normalizeColor(match.dominantColor)
    }
  })
}

function getAnalysisById(imageAnalyses) {
  return new Map(imageAnalyses.map(item => [item.fileId, item]))
}

function completeNarrativeSpaces({ narrative, imageAnalyses, caseDoc, spacePageCount, warnings }) {
  const spaces = Array.isArray(narrative.spaces) ? narrative.spaces.slice(0, spacePageCount) : []
  const missingCount = Math.max(0, spacePageCount - spaces.length)
  for (let index = spaces.length; index < spacePageCount; index += 1) {
    const analysis = imageAnalyses[index % Math.max(1, imageAnalyses.length)] || {}
    const imageIndex = Math.max(0, caseDoc.imageFileIds.indexOf(analysis.fileId))
    spaces.push({
      imageIndex,
      label: analysis.spaceLabel || `SPACE ${index + 1}`,
      title: analysis.spaceLabel ? `${analysis.spaceLabel}的光影层次` : `空间叙事 ${index + 1}`,
      body: analysis.description || '以克制的亮度关系组织空间层次与使用路径。',
      layout: analysis.recommendedLayout || 'space-overlay'
    })
  }
  if (missingCount) warnings.push(`AI 空间叙事不足，已根据图片分析自动补全 ${missingCount} 幕`)
  return spaces
}

function chooseUniqueImage(requestedIndex, imageFileIds, usedWorkImages) {
  const requested = imageFileIds[Number(requestedIndex)]
  if (requested && !usedWorkImages.has(requested)) {
    usedWorkImages.add(requested)
    return requested
  }
  const next = imageFileIds.find(fileId => !usedWorkImages.has(fileId))
  if (next) {
    usedWorkImages.add(next)
    return next
  }
  return imageFileIds[usedWorkImages.size % imageFileIds.length]
}

function focalFor(fileId, analysisMap, override) {
  return normalizeFocal(override || (analysisMap.get(fileId) && analysisMap.get(fileId).focal))
}

function buildSlides({ caseDoc, imageAnalyses, narrative, targetSlideCount, warnings }) {
  if (!narrative || typeof narrative !== 'object') {
    throw new PresentationGenerationError('AI_INVALID_OUTPUT', 'AI 故事板结构无效')
  }
  if (!narrative.concept || !narrative.strategy || !Array.isArray(narrative.spaces)) {
    throw new PresentationGenerationError('AI_INVALID_OUTPUT', 'AI 故事板缺少理念、策略或空间叙事')
  }

  const spacePageCount = targetSlideCount - 4
  const narrativeSpaces = completeNarrativeSpaces({
    narrative,
    imageAnalyses,
    caseDoc,
    spacePageCount,
    warnings
  })
  const strategyItems = Array.isArray(narrative.strategy.items) ? narrative.strategy.items.slice(0, 3) : []
  if (strategyItems.length < 1) {
    throw new PresentationGenerationError('AI_INVALID_OUTPUT', 'AI 灯光策略缺少策略项')
  }

  const imageFileIds = caseDoc.imageFileIds.slice()
  const analysisMap = getAnalysisById(imageAnalyses)
  const coverImage = imageFileIds[0]
  const coverAnalysis = analysisMap.get(coverImage) || {}
  const usedWorkImages = new Set()
  const slides = []

  slides.push({
    id: 'cover',
    type: 'cover',
    layout: 'cover-full',
    sectionNo: '',
    imageFileIds: [coverImage],
    imageFocals: { [coverImage]: focalFor(coverImage, analysisMap) },
    label: [normalizeText(caseDoc.city), normalizeText(caseDoc.spaceType)].filter(Boolean).join(' · '),
    title: clipText(caseDoc.title || '光的空间', 28, warnings, '封面标题'),
    body: '',
    strategyItems: [],
    dominantColor: normalizeColor(coverAnalysis.dominantColor)
  })

  const conceptImage = chooseUniqueImage(narrative.concept.imageIndex, imageFileIds, usedWorkImages)
  const conceptAnalysis = analysisMap.get(conceptImage) || {}
  slides.push({
    id: 'concept',
    type: 'concept',
    layout: 'image-top-copy-bottom',
    sectionNo: '01',
    imageFileIds: [conceptImage],
    imageFocals: { [conceptImage]: focalFor(conceptImage, analysisMap) },
    label: 'DESIGN CONCEPT',
    title: clipText(narrative.concept.title, 28, warnings, '设计理念标题'),
    body: clipText(narrative.concept.body, 110, warnings, '设计理念正文'),
    strategyItems: [],
    dominantColor: normalizeColor(conceptAnalysis.dominantColor)
  })

  const strategyImage = chooseUniqueImage(narrative.strategy.imageIndex, imageFileIds, usedWorkImages)
  const strategyAnalysis = analysisMap.get(strategyImage) || {}
  slides.push({
    id: 'strategy',
    type: 'strategy',
    layout: 'strategy-image70',
    sectionNo: '02',
    imageFileIds: [strategyImage],
    imageFocals: { [strategyImage]: focalFor(strategyImage, analysisMap) },
    label: 'LIGHTING STRATEGY',
    title: clipText(narrative.strategy.title, 28, warnings, '灯光策略标题'),
    body: '',
    strategyItems: strategyItems.map((item, index) => ({
      title: clipText(item && item.title, 12, warnings, `策略 ${index + 1} 标题`),
      body: clipText(item && item.body, 42, warnings, `策略 ${index + 1} 正文`)
    })),
    dominantColor: normalizeColor(strategyAnalysis.dominantColor)
  })

  narrativeSpaces.forEach((space, index) => {
    const image = chooseUniqueImage(space && space.imageIndex, imageFileIds, usedWorkImages)
    const analysis = analysisMap.get(image) || {}
    const layout = ['space-overlay', 'image-top-copy-bottom'].includes(space && space.layout)
      ? space.layout
      : analysis.recommendedLayout || 'space-overlay'
    slides.push({
      id: `space-${index + 1}`,
      type: 'space',
      layout,
      sectionNo: String(index + 3).padStart(2, '0'),
      imageFileIds: [image],
      imageFocals: { [image]: focalFor(image, analysisMap) },
      label: clipText((space && space.label) || analysis.spaceLabel || 'SPACE', 18, warnings, `空间 ${index + 1} 标签`),
      title: clipText(space && space.title, 28, warnings, `空间 ${index + 1} 标题`),
      body: clipText(space && space.body, 110, warnings, `空间 ${index + 1} 正文`),
      strategyItems: [],
      dominantColor: normalizeColor(analysis.dominantColor)
    })
  })

  const coverFocal = focalFor(coverImage, analysisMap)
  const closingFocal = {
    x: Math.min(1, Math.max(0, coverFocal.x + (coverFocal.x > 0.62 ? -0.18 : 0.18))),
    y: Math.min(1, Math.max(0, coverFocal.y + (coverFocal.y > 0.58 ? -0.12 : 0.12)))
  }
  slides.push({
    id: 'closing',
    type: 'closing',
    layout: 'closing-full',
    sectionNo: '',
    imageFileIds: [coverImage],
    imageFocals: { [coverImage]: closingFocal },
    label: '',
    title: '',
    body: '',
    strategyItems: [],
    dominantColor: '#090909'
  })

  return slides
}

function createPresentationGenerator({ aiAdapter, getTempUrls, now = () => Date.now() }) {
  if (!aiAdapter) throw new Error('缺少 aiAdapter')
  if (typeof getTempUrls !== 'function') throw new Error('缺少 getTempUrls')

  async function generateDraft(caseDoc) {
    const imageFileIds = Array.isArray(caseDoc.imageFileIds) ? caseDoc.imageFileIds.filter(Boolean) : []
    if (imageFileIds.length < MIN_IMAGES) {
      throw new PresentationGenerationError('MIN_IMAGES_REQUIRED', `至少需要 ${MIN_IMAGES} 张案例图片`)
    }

    const targetSlideCount = getTargetSlideCount(imageFileIds.length)
    const warnings = []
    let urlMap
    try {
      urlMap = await getTempUrls(imageFileIds)
    } catch (error) {
      throw new PresentationGenerationError('IMAGE_URL_ERROR', '案例图片临时地址获取失败', null, error)
    }
    const imageInputs = imageFileIds.map((fileId, imageIndex) => ({
      fileId,
      imageIndex,
      url: urlMap instanceof Map ? urlMap.get(fileId) : urlMap && urlMap[fileId]
    }))
    const missing = imageInputs.filter(item => !item.url)
    if (missing.length) {
      throw new PresentationGenerationError('IMAGE_URL_ERROR', '部分案例图片无法读取', {
        fileIds: missing.map(item => item.fileId)
      })
    }

    const analyses = []
    try {
      const imageBatches = chunks(imageInputs, 3)
      const rawBatchResults = await Promise.all(imageBatches.map(batch => (
        aiAdapter.analyzeImageBatch({ caseDoc, images: batch })
      )))
      rawBatchResults.forEach((raw, index) => {
        const batch = imageBatches[index]
        analyses.push(...normalizeAnalysisResult(raw, batch, warnings))
      })
    } catch (error) {
      throw new PresentationGenerationError(error.code || 'AI_SERVICE_ERROR', error.message || '图片识别失败', null, error)
    }
    const imageAnalyses = sanitizeImageAnalyses(analyses, imageFileIds)

    let narrative
    try {
      narrative = await aiAdapter.generateNarrative({
        caseDoc,
        imageAnalyses,
        spacePageCount: targetSlideCount - 4
      })
    } catch (error) {
      throw new PresentationGenerationError(error.code || 'AI_SERVICE_ERROR', error.message || '故事板生成失败', null, error)
    }

    const timestamp = now()
    const draft = sanitizeDraft({
      revision: 0,
      sourceHash: computeSourceHash(caseDoc),
      generatedAt: timestamp,
      updatedAt: timestamp,
      imageAnalyses,
      slides: buildSlides({ caseDoc, imageAnalyses, narrative, targetSlideCount, warnings }),
      generationMeta: {
        model: aiAdapter.meta && aiAdapter.meta.model || '',
        promptVersion: aiAdapter.meta && aiAdapter.meta.promptVersion || 'case-deck-v1',
        warnings
      }
    }, caseDoc)
    const issues = validateDraft(draft, caseDoc)
    if (issues.length) {
      throw new PresentationGenerationError('AI_INVALID_OUTPUT', 'AI 草稿未通过结构校验', { issues })
    }
    return { draft, theme: THEME, warnings }
  }

  return { generateDraft }
}

module.exports = {
  createPresentationGenerator,
  PresentationGenerationError,
  clipText,
  chunks,
  normalizeAnalysisResult,
  completeNarrativeSpaces,
  buildSlides
}
