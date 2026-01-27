// const api = require('../../../utils/api')
// const util = require('../../../utils/util')

Page({
  data: {
    isCopied: false,
    link: 'https://xakrvq3l0nw.feishu.cn/docx/KIVgdUR1XoFUHSxy4qPcRDjGnqb' // 默认 Apple Store 链接
  },
  
  onLoad() {
    wx.setNavigationBarTitle({
      title: '前往浏览器继续访问'
    })
  },

  copyLink() {
    wx.setClipboardData({
      data: this.data.link,
      success: () => {
        wx.showToast({ title: '', duration: 0, icon: 'none' });
        wx.hideLoading();
        this.setData({ isCopied: true });
      }
    });
  }
})

/*
Page({
  data:{
    // 表单字段
    budget:'',
    stageOptions:['未开工','走水电','木工已完工','油漆完工','硬装已完工'],
    stageIdx:0,
    // 吊顶下吊：先选是否下吊，再选具体厘米数
    dropOptions:['明装','嵌入式'],
    dropIdx:0,
    dropDisplay:'明装',
    bodyHeightOptions:['薄型 ≤40mm','常规 40-60mm','厚型 ≥60mm'],
    bodyHeightIdx:1,
    trimlessOptions:['常规带边','预埋','弧形'],
    trimlessIdx:0,
    spotPriceOptions:['70-100（国产优质光源）','100-160（进口品牌光源）','160-300（品牌高端款）'],
    spotPriceIdx:0,
    note:'',
    submitting:false,
    // 级联选择配置
    formFieldOrder: ['budget', 'stage', 'drop', 'bodyHeight', 'trimless', 'spotPrice']
  },

  // ========== 级联选择核心方法 ==========
  triggerNextField(currentField) {
    const order = this.data.formFieldOrder
    const currentIndex = order.indexOf(currentField)
    if (currentIndex === -1 || currentIndex >= order.length - 1) return
    
    const nextField = order[currentIndex + 1]
    
    setTimeout(() => {
      this.openFieldSelector(nextField)
    }, 350)
  },
  
  openFieldSelector(field) {
    const fieldMap = {
      'budget': () => {}, // 预算是输入框，不需要弹窗
      'stage': () => this.onTapStage(true),
      'drop': () => this.onTapDrop(true),
      'bodyHeight': () => this.onTapBodyHeight(true),
      'trimless': () => this.onTapTrimless(true),
      'spotPrice': () => this.onTapSpotPrice(true)
    }
    if (fieldMap[field]) {
      fieldMap[field]()
    }
  },

  // 交互
  onBudgetInput(e){ 
    this.setData({ budget:e.detail.value })
  },
  onBudgetBlur(e){
    // 预算输入完成后触发下一项
    if(this.data.budget){
      this.triggerNextField('budget')
    }
  },
  onStageChange(e){ this.setData({ stageIdx: Number(e.detail.value) }) },
  onDropChange(e){ this.setData({ dropIdx: Number(e.detail.value) }) },
  onBodyHeightChange(e){ this.setData({ bodyHeightIdx: Number(e.detail.value) }) },
  onTrimlessChange(e){ this.setData({ trimlessIdx: Number(e.detail.value) }) },
  onSpotPriceChange(e){ this.setData({ spotPriceIdx: Number(e.detail.value) }) },
  onNote(e){ this.setData({ note:e.detail.value }) },

  // 弹窗选择（支持级联）
  onTapStage(isAutoTrigger){
    const { stageOptions } = this.data
    wx.showActionSheet({
      itemList: stageOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ stageIdx: res.tapIndex }, () => {
            this.triggerNextField('stage')
          })
        }
      }
    })
  },
  onTapDrop(isAutoTrigger){
    const { dropOptions, dropCmOptions } = this.data
    wx.showActionSheet({
      itemList: dropOptions,
      success: (res) => {
        if(typeof res.tapIndex !== 'number') return
        // 不下吊
        if(res.tapIndex === 0){
          this.setData({ dropIdx: 0, dropDisplay: '不下吊' }, () => {
            this.triggerNextField('drop')
          })
          return
        }
        // 选择具体下吊厘米数
        wx.showActionSheet({
          itemList: dropCmOptions.map(cm => `下吊了${cm}cm`),
          success: (cmRes) => {
            if(typeof cmRes.tapIndex !== 'number') return
            const cmIdx = cmRes.tapIndex
            const cmVal = dropCmOptions[cmIdx]
            this.setData({
              dropIdx: 1,
              dropCmIdx: cmIdx,
              dropDisplay: `下吊了${cmVal}cm`
            }, () => {
              this.triggerNextField('drop')
            })
          }
        })
      }
    })
  },
  onTapBodyHeight(isAutoTrigger){
    const { bodyHeightOptions } = this.data
    wx.showActionSheet({
      itemList: bodyHeightOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ bodyHeightIdx: res.tapIndex }, () => {
            this.triggerNextField('bodyHeight')
          })
        }
      }
    })
  },
  onTapTrimless(isAutoTrigger){
    const { trimlessOptions } = this.data
    wx.showActionSheet({
      itemList: trimlessOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ trimlessIdx: res.tapIndex }, () => {
            this.triggerNextField('trimless')
          })
        }
      }
    })
  },
  onTapSpotPrice(isAutoTrigger){
    const { spotPriceOptions } = this.data
    wx.showActionSheet({
      itemList: spotPriceOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ spotPriceIdx: res.tapIndex })
          // 最后一项，不再触发下一个
        }
      }
    })
  },

  async onSubmitSelection(){
    // 登录检查：未登录时跳转登录页
    const app = getApp()
    if (!app.requireLogin(true, '/pages/flows/selection/selection')) {
      return // 未登录，阻止提交并跳转登录页
    }
    if (this.data.submitting || this._submitting) return
    
    // 🔥 查询云端押金状态，用于优先服务标记
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

    if(!this.data.budget){ wx.showToast({ title:'请填写预算', icon:'none' }); return }
    this._submitting = true
    this.setData({ submitting: true })
    const req = {
      id: Date.now().toString(),
      space: '灯具清单选型',
      budget: this.data.budget,
      stage: this.data.stageOptions[this.data.stageIdx],
      ceilingDrop: this.data.dropDisplay,
      bodyHeight: this.data.bodyHeightOptions[this.data.bodyHeightIdx],
      trimless: this.data.trimlessOptions[this.data.trimlessIdx],
      spotPrice: this.data.spotPriceOptions[this.data.spotPriceIdx],
      note: this.data.note,
      createdAt: new Date().toISOString(),
      source: 'selection',
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
    wx.switchTab({ url:'/pages/cart/cart' })
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        const params = { budget:this.data.budget, stage:this.data.stageOptions[this.data.stageIdx], ceilingDrop:this.data.dropDisplay, bodyHeight:this.data.bodyHeightOptions[this.data.bodyHeightIdx], trimless:this.data.trimlessOptions[this.data.trimlessIdx], spotPrice:this.data.spotPriceOptions[this.data.spotPriceIdx], note:this.data.note }
        // 🔥 添加 priority 参数
        util.callCf('requests_create', { request: { orderNo: req.id, category: 'selection', params, userId, status: 'submitted', priority: depositPaid } })
          .catch(err => {
            const msg = (err && (err.message || err.errMsg)) || ''
            if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
              if (wx.cloud && wx.cloud.callFunction) {
                wx.cloud.callFunction({ name: 'initCollections' }).then(() => {
                  util.callCf('requests_create', { request: { orderNo: req.id, category: 'selection', params, userId, status: 'submitted', priority: depositPaid } }).catch(()=>{})
                }).catch(()=>{})
              }
            }
          })
        // 🔥 添加 priority 参数
        util.callCf('orders_create', { order: { type:'products', orderNo: req.id, category:'selection', params, status:'submitted', paid:false, userId, priority: depositPaid } })
          .catch(()=>{})
      }
    }catch(err){}
    this._submitting = false
    this.setData({ submitting:false })
  }
})
*/