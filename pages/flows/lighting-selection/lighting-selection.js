const util = require('../../../utils/util')

const QUESTIONS = [
  {
    id: 'q01', no: '01', title: '预算范围',
    subtitle: '1、预算为单色灯具，智能灯具会贵30-50%左右，不同智能间会有所差异\n2、以套内面积预估（如：你家100m²，选小众品牌总价是¥5000-8000元左右，以此类推）',
    type: 'choice', required: true,
    options: ['专业照明 小众品牌 ¥50-80/m²', '专业照明 国内大牌 ¥100-180/m²', '专业照明 国际大牌 ¥200-400/m²', '其他'],
  },
  {
    id: 'q02', no: '02', title: '有品牌特定的品牌吗？',
    subtitle: '',
    type: 'multiChoice', required: true,
    options: ['无特定品牌', '专业大牌-西顿照明', '专业大牌-企一照明', '专业小众-艾客照明', '专业小众-唯宝彩佳', '商照小众-哲成照明', '商照小众-欧铁照明', '其他'],
  },
  {
    id: 'q03', no: '03', title: '吊顶下掉高度',
    subtitle: '影响灯体高度，如果不知道或其他高度选"其他"',
    type: 'choice', required: true,
    options: ['下掉10cm以内', '下掉10-15cm左右', '下掉大于15cm', '其他'],
  },
  {
    id: 'q04', no: '04', title: '智能家居生态',
    subtitle: '还没考虑好，或暂不清楚填"待定"即可',
    type: 'choice', required: true,
    options: ['非智能', '华为智能', '米家智能', '有线智能', '绿米aqara', '待定', '其他'],
  },
]

Page({
  data: {
    steps: QUESTIONS,
    currentStep: 0,
    isNextValid: false,
    answers: {},
    multiAnswers: {},
    otherInputs: {},
    keyboardHeight: 0,
    inputFocus: false,
    submitting: false,
    submitted: false,
  },

  onLoad() {
    this.checkNextValid()
  },

  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 })
  },

  checkNextValid() {
    const step = this.data.steps[this.data.currentStep]
    let valid = false

    if (!step.required) {
      valid = true
    } else if (step.type === 'choice') {
      const val = this.data.answers[step.id]
      if (val === '其他') {
        valid = !!(this.data.otherInputs[step.id] && this.data.otherInputs[step.id].trim())
      } else {
        valid = !!val
      }
    } else if (step.type === 'multiChoice') {
      const arr = this.data.multiAnswers[step.id] || []
      if (arr.length === 0) {
        valid = false
      } else if (arr.indexOf('其他') !== -1) {
        valid = !!(this.data.otherInputs[step.id] && this.data.otherInputs[step.id].trim())
      } else {
        valid = true
      }
    } else if (step.type === 'input') {
      valid = !!(this.data.answers[step.id] && String(this.data.answers[step.id]).trim())
    } else if (step.type === 'textarea') {
      valid = !!(this.data.answers[step.id] && String(this.data.answers[step.id]).trim())
    }

    this.setData({ isNextValid: valid })
  },

  handleOptionSelect(e) {
    const { id, option } = e.currentTarget.dataset
    const answers = Object.assign({}, this.data.answers, { [id]: option })
    this.setData({ answers }, () => {
      this.checkNextValid()
      if (option !== '其他' && this.data.currentStep < this.data.steps.length - 1) {
        if (this._nextTimer) clearTimeout(this._nextTimer)
        this._nextTimer = setTimeout(() => this.handleNext(), 300)
      }
    })
  },

  handleMultiSelect(e) {
    const { id, option } = e.currentTarget.dataset
    const multiAnswers = Object.assign({}, this.data.multiAnswers)
    const arr = (multiAnswers[id] || []).slice()
    const idx = arr.indexOf(option)
    if (idx === -1) {
      arr.push(option)
    } else {
      arr.splice(idx, 1)
    }
    multiAnswers[id] = arr
    this.setData({ multiAnswers }, () => {
      this.checkNextValid()
    })
  },

  handleTextInput(e) {
    const { id } = e.currentTarget.dataset
    const answers = Object.assign({}, this.data.answers, { [id]: e.detail.value })
    this.setData({ answers }, () => {
      this.checkNextValid()
    })
  },

  handleOtherInput(e) {
    const { id } = e.currentTarget.dataset
    const otherInputs = Object.assign({}, this.data.otherInputs, { [id]: e.detail.value })
    this.setData({ otherInputs }, () => {
      this.checkNextValid()
    })
  },

  handleOtherBlur() {
    this.setData({ keyboardHeight: 0 })
  },

  handleInputBlur() {
    this.setData({ keyboardHeight: 0, inputFocus: false })
  },

  _applyStepSideEffects() {
    const step = this.data.steps[this.data.currentStep]
    if (step && (step.type === 'input' || step.type === 'textarea')) {
      this.setData({ inputFocus: false }, () => {
        setTimeout(() => this.setData({ inputFocus: true }), 50)
      })
    } else {
      this.setData({ inputFocus: false })
    }
  },

  handlePrev() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 }, () => {
        this.checkNextValid()
        this._applyStepSideEffects()
      })
    }
  },

  handleNext() {
    if (!this.data.isNextValid) return
    const now = Date.now()
    if (this._lastNextTime && now - this._lastNextTime < 400) return
    this._lastNextTime = now
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 }, () => {
        this.checkNextValid()
        this._applyStepSideEffects()
      })
    }
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/products/products' })
  },

  onSubmit() {
    if (this.data.submitting || this._submitting) return

    const app = getApp()
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '提交收集表需要登录，是否前往登录？',
        confirmText: '去登录',
        cancelText: '暂不提交',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/flows/lighting-selection/lighting-selection')
            })
          }
        }
      })
      return
    }

    this._doSubmit()
  },

  async _doSubmit() {
    this._submitting = true
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    const params = {}
    for (let i = 0; i < this.data.steps.length; i++) {
      const step = this.data.steps[i]
      if (step.type === 'multiChoice') {
        params[step.id] = this.data.multiAnswers[step.id] || []
      } else {
        params[step.id] = this.data.answers[step.id] || ''
      }
      if (this.data.otherInputs[step.id]) {
        params[step.id + 'Other'] = this.data.otherInputs[step.id]
      }
    }

    const userDoc = wx.getStorageSync('userDoc') || {}
    const userId = (userDoc && userDoc._id) ? userDoc._id : null

    try {
      const db = wx.cloud.database()
      await db.collection('lighting_selections').add({
        data: {
          params,
          userId,
          status: 'submitted',
          createdAt: Date.now(),
        }
      })
    } catch (err) {
      console.error('提交灯具选型收集表失败', err)
    }

    wx.hideLoading()
    this._submitting = false
    this.setData({ submitting: false, submitted: true })
  },
})
