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
  },

  // 交互事件
  onSpaceChange(e){ this.setData({ space:e.detail.value }) },
  onSpaceOther(e){ this.setData({ spaceOther:e.detail.value }) },
  onServiceChange(e){ this.setData({ service:e.detail.value }) },
  onBudgetChange(e){ this.setData({ budget:e.detail.value }) },
  onBudgetOther(e){ this.setData({ budgetOther:e.detail.value }) },
  onArea(e){ this.setData({ area:e.detail.value }) },
  onStageChange(e){ this.setData({ stage:e.detail.value }) },
  onShareChange(e){ this.setData({ share:e.detail.value }) },
  onCoCreateChange(e){ this.setData({ coCreate:e.detail.value }) },

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
