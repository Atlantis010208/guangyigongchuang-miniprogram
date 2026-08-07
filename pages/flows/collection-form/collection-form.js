const { getFormTemplate } = require('./form-template')
const { loadFormTemplate, isValidTemplate } = require('../../../utils/collection-form-loader')

const SPACE_TYPES = ['residential', 'wellness', 'office', 'fitness']
const AUTO_ADVANCE_TYPES = new Set(['single', 'shortText', 'longText'])
const MODULE_TAG_TITLES = {
  '空间愿景与长期生活状态': '长期生活状态',
  '基础信息与家庭结构': '家庭结构',
  '装修、施工与资料条件': '施工与资料',
  '风格、亮度与灯光感受': '灯光感受',
  '时间线、重点空间与生活场景': '重点空间场景',
  '柜体、展示、智能与预算': '智能与预算',
}

function getModuleTagTitle(module) {
  if (!module) return ''
  const customTitle = String(module.tagTitle || '').trim()
  if (customTitle) return customTitle
  const moduleTitle = String(module.title || '').trim()
  return MODULE_TAG_TITLES[moduleTitle] || moduleTitle || `${module.code || ''} 模块`.trim()
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
    && (String(answer.name || '').trim() || String(answer.address || '').trim())
    && Number.isFinite(Number(answer.latitude)) && Number.isFinite(Number(answer.longitude))
    && Number(answer.latitude) >= -90 && Number(answer.latitude) <= 90
    && Number(answer.longitude) >= -180 && Number(answer.longitude) <= 180)
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
  return true
}

function getVisibleQuestions(module, answers) {
  return module.questions.filter((question) => isVisible(question, answers))
}

function validateQuestion(question, answer) {
  const rules = question.validation || {}
  if (question.required && !hasAnswer(answer)) return '请完成本题后继续'
  if (!hasAnswer(answer)) return ''

  const optionIds = (question.options || []).map((option) => option.id)
  const selected = choiceSelections(answer)
  if (question.type === 'single' && (selected.length !== 1 || !optionIds.includes(selected[0]))) return '选项已失效，请重新选择'
  if (question.type === 'multiple') {
    const uniqueIds = new Set(selected)
    if (uniqueIds.size !== selected.length || selected.some((id) => !optionIds.includes(id))) {
      return '选项已失效，请重新选择'
    }
  }

  if (question.type === 'single' || question.type === 'multiple') {
    const otherOption = (question.options || []).find((option) => option.isOther && selected.includes(option.id))
    if (otherOption) {
      const otherText = isChoiceAnswer(answer) && typeof answer.otherText === 'string' ? answer.otherText.trim() : ''
      if (otherOption.otherRequired !== false && !otherText) return '请填写其他内容'
      if (otherText.length > (otherOption.otherMaxLength || 100)) return `其他内容最多输入 ${otherOption.otherMaxLength || 100} 个字`
    }
  }

  if (question.type === 'multiple') {
    if (rules.minSelections && selected.length < rules.minSelections) return `请至少选择 ${rules.minSelections} 项`
    if (rules.maxSelections && selected.length > rules.maxSelections) return `最多选择 ${rules.maxSelections} 项`
  }
  if (question.type === 'location' && !isLocationAnswer(answer)) return '请选择有效位置'
  if (question.type === 'table') {
    if (!Array.isArray(answer)) return '请至少填写一行'
    const table = question.table || { columns: [], minRows: 0 }
    if (answer.length < Number(table.minRows || 0)) return `请至少填写 ${table.minRows} 行`
    if (answer.length > 100 || (table.maxRows && answer.length > table.maxRows)) return `最多填写 ${table.maxRows || 100} 行`
    for (let rowIndex = 0; rowIndex < answer.length; rowIndex += 1) {
      const row = answer[rowIndex]
      if (!row || typeof row !== 'object' || Array.isArray(row)) return `第 ${rowIndex + 1} 行数据无效`
      for (const column of table.columns || []) {
        const value = row[column.id]
        const empty = value === undefined || value === null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '')
        if (column.required !== false && empty) return `请填写第 ${rowIndex + 1} 行的${column.label}`
        if (empty) continue
        const columnRules = column.validation || {}
        if (column.type === 'single') {
          const optionIds = (column.options || []).map((option) => option.id)
          if (typeof value !== 'string' || !optionIds.includes(value)) return `第 ${rowIndex + 1} 行的${column.label}请选择有效选项`
        }
        if (column.type === 'multiple') {
          const optionIds = (column.options || []).map((option) => option.id)
          if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((id) => !optionIds.includes(id))) return `第 ${rowIndex + 1} 行的${column.label}请选择有效选项`
          if (columnRules.minSelections && value.length < columnRules.minSelections) return `第 ${rowIndex + 1} 行的${column.label}请至少选择 ${columnRules.minSelections} 项`
          if (columnRules.maxSelections && value.length > columnRules.maxSelections) return `第 ${rowIndex + 1} 行的${column.label}最多选择 ${columnRules.maxSelections} 项`
        }
        if (column.type === 'number') {
          const number = Number(value)
          if (!Number.isFinite(number)) return `第 ${rowIndex + 1} 行的${column.label}须为数字`
          if (columnRules.min !== undefined && number < columnRules.min) return `第 ${rowIndex + 1} 行的${column.label}不能小于 ${columnRules.min}`
          if (columnRules.max !== undefined && number > columnRules.max) return `第 ${rowIndex + 1} 行的${column.label}不能大于 ${columnRules.max}`
        }
        if (column.type === 'shortText' || column.type === 'longText') {
          const length = String(value).trim().length
          if (columnRules.minLength && length < columnRules.minLength) return `第 ${rowIndex + 1} 行的${column.label}请至少输入 ${columnRules.minLength} 个字`
          if (columnRules.maxLength && length > columnRules.maxLength) return `第 ${rowIndex + 1} 行的${column.label}最多输入 ${columnRules.maxLength} 个字`
        }
      }
    }
  }
  if (question.type === 'shortText' || question.type === 'longText') {
    const length = String(answer).trim().length
    if (rules.minLength && length < rules.minLength) return `请至少输入 ${rules.minLength} 个字`
    if (rules.maxLength && length > rules.maxLength) return `最多输入 ${rules.maxLength} 个字`
  }
  if (question.type === 'number') {
    const value = Number(answer)
    if (!Number.isFinite(value)) return '请输入有效数字'
    if (rules.min !== undefined && value < rules.min) return `不能小于 ${rules.min}${question.unit || ''}`
    if (rules.max !== undefined && value > rules.max) return `不能大于 ${rules.max}${question.unit || ''}`
  }
  if (question.type === 'upload') {
    if (!Array.isArray(answer)) return '文件记录已失效，请重新选择'
    const validFiles = answer.filter((file) => file.valid !== false)
    if (question.required && !validFiles.length) return '请选择有效文件后继续'
    if (rules.maxFiles && validFiles.length > rules.maxFiles) return `最多选择 ${rules.maxFiles} 个文件`
  }
  if (question.type === 'ranking') {
    const expectedIds = question.options.map((option) => option.id)
    const uniqueIds = Array.isArray(answer) ? new Set(answer) : new Set()
    const hasExactOptions = Array.isArray(answer)
      && answer.length === expectedIds.length
      && uniqueIds.size === expectedIds.length
      && answer.every((id) => expectedIds.includes(id))
    if (!hasExactOptions) return '请为全部选项完成排序'
  }
  return ''
}

Page({
  data: {
    statusBarHeight: 20,
    navigationBarHeight: 44,
    view: 'overview',
    form: null,
    answers: {},
    moduleCards: [],
    currentModule: null,
    currentModuleTagTitle: '',
    currentModuleIndex: 0,
    currentQuestion: null,
    currentQuestionIndex: 0,
    visibleQuestionCount: 0,
    currentAnswer: null,
    progressWidth: 0,
    reviewModules: [],
    submitted: false,
    allModulesComplete: false,
    scrollLocked: false,
    motionClass: '',
    keyboardHeight: 0,
    bottomBarStyle: '',
    offlineMode: false,
    submitting: false,
    uploadProgress: 0,
    submitButtonText: '确认提交',
  },

  onLoad(options) {
    return this.initializeFormPage(options || {})
  },

  async initializeFormPage(options) {
    const requestedType = options.spaceType || 'residential'
    const spaceType = SPACE_TYPES.includes(requestedType) ? requestedType : 'residential'
    const builtin = getFormTemplate(spaceType)
    const loaded = await loadFormTemplate(spaceType, builtin)
    this.spaceType = spaceType
    this.latestForm = loaded.template
    this.activeDraftKey = `collection_form_active_draft:${spaceType}`

    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const navigationBarHeight = Math.max(44, (menuButton.top - statusBarHeight) * 2 + menuButton.height)
    this.setData({ statusBarHeight, navigationBarHeight, offlineMode: loaded.offline })

    this.keyboardHeightHandler = this.handleKeyboardHeightChange.bind(this)
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.keyboardHeightHandler)
    if (loaded.offline) wx.showToast({ title: loaded.source === 'cache' ? '已使用缓存表单' : '已使用本地表单', icon: 'none' })

    let activeStorageKey = ''
    try { activeStorageKey = wx.getStorageSync(this.activeDraftKey) || '' } catch (error) {}
    const latestKey = this.getDraftStorageKey(loaded.template)
    const activeDraft = activeStorageKey ? this.readDraftByKey(activeStorageKey) : null
    if (activeDraft && activeDraft.answers && Object.keys(activeDraft.answers).length && activeStorageKey !== latestKey && isValidTemplate(activeDraft.templateSnapshot, spaceType)) {
      wx.showModal({
        title: '发现旧版本草稿',
        content: '后台已有新版本，您可以继续按旧版填写并提交，或清空答案后使用最新版。',
        confirmText: '继续旧版', cancelText: '使用最新版',
        success: ({ confirm }) => {
          if (confirm) {
            this.configureForm(activeDraft.templateSnapshot)
            this.restoreDraft(activeDraft)
          } else {
            try { wx.removeStorageSync(activeStorageKey) } catch (error) {}
            this.configureForm(loaded.template)
            this.showOverview()
          }
        },
      })
      return
    }
    this.configureForm(loaded.template)
    const draft = this.readDraft()
    if (draft && draft.submitted && draft.answers) {
      this.restoreDraft({ ...draft, position: { view: 'review' } })
      return
    }
    if (draft && draft.answers && Object.keys(draft.answers).length) {
      wx.showModal({
        title: '发现未完成的填写', content: '是否继续上次的填写进度？',
        confirmText: '继续填写', cancelText: '重新填写',
        success: ({ confirm }) => confirm ? this.restoreDraft(draft) : this.restartForm(),
      })
      return
    }
    this.showOverview()
  },

  getDraftStorageKey(form) {
    return `collection_form_draft:${form.id}:${form.versionId || form.version}:${form.spaceType}`
  },

  configureForm(form) {
    this.form = form
    this.storageKey = this.getDraftStorageKey(form)
    this.setData({ form })
  },
  onUnload() {
    if (this.keyboardHeightHandler && wx.offKeyboardHeightChange) {
      wx.offKeyboardHeightChange(this.keyboardHeightHandler)
    }
    this.keyboardHeightHandler = null
    this.cancelAutoAdvance()
  },

  handleKeyboardHeightChange(event) {
    const keyboardHeight = Math.max(0, Number(event && event.height) || 0)
    const bottomBarStyle = keyboardHeight > 0
      ? `bottom: ${keyboardHeight}px; padding-bottom: 20rpx;`
      : ''
    this.setData({ keyboardHeight, bottomBarStyle })
  },

  readDraft() {
    return this.readDraftByKey(this.storageKey)
  },

  readDraftByKey(key) {
    try {
      return wx.getStorageSync(key) || null
    } catch (error) {
      return null
    }
  },

  restoreDraft(draft) {
    const answers = this.revalidateCachedFiles(draft.answers || {})
    this.requestId = draft.requestId || ''
    this.setData({ answers, submitted: Boolean(draft.submitted) })
    const position = draft.position || {}
    if (position.view === 'question') {
      this.showQuestion(position.moduleIndex || 0, position.questionIndex || 0)
    } else if (position.view === 'module') {
      this.showModule(position.moduleIndex || 0)
    } else if (position.view === 'review') {
      this.showReview()
    } else {
      this.showOverview()
    }
  },

  revalidateCachedFiles(answers) {
    const result = { ...answers }
    const fileSystem = wx.getFileSystemManager && wx.getFileSystemManager()
    this.form.modules.forEach((module) => module.questions.forEach((question) => {
      if (question.type !== 'upload' || !Array.isArray(result[question.id])) return
      result[question.id] = result[question.id].map((file) => {
        let valid = Boolean(file.fileID || file.tempPath)
        if (valid && !file.fileID && fileSystem && fileSystem.accessSync) {
          try { fileSystem.accessSync(file.tempPath) } catch (error) { valid = false }
        }
        return { ...file, valid }
      })
    }))
    return result
  },

  saveDraft() {
    const position = {
      view: this.data.view,
      moduleIndex: this.data.currentModuleIndex,
      questionIndex: this.data.currentQuestionIndex,
    }
    try {
      wx.setStorageSync(this.storageKey, {
        answers: this.data.answers,
        position,
        updatedAt: Date.now(),
        submitted: this.data.submitted,
        templateSnapshot: this.form,
        spaceType: this.spaceType,
        versionId: this.form.versionId,
        requestId: this.requestId || '',
      })
      if (!this.data.submitted) wx.setStorageSync(this.activeDraftKey, this.storageKey)
    } catch (error) {
      wx.showToast({ title: '本机存储空间不足', icon: 'none' })
    }
  },

  restartForm() {
    try { wx.removeStorageSync(this.storageKey) } catch (error) {}
    this.setData({ answers: {}, submitted: false })
    this.showOverview()
  },

  deriveModuleCards() {
    return this.form.modules.map((module) => {
      const questions = getVisibleQuestions(module, this.data.answers)
      const answered = questions.some((question) => hasAnswer(this.data.answers[question.id]))
      const complete = questions
        .filter((question) => question.required)
        .every((question) => !validateQuestion(question, this.data.answers[question.id]))
      return {
        ...module,
        questionCount: module.questions.length,
        status: complete ? 'completed' : (answered ? 'in_progress' : 'not_started'),
        statusText: complete ? '已完成' : (answered ? '进行中' : '未开始'),
      }
    })
  },

  nextMotionClass() {
    this.motionSequence = (this.motionSequence || 0) + 1
    return this.motionSequence % 2 ? 'content-enter-a' : 'content-enter-b'
  },

  showOverview() {
    this.setData({ view: 'overview', moduleCards: this.deriveModuleCards(), scrollLocked: false, motionClass: this.nextMotionClass() })
    this.saveDraft()
  },

  showModule(moduleIndex) {
    const safeIndex = Math.max(0, Math.min(this.form.modules.length - 1, moduleIndex))
    const currentModule = this.form.modules[safeIndex]
    const visibleQuestions = getVisibleQuestions(currentModule, this.data.answers).map((question) => ({
      ...question,
      answered: hasAnswer(this.data.answers[question.id]),
    }))
    this.visibleQuestions = visibleQuestions
    this.setData({
      motionClass: this.nextMotionClass(),
      view: 'module',
      currentModule,
      currentModuleTagTitle: getModuleTagTitle(currentModule),
      currentModuleIndex: safeIndex,
      visibleQuestions,
      scrollLocked: false,
    })
    this.saveDraft()
  },

  showQuestion(moduleIndex, questionIndex) {
    const currentModule = this.form.modules[moduleIndex]
    const questions = getVisibleQuestions(currentModule, this.data.answers)
    if (!questions.length) {
      if (moduleIndex < this.form.modules.length - 1) this.showModule(moduleIndex + 1)
      else this.showReview()
      return
    }
    const safeIndex = Math.max(0, Math.min(questions.length - 1, questionIndex))
    const currentQuestion = questions[safeIndex]
    let currentAnswer = this.data.answers[currentQuestion.id]
    let answers = this.data.answers
    if (currentQuestion.type === 'ranking' && currentAnswer === undefined) {
      currentAnswer = currentQuestion.options.map((option) => option.id)
      answers = { ...this.data.answers, [currentQuestion.id]: currentAnswer }
    }
    this.visibleQuestions = questions
    this.setData({
      motionClass: this.nextMotionClass(),
      answers,
      view: 'question',
      currentModule,
      currentModuleTagTitle: getModuleTagTitle(currentModule),
      currentModuleIndex: moduleIndex,
      currentQuestion,
      currentQuestionIndex: safeIndex,
      visibleQuestionCount: questions.length,
      currentAnswer: currentAnswer === undefined ? null : currentAnswer,
      progressWidth: Math.round(((safeIndex + 1) / questions.length) * 100),
      scrollLocked: false,
    })
    this.saveDraft()
  },

  showReview() {
    const moduleCards = this.deriveModuleCards()
    this.setData({
      motionClass: this.nextMotionClass(),
      view: 'review',
      reviewModules: this.buildReviewModules(),
      moduleCards,
      allModulesComplete: moduleCards.every((module) => module.status === 'completed'),
      scrollLocked: false,
    })
    this.saveDraft()
  },

  buildReviewModules() {
    return this.form.modules.map((module) => {
      const parts = getVisibleQuestions(module, this.data.answers)
        .filter((question) => hasAnswer(this.data.answers[question.id]))
        .slice(0, 3)
        .map((question) => this.formatAnswer(question, this.data.answers[question.id]))
      return { ...module, summary: parts.join(' · ') || '尚未填写' }
    })
  },

  formatAnswer(question, answer) {
    if (question.type === 'upload') return `已选 ${answer.filter((file) => file.valid !== false).length} 个文件`
    if (question.type === 'number') return `${answer}${question.unit || ''}`
    if (question.type === 'location') return [answer.name, answer.address].filter(Boolean).join(' · ')
    if (question.type === 'single' || question.type === 'multiple') {
      const selected = choiceSelections(answer)
      const labels = new Map((question.options || []).map((option) => [option.id, option.label]))
      const summary = selected.map((id) => labels.get(id) || id).join('、')
      const otherText = isChoiceAnswer(answer) && typeof answer.otherText === 'string' ? answer.otherText.trim() : ''
      return otherText ? `${summary}：${otherText}` : summary
    }
    if (question.type === 'table') return `已填写 ${answer.length} 行`
    if (Array.isArray(answer)) {
      const labels = new Map((question.options || []).map((option) => [option.id, option.label]))
      return answer.map((id) => labels.get(id) || id).join('、')
    }
    const option = (question.options || []).find((item) => item.id === answer)
    return option ? option.label : String(answer)
  },

  onBack() {
    this.cancelAutoAdvance()
    const { view, currentModuleIndex } = this.data
    if (view === 'question') return this.showModule(currentModuleIndex)
    if (view === 'module' || view === 'review') return this.showOverview()
    if (getCurrentPages().length > 1) return wx.navigateBack()
    wx.switchTab({ url: '/pages/products/products' })
  },

  onOverviewPrimary() {
    const cards = this.deriveModuleCards()
    const index = cards.findIndex((item) => item.status !== 'completed')
    this.showModule(index < 0 ? 0 : index)
  },

  onModuleTap(event) {
    this.showModule(Number(event.currentTarget.dataset.index))
  },

  onQuestionTap(event) {
    this.showQuestion(this.data.currentModuleIndex, Number(event.currentTarget.dataset.index))
  },

  onModulePrimary() {
    const questions = getVisibleQuestions(this.data.currentModule, this.data.answers)
    let index = questions.findIndex((question) => validateQuestion(question, this.data.answers[question.id]))
    if (index < 0) index = 0
    this.showQuestion(this.data.currentModuleIndex, index)
  },

  onPreviousQuestion() {
    this.cancelAutoAdvance()
    if (this.data.currentQuestionIndex <= 0) this.showModule(this.data.currentModuleIndex)
    else this.showQuestion(this.data.currentModuleIndex, this.data.currentQuestionIndex - 1)
  },

  onNextQuestion() {
    this.cancelAutoAdvance()
    const { currentQuestion, currentAnswer, currentModuleIndex, currentQuestionIndex } = this.data
    const message = validateQuestion(currentQuestion, currentAnswer)
    if (message) {
      wx.showToast({ title: message, icon: 'none' })
      return
    }
    const questions = getVisibleQuestions(this.form.modules[currentModuleIndex], this.data.answers)
    if (currentQuestionIndex < questions.length - 1) {
      this.showQuestion(currentModuleIndex, currentQuestionIndex + 1)
    } else if (currentModuleIndex < this.form.modules.length - 1) {
      this.showModule(currentModuleIndex + 1)
    } else {
      this.showReview()
    }
  },

  cancelAutoAdvance() {
    if (!this.autoAdvanceTimer) return
    clearTimeout(this.autoAdvanceTimer)
    this.autoAdvanceTimer = null
  },

  scheduleAutoAdvance() {
    this.cancelAutoAdvance()
    const questionId = this.data.currentQuestion && this.data.currentQuestion.id
    this.autoAdvanceTimer = setTimeout(() => {
      this.autoAdvanceTimer = null
      const currentQuestion = this.data.currentQuestion
      if (this.data.view === 'question' && currentQuestion && currentQuestion.id === questionId) {
        this.onNextQuestion()
      }
    }, 120)
  },

  onAnswerChange(event) {
    const value = event.detail.value
    const confirmed = Boolean(event.detail.confirmed)
    const currentQuestion = this.data.currentQuestion
    const answers = { ...this.data.answers, [currentQuestion.id]: value }
    this.setData({ answers, currentAnswer: value, submitted: false })
    this.saveDraft()
    if (confirmed && AUTO_ADVANCE_TYPES.has(currentQuestion.type)) this.scheduleAutoAdvance()
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (location) => {
        const latitude = Number(location.latitude)
        const longitude = Number(location.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          wx.showToast({ title: '未能读取位置坐标', icon: 'none' })
          return
        }
        const locationValue = {
          name: location.name || '',
          address: location.address || '',
          latitude,
          longitude,
        }
        const currentQuestion = this.data.currentQuestion
        const value = currentQuestion && currentQuestion.type === 'location'
          ? locationValue
          : (locationValue.address || locationValue.name)
        if (value) this.onAnswerChange({ detail: { value, confirmed: false } })
      },
      fail: (error) => {
        const message = String((error && error.errMsg) || '')
        if (message.includes('cancel')) return
        wx.showModal({
          title: '无法获取位置',
          content: '请允许使用位置信息后重试。',
          confirmText: '去设置',
          success: ({ confirm }) => { if (confirm) wx.openSetting() },
        })
      },
    })
  },

  onChooseUpload() {
    const question = this.data.currentQuestion
    const existing = Array.isArray(this.data.currentAnswer) ? this.data.currentAnswer : []
    const maxFiles = (question.validation && question.validation.maxFiles) || 1
    const count = Math.max(0, maxFiles - existing.length)
    if (!count) {
      wx.showToast({ title: `最多选择 ${maxFiles} 个文件`, icon: 'none' })
      return
    }
    if (question.uploadType === 'image') {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: ({ tempFiles }) => this.appendFiles(tempFiles.map((file, index) => ({
          name: `项目图片 ${existing.length + index + 1}`,
          size: file.size,
          type: 'image',
          tempPath: file.tempFilePath,
          valid: true,
        }))),
      })
      return
    }
    wx.chooseMessageFile({
      count,
      type: 'file',
      success: ({ tempFiles }) => this.appendFiles(tempFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || 'file',
        tempPath: file.path,
        valid: true,
      }))),
    })
  },

  appendFiles(files) {
    const existing = Array.isArray(this.data.currentAnswer) ? this.data.currentAnswer : []
    this.onAnswerChange({ detail: { value: existing.concat(files) } })
  },

  onRemoveUpload(event) {
    const files = Array.isArray(this.data.currentAnswer) ? this.data.currentAnswer.slice() : []
    files.splice(event.detail.index, 1)
    this.onAnswerChange({ detail: { value: files } })
  },

  onPreviewUpload(event) {
    const files = Array.isArray(this.data.currentAnswer) ? this.data.currentAnswer : []
    const file = files[event.detail.index]
    if (!file || file.valid === false) return
    if (file.type === 'image') {
      wx.previewImage({ current: file.tempPath, urls: files.filter((item) => item.type === 'image' && item.valid !== false).map((item) => item.tempPath) })
    } else {
      wx.openDocument({ filePath: file.tempPath, showMenu: true, fail: () => wx.showToast({ title: '暂不支持预览该文件', icon: 'none' }) })
    }
  },

  onDragState(event) {
    this.setData({ scrollLocked: Boolean(event.detail.dragging) })
  },

  onEditModule(event) {
    this.showModule(Number(event.currentTarget.dataset.index))
  },

  createRequestId() {
    return `cfr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  },

  returnToTypeSelection() {
    const url = '/pages/flows/collection-type/collection-type'
    const pages = getCurrentPages()
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    const previousRoute = String(previousPage && previousPage.route || '').replace(/^\/+/, '')
    if (previousRoute === 'pages/flows/collection-type/collection-type') {
      wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url }) })
      return
    }
    wx.redirectTo({ url })
  },

  getVisibleUploadEntries() {
    const entries = []
    this.form.modules.forEach((module) => getVisibleQuestions(module, this.data.answers).forEach((question) => {
      if (question.type !== 'upload') return
      const files = Array.isArray(this.data.answers[question.id]) ? this.data.answers[question.id] : []
      files.forEach((file, fileIndex) => entries.push({ question, file, fileIndex }))
    }))
    return entries
  },

  async uploadPendingFiles() {
    const entries = this.getVisibleUploadEntries()
    const pending = entries.filter((entry) => !entry.file.fileID)
    if (!pending.length) return
    if (!wx.cloud || !wx.cloud.uploadFile) throw new Error('当前环境不支持云文件上传')
    for (let index = 0; index < pending.length; index += 1) {
      const { question, file, fileIndex } = pending[index]
      if (!file.tempPath || file.valid === false) throw new Error(`请重新选择文件：${file.name || '未命名文件'}`)
      const extension = String(file.name || file.tempPath).match(/\.[A-Za-z0-9]{1,8}$/)
      const safeExtension = extension ? extension[0].toLowerCase() : ''
      const uploadNonce = file.uploadNonce || Math.random().toString(36).slice(2, 12)
      const cloudPath = `collection-form-submissions/${this.spaceType}/${this.requestId}/${question.id}_${fileIndex}_${uploadNonce}${safeExtension}`
      const result = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempPath })
      if (!result || !result.fileID) throw new Error(`文件上传失败：${file.name || '未命名文件'}`)
      const files = this.data.answers[question.id].slice()
      files[fileIndex] = { ...files[fileIndex], uploadNonce, fileID: result.fileID, valid: true }
      const answers = { ...this.data.answers, [question.id]: files }
      const progress = Math.round(((index + 1) / pending.length) * 100)
      this.setData({ answers, uploadProgress: progress, submitButtonText: `上传中 ${progress}%` })
      this.saveDraft()
    }
  },

  async onConfirm() {
    if (this.data.submitting) return
    const incomplete = this.deriveModuleCards().findIndex((module) => module.status !== 'completed')
    if (incomplete >= 0) {
      wx.showToast({ title: `请先完成 ${this.form.modules[incomplete].code} 模块`, icon: 'none' })
      this.showModule(incomplete)
      return
    }
    this.requestId = this.requestId || (this.readDraft() && this.readDraft().requestId) || this.createRequestId()
    this.setData({ submitting: true, uploadProgress: 0, submitButtonText: '提交中' })
    this.saveDraft()
    try {
      await this.uploadPendingFiles()
      const call = await wx.cloud.callFunction({
        name: 'collection_form_public',
        data: {
          action: 'submit',
          requestId: this.requestId,
          spaceType: this.spaceType,
          versionId: this.form.versionId,
          answers: this.data.answers,
        },
      })
      const response = call && call.result
      if (!response || !response.success) throw new Error((response && response.errorMessage) || '提交失败，请稍后重试')
      this.setData({ submitted: true, submitting: false, uploadProgress: 100, submitButtonText: '已提交' })
      this.saveDraft()
      try {
        wx.removeStorageSync(this.activeDraftKey)
        wx.removeStorageSync(this.storageKey)
      } catch (error) {}
      wx.showToast({ title: response.data && response.data.duplicate ? '已提交，请勿重复操作' : '提交成功', icon: 'success' })
      this.returnToTypeSelection()
    } catch (error) {
      this.setData({ submitting: false, submitButtonText: '重试提交' })
      this.saveDraft()
      wx.showModal({ title: '提交未完成', content: error.message || '请检查网络后重试，填写内容和已上传文件均已保留。', showCancel: false })
    }
  },
})

module.exports = { hasAnswer, isVisible, getVisibleQuestions, validateQuestion, getModuleTagTitle }
