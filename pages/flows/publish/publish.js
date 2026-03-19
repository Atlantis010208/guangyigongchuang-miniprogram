const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    // 表单字段
    space:'', spaceOther:'',
    service:'',
    budget:'', budgetOther:'',
    area:'',
    stage:'',
    share:'愿意',
    coCreate:'愿意',
    submitting:false,
    
    // 分步表单状态
    keyboardHeight: 0,
    currentStep: 0,
    isNextValid: false,
    steps: [
      {
        id: 'space',
        title: '01 空间类型',
        subtitle: '',
        type: 'choice',
        options: ['住宅', '商铺', '办公室', '其他'],
      },
      {
        id: 'service',
        title: '02 需要什么服务？',
        subtitle: '根据个人需求选择',
        type: 'choice',
        options: ['选灯配灯服务', '只深化灯光施工图', '整套灯光设计'],
      },
      {
        id: 'budget',
        title: '03 设计预算',
        subtitle: '整套灯光根据你的预算匹配对应的设计师，最低价格不低于9元/平，预算越高将匹配到更有经验的共创设计师',
        type: 'choice',
        options: ['¥5/m²（只针对选灯配灯）', '¥9/m²', '¥16/m²', '¥19/m²', '¥29/m²', '¥39/m²', '¥50/m²及以上', '其他'],
      },
      {
        id: 'area',
        title: '04 设计面积',
        subtitle: '根据你家大概面积进行填写，只填写需要设计的面积。面积低于50平按50平收费！',
        type: 'input',
        inputLabel: '面积(m²)',
        inputPlaceholder: '请输入数字',
      },
      {
        id: 'stage',
        title: '05 项目进度',
        subtitle: '',
        type: 'choice',
        options: ['未开始', '正在设计', '装修中', '已完成装修'],
      },
      {
        id: 'share',
        title: '06 愿意分享你家的装修故事换取折扣吗？',
        subtitle: '',
        type: 'choice',
        options: ['愿意', '不愿意'],
      },
      {
        id: 'coCreate',
        title: '07 愿意跟设计师共创你的设计吗？',
        subtitle: '',
        type: 'choice',
        options: ['愿意', '不愿意'],
      }
    ]
  },

  onLoad(){
    // 读取首页测算预填
    const prefill = wx.getStorageSync('publish_prefill')
    if (prefill){
      const data = {}
      if (prefill.space) data.space = prefill.space
      if (prefill.service) data.service = prefill.service
      if (prefill.budget) data.budget = prefill.budget
      if (prefill.area) data.area = prefill.area
      this.setData(data)
      wx.removeStorageSync('publish_prefill')
    }
    this.checkNextValid()
  },

  // ========== 键盘高度监听 ==========
  onKeyboardHeightChange(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 })
  },

  // ========== 分步交互逻辑 ==========
  checkNextValid() {
    const step = this.data.steps[this.data.currentStep]
    let valid = false
    if (step.type === 'choice') {
      const val = this.data[step.id]
      if (val) {
        if (val === '其他') {
          valid = !!(this.data[step.id + 'Other'] && this.data[step.id + 'Other'].trim())
        } else {
          valid = true
        }
      }
    } else if (step.type === 'input') {
      valid = !!(this.data[step.id] && String(this.data[step.id]).trim())
    }
    this.setData({ isNextValid: valid })
  },

  handleOptionSelect(e) {
    const { id, option } = e.currentTarget.dataset
    this.setData({ [id]: option }, () => {
      this.checkNextValid()
      
      // 如果不是选择了"其他"，且不是最后一题，直接自动下一步
      if (option !== '其他' && this.data.currentStep < this.data.steps.length - 1) {
        if (this._nextTimer) clearTimeout(this._nextTimer)
        this._nextTimer = setTimeout(() => {
          this.handleNext()
        }, 300)
      }
    })
  },

  handleOtherInput(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [id + 'Other']: e.detail.value }, () => {
      this.checkNextValid()
    })
  },

  handleOtherConfirm(e) {
    this.setData({ keyboardHeight: 0 })
    if (this.data.isNextValid) {
      this.handleNext()
    }
  },

  handleNumberInput(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ [id]: e.detail.value }, () => {
      this.checkNextValid()
    })
  },

  handleNumberConfirm(e) {
    this.setData({ keyboardHeight: 0 })
    if (this.data.isNextValid) {
      this.handleNext()
    }
  },

  handlePrev() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 }, () => {
        this.checkNextValid()
      })
    }
  },

  handleNext() {
    if (!this.data.isNextValid) return
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 }, () => {
        this.checkNextValid()
      })
    }
  },

  async onSubmit(){
    if (this.data.submitting || this._submitting) return
    
    // 检查登录状态 - 提交需求需要登录
    const app = getApp()
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '提交照明需求需要登录，是否前往登录？',
        confirmText: '去登录',
        cancelText: '暂不提交',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/flows/publish/publish')
            })
          }
        }
      })
      return
    }
    
    // 查询云端押金状态，用于优先服务标记
    let depositPaid = false
    try {
      const depositRes = await wx.cloud.callFunction({ name: 'deposit_query' })
      if (depositRes.result && depositRes.result.code === 0) {
        depositPaid = depositRes.result.data.hasPaid === true
      }
      console.log('押金状态:', depositPaid ? '已缴纳' : '未缴纳')
    } catch (err) {
      console.warn('查询押金状态失败，使用默认值:', err)
    }
    
    const userDoc = wx.getStorageSync('userDoc') || {}
    const userIdLocal = (userDoc && userDoc._id) ? userDoc._id : null

    const space = this.data.space==='其他' ? (this.data.spaceOther||'其他') : this.data.space
    const budget = this.data.budget==='其他' ? (this.data.budgetOther||'其他') : this.data.budget
    if(!space){ wx.showToast({ title:'请选择空间类型', icon:'none' }); return }
    if(!this.data.service){ wx.showToast({ title:'请选择服务类型', icon:'none' }); return }
    if(!budget){ wx.showToast({ title:'请选择预算', icon:'none' }); return }
    if(!this.data.area){ wx.showToast({ title:'请输入设计面积', icon:'none' }); return }
    if(!this.data.stage){ wx.showToast({ title:'请选择项目进度', icon:'none' }); return }

    const id = Date.now().toString()
    this._submitting = true
    this.setData({ submitting: true })
    const req = {
      id,
      space,
      service: this.data.service,
      budget,
      area: this.data.area,
      stage: this.data.stage,
      share: this.data.share,
      coCreate: this.data.coCreate,
      createdAt: new Date().toISOString(),
      source: 'publish',
      priority: depositPaid,
      status: 'submitted',
      userId: userIdLocal,
      steps: [
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false },
        { key:'design', label:'设计中', done:false },
        { key:'done', label:'已完成', done:false }
      ]
    }
    wx.showToast({ title:'已提交', icon:'success' })
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        const params = { space, service: this.data.service, budget, area: this.data.area, stage: this.data.stage, coCreate: this.data.coCreate, share: this.data.share }
        try{
          const r1 = await util.callCf('requests_create', { request: { orderNo: id, category: 'publish', params, userId, status: 'submitted', priority: depositPaid } })
          if (!r1 || !r1.success) throw new Error((r1 && r1.errorMessage) || 'requests_create failed')
        }catch(err){
          const msg = (err && (err.message || err.errMsg)) || ''
          if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
            if (wx.cloud && wx.cloud.callFunction) {
              await wx.cloud.callFunction({ name: 'initCollections' }).catch(()=>{})
              await util.callCf('requests_create', { request: { orderNo: id, category: 'publish', params, userId, status: 'submitted', priority: depositPaid } }).catch(()=>{})
            }
          }
        }
        util.callCf('orders_create', { order: { type: 'products', orderNo: id, category: 'publish', params, status: 'submitted', paid: false, userId, priority: depositPaid } }).catch(()=>{})
      }
    }catch(err){}
    setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }); this._submitting = false; this.setData({ submitting:false }) }, 400)
  }
})
