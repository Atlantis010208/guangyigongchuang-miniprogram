const { getFormTemplate } = require('./form-template')

const SPACE_TYPES = ['residential', 'wellness', 'office', 'fitness']

function hasAnswer(answer) {
  if (Array.isArray(answer)) return answer.length > 0
  if (typeof answer === 'string') return answer.trim().length > 0
  return answer !== undefined && answer !== null
}

function isVisible(question, answers) {
  const condition = question.visibleWhen
  if (!condition) return true
  const source = answers[condition.questionId]
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
  if (question.type === 'single' && !optionIds.includes(answer)) return '选项已失效，请重新选择'
  if (question.type === 'multiple') {
    if (!Array.isArray(answer)) return '选项已失效，请重新选择'
    const uniqueIds = new Set(answer)
    if (uniqueIds.size !== answer.length || answer.some((id) => !optionIds.includes(id))) {
      return '选项已失效，请重新选择'
    }
  }

  if (question.type === 'multiple') {
    if (rules.minSelections && answer.length < rules.minSelections) return `请至少选择 ${rules.minSelections} 项`
    if (rules.maxSelections && answer.length > rules.maxSelections) return `最多选择 ${rules.maxSelections} 项`
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
  },

  onLoad(options) {
    const requestedType = options.spaceType || 'residential'
    const spaceType = SPACE_TYPES.includes(requestedType) ? requestedType : 'residential'
    const form = getFormTemplate(spaceType)
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const navigationBarHeight = Math.max(44, (menuButton.top - statusBarHeight) * 2 + menuButton.height)

    this.form = form
    this.storageKey = `collection_form_draft:${form.id}:${form.version}:${spaceType}`
    this.setData({ form, statusBarHeight, navigationBarHeight })

    const draft = this.readDraft()
    if (draft && draft.answers && Object.keys(draft.answers).length) {
      wx.showModal({
        title: '发现未完成的填写',
        content: '是否继续上次的填写进度？',
        confirmText: '继续填写',
        cancelText: '重新填写',
        success: ({ confirm }) => {
          if (confirm) this.restoreDraft(draft)
          else this.restartForm()
        },
      })
      return
    }
    this.showOverview()
  },

  readDraft() {
    try {
      return wx.getStorageSync(this.storageKey) || null
    } catch (error) {
      return null
    }
  },

  restoreDraft(draft) {
    const answers = this.revalidateCachedFiles(draft.answers || {})
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
        let valid = Boolean(file.tempPath)
        if (valid && fileSystem && fileSystem.accessSync) {
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
      })
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

  showOverview() {
    this.setData({ view: 'overview', moduleCards: this.deriveModuleCards(), scrollLocked: false })
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
      view: 'module',
      currentModule,
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
      answers,
      view: 'question',
      currentModule,
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
    if (Array.isArray(answer)) {
      const labels = new Map((question.options || []).map((option) => [option.id, option.label]))
      return answer.map((id) => labels.get(id) || id).join('、')
    }
    const option = (question.options || []).find((item) => item.id === answer)
    return option ? option.label : String(answer)
  },

  onBack() {
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
    if (this.data.currentQuestionIndex <= 0) this.showModule(this.data.currentModuleIndex)
    else this.showQuestion(this.data.currentModuleIndex, this.data.currentQuestionIndex - 1)
  },

  onNextQuestion() {
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

  onAnswerChange(event) {
    const value = event.detail.value
    const answers = { ...this.data.answers, [this.data.currentQuestion.id]: value }
    this.setData({ answers, currentAnswer: value, submitted: false })
    this.saveDraft()
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (location) => {
        const value = location.address || location.name
        if (value) this.onAnswerChange({ detail: { value } })
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

  onConfirm() {
    const incomplete = this.deriveModuleCards().findIndex((module) => module.status !== 'completed')
    if (incomplete >= 0) {
      wx.showToast({ title: `请先完成 ${this.form.modules[incomplete].code} 模块`, icon: 'none' })
      this.showModule(incomplete)
      return
    }
    this.setData({ submitted: true })
    this.saveDraft()
    wx.showToast({ title: '演示提交成功', icon: 'success' })
  },
})

module.exports = { hasAnswer, isVisible, getVisibleQuestions, validateQuestion }
