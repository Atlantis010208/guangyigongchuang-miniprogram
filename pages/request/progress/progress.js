Page({
  data:{ 
    req:{}, 
    beijingTime:'', 
    isDesigner:false, 
    userConfirmed:false, 
    designerConfirmed:false,
    // 顶部步骤条：待确认 → 进行中 → 已完成
    progressSteps: [
      { text: '待确认' },
      { text: '进行中' },
      { text: '已完成' }
    ],
    progressActive: 0  // 0=待确认, 1=进行中, 2=已完成
  },
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
      let req = {}
      let doc = null
      let progressActive = 0  // 步骤条：0=待确认, 1=进行中, 2=已完成
      
      // 🔥 优先使用云函数查询（避免权限问题）
      try {
        console.log('[progress.loadData] 使用云函数查询 orderNo:', this.id)
        const cloudRes = await wx.cloud.callFunction({
          name: 'requests_detail',
          data: { orderNo: this.id }
        })
        console.log('[progress.loadData] 云函数返回:', cloudRes.result)
        if (cloudRes.result && cloudRes.result.success && cloudRes.result.data) {
          doc = cloudRes.result.data
        }
      } catch (cfErr) {
        console.warn('[progress.loadData] 云函数查询失败，尝试直接查询:', cfErr)
        // 云函数不存在或失败，降级为直接查询数据库
        const db = wx.cloud && wx.cloud.database ? wx.cloud.database() : null
        if (db) {
          const r = await db.collection('requests').where({ orderNo: this.id }).limit(1).get()
          doc = (r && r.data && r.data[0]) || null
          console.log('[progress.loadData] 直接查询结果:', doc)
        }
      }
      
      if (doc) {
        const params = doc.params || {}
        const category = String(doc.category || '')
        
        // 🔥 计算步骤条进度
        // 待确认(0): 未分配设计师 且 未预约
        // 进行中(1): 已分配设计师 且 工作流阶段不是 'completed'
        // 已完成(2): 工作流阶段为 'completed'
        const workflowStage = doc.stage || 'publish'
        const hasDesigner = !!doc.designerId
        const hasAppointment = !!doc.appointmentId || !!doc.hasAppointment
        
        if (workflowStage === 'completed') {
          // 已完成阶段
          progressActive = 2
        } else if (hasDesigner || hasAppointment) {
          // 已分配设计师或有预约，进入进行中
          progressActive = 1
        } else {
          // 待确认：未分配且未预约
          progressActive = 0
        }
        
        console.log('[progress] 步骤条状态:', { workflowStage, hasDesigner, hasAppointment, progressActive })
          
          // 根据不同类型映射字段
          let space = '', service = '', budget = '', area = '', stage = '', target = ''
          
          if (category === 'publish') {
            // 发布需求类型
            space = params.space || ''
            service = params.service || ''
            budget = params.budget || ''
            area = params.area || ''
            stage = params.stage || ''
          } else if (category === 'residential' || category === 'commercial' || category === 'office' || category === 'hotel') {
            // 住宅/商业/办公/酒店照明类型
            space = category === 'residential' ? '住宅照明' : (category === 'commercial' ? '商业照明' : (category === 'office' ? '办公照明' : '酒店照明'))
            service = params.renovationTypeText || params.style || ''
            budget = params.estTotal ? `¥${params.estTotal}` : ''
            area = params.areaBucketText || ''
            stage = params.progressText || ''
          } else if (category === 'selection') {
            // 选配服务 - 使用 selection.js 中定义的字段
            space = '选配服务'
            budget = params.budget || ''
            stage = params.stage || ''
          } else if (category === 'optimize') {
            // 灯光施工图优化
            space = '灯光施工图优化'
            target = params.target || ''
          } else if (category === 'custom') {
            // 个性需求定制 - 使用 buildQuestions() 中定义的字段
            space = '个性需求定制'
            // 映射个性需求定制的特有字段
            service = params.style || '' // 风格意向
            budget = params.budgetTotal || '' // 整体装修预算
            area = params.area || '' // 套内面积
            stage = params.progress || '' // 装修进度
          }
          
          // 额外字段用于个性需求定制的详细展示
          const customFields = category === 'custom' ? {
            age: params.age || '',
            renoType: params.renoType || '',
            layout: params.layout || '',
            cctPreference: params.cctPreference || '',
            smartHome: params.smartHome || '',
            smartLighting: params.smartLighting || ''
          } : {}
          
          // 选配服务额外字段
          const selectionFields = category === 'selection' ? {
            ceilingDrop: params.ceilingDrop || '',
            bodyHeight: params.bodyHeight || '',
            trimless: params.trimless || '',
            spotPrice: params.spotPrice || '',
            note: params.note || ''
          } : {}
          
          // 灯光施工图优化额外字段
          const optimizeFields = category === 'optimize' ? {
            needs: params.needs || [],  // 优化方向数组
            needsText: (params.needs || []).join('、') || '-',  // 格式化的优化方向
            deliverables: params.deliverables || [],  // 期望交付数组
            deliverablesText: (params.deliverables || []).join('、') || '-',  // 格式化的期望交付
            files: params.files || [],  // 上传的文件
            filesCount: (params.files || []).length,  // 文件数量
            note: params.note || ''  // 备注
          } : {}
          
        // 🔥 处理设计师信息（预约成功或分配成功后可见）
        // 优先使用用户自定义的联系方式，其次使用系统分配的设计师信息
        const customContact = doc.customDesignerInfo || null
        const systemContact = doc.designerInfo || null
        const designerInfo = customContact || systemContact
        const hasDesignerContact = !!(systemContact && (systemContact.phone || systemContact.wechat || systemContact.email))
        const hasCustomContact = !!(customContact && (customContact.name || customContact.phone || customContact.wechat))
        
        req = {
          id: String(doc.orderNo || doc._id || ''),
          source: category,
          space: space,
          service: service,
          budget: budget,
          area: area,
          stage: stage,
          target: target,
          status: doc.status || 'submitted',
          steps: [],
          createdAt: doc.createdAt || '',
          priority: !!doc.priority,  // 🔥 从云数据库读取 priority
          userConfirmed: false,
          designerConfirmed: false,
          // 设计师信息（预约成功或分配成功后显示）
          designerInfo: designerInfo,
          hasDesignerContact: hasDesignerContact,
          hasCustomContact: hasCustomContact,
          // 个性需求定制额外字段
          ...customFields,
          // 选配服务额外字段
          ...selectionFields,
          // 灯光施工图优化额外字段
          ...optimizeFields
        }
      }
      // fallback 本地
      if (!req || !req.id) {
        console.log('[progress.loadData] 云端无数据，使用本地存储 fallback')
        const list = wx.getStorageSync('lighting_requests') || []
        req = list.find(i=>i.id===this.id) || {}
      }
      // 🔥 优先使用云端的 priority，fallback 到本地存储
      const isPriority = req.priority !== undefined ? !!req.priority : !!wx.getStorageSync('deposit_paid')
      const bj = this.formatBeijing(req.createdAt)
      console.log('[progress.loadData] 最终数据:', { id: req.id, category: req.source, space: req.space, priority: isPriority, progressActive })
      this.setData({ 
        req: Object.assign({}, req, { priority: isPriority }), 
        beijingTime: bj, 
        userConfirmed: !!req.userConfirmed, 
        designerConfirmed: !!req.designerConfirmed,
        progressActive  // 🔥 步骤条当前激活索引
      })
    }catch(err){
      const list = wx.getStorageSync('lighting_requests') || []
      const req = list.find(i=>i.id===this.id) || {}
      const isPriority = !!wx.getStorageSync('deposit_paid')
      const bj = this.formatBeijing(req.createdAt)
      // 本地 fallback 时默认待确认阶段
      this.setData({ 
        req: Object.assign({}, req, { priority: isPriority }), 
        beijingTime: bj, 
        userConfirmed: !!req.userConfirmed, 
        designerConfirmed: !!req.designerConfirmed,
        progressActive: 0  // 本地 fallback 默认待确认
      })
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
      success: async (res)=>{
        if(res.confirm){
          wx.showLoading({ title:'撤销中...', mask:true })
          try {
            // 调用云函数更新云数据库
            const util = require('../../../utils/util')
            const result = await util.callCf('requests_update', {
              orderNo: this.id,
              patch: { status: 'canceled' }
            })
            
            // 同时更新本地存储
            const list = wx.getStorageSync('lighting_requests') || []
            const idx = list.findIndex(i=>i.id===this.id)
            if(idx>-1){
              list[idx].status='canceled'
              list[idx].steps.forEach((s,i)=>{ s.done = (i===0) })
              wx.setStorageSync('lighting_requests', list)
            }
            
            wx.hideLoading()
            wx.showToast({ title:'已撤销', icon:'success' })
            
            // 重新加载数据
            this.loadData()
            this.eventChannel && this.eventChannel.emit && this.eventChannel.emit('requestUpdated')
          } catch (err) {
            wx.hideLoading()
            console.error('撤销订单失败:', err)
            wx.showToast({ title:'撤销失败，请重试', icon:'none' })
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
    const status = this.data.req && this.data.req.status
    const isCanceled = status === 'canceled'
    
    // 未撤销时只能撤销，已撤销后才能删除
    const items = isCanceled ? ['删除订单'] : ['撤销订单']
    
    wx.showActionSheet({
      itemList: items,
      success: (res)=>{
        if(typeof res.tapIndex !== 'number') return
        if(isCanceled) {
          // 已撤销状态：只有删除选项
          if(res.tapIndex === 0){ this.onDeleteOrder(); return }
        } else {
          // 未撤销状态：只有撤销选项
          if(res.tapIndex === 0){ this.onCancel(); return }
        }
      }
    })
  },
  onDeleteOrder(){
    wx.showModal({
      title:'删除订单',
      content:'删除后将无法恢复，确认删除？',
      success: async (r)=>{
        if(!r.confirm) return
        wx.showLoading({ title:'删除中...', mask:true })
        try {
          const util = require('../../../utils/util')
          // 等待云函数执行完成
          await Promise.all([
            util.callCf('orders_remove', { orderNo: this.id }),
            util.callCf('requests_remove', { orderNo: this.id })
          ])
          
          // 更新本地存储
          const list = wx.getStorageSync('lighting_requests') || []
          const next = list.filter(i=> i.id !== this.id)
          wx.setStorageSync('lighting_requests', next)
          
          wx.hideLoading()
          wx.showToast({ title:'已删除', icon:'success' })
          this.eventChannel && this.eventChannel.emit && this.eventChannel.emit('requestUpdated')
          setTimeout(()=>{ wx.navigateBack({ delta: 1 }) }, 500)
        } catch(err) {
          wx.hideLoading()
          console.error('删除订单失败:', err)
          wx.showToast({ title:'删除失败，请重试', icon:'none' })
        }
      }
    })
  },
  // 🔥 长按复制电话
  onLongPressPhone(e){
    const phone = e.currentTarget.dataset.phone
    if(!phone) return
    wx.setClipboardData({
      data: phone,
      success: ()=>{
        wx.showToast({ title:'电话已复制', icon:'success' })
      }
    })
  },
  // 🔥 长按复制微信号
  onLongPressWechat(e){
    const wechat = e.currentTarget.dataset.wechat
    if(!wechat) return
    wx.setClipboardData({
      data: wechat,
      success: ()=>{
        wx.showToast({ title:'微信号已复制', icon:'success' })
      }
    })
  },
  // 🔥 长按复制邮箱
  onLongPressEmail(e){
    const email = e.currentTarget.dataset.email
    if(!email) return
    wx.setClipboardData({
      data: email,
      success: ()=>{
        wx.showToast({ title:'邮箱已复制', icon:'success' })
      }
    })
  }
})
