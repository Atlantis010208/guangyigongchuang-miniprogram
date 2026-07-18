const util = require('../../../utils/util')

const QUESTIONS = [
  {
    id: 'q01', no: '01', title: '你的年龄为',
    subtitle: '',
    type: 'choice', required: true,
    options: ['30岁以下', '30-40岁', '40-50岁', '50岁以上'],
  },
  {
    id: 'q02', no: '02', title: '长住人员结构、年龄及对应居住空间位置',
    subtitle: '如：夫妻二人，年龄50，主卧\n父母二人，年龄70，长辈房\n子女一人，年龄15，次卧',
    type: 'textarea', required: true,
  },
  {
    id: 'q03', no: '03', title: '整体装修预算',
    subtitle: '包含所有硬装、软装、家电',
    type: 'choice', required: true,
    options: ['20万以内', '30万以内', '40万以内', '50万以内', '80万以内', '100万以内', '其他'],
  },
  {
    id: 'q04', no: '04', title: '风格意向',
    subtitle: '',
    type: 'choice', required: true,
    options: ['意式极简', '现代极简', '原木风', '奶油风', '中古风', '宋式美学', '轻法式', '新中式', '轻奢风', '侘寂风', '美式风', '其他'],
  },
  {
    id: 'q05', no: '05', title: '装修类型',
    subtitle: '',
    type: 'choice', required: true,
    options: ['精装房', '毛坯房', '旧房改造'],
  },
  {
    id: 'q06', no: '06', title: '装修进度',
    subtitle: '现在的进度，如实填写即可，如果其他情况可选其他备注',
    type: 'choice', required: true,
    options: ['未开工', '走水电', '木工已完工', '油漆完工', '硬装已完工', '其他'],
  },
  {
    id: 'q07', no: '07', title: '平面布置',
    subtitle: '平面方案是否已经定稿？有调整需及时告知',
    type: 'choice', required: true,
    options: ['已确定', '还有局部要调整（请标注需要调整的位置）'],
  },
  {
    id: 'q08', no: '08', title: '套内面积',
    subtitle: '',
    type: 'input', required: true,
    inputLabel: '面积 (m²)',
    inputPlaceholder: '请输入数字',
  },
  {
    id: 'q09', no: '09', title: '色温特殊要求',
    subtitle: '对灯光颜色的个人特殊要求，没有可不填\n如：楼层统一种色温，不喜欢太黄、可接受混和色温（色差较小的特色）',
    type: 'textarea', required: false,
  },
  {
    id: 'q10', no: '10', title: '[多选] 空调类型',
    subtitle: '空调摆放位置是否确定，有调整在其他项备注。',
    type: 'multiChoice', required: true,
    options: ['中央空调', '风管机', '挂机', '柜机', '以图纸为准', '其他'],
  },
  {
    id: 'q11', no: '11', title: '兴趣爱好',
    subtitle: '是否有需要展示的兴趣爱好，请注明，如果没有可以忽略...',
    type: 'textarea', required: false,
  },
  {
    id: 'q12', no: '12', title: '[多选] 可接受的装饰灯',
    subtitle: '增加装饰性光源，可增加空间层次感及装饰感。',
    type: 'multiChoice', required: true,
    options: ['壁灯', '吊灯', '落地灯', '台灯', '其他'],
  },
  {
    id: 'q13', no: '13', title: '[多选] 柜体灯带',
    subtitle: '哪些柜体可以接受做灯带',
    type: 'multiChoice', required: true,
    options: ['橱柜', '储物柜', '餐边柜', '其他'],
  },
  {
    id: 'q14', no: '14', title: '晾衣架',
    subtitle: '晾衣架是否自带光源',
    type: 'choice', required: true,
    options: ['是', '否', '其他'],
  },
  {
    id: 'q15', no: '15', title: '吧台能否添加光源',
    subtitle: '',
    type: 'choice', required: true,
    options: ['可添加光源', '不添加光源'],
  },
  {
    id: 'q16', no: '16', title: '[多选] 有成品柜吗？',
    subtitle: '',
    type: 'multiChoice', required: false,
    options: ['没有', '其他'],
  },
  {
    id: 'q17', no: '17', title: '[多选] 卧室床头',
    subtitle: '床头柜照明位置偏向吊灯、台灯还是壁灯？',
    type: 'multiChoice', required: true,
    options: ['吊灯', '壁灯', '台灯', '无特殊喜好', '其他'],
  },
  {
    id: 'q18', no: '18', title: '睡前习惯',
    subtitle: '自己或配偶是否有床上阅读、玩手机的个人习惯等等？',
    type: 'choice', required: true,
    options: ['有，需要一定光源', '不需要', '其他'],
  },
  {
    id: 'q19', no: '19', title: '[多选] 浴霸',
    subtitle: '浴霸自带光源吗？',
    type: 'multiChoice', required: true,
    options: ['自带光源', '没有光源', '没有浴霸'],
  },
  {
    id: 'q20', no: '20', title: '[多选] 卫生间吊顶',
    subtitle: '卫生间吊顶是什么材料？',
    type: 'multiChoice', required: true,
    options: ['铝扣板', '石膏板', '蜂窝板', '其他'],
  },
  {
    id: 'q21', no: '21', title: '是否有宠物',
    subtitle: '',
    type: 'choice', required: true,
    options: ['有', '没有'],
  },
  {
    id: 'q22', no: '22', title: '起夜光源',
    subtitle: '是否需要预留起夜照明？',
    type: 'choice', required: true,
    options: ['需要', '不需要'],
  },
  {
    id: 'q23', no: '23', title: '[多选] 灯光优先级',
    subtitle: '灯光在你心里关注点，请在其他项填1234排序',
    type: 'multiChoice', required: true,
    options: ['1.想要空间很亮', '2.高级氛围感', '3.温馨的灯光', '4.不要太亮', '5.智能灯光', '6.护眼、减少视觉疲劳等功能性', '其他'],
  },
  {
    id: 'q24', no: '24', title: '特殊喜好品',
    subtitle: '若有喜欢的特定灯具、壁画、摆件需要考虑到灯光设计中，选其他备注',
    type: 'choice', required: true,
    options: ['没有', '其他'],
  },
  {
    id: 'q25', no: '25', title: '[多选] 不喜欢的灯',
    subtitle: '如果选项没有的，可以在其他项备注',
    type: 'multiChoice', required: true,
    options: ['吊灯', '壁灯', '射灯', '灯带', '台灯', '落地灯', '磁吸灯', '线性灯', '吸顶灯', '不清楚', '其他'],
  },
  {
    id: 'q26', no: '26', title: '[多选] 餐吊灯',
    subtitle: '餐桌可以接受使用吊灯吗？',
    type: 'multiChoice', required: true,
    options: ['接受', '不接受', '其他'],
  },
  {
    id: 'q27', no: '27', title: '是否做智能家居',
    subtitle: '',
    type: 'choice', required: true,
    options: ['确定做', '确定不做', '还没考虑好', '其他'],
  },
  {
    id: 'q28', no: '28', title: '智能品牌',
    subtitle: '准备或者计划使用哪个智能品牌？',
    type: 'input', required: false,
    inputLabel: '品牌名称',
    inputPlaceholder: '请输入',
  },
  {
    id: 'q29', no: '29', title: '智能灯光倾向',
    subtitle: '',
    type: 'choice', required: false,
    options: ['做单色不调光', '全屋调光调色', '部分空间调光调色', '其他'],
  },
  {
    id: 'q30', no: '30', title: '[多选] 天花调整',
    subtitle: '我们是否可以调整天花？局部改请在其他项中填写天花可调整的位置\n如：客厅、主卧、厨房等空间',
    type: 'multiChoice', required: true,
    options: ['可以改', '局部改', '不可以改', '其他'],
  },
  {
    id: 'q31', no: '31', title: '其他个人需求补充',
    subtitle: '如果有个人比较特殊的需求，上述收集表没能体现的，可以在这里详细表述给我们。',
    type: 'textarea', required: false,
  },
]

Page({
  data: {
    steps: QUESTIONS,
    currentStep: 0,
    isNextValid: false,
    answers: {},      // { q01: '30岁以下', q08: '120', ... }
    multiAnswers: {}, // { q10: ['中央空调', '挂机'], ... }
    otherInputs: {},  // { q03: '150万', ... }
    keyboardHeight: 0,
    inputFocus: false,
    submitting: false,
    submitted: false,
  },

  onLoad() {
    this.checkNextValid()
  },

  // ========== 键盘高度监听 ==========
  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 })
  },

  // ========== 校验当前步是否可进行下一步 ==========
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

  // ========== 单选 ==========
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

  // ========== 多选 ==========
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

  // ========== 文字输入（input / textarea）==========
  handleTextInput(e) {
    const { id } = e.currentTarget.dataset
    const answers = Object.assign({}, this.data.answers, { [id]: e.detail.value })
    this.setData({ answers }, () => {
      this.checkNextValid()
    })
  },

  // ========== "其他"选项输入 ==========
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

  // ========== 切换步骤副作用 ==========
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

  // ========== 上一步 / 下一步 ==========
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

  // ========== 感谢页返回 ==========
  onBackHome() {
    wx.switchTab({ url: '/pages/products/products' })
  },

  // ========== 提交 ==========
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
              url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/flows/collection/collection')
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
      await db.collection('lighting_collections').add({
        data: {
          params,
          userId,
          status: 'submitted',
          createdAt: Date.now(),
        }
      })
    } catch (err) {
      console.error('提交收集表失败', err)
    }

    wx.hideLoading()
    this._submitting = false
    this.setData({ submitting: false, submitted: true })
  },
})
