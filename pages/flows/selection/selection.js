const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    // 表单字段
    budget:'',
    stageOptions:['未开工','走水电','木工已完工','油漆完工','硬装已完工'],
    stageIdx:0,
    // 吊顶下吊：先选是否下吊，再选具体厘米数
    dropOptions:['不下吊','有下吊'],
    dropIdx:0,
    dropCmOptions:['5','8','10','12','15','20'],
    dropCmIdx:0,
    dropDisplay:'不下吊',
    bodyHeightOptions:['薄型 ≤40mm','常规 40-60mm','厚型 ≥60mm'],
    bodyHeightIdx:1,
    trimlessOptions:['未做','计划做','已做'],
    trimlessIdx:0,
    spotPriceOptions:['70-100（国产优质光源）','100-160（进口品牌光源）','160-300（品牌高端款）'],
    spotPriceIdx:0,
    note:'',
    submitting:false
  },

  // 交互
  onBudgetInput(e){ this.setData({ budget:e.detail.value }) },
  onStageChange(e){ this.setData({ stageIdx: Number(e.detail.value) }) },
  onDropChange(e){ this.setData({ dropIdx: Number(e.detail.value) }) },
  onBodyHeightChange(e){ this.setData({ bodyHeightIdx: Number(e.detail.value) }) },
  onTrimlessChange(e){ this.setData({ trimlessIdx: Number(e.detail.value) }) },
  onSpotPriceChange(e){ this.setData({ spotPriceIdx: Number(e.detail.value) }) },
  onNote(e){ this.setData({ note:e.detail.value }) },

  // 弹窗选择
  onTapStage(){
    const { stageOptions } = this.data
    wx.showActionSheet({
      itemList: stageOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ stageIdx: res.tapIndex })
        }
      }
    })
  },
  onTapDrop(){
    const { dropOptions, dropCmOptions } = this.data
    wx.showActionSheet({
      itemList: dropOptions,
      success: (res) => {
        if(typeof res.tapIndex !== 'number') return
        // 不下吊
        if(res.tapIndex === 0){
          this.setData({ dropIdx: 0, dropDisplay: '不下吊' })
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
            })
          }
        })
      }
    })
  },
  onTapBodyHeight(){
    const { bodyHeightOptions } = this.data
    wx.showActionSheet({
      itemList: bodyHeightOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ bodyHeightIdx: res.tapIndex })
        }
      }
    })
  },
  onTapTrimless(){
    const { trimlessOptions } = this.data
    wx.showActionSheet({
      itemList: trimlessOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ trimlessIdx: res.tapIndex })
        }
      }
    })
  },
  onTapSpotPrice(){
    const { spotPriceOptions } = this.data
    wx.showActionSheet({
      itemList: spotPriceOptions,
      success: (res) => {
        if(typeof res.tapIndex === 'number'){
          this.setData({ spotPriceIdx: res.tapIndex })
        }
      }
    })
  },

  onSubmitSelection(){
    if (this.data.submitting || this._submitting) return
    const depositPaid = !!wx.getStorageSync('deposit_paid')
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
        util.callCf('requests_create', { request: { orderNo: req.id, category: 'selection', params, userId, status: 'submitted' } })
          .catch(err => {
            const msg = (err && (err.message || err.errMsg)) || ''
            if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
              if (wx.cloud && wx.cloud.callFunction) {
                wx.cloud.callFunction({ name: 'initCollections' }).then(() => {
                  util.callCf('requests_create', { request: { orderNo: req.id, category: 'selection', params, userId, status: 'submitted' } }).catch(()=>{})
                }).catch(()=>{})
              }
            }
          })
        util.callCf('orders_create', { order: { type:'products', orderNo: req.id, category:'selection', params, status:'submitted', paid:false, userId } })
          .catch(()=>{})
      }
    }catch(err){}
    this._submitting = false
    this.setData({ submitting:false })
  }
})
