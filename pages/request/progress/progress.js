Page({
  data:{ req:{}, beijingTime:'', isDesigner:false, userConfirmed:false, designerConfirmed:false },
  onLoad(options){
    this.id = options.id
    this.eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    const isDesigner = !!wx.getStorageSync('designer_authed')
    this.setData({ isDesigner })
    this.loadData()
  },
  onShow(){
    this.checkAutoConfirm()
    this.loadData()
    this.startDepositMonitor()
  },
  async loadData(){
    try{
      const db = wx.cloud && wx.cloud.database ? wx.cloud.database() : null
      let req = {}
      if (db) {
        const r = await db.collection('requests').where({ orderNo: this.id }).limit(1).get()
        const doc = (r && r.data && r.data[0]) || null
        if (doc) {
          req = {
            id: String(doc.orderNo || doc._id || ''),
            source: String(doc.category || ''),
            space: (doc.params && doc.params.space) || '',
            status: doc.status || 'submitted',
            steps: [],
            createdAt: doc.createdAt || '',
            userConfirmed: false,
            designerConfirmed: false
          }
        }
      }
      // fallback 本地
      if (!req || !req.id) {
        const list = wx.getStorageSync('lighting_requests') || []
        req = list.find(i=>i.id===this.id) || {}
      }
      const isPriority = !!wx.getStorageSync('deposit_paid')
      const bj = this.formatBeijing(req.createdAt)
      this.setData({ req: Object.assign({}, req, { priority: isPriority }), beijingTime: bj, userConfirmed: !!req.userConfirmed, designerConfirmed: !!req.designerConfirmed })
    }catch(err){
      const list = wx.getStorageSync('lighting_requests') || []
      const req = list.find(i=>i.id===this.id) || {}
      const isPriority = !!wx.getStorageSync('deposit_paid')
      const bj = this.formatBeijing(req.createdAt)
      this.setData({ req: Object.assign({}, req, { priority: isPriority }), beijingTime: bj, userConfirmed: !!req.userConfirmed, designerConfirmed: !!req.designerConfirmed })
    }
  },
  startDepositMonitor(){
    if(this._depTimer) return
    this._depositPaidLast = !!wx.getStorageSync('deposit_paid')
    this._depTimer = setInterval(()=>{
      const curr = !!wx.getStorageSync('deposit_paid')
      if(curr !== this._depositPaidLast){
        this._depositPaidLast = curr
        this.loadData()
      }
    }, 1500)
  },
  onHide(){ if(this._depTimer){ clearInterval(this._depTimer); this._depTimer = null } },
  onUnload(){ if(this._depTimer){ clearInterval(this._depTimer); this._depTimer = null } },
  formatBeijing(iso){
    if(!iso) return ''
    const d = new Date(iso)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
    const bj = new Date(utc + 8*3600000)
    const pad = n=> (n<10? '0'+n : ''+n)
    return `${bj.getFullYear()}-${pad(bj.getMonth()+1)}-${pad(bj.getDate())} ${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())}`
  },
  // 设计师：确认开始设计（5分钟内可取消）
  onConfirmStart(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      const now = Date.now()
      const deadline = item.acceptDeadline ? new Date(item.acceptDeadline).getTime() : 0
      if(deadline && now>deadline){
        wx.showToast({ title:'超过考虑期', icon:'none' })
        return
      }
      item.designStartConfirmed = true
      item.designerConfirmed = false
      // 推进到设计中
      const step = item.steps.find(s=>s.key==='design')
      if(step) step.done = false
      const review = item.steps.find(s=>s.key==='review')
      if(review) review.done = true
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'已确认开始', icon:'success' })
      this.loadData()
    }
  },
  // 设计师：考虑期取消接单
  onCancelAccept(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      const now = Date.now()
      const deadline = item.acceptDeadline ? new Date(item.acceptDeadline).getTime() : 0
      if(deadline && now>deadline){
        wx.showToast({ title:'超过考虑期，无法取消', icon:'none' })
        return
      }
      item.assigned = false
      item.acceptAt = null
      item.acceptDeadline = null
      item.designStartConfirmed = false
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'已取消接单', icon:'none' })
      this.loadData()
    }
  },
  // 设计师：提交订单（提交成果）
  onSubmitOrder(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      item.submittedAt = new Date().toISOString()
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'已提交订单', icon:'success' })
    }
  },
  // 设计师：标记完成（等待用户确认）
  onDesignerDone(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      item.designerConfirmed = true
      item.userConfirmDeadline = new Date(Date.now()+24*3600*1000).toISOString()
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'待用户确认', icon:'none' })
      this.loadData()
    }
  },
  // 用户：确认完成
  onUserConfirmDone(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      item.userConfirmed = true
      item.designerConfirmed = true
      const done = item.steps.find(s=>s.key==='done')
      if(done) done.done = true
      const design = item.steps.find(s=>s.key==='design')
      if(design) design.done = true
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'订单已完成', icon:'success' })
      this.loadData()
    }
  },
  // 自动确认：若设计师已标记完成，用户24小时未确认则默认同意
  checkAutoConfirm(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.id)
    if(idx>-1){
      const item = list[idx]
      if(item.designerConfirmed && !item.userConfirmed && item.userConfirmDeadline){
        const now = Date.now()
        const ddl = new Date(item.userConfirmDeadline).getTime()
        if(now>ddl){
          item.userConfirmed = true
          const done = item.steps.find(s=>s.key==='done')
          if(done) done.done = true
          const design = item.steps.find(s=>s.key==='design')
          if(design) design.done = true
          wx.setStorageSync('lighting_requests', list)
          this.loadData()
        }
      }
    }
  },
  onCancel(){
    wx.showModal({
      title:'确认撤销',
      content:'撤销后将无法继续处理该需求，是否确认？',
      success: (res)=>{
        if(res.confirm){
          const list = wx.getStorageSync('lighting_requests') || []
          const idx = list.findIndex(i=>i.id===this.id)
          if(idx>-1){
            list[idx].status='canceled'
            list[idx].steps.forEach((s,i)=>{ s.done = (i===0) })
            wx.setStorageSync('lighting_requests', list)
            // 云端保留记录，不删除
            this.loadData()
            this.eventChannel && this.eventChannel.emit && this.eventChannel.emit('requestUpdated')
            wx.showToast({ title:'已撤销', icon:'none' })
          }
        }
      }
    })
  },
  onModify(){
    wx.navigateTo({ url:`/pages/request/edit/edit?id=${this.id}` })
  },
  onContact(){
    wx.showActionSheet({
      itemList:['电话联系','在线客服'],
      success:(res)=>{
        if(res.tapIndex===0){
          wx.makePhoneCall({ phoneNumber: '400-000-0000' })
        } else {
          wx.showToast({ title:'已进入在线客服(示意)', icon:'none' })
        }
      }
    })
  },
  onGoDeposit(){
    wx.navigateTo({ url: '/pages/profile/deposit/deposit' })
  },
  onMoreTap(){
    const items = ['撤销订单','删除订单']
    wx.showActionSheet({
      itemList: items,
      success: (res)=>{
        if(typeof res.tapIndex !== 'number') return
        if(res.tapIndex === 0){ this.onCancel(); return }
        if(res.tapIndex === 1){ this.onDeleteOrder(); return }
      }
    })
  },
  onDeleteOrder(){
    wx.showModal({
      title:'删除订单',
      content:'删除后将无法恢复，确认删除？',
      success:(r)=>{
        if(!r.confirm) return
        const list = wx.getStorageSync('lighting_requests') || []
        const next = list.filter(i=> i.id !== this.id)
        wx.setStorageSync('lighting_requests', next)
        try{
          const util = require('../../../utils/util')
          util.callCf('orders_remove', { orderNo: this.id }).catch(()=>{})
          util.callCf('requests_remove', { orderNo: this.id }).catch(()=>{})
        }catch(err){ }
        this.eventChannel && this.eventChannel.emit && this.eventChannel.emit('requestUpdated')
        wx.showToast({ title:'已删除', icon:'none' })
        setTimeout(()=>{ wx.navigateBack({ delta: 1 }) }, 300)
      }
    })
  }
})
