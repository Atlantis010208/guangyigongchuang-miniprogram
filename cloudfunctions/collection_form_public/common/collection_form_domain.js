const SPACE_TYPES = ['residential', 'wellness', 'office', 'fitness']
const QUESTION_TYPES = ['single', 'multiple', 'shortText', 'longText', 'number', 'location', 'table', 'upload', 'ranking']
const SPACE_TYPE_LABELS = {
  residential: '住宅空间',
  wellness: '疗愈服务空间',
  office: '辅助办公空间',
  fitness: '运动健身空间',
}
const MAX_TEMPLATE_BYTES = 1024 * 1024

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function toText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function moduleCode(index) {
  return index < 26 ? String.fromCharCode(65 + index) : `M${index + 1}`
}

function createEmptyTemplate(spaceType) {
  const safeType = SPACE_TYPES.includes(spaceType) ? spaceType : 'residential'
  return {
    id: `lighting-needs-${safeType}`,
    schemaVersion: 1,
    spaceType: safeType,
    title: `${SPACE_TYPE_LABELS[safeType]}灯光需求收集`,
    description: '',
    modules: [],
  }
}

function normalizeValidation(validation) {
  const source = validation && typeof validation === 'object' ? validation : {}
  const result = {}
  ;['minLength', 'maxLength', 'min', 'max', 'minSelections', 'maxSelections', 'maxFiles'].forEach((key) => {
    const value = normalizeNumber(source[key])
    if (value !== undefined) result[key] = value
  })
  return result
}

function normalizeOptions(options) {
  return (Array.isArray(options) ? options : []).map((option) => {
    const normalized = {
      id: toText(option && option.id),
      label: toText(option && option.label),
    }
    if (option && option.isOther) {
      normalized.isOther = true
      normalized.otherPlaceholder = toText(option.otherPlaceholder, '请填写其他内容')
      normalized.otherRequired = option.otherRequired !== false
      normalized.otherMaxLength = normalizeNumber(option.otherMaxLength) ?? 100
    }
    return normalized
  })
}

function normalizeTableConfig(table) {
  const source = table && typeof table === 'object' ? table : {}
  const allowedTypes = ['single', 'multiple', 'shortText', 'longText', 'number']
  const columns = (Array.isArray(source.columns) ? source.columns : []).map((column) => {
    const type = column && allowedTypes.includes(column.type) ? column.type : 'shortText'
    const normalized = {
      id: toText(column && column.id), label: toText(column && column.label), type,
      required: !column || column.required !== false, placeholder: toText(column && column.placeholder), unit: toText(column && column.unit),
    }
    if (type === 'single' || type === 'multiple') normalized.options = normalizeOptions(column && column.options)
    const validation = normalizeValidation(column && column.validation)
    if (Object.keys(validation).length) normalized.validation = validation
    return normalized
  })
  const minRows = normalizeNumber(source.minRows) ?? 0
  const maxRows = normalizeNumber(source.maxRows)
  return { columns, minRows, ...(maxRows === undefined ? {} : { maxRows }) }
}


function normalizeQuestion(question, code) {
  const source = question && typeof question === 'object' ? question : {}
  const normalized = {
    id: toText(source.id),
    code,
    type: QUESTION_TYPES.includes(source.type) ? source.type : 'shortText',
    title: toText(source.title),
    shortTitle: toText(source.shortTitle),
    description: toText(source.description),
    required: Boolean(source.required),
  }

  if (source.placeholder) normalized.placeholder = toText(source.placeholder)
  if (source.unit) normalized.unit = toText(source.unit)
  if (source.action === 'chooseLocation' || source.locationEnabled) {
    normalized.action = 'chooseLocation'
    normalized.locationEnabled = true
  }
  if (normalized.type === 'upload') {
    normalized.uploadType = source.uploadType === 'file' || (source.upload && source.upload.accept === 'file') ? 'file' : 'image'
  }
  if (['single', 'multiple', 'ranking'].includes(normalized.type)) {
    normalized.options = normalizeOptions(source.options)
  }
  if (normalized.type === 'table') normalized.table = normalizeTableConfig(source.table)

  const validationSource = { ...(source.validation || {}) }
  if (normalized.type === 'upload' && source.upload && source.upload.maxCount !== undefined) validationSource.maxFiles = source.upload.maxCount
  const validation = normalizeValidation(validationSource)
  if (Object.keys(validation).length) normalized.validation = validation
  if (normalized.type === 'upload') normalized.upload = { accept: normalized.uploadType, maxCount: validation.maxFiles || 1 }

  const condition = source.visibleWhen
  if (condition && typeof condition === 'object') {
    normalized.visibleWhen = {
      questionId: toText(condition.questionId),
      operator: condition.operator === 'includes' ? 'includes' : 'equals',
      value: condition.value,
    }
  }
  return normalized
}

function normalizeTemplate(template, spaceType) {
  const safeType = SPACE_TYPES.includes(spaceType || (template && template.spaceType))
    ? (spaceType || template.spaceType)
    : 'residential'
  const source = template && typeof template === 'object' ? template : createEmptyTemplate(safeType)
  const modules = (Array.isArray(source.modules) ? source.modules : []).map((module, moduleIndex) => {
    const code = moduleCode(moduleIndex)
    return {
      id: toText(module && module.id),
      code,
      title: toText(module && module.title),
      description: toText(module && module.description),
      estimatedMinutes: Math.max(0, normalizeNumber(module && module.estimatedMinutes) || 0),
      questions: (Array.isArray(module && module.questions) ? module.questions : [])
        .map((question, questionIndex) => normalizeQuestion(question, `${code}${questionIndex + 1}`)),
    }
  })

  return {
    id: toText(source.id, `lighting-needs-${safeType}`),
    schemaVersion: 1,
    spaceType: safeType,
    title: toText(source.title),
    description: toText(source.description),
    modules,
  }
}

function validateTemplate(template, options = {}) {
  const normalized = normalizeTemplate(template, template && template.spaceType)
  const errors = []
  const forPublish = Boolean(options.forPublish)
  const add = (path, message) => errors.push({ path, message })
  ;(Array.isArray(template && template.modules) ? template.modules : []).forEach((module, moduleIndex) => {
    ;(Array.isArray(module && module.questions) ? module.questions : []).forEach((question, questionIndex) => {
      const path = `modules[${moduleIndex}].questions[${questionIndex}]`
      if (!QUESTION_TYPES.includes(question && question.type)) add(`${path}.type`, '题型无效')
      if (question && question.type === 'table') {
        const columns = question.table && Array.isArray(question.table.columns) ? question.table.columns : []
        columns.forEach((column, columnIndex) => {
          if (!column || !['single', 'multiple', 'shortText', 'longText', 'number'].includes(column.type)) add(`${path}.table.columns[${columnIndex}].type`, '列类型无效')
        })
      }
      if (question && question.visibleWhen && !['equals', 'includes'].includes(question.visibleWhen.operator)) add(`${path}.visibleWhen.operator`, '条件运算符无效')
    })
  })
  if (!SPACE_TYPES.includes(normalized.spaceType)) add('spaceType', '空间类型无效')
  if (!normalized.id) add('id', '模板 ID 不能为空')
  if (forPublish && !normalized.title) add('title', '表单标题不能为空')
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_TEMPLATE_BYTES) {
    add('template', '模板大小不能超过 1 MB')
  }
  if (forPublish && normalized.modules.length === 0) add('modules', '发布前至少添加一个模块')

  const allIds = new Set()
  const previousQuestions = new Map()
  const registerId = (id, path) => {
    if (!id) return add(path, '稳定 ID 不能为空')
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return add(path, '稳定 ID 只能包含字母、数字、下划线和连字符')
    if (allIds.has(id)) return add(path, `稳定 ID 重复：${id}`)
    allIds.add(id)
  }

  normalized.modules.forEach((module, moduleIndex) => {
    const modulePath = `modules[${moduleIndex}]`
    registerId(module.id, `${modulePath}.id`)
    if (forPublish && !module.title) add(`${modulePath}.title`, '模块标题不能为空')
    if (forPublish && module.questions.length === 0) add(`${modulePath}.questions`, '模块至少需要一道题')

    module.questions.forEach((question, questionIndex) => {
      const questionPath = `${modulePath}.questions[${questionIndex}]`
      registerId(question.id, `${questionPath}.id`)
      if (!QUESTION_TYPES.includes(question.type)) add(`${questionPath}.type`, '题型无效')
      if (forPublish && !question.title) add(`${questionPath}.title`, '题目标题不能为空')

      if (['single', 'multiple', 'ranking'].includes(question.type)) {
        if (forPublish && (!Array.isArray(question.options) || question.options.length < 2)) {
          add(`${questionPath}.options`, '至少需要两个选项')
        }
        const optionIds = new Set()
        ;(question.options || []).forEach((option, optionIndex) => {
          const optionPath = `${questionPath}.options[${optionIndex}]`
          registerId(option.id, `${optionPath}.id`)
          if (forPublish && !option.label) add(`${optionPath}.label`, '选项文字不能为空')
          if (optionIds.has(option.id)) add(`${optionPath}.id`, '当前题目存在重复选项 ID')
          if (option.isOther && (!Number.isInteger(option.otherMaxLength) || option.otherMaxLength < 1 || option.otherMaxLength > 500)) {
            add(`${optionPath}.otherMaxLength`, '“其他”文本长度须为 1–500')
          }
          optionIds.add(option.id)
        })
        const otherOptions = (question.options || []).filter((option) => option.isOther)
        if (otherOptions.length > 1) add(`${questionPath}.options`, '最多只能配置一个“其他”选项')
        if (question.type === 'ranking' && otherOptions.length) add(`${questionPath}.options`, '排序题不能配置“其他”文本选项')
      }

      if (question.type === 'table') {
        const table = question.table || { columns: [], minRows: 0 }
        if (forPublish && table.columns.length < 1) add(`${questionPath}.table.columns`, '表格题至少需要一列')
        if (table.columns.length > 10) add(`${questionPath}.table.columns`, '表格题最多支持 10 列')
        const columnIds = new Set()
        table.columns.forEach((column, columnIndex) => {
          const columnPath = `${questionPath}.table.columns[${columnIndex}]`
          registerId(column.id, `${columnPath}.id`)
          if (columnIds.has(column.id)) add(`${columnPath}.id`, '当前表格存在重复列 ID')
          if (forPublish && !column.label) add(`${columnPath}.label`, '列标题不能为空')
          if (!['single', 'multiple', 'shortText', 'longText', 'number'].includes(column.type)) add(`${columnPath}.type`, '列类型无效')
          if (column.type === 'single' || column.type === 'multiple') {
            const options = column.options || []
            if (forPublish && options.length < 1) add(`${columnPath}.options`, '选择列至少需要一个选项')
            const optionIds = new Set()
            options.forEach((option, optionIndex) => {
              const optionPath = `${columnPath}.options[${optionIndex}]`
              registerId(option.id, `${optionPath}.id`)
              if (optionIds.has(option.id)) add(`${optionPath}.id`, '当前列存在重复选项 ID')
              if (forPublish && !option.label) add(`${optionPath}.label`, '选项文本不能为空')
              if (option.isOther) add(optionPath, '表格列暂不支持“其他”文本选项')
              optionIds.add(option.id)
            })
            const rules = column.validation || {}
            ;['minSelections', 'maxSelections'].forEach((key) => {
              if (rules[key] !== undefined && (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > options.length)) add(`${columnPath}.validation.${key}`, '须为不超过选项数量的非负整数')
            })
            if (rules.minSelections !== undefined && rules.maxSelections !== undefined && rules.minSelections > rules.maxSelections) add(`${columnPath}.validation`, '最少选择不能大于最多选择')
          }
          if (column.type === 'shortText' || column.type === 'longText') {
            const rules = column.validation || {}
            ;['minLength', 'maxLength'].forEach((key) => { if (rules[key] !== undefined && (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > 500)) add(`${columnPath}.validation.${key}`, '须为 0–500 的整数') })
            if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) add(`${columnPath}.validation`, '最少字数不能大于最多字数')
          }
          if (column.type === 'number') {
            const rules = column.validation || {}
            if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) add(`${columnPath}.validation`, '最小值不能大于最大值')
          }
          columnIds.add(column.id)
        })
        if (!Number.isInteger(table.minRows) || table.minRows < 0) add(`${questionPath}.table.minRows`, '必须是非负整数')
        if (table.maxRows !== undefined && (!Number.isInteger(table.maxRows) || table.maxRows < 1 || table.maxRows > 100)) add(`${questionPath}.table.maxRows`, '须为 1–100')
        if (table.maxRows !== undefined && table.minRows > table.maxRows) add(`${questionPath}.table`, '最少行数不能大于最多行数')
      }

      const rules = question.validation || {}
      ;['minLength', 'maxLength', 'minSelections', 'maxSelections', 'maxFiles'].forEach((key) => {
        if (rules[key] !== undefined && (!Number.isInteger(rules[key]) || rules[key] < 0)) add(`${questionPath}.validation.${key}`, '必须是非负整数')
      })
      if (question.type === 'multiple') {
        const optionCount = (question.options || []).length
        if (rules.minSelections !== undefined && rules.minSelections > optionCount) add(`${questionPath}.validation.minSelections`, '不能超过选项数量')
        if (rules.maxSelections !== undefined && rules.maxSelections > optionCount) add(`${questionPath}.validation.maxSelections`, '不能超过选项数量')
      }
      if (question.type === 'upload' && rules.maxFiles !== undefined && rules.maxFiles < 1) add(`${questionPath}.validation.maxFiles`, '至少允许上传一个文件')
      if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) {
        add(`${questionPath}.validation`, '最小字数不能大于最大字数')
      }
      if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
        add(`${questionPath}.validation`, '最小值不能大于最大值')
      }
      if (rules.minSelections !== undefined && rules.maxSelections !== undefined
        && rules.minSelections > rules.maxSelections) {
        add(`${questionPath}.validation`, '最少选择数不能大于最多选择数')
      }

      if (question.visibleWhen) {
        const condition = question.visibleWhen
        const sourceQuestion = previousQuestions.get(condition.questionId)
        if (!sourceQuestion) {
          add(`${questionPath}.visibleWhen`, '条件来源必须是当前题之前的题目')
        } else if (condition.operator === 'equals' && sourceQuestion.type !== 'single') {
          add(`${questionPath}.visibleWhen`, 'equals 只能引用单选题')
        } else if (condition.operator === 'includes' && sourceQuestion.type !== 'multiple') {
          add(`${questionPath}.visibleWhen`, 'includes 只能引用多选题')
        } else {
          const optionIds = (sourceQuestion.options || []).map((option) => option.id)
          if (!optionIds.includes(condition.value)) {
            add(`${questionPath}.visibleWhen.value`, '条件值不是来源题的有效选项')
          }
        }
      }
      previousQuestions.set(question.id, question)
    })
  })
  return errors
}

function isChoiceAnswer(answer) {
  return Boolean(answer && typeof answer === 'object' && !Array.isArray(answer) && Object.prototype.hasOwnProperty.call(answer, 'selected'))
}

function choiceValue(answer) {
  return isChoiceAnswer(answer) ? answer.selected : answer
}

function choiceSelections(answer) {
  const value = choiceValue(answer)
  if (Array.isArray(value)) return value
  return typeof value === 'string' && value ? [value] : []
}

function isLocationAnswer(answer) {
  return Boolean(answer && typeof answer === 'object' && !Array.isArray(answer)
    && (toText(answer.name) || toText(answer.address))
    && Number.isFinite(Number(answer.latitude)) && Number.isFinite(Number(answer.longitude))
    && Number(answer.latitude) >= -90 && Number(answer.latitude) <= 90
    && Number(answer.longitude) >= -180 && Number(answer.longitude) <= 180
    && toText(answer.name).length <= 200 && toText(answer.address).length <= 500)
}

function hasAnswer(answer) {
  if (isChoiceAnswer(answer)) return hasAnswer(answer.selected)
  if (Array.isArray(answer)) return answer.length > 0
  if (typeof answer === 'string') return answer.trim().length > 0
  return answer !== undefined && answer !== null
}

function isVisible(question, answers) {
  const condition = question.visibleWhen
  if (!condition) return true
  const source = choiceValue(answers[condition.questionId])
  if (condition.operator === 'equals') return source === condition.value
  if (condition.operator === 'includes') return Array.isArray(source) && source.includes(condition.value)
  return false
}

function validateAnswer(question, answer) {
  const rules = question.validation || {}
  if (question.required && !hasAnswer(answer)) return '请完成本题后继续'
  if (!hasAnswer(answer)) return ''
  const optionIds = (question.options || []).map((option) => option.id)
  const selected = choiceSelections(answer)

  if (question.type === 'single' && (selected.length !== 1 || !optionIds.includes(selected[0]))) return '请选择有效选项'
  if (question.type === 'multiple') {
    if (new Set(selected).size !== selected.length || selected.some((id) => !optionIds.includes(id))) return '请选择有效选项'
    if (rules.minSelections !== undefined && selected.length < rules.minSelections) return `请至少选择 ${rules.minSelections} 项`
    if (rules.maxSelections !== undefined && selected.length > rules.maxSelections) return `最多选择 ${rules.maxSelections} 项`
  }
  if (question.type === 'single' || question.type === 'multiple') {
    const otherOption = (question.options || []).find((option) => option.isOther && selected.includes(option.id))
    if (otherOption) {
      const otherText = isChoiceAnswer(answer) && typeof answer.otherText === 'string' ? answer.otherText.trim() : ''
      if (otherOption.otherRequired !== false && !otherText) return '请填写其他内容'
      if (otherText.length > (otherOption.otherMaxLength || 100)) return `其他内容最多输入 ${otherOption.otherMaxLength || 100} 个字`
    }
  }
  if (question.type === 'location' && !isLocationAnswer(answer)) return '请选择有效位置'
  if (question.type === 'table') {
    if (!Array.isArray(answer)) return '请至少填写一行'
    const table = question.table || { columns: [], minRows: 0 }
    if (answer.length < table.minRows) return `请至少填写 ${table.minRows} 行`
    if (answer.length > 100 || (table.maxRows !== undefined && answer.length > table.maxRows)) return `最多填写 ${table.maxRows || 100} 行`
    for (let rowIndex = 0; rowIndex < answer.length; rowIndex += 1) {
      const row = answer[rowIndex]
      if (!row || typeof row !== 'object' || Array.isArray(row)) return `第 ${rowIndex + 1} 行数据无效`
      for (const column of table.columns) {
        const value = row[column.id]
        const empty = value === undefined || value === null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '')
        if (column.required !== false && empty) return `请填写第 ${rowIndex + 1} 行的${column.label}`
        if (empty) continue
        const rules = column.validation || {}
        if (column.type === 'single') {
          const optionIds = (column.options || []).map((option) => option.id)
          if (typeof value !== 'string' || !optionIds.includes(value)) return `第 ${rowIndex + 1} 行的${column.label}请选择有效选项`
        }
        if (column.type === 'multiple') {
          const optionIds = (column.options || []).map((option) => option.id)
          if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((id) => typeof id !== 'string' || !optionIds.includes(id))) return `第 ${rowIndex + 1} 行的${column.label}请选择有效选项`
          if (rules.minSelections !== undefined && value.length < rules.minSelections) return `第 ${rowIndex + 1} 行的${column.label}请至少选择 ${rules.minSelections} 项`
          if (rules.maxSelections !== undefined && value.length > rules.maxSelections) return `第 ${rowIndex + 1} 行的${column.label}最多选择 ${rules.maxSelections} 项`
        }
        if (column.type === 'number') {
          const number = Number(value)
          if (!Number.isFinite(number)) return `第 ${rowIndex + 1} 行的${column.label}须为数字`
          if (rules.min !== undefined && number < rules.min) return `第 ${rowIndex + 1} 行的${column.label}不能小于 ${rules.min}`
          if (rules.max !== undefined && number > rules.max) return `第 ${rowIndex + 1} 行的${column.label}不能大于 ${rules.max}`
        }
        if (column.type === 'shortText' || column.type === 'longText') {
          const length = String(value).trim().length
          if (rules.minLength !== undefined && length < rules.minLength) return `第 ${rowIndex + 1} 行的${column.label}请至少输入 ${rules.minLength} 个字`
          if (length > (rules.maxLength || 500)) return `第 ${rowIndex + 1} 行的${column.label}最多输入 ${rules.maxLength || 500} 个字`
        }
      }
    }
  }
  if (question.type === 'shortText' || question.type === 'longText') {
    const length = String(answer).trim().length
    if (rules.minLength !== undefined && length < rules.minLength) return `请至少输入 ${rules.minLength} 个字`
    if (rules.maxLength !== undefined && length > rules.maxLength) return `最多输入 ${rules.maxLength} 个字`
  }
  if (question.type === 'number') {
    const value = Number(answer)
    if (!Number.isFinite(value)) return '请输入有效数字'
    if (rules.min !== undefined && value < rules.min) return `不能小于 ${rules.min}${question.unit || ''}`
    if (rules.max !== undefined && value > rules.max) return `不能大于 ${rules.max}${question.unit || ''}`
  }
  if (question.type === 'upload') {
    if (!Array.isArray(answer)) return '文件记录无效'
    if (rules.maxFiles !== undefined && answer.length > rules.maxFiles) return `最多上传 ${rules.maxFiles} 个文件`
    if (answer.some((file) => !file || typeof file.fileID !== 'string' || !file.fileID.startsWith('cloud://'))) {
      return '请先完成文件上传'
    }
  }
  if (question.type === 'ranking') {
    const unique = Array.isArray(answer) ? new Set(answer) : new Set()
    if (!Array.isArray(answer) || answer.length !== optionIds.length || unique.size !== optionIds.length
      || answer.some((id) => !optionIds.includes(id))) return '请为全部选项完成排序'
  }
  return ''
}

function sanitizeChoiceAnswer(question, answer) {
  const selected = choiceValue(answer)
  const otherOption = (question.options || []).find((option) => option.isOther)
  if (!otherOption) return clone(selected)
  const otherSelected = Array.isArray(selected) ? selected.includes(otherOption.id) : selected === otherOption.id
  return {
    selected: clone(selected),
    otherText: otherSelected && isChoiceAnswer(answer) && typeof answer.otherText === 'string' ? answer.otherText.trim() : '',
  }
}
function sanitizeLocation(answer) {
  return {
    name: toText(answer.name),
    address: toText(answer.address),
    latitude: Number(answer.latitude),
    longitude: Number(answer.longitude),
  }
}

function sanitizeTable(question, answer) {
  const columns = (question.table && question.table.columns) || []
  return answer.map((row) => {
    const sanitized = {}
    columns.forEach((column) => {
      const value = row[column.id]
      if (value === undefined || value === null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '')) return
      if (column.type === 'number') sanitized[column.id] = Number(value)
      else if (column.type === 'multiple') sanitized[column.id] = value.slice()
      else sanitized[column.id] = String(value).trim()
    })
    return sanitized
  })
}


function sanitizeUpload(answer) {
  return answer.map((file) => ({
    fileID: file.fileID,
    name: toText(file.name, '未命名文件'),
    size: Math.max(0, normalizeNumber(file.size) || 0),
    type: toText(file.type),
  }))
}

function sanitizeSubmission(template, rawAnswers) {
  const normalized = normalizeTemplate(template, template && template.spaceType)
  const sourceAnswers = rawAnswers && typeof rawAnswers === 'object' ? rawAnswers : {}
  const answers = {}
  const errors = []

  normalized.modules.forEach((module) => module.questions.forEach((question) => {
    if (!isVisible(question, answers)) return
    const answer = sourceAnswers[question.id]
    const message = validateAnswer(question, answer)
    if (message) {
      errors.push({ questionId: question.id, code: question.code, message })
      return
    }
    if (!hasAnswer(answer)) return
    answers[question.id] = question.type === 'upload' ? sanitizeUpload(answer) : (question.type === 'location' ? sanitizeLocation(answer) : (question.type === 'table' ? sanitizeTable(question, answer) : (['single', 'multiple'].includes(question.type) ? sanitizeChoiceAnswer(question, answer) : clone(answer))))
  }))
  return { answers, errors }
}

function buildSubmissionSummary(template, answers) {
  const questions = template.modules.flatMap((module) => module.questions)
  const firstNamed = questions.find((question) => question.code === 'A1')
    || questions.find((question) => question.type === 'shortText')
  const value = firstNamed ? answers[firstNamed.id] : ''
  return typeof value === 'string' ? value.slice(0, 80) : ''
}

function validateFileReferences(template, answers, requestId) {
  const prefix = `/collection-form-submissions/${template.spaceType}/${requestId}/`
  const errors = []
  template.modules.forEach((module) => module.questions.forEach((question) => {
    if (question.type !== 'upload' || !Array.isArray(answers[question.id])) return
    answers[question.id].forEach((file) => {
      const pathStart = file.fileID.indexOf('/', 'cloud://'.length)
      const storagePath = pathStart >= 0 ? file.fileID.slice(pathStart) : ''
      if (!storagePath.startsWith(prefix)) errors.push({ questionId: question.id, code: question.code, message: '文件不属于本次提交' })
    })
  }))
  return errors
}
module.exports = {
  SPACE_TYPES,
  QUESTION_TYPES,
  SPACE_TYPE_LABELS,
  MAX_TEMPLATE_BYTES,
  createEmptyTemplate,
  normalizeTemplate,
  validateTemplate,
  hasAnswer,
  isVisible,
  validateAnswer,
  sanitizeSubmission,
  buildSubmissionSummary,
  validateFileReferences,
}
