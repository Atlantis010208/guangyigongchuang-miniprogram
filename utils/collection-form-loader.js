const CACHE_PREFIX = 'collection_form_template_cache:'
const LATEST_PREFIX = 'collection_form_template_latest:'

function isValidTemplate(template, spaceType) {
  if (!template || template.spaceType !== spaceType || !Array.isArray(template.modules)) return false
  const questionTypes = ['single', 'multiple', 'shortText', 'longText', 'number', 'location', 'table', 'upload', 'ranking']
  const ids = new Set()
  const priorQuestions = new Map()
  for (const module of template.modules) {
    if (!module || typeof module.id !== 'string' || !module.id || ids.has(module.id) || !Array.isArray(module.questions)) return false
    ids.add(module.id)
    for (const question of module.questions) {
      if (!question || typeof question.id !== 'string' || !question.id || ids.has(question.id) || !questionTypes.includes(question.type) || typeof question.title !== 'string' || !question.title.trim()) return false
      ids.add(question.id)
      if (['single', 'multiple', 'ranking'].includes(question.type)) {
        if (!Array.isArray(question.options) || !question.options.length) return false
        const optionIds = new Set()
        let otherOptionCount = 0
        for (const option of question.options) {
          if (!option || typeof option.id !== 'string' || !option.id || optionIds.has(option.id) || typeof option.label !== 'string' || !option.label.trim()) return false
          if (option.isOther) {
            otherOptionCount += 1
            const maxLength = Number(option.otherMaxLength || 100)
            if (question.type === 'ranking' || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500) return false
          }
          optionIds.add(option.id)
        }
        if (otherOptionCount > 1) return false
      }
      if (question.type === 'table') {
        const table = question.table
        if (!table || !Array.isArray(table.columns) || !table.columns.length || table.columns.length > 10) return false
        const columnIds = new Set()
        for (const column of table.columns) {
          if (!column || typeof column.id !== 'string' || !column.id || columnIds.has(column.id) || ids.has(column.id) || typeof column.label !== 'string' || !column.label.trim() || !['single', 'multiple', 'shortText', 'longText', 'number'].includes(column.type)) return false
          columnIds.add(column.id)
          ids.add(column.id)
          const columnRules = column.validation || {}
          if (column.type === 'single' || column.type === 'multiple') {
            if (!Array.isArray(column.options) || !column.options.length) return false
            const optionIds = new Set()
            for (const option of column.options) {
              if (!option || typeof option.id !== 'string' || !option.id || ids.has(option.id) || optionIds.has(option.id) || typeof option.label !== 'string' || !option.label.trim() || option.isOther) return false
              optionIds.add(option.id)
              ids.add(option.id)
            }
            for (const key of ['minSelections', 'maxSelections']) {
              if (columnRules[key] !== undefined && (!Number.isInteger(Number(columnRules[key])) || Number(columnRules[key]) < 0 || Number(columnRules[key]) > column.options.length)) return false
            }
            if (columnRules.minSelections !== undefined && columnRules.maxSelections !== undefined && Number(columnRules.minSelections) > Number(columnRules.maxSelections)) return false
          }
          if (column.type === 'shortText' || column.type === 'longText') {
            for (const key of ['minLength', 'maxLength']) {
              if (columnRules[key] !== undefined && (!Number.isInteger(Number(columnRules[key])) || Number(columnRules[key]) < 0 || Number(columnRules[key]) > 500)) return false
            }
            if (columnRules.minLength !== undefined && columnRules.maxLength !== undefined && Number(columnRules.minLength) > Number(columnRules.maxLength)) return false
          }
          if (column.type === 'number' && columnRules.min !== undefined && columnRules.max !== undefined && Number(columnRules.min) > Number(columnRules.max)) return false
        }
        if (!Number.isInteger(Number(table.minRows)) || Number(table.minRows) < 0) return false
        if (table.maxRows !== undefined && (!Number.isInteger(Number(table.maxRows)) || Number(table.maxRows) < 1 || Number(table.maxRows) > 100 || Number(table.maxRows) < Number(table.minRows))) return false
      }
      const rules = question.validation || {}
      const integerRules = ['minLength', 'maxLength', 'minSelections', 'maxSelections', 'maxFiles']
      if (integerRules.some((key) => rules[key] !== undefined && (!Number.isInteger(Number(rules[key])) || Number(rules[key]) < 0))) return false
      if (rules.minLength !== undefined && rules.maxLength !== undefined && Number(rules.minLength) > Number(rules.maxLength)) return false
      if (rules.min !== undefined && rules.max !== undefined && Number(rules.min) > Number(rules.max)) return false
      if (rules.minSelections !== undefined && rules.maxSelections !== undefined && Number(rules.minSelections) > Number(rules.maxSelections)) return false
      if (question.visibleWhen) {
        const source = priorQuestions.get(question.visibleWhen.questionId)
        if (!source) return false
        if (!((source.type === 'single' && question.visibleWhen.operator === 'equals') || (source.type === 'multiple' && question.visibleWhen.operator === 'includes'))) return false
        if (!(source.options || []).some((option) => option.id === question.visibleWhen.value)) return false
      }
      priorQuestions.set(question.id, question)
    }
  }
  return true
}
function normalizeTemplate(raw, spaceType) {
  const template = JSON.parse(JSON.stringify(raw))
  template.spaceType = spaceType
  template.version = Number(template.version || 0)
  template.versionId = template.versionId || `collection_form_fallback_${spaceType}_v1`
  template.modules.forEach((module, moduleIndex) => {
    module.code = module.code || String.fromCharCode(65 + moduleIndex)
    module.questions.forEach((question, questionIndex) => {
      question.code = question.code || `${module.code}${questionIndex + 1}`
      question.shortTitle = question.shortTitle || question.title
      if (question.type === 'upload') {
        question.uploadType = question.uploadType || (question.upload && question.upload.accept) || question.accept || 'image'
        question.validation = { ...(question.validation || {}), maxFiles: (question.upload && question.upload.maxCount) || (question.validation && question.validation.maxFiles) || 1 }
      }
    })
  })
  return template
}

function templateCacheKey(spaceType, versionId) { return `${CACHE_PREFIX}${spaceType}:${versionId}` }

function readCachedTemplate(spaceType) {
  try {
    const versionId = wx.getStorageSync(`${LATEST_PREFIX}${spaceType}`)
    if (!versionId) return null
    const cached = wx.getStorageSync(templateCacheKey(spaceType, versionId))
    return isValidTemplate(cached, spaceType) ? normalizeTemplate(cached, spaceType) : null
  } catch (error) { return null }
}

function cacheTemplate(template) {
  try {
    wx.setStorageSync(templateCacheKey(template.spaceType, template.versionId), template)
    wx.setStorageSync(`${LATEST_PREFIX}${template.spaceType}`, template.versionId)
  } catch (error) {}
}

async function loadFormTemplate(spaceType, builtinTemplate) {
  if (wx.cloud && wx.cloud.callFunction) {
    try {
      const call = await wx.cloud.callFunction({ name: 'collection_form_public', data: { action: 'getPublished', spaceType } })
      const response = call && call.result
      const remote = response && response.success && response.data && response.data.template
      if (isValidTemplate(remote, spaceType)) {
        const template = normalizeTemplate(remote, spaceType)
        cacheTemplate(template)
        return { template, source: 'remote', offline: false }
      }
    } catch (error) {}
  }
  const cached = readCachedTemplate(spaceType)
  if (cached) return { template: cached, source: 'cache', offline: true }
  const fallback = normalizeTemplate(builtinTemplate, spaceType)
  fallback.source = 'builtin'
  return { template: fallback, source: 'builtin', offline: true }
}

module.exports = { isValidTemplate, normalizeTemplate, loadFormTemplate, readCachedTemplate, templateCacheKey }
