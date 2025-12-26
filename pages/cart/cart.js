// pages/cart/cart.js
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cartItems: [],
    savedItems: [],
    isEditing: false,
    selectedItems: [],
    showSaved: true,
    requests: [],
    mallOrders: [],
    requestsCloud: [],
    mallOrdersCloud: [],
    filterType: 'mall',
    isLoggedIn: false, // 登录状态
    countdownTimer: null // 支付倒计时定时器
  },
  
  // 订单超时时间（毫秒）: 15分钟
  ORDER_TIMEOUT_MS: 15 * 60 * 1000,

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查登录状态
    const app = getApp()
    const isLoggedIn = app.isLoggedIn()
    this.setData({ isLoggedIn })
    
    // 🔥 检查是否需要自动切换到方案订单 tab（预约成功后跳转）
    const switchToScheme = wx.getStorageSync('cart_switch_to_scheme')
    if (switchToScheme) {
      wx.removeStorageSync('cart_switch_to_scheme')
      this.setData({ filterType: 'scheme' })
    }
    
    if (isLoggedIn) {
      // 🔥 主动从数据库获取完整数据，确保字段完整
      this.fetchRequestsFromDB()
      this.fetchOrdersFromDB()  // 使用云函数获取商城订单
      this.startDepositMonitor()
      this.startWatchers()
      this.ensureNetworkMonitor()
      
      // 立即检查超时订单
      setTimeout(() => {
        this.updateCountdown()
      }, 1000)
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this.stopDepositMonitor()
    this.stopWatchers()
    this.stopCountdown()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.stopDepositMonitor()
    this.stopWatchers()
    this.stopCountdown()
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  async onPullDownRefresh() {
    console.log('[onPullDownRefresh] 用户下拉刷新')
    try {
      // 重新从数据库获取数据
      await this.fetchRequestsFromDB()
      await this.fetchOrdersFromDB()
      wx.showToast({ title: '刷新成功', icon: 'success', duration: 1000 })
    } catch (e) {
      console.error('[onPullDownRefresh] 刷新失败:', e)
      wx.showToast({ title: '刷新失败', icon: 'none' })
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
  ,
  ensureNetworkMonitor(){
    if (this._netHooked) return
    this._netHooked = true
    try{
      wx.getNetworkType({ success: (res)=>{ this._netConnected = res && res.networkType && res.networkType !== 'none' } })
      wx.onNetworkStatusChange((res)=>{
        this._netConnected = !!res.isConnected
        if (this._netConnected) {
          this.startWatchers()
        } else {
          this.stopWatchers()
        }
      })
    }catch(_){ }
  },
  startDepositMonitor(){
    if(this._depTimer) return
    this._depositPaidLast = !!wx.getStorageSync('deposit_paid')
    this._depTimer = setInterval(()=>{
      const curr = !!wx.getStorageSync('deposit_paid')
      if(curr !== this._depositPaidLast){
        this._depositPaidLast = curr
        this.reloadRequests()
      }
    }, 1500)
  },
  stopDepositMonitor(){
    if(this._depTimer){ clearInterval(this._depTimer); this._depTimer = null }
  },
  startWatchers(){
    const now = Date.now()
    if (this._watchCooldownUntil && now < this._watchCooldownUntil) return
    if (this._watching) return
    this._watching = true
    if (this._watchTimer) { clearTimeout(this._watchTimer); this._watchTimer = null }
    this._watchTimer = setTimeout(()=>{
      try{
        try{
          wx.getNetworkType({ success: (res)=>{ if (!res || res.networkType === 'none') { this._watching = false } } })
          if (this._watching === false) return
        }catch(_){ }
        const db = api.dbInit()
        if(!db){ this._watching = false; return }
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        if(!userId){ this._watching = false; return }
        const Orders = api.getOrdersRepo(db)
        const Requests = api.getRequestsRepo(db)
        console.log('[startWatchers] 开始加载订单数据, userId:', userId)

        // 注意：移除了 listByUser 调用，避免与 watchByUser 产生数据竞争
        // watcher 首次触发时会返回完整的数据快照
        // 注意：移除了 listByUser 调用，避免与 watchByUser 产生数据竞争
        // watcher 首次触发时会返回完整的数据快照
        // 如果需要立即加载数据，watcher 会在连接后立即触发 onChange
        // 安全关闭旧的 watchers
        if (this._ordersUnwatch && typeof this._ordersUnwatch.close === 'function') { 
          try{ this._ordersUnwatch.close() }catch(e){ 
            if (e && e.message && !e.message.includes('does not accept')) console.warn('close orders:', e)
          } 
          this._ordersUnwatch = null
        }
        if (this._requestsUnwatch && typeof this._requestsUnwatch.close === 'function') { 
          try{ this._requestsUnwatch.close() }catch(e){ 
            if (e && e.message && !e.message.includes('does not accept')) console.warn('close requests:', e)
          } 
          this._requestsUnwatch = null
        }
        const onErr = async (err)=>{
          // 忽略状态机错误
          if (err && err.message && err.message.includes('does not accept')) return
          if (this._closing) return
          this._closing = true
          this._watching = false

          // 安全关闭 watchers，忽略状态机错误
          if (this._ordersUnwatch && typeof this._ordersUnwatch.close === 'function') {
            try {
              this._ordersUnwatch.close()
            } catch(e) {
              if (e && e.message && !e.message.includes('does not accept')) {
                console.warn('onErr close orders:', e)
              }
            }
          }
          if (this._requestsUnwatch && typeof this._requestsUnwatch.close === 'function') {
            try {
              this._requestsUnwatch.close()
            } catch(e) {
              if (e && e.message && !e.message.includes('does not accept')) {
                console.warn('onErr close requests:', e)
              }
            }
          }

          const n = (this._watchRetry || 0) + 1
          this._watchRetry = n
          this._closing = false
          // 尝试刷新登录态，避免 CLOSED/LOGGING_IN 状态机冲突
          try{
            const util = require('../../utils/util')
            await util.callCf('login', {})
          }catch(_){ }
          // 增加冷却时间，避免状态竞争
          this._watchCooldownUntil = Date.now() + Math.min(6000, 1000 * n)
          if (n <= 5) {
            const delay = Math.min(1000 * Math.pow(2, n), 15000)
            setTimeout(()=>{ this.startWatchers() }, delay)
          }
        }
        try{
          this._ordersUnwatch = Orders.watchByUser(userId, (snapshot)=>{
            const docs = snapshot && snapshot.docs ? snapshot.docs : []
            const mall = docs.filter(d => d && d.type === 'goods' && d.isDelete !== 1)
            this.setData({ mallOrdersCloud: mall })
            this.reloadMallOrders()
          }, onErr)
        }catch(e){ onErr(e) }
        try{
          this._requestsUnwatch = Requests.watchByUser(userId, (snapshot)=>{
            const docs = snapshot && snapshot.docs ? snapshot.docs : []
            console.log('[watchByUser] Requests watcher 触发，文档数:', docs.length)
            // 打印每个文档的 priority 字段，用于调试
            docs.forEach((doc, i) => {
              if (doc.category !== 'mall') {
                console.log(`[watchByUser] 文档 ${i}: orderNo=${doc.orderNo}, priority=${doc.priority}, designerId=${doc.designerId}`)
              }
            })
            // 🔥 watcher 返回的数据可能不完整，主动重新获取完整数据
            this.fetchRequestsFromDB()
          }, onErr)
        }catch(e){ onErr(e) }
      }catch(err){ this._watching = false }
    }, 200)
  },
  stopWatchers(){
    if (this._closing) return
    this._closing = true
    if (this._watchTimer) { clearTimeout(this._watchTimer); this._watchTimer = null }

    // 关闭 orders watcher
    if (this._ordersUnwatch) {
      try {
        if (typeof this._ordersUnwatch.close === 'function') {
          this._ordersUnwatch.close()
        }
      } catch(e) {
        // 忽略 "does not accept disconnect" 等状态机错误
        if (e && e.message && !e.message.includes('does not accept')) {
          console.warn('stopWatchers orders error:', e)
        }
      }
      this._ordersUnwatch = null
    }

    // 关闭 requests watcher
    if (this._requestsUnwatch) {
      try {
        if (typeof this._requestsUnwatch.close === 'function') {
          this._requestsUnwatch.close()
        }
      } catch(e) {
        // 忽略 "does not accept disconnect" 等状态机错误
        if (e && e.message && !e.message.includes('does not accept')) {
          console.warn('stopWatchers requests error:', e)
        }
      }
      this._requestsUnwatch = null
    }

    this._watching = false
    this._watchRetry = 0
    this._closing = false
    this._watchCooldownUntil = Date.now() + 2000
  },
  getCoverForRequest(r){
    const fallback = 'https://images.pexels.com/photos/45072/pexels-photo-45072.jpeg'
    if(!r) return fallback
    if(r.source === 'scheme'){
      switch(r.category){
        case 'residential': return 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
        case 'commercial': return 'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg'
        case 'office': return 'https://images.pexels.com/photos/3184306/pexels-photo-3184306.jpeg'
        case 'hotel': return 'https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg'
        default: return fallback
      }
    }
    switch(r.source){
      case 'publish': return 'https://images.pexels.com/photos/704590/pexels-photo-704590.jpeg'
      case 'survey': return 'https://images.pexels.com/photos/2381463/pexels-photo-2381463.jpeg'
      case 'concept': return 'https://images.pexels.com/photos/373548/pexels-photo-373548.jpeg'
      case 'calc': return 'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
      case 'selection': return 'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
      case 'optimize': return 'https://images.pexels.com/photos/462123/pexels-photo-462123.jpeg'
      case 'construction': return 'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg'
      case 'commission': return 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg'
      default: return fallback
    }
  },
  getUnifiedStatusText(r){
    if(!r) return ''
    if(r.status === 'canceled') return ''
    const steps = Array.isArray(r.steps) ? r.steps : []
    const order = ['submitted','review','design','done']
    const texts = ['已提交','审核中','设计中','已完成']
    let highest = -1
    for(const step of steps){
      if(step && step.done){
        const idx = order.indexOf(step.key)
        if(idx > highest) highest = idx
      }
    }
    if(highest >= 0) return texts[highest]
    if(steps.length > 0) return '已提交'
    const s = String(r.status || r.statusText || '').trim()
    if(/完成/.test(s) || /(done|completed)/i.test(s)) return '已完成'
    if(/设计/.test(s) || /计算/.test(s) || /(design|calc(ulate)?)/i.test(s)) return '设计中'
    if(/审/.test(s) || /(review|approve)/i.test(s)) return '审核中'
    return '已提交'
  },
  onRequestTap(e){
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/request/progress/progress?id=${id}`,
      events: {
        requestUpdated: () => { this.reloadRequests() }
      }
    })
  },
  /**
   * 修改照明需求（从云端数据中查找）
   */
  onRequestModify(e){
    const id = e.currentTarget.dataset.id
    // 从云端数据中查找请求
    const cloudRequests = this.data.requestsCloud || []
    const req = cloudRequests.find(doc => String(doc.orderNo || doc._id) === String(id)) || {}
    
    if (req && req.params) {
      wx.navigateTo({ url:`/pages/request/params-edit/params-edit?id=${id}` })
      return
    }
    wx.navigateTo({ url:`/pages/request/edit/edit?id=${id}` })
  },

  /**
   * 删除照明需求（调用云函数，不依赖本地存储）
   */
  onDeleteRequest(e){
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title:'删除已撤销订单',
      content:'删除后可在发布需求重新提交，确认删除？',
      success: async (res)=>{
        if(res.confirm){
          wx.showLoading({ title: '删除中...', mask: true })
          
          try {
            // 调用云函数删除（逻辑删除，更新 isDelete 字段）
            await Promise.all([
              util.callCf('orders_remove', { orderNo: id }),
              util.callCf('requests_remove', { orderNo: id })
            ])
            
            wx.hideLoading()
            wx.showToast({ title:'已删除', icon:'success' })
            
            // 重新加载数据（watcher 会自动更新，但主动触发一次更快）
            this.reloadRequests()
          } catch (err) {
            wx.hideLoading()
            console.error('[删除需求失败]', err)
            wx.showToast({ title:'删除失败', icon:'none' })
          }
        }
      }
    })
  },
  /**
   * 🔥 主动从数据库获取完整的请求数据
   * 解决 watcher 增量更新可能缺少字段的问题
   * 带节流机制，避免频繁查询
   */
  async fetchRequestsFromDB() {
    // 节流：500ms 内不重复查询
    const now = Date.now()
    if (this._lastFetchTime && now - this._lastFetchTime < 500) {
      console.log('[fetchRequestsFromDB] 节流中，跳过本次查询')
      return
    }
    this._lastFetchTime = now
    
    try {
      const userDoc = wx.getStorageSync('userDoc') || {}
      const userId = userDoc._id
      const openid = wx.getStorageSync('openid') || ''
      
      if (!userId && !openid) {
        console.log('[fetchRequestsFromDB] 未找到用户ID或openid')
        return
      }
      
      console.log('[fetchRequestsFromDB] userId=' + userId, 'openid=' + openid)
      
      // 🔥 使用云函数查询，突破小程序端 20 条限制
      const cloudRes = await wx.cloud.callFunction({
        name: 'requests_list',
        data: { userId: userId }
      })
      
      const res = cloudRes.result || {}
      console.log('[fetchRequestsFromDB] 云函数返回记录数:', res.total || 0, '成功:', res.success)
      
      const docs = (res.success && res.data) ? res.data : []
      console.log('[fetchRequestsFromDB] 获取到请求数:', docs.length, '用户信息:', { userId, openid })
      
      // 调试：输出关键字段
      docs.forEach((doc, i) => {
        if (doc.category !== 'mall') {
          console.log(`[fetchRequestsFromDB] 请求 ${i}: orderNo=${doc.orderNo}, designerId=${doc.designerId}, designerName=${doc.designerName}, hasAppointment=${doc.hasAppointment}`)
        }
      })
      
      // 更新 requestsCloud 并刷新显示
      this.setData({ requestsCloud: docs })
      this.reloadRequests()
    } catch (err) {
      console.error('[fetchRequestsFromDB] 获取请求失败:', err)
      // 失败时依赖 watcher 数据
      this.reloadRequests()
    }
  },

  /**
   * 🔥 使用云函数获取商城订单（突破 20 条限制）
   */
  async fetchOrdersFromDB() {
    try {
      const userDoc = wx.getStorageSync('userDoc') || {}
      const userId = userDoc._id
      const openid = wx.getStorageSync('openid') || ''
      
      if (!userId && !openid) {
        console.log('[fetchOrdersFromDB] 未找到用户ID或openid')
        return
      }
      
      console.log('[fetchOrdersFromDB] 查询商城订单, userId:', userId, 'openid:', openid)
      
      const cloudRes = await wx.cloud.callFunction({
        name: 'orders_list',
        data: { userId: userId }
      })
      
      const res = cloudRes.result || {}
      console.log('[fetchOrdersFromDB] 云函数返回总数:', res.total || 0)
      
      const docs = (res.success && res.data) ? res.data : []
      console.log('[fetchOrdersFromDB] 原始订单数:', docs.length)
      
      // 过滤出商城订单，并打印待支付订单调试信息
      const mall = docs.filter(d => {
        if (!d || d.type !== 'goods' || d.isDelete === 1) return false
        // 打印待支付订单的调试信息
        if (d.status === 'pending_payment' || d.status === 'pending') {
          console.log('[fetchOrdersFromDB] 发现待支付订单:', {
            orderNo: d.orderNo,
            status: d.status,
            createdAt: d.createdAt,
            hasItems: !!(d.items || (d.params && d.params.items))
          })
        }
        return true
      })
      
      console.log('[fetchOrdersFromDB] 商城订单数:', mall.length)
      
      this.setData({ mallOrdersCloud: mall })
      this.reloadMallOrders()
    } catch (err) {
      console.error('[fetchOrdersFromDB] 获取订单失败:', err)
      this.reloadMallOrders()
    }
  },

  reloadRequests(){
    const cloud = this.data.requestsCloud || []
    console.log('[reloadRequests] 云端数据总数:', cloud.length)
    console.log('[reloadRequests] 原始云端数据:', cloud)

    // 类别英文转中文映射
    const categoryMap = {
      'residential': '住宅照明',
      'commercial': '商业照明',
      'office': '办公照明',
      'hotel': '酒店照明',
      'publish': '发布需求',
      'selection': '选配服务',
      'optimize': '方案优化',
      'full': '整套设计',
      'custom': '个性需求定制'
    }
    
    const mapStatus = (r)=>{
      const statusText = this.getUnifiedStatusText(r)
      const cover = this.getCoverForRequest(r)
      // 🔥 使用云端数据库中的 priority 字段，而不是本地存储
      const priority = !!r.priority
      // derive a better card title by source
      let cardTitle = r.space || '照明需求'
      const catCN = categoryMap[r.category] || r.category || '照明需求'
      
      if(r.source === 'scheme'){
        const scheme = r.scheme ? String(r.scheme) : ''
        if (r.category === 'custom') {
          cardTitle = '个性需求定制'
        } else {
          cardTitle = catCN + (scheme ? ' · ' + scheme : '')
        }
      } else if (r.source === 'selection') {
        cardTitle = '选配服务'
      } else if (r.source === 'optimize') {
        cardTitle = '方案优化'
      } else if (r.source === 'full') {
        cardTitle = '整套设计'
      } else if (r.source === 'publish') {
        cardTitle = r.space || '发布需求'
      } else {
        cardTitle = catCN
      }
      
      // 同时将 category 也转成中文用于显示
      const categoryCN = catCN
      return Object.assign({}, r, { statusText, cover, priority, cardTitle, categoryCN })
    }
    // 🔥 调试：先统计各类记录数量
    let mallCount = 0, deletedCount = 0, validCount = 0
    cloud.forEach(doc => {
      if (doc.category === 'mall') mallCount++
      else if (doc.isDelete === 1) deletedCount++
      else validCount++
    })
    console.log('[reloadRequests] 数据统计: mall=' + mallCount + ', 已删除=' + deletedCount + ', 有效=' + validCount)
    
    const fromCloud = cloud.filter(doc => {
      const isMall = doc.category === 'mall'
      const isDeleted = doc.isDelete === 1
      const shouldKeep = doc && !isDeleted && !isMall
      
      // 只打印非 mall 记录的详细信息，减少日志量
      if (!isMall) {
        console.log('[reloadRequests] 非mall记录:', doc.orderNo, 'category=' + doc.category, 'isDelete=' + doc.isDelete, '保留=' + shouldKeep)
      }
      
      return shouldKeep
    }).map(doc => {
      const cat = String(doc.category || 'publish')
      const scheme = String((doc.params && (doc.params.scheme || doc.params.schemeText)) || '')
      const isScheme = ['residential','commercial','office','hotel'].indexOf(cat) > -1
      const isCustomForm = cat === 'custom'
      const normalizedSource = (isScheme || isCustomForm) ? 'scheme' : cat
      // 提取 params 中的详细字段
      const params = doc.params || {}
      // 🔥 判断设计师分配状态
      const hasAppointment = !!doc.hasAppointment || !!doc.appointmentId
      const hasDesigner = !!doc.designerId
      let designerStatus = 'none'  // none: 未预约, pending: 待确认, assigned: 已分配
      if (hasDesigner) {
        designerStatus = 'assigned'
      } else if (hasAppointment) {
        designerStatus = 'pending'
      }
      
      return {
        id: String(doc.orderNo || doc._id || ''),
        source: normalizedSource,
        category: cat,
        scheme: scheme,
        space: params.space || '',
        status: doc.status || 'submitted',
        steps: [],
        createdAt: doc.createdAt || '',
        priority: !!doc.priority,  // 🔥 使用云端数据库中的 priority 字段
        // 🔥 添加预约和设计师相关字段
        hasAppointment: hasAppointment,
        appointmentId: doc.appointmentId || '',
        designerId: doc.designerId || '',
        designerName: doc.designerName || '',
        designerStatus: designerStatus,  // 🔥 新增：设计师分配状态
        // 🔥 个性需求定制字段
        area: params.area || '',
        budget: params.budgetTotal || params.budget || '',
        style: params.style || '',
        progress: params.progress || '',
        renoType: params.renoType || '',
        smartHome: params.smartHome || '',
        smartLighting: params.smartLighting || '',
        // 🔥 选配服务字段
        stage: params.stage || params.progressText || '',
        // 🔥 选配服务额外字段
        ceilingDrop: params.ceilingDrop || '',
        bodyHeight: params.bodyHeight || '',
        trimless: params.trimless || '',
        spotPrice: params.spotPrice || '',
        note: params.note || ''
      }
    }).map(mapStatus)

    console.log('[reloadRequests] 过滤后请求数:', fromCloud.length)
    console.log('[reloadRequests] 请求详情:', fromCloud)

    const requests = fromCloud
    this.setData({ requests })
    
    // 🔥 异步补全缺失的设计师名字
    this.fillMissingDesignerNames(requests)
  },
  
  /**
   * 当订单有 designerId 但没有 designerName 时，从设计师集合查询并补全
   */
  async fillMissingDesignerNames(requests) {
    // 找出有 designerId 但没有 designerName 的订单
    const needFill = requests.filter(r => r.designerId && !r.designerName)
    if (needFill.length === 0) return
    
    // 获取所有需要查询的设计师ID（去重）
    const designerIds = [...new Set(needFill.map(r => r.designerId))]
    
    try {
      const db = api.dbInit()
      if (!db) return
      
      // 查询设计师信息
      const res = await db.collection('designers')
        .where({ _id: db.command.in(designerIds) })
        .field({ _id: true, name: true })
        .get()
      
      const designers = res.data || []
      const designerMap = {}
      designers.forEach(d => { designerMap[d._id] = d.name })
      
      // 更新本地数据
      const updated = this.data.requests.map(r => {
        if (r.designerId && !r.designerName && designerMap[r.designerId]) {
          return { ...r, designerName: designerMap[r.designerId] }
        }
        return r
      })
      
      this.setData({ requests: updated })
      console.log('[fillMissingDesignerNames] 已补全设计师名字')
    } catch (err) {
      console.warn('[fillMissingDesignerNames] 查询设计师失败:', err)
    }
  }
  ,
  reloadMallOrders(){
    const docs = this.data.mallOrdersCloud || []
    console.log('[reloadMallOrders] 云端数据总数:', docs.length)

    const fallbackImg = 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg'
    const mapped = docs.filter(d=> {
      if (!d || d.isDelete === 1 || d.type !== 'goods') {
        console.log('[reloadMallOrders] 订单被过滤(基础条件):', d?.orderNo, 'isDelete:', d?.isDelete, 'type:', d?.type)
        return false
      }
      // 支持两种数据结构：新版本使用 d.items，旧版本使用 d.params.items
      const items = d.items || (d.params && d.params.items) || []
      const hasItems = Array.isArray(items) && items.length > 0
      if (!hasItems) {
        console.log('[reloadMallOrders] 订单被过滤(无商品):', d.orderNo, 'status:', d.status)
      } else if (d.status === 'pending_payment' || d.status === 'pending') {
        console.log('[reloadMallOrders] 保留待支付订单:', d.orderNo)
      }
      return hasItems
    }).map(doc=>{
      // 支持两种数据结构：新版本使用 doc.items，旧版本使用 doc.params.items
      const sourceItems = doc.items || (doc.params && doc.params.items) || []
      const items = sourceItems.map(it=>({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        image: it.image || fallbackImg,
        price: it.amount
      }))
      
      // 使用 getOrderStatus 获取详细状态信息
      const { statusText, statusType, canPay, remainingTime } = this.getOrderStatus(doc)
      
      // 获取商品名称
      const firstItem = items[0] || {}
      const itemCount = items.length
      const title = `商城订单 · ${firstItem.name || '商品'}${itemCount > 1 ? ` 等${itemCount}件` : ''}`
      
      // 格式化时间
      let timeStr = ''
      if (doc.createdAt) {
        const d = new Date(doc.createdAt)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        timeStr = `${y}-${m}-${day}`
      }
      
      return {
        id: String(doc.orderNo || doc._id || ''),
        orderNo: String(doc.orderNo || doc._id || ''),
        title: title,
        status: statusText,
        statusType: statusType,
        canPay: canPay,
        remainingTime: remainingTime,
        afterSaleStatus: doc.afterSaleStatus || '无售后',
        createdAt: doc.createdAt || Date.now(),
        time: timeStr,
        items,
        // 支持两种数据结构：新版本使用 doc.totalAmount，旧版本使用 doc.params.totalAmount
        total: Number(doc.totalAmount || (doc.params && doc.params.totalAmount) || 0),
        _raw: doc
      }
    })

    console.log('[reloadMallOrders] 过滤后订单数:', mapped.length)
    console.log('[reloadMallOrders] 订单详情:', mapped)
    
    // 按创建时间倒序排列
    mapped.sort((a, b) => (new Date(b.createdAt).getTime()) - (new Date(a.createdAt).getTime()))
    
    this.setData({ mallOrders: mapped })
    
    // 如果有待支付订单，启动倒计时
    const hasPendingOrders = mapped.some(o => o.canPay)
    if (hasPendingOrders) {
      this.startCountdown()
    } else {
      this.stopCountdown()
    }
  },
  onFilterTap(e){
    const type = e.currentTarget.dataset.type
    if (!type) return
    this.setData({ filterType: type })
  },
  
  /**
   * 获取订单状态信息（含支付倒计时）
   */
  getOrderStatus(order) {
    const now = Date.now()
    
    // 安全地解析创建时间
    let createdAt = 0
    if (order.createdAt) {
      if (typeof order.createdAt === 'number') {
        createdAt = order.createdAt
      } else if (typeof order.createdAt === 'string' || order.createdAt instanceof Date) {
        createdAt = new Date(order.createdAt).getTime()
      }
    }
    
    // 如果创建时间无效，返回未知状态
    if (!createdAt || isNaN(createdAt)) {
      console.warn('[getOrderStatus] 订单创建时间无效:', order.orderNo, order.createdAt)
      return {
        statusText: order.status || '未知',
        statusType: 'unknown',
        canPay: false,
        remainingTime: 0
      }
    }
    
    const expireAt = createdAt + this.ORDER_TIMEOUT_MS

    // 已完成
    if (order.status === 'completed') {
      return {
        statusText: '已完成',
        statusType: 'completed',
        canPay: false,
        remainingTime: 0
      }
    }

    // 已发货
    if (order.status === 'shipped') {
      return {
        statusText: '已发货',
        statusType: 'shipped',
        canPay: false,
        remainingTime: 0
      }
    }

    // 已支付
    if (order.paid === true || order.status === 'paid') {
      return {
        statusText: '已支付',
        statusType: 'paid',
        canPay: false,
        remainingTime: 0
      }
    }

    // 已关闭/已取消
    if (order.status === 'closed' || order.status === 'cancelled' || order.status === 'canceled') {
      return {
        statusText: '已取消',
        statusType: 'closed',
        canPay: false,
        remainingTime: 0
      }
    }
    
    // 已退款
    if (order.status === 'refunded') {
      return {
        statusText: '已退款',
        statusType: 'refunded',
        canPay: false,
        remainingTime: 0
      }
    }

    // 待支付 - 检查是否超时
    if (order.status === 'pending_payment' || order.status === 'pending') {
      const remainingMs = expireAt - now

      if (remainingMs <= 0) {
        // 已超时
        return {
          statusText: '已关闭',
          statusType: 'closed',
          canPay: false,
          remainingTime: 0
        }
      }

      // 计算剩余时间，最后1分钟显示秒数
      let timeText = ''
      const remainingSeconds = Math.ceil(remainingMs / 1000)
      
      if (remainingSeconds <= 60) {
        // 最后1分钟显示秒数
        timeText = `${remainingSeconds}秒后关闭`
      } else {
        // 超过1分钟显示分钟数
        const remainingMin = Math.ceil(remainingMs / 1000 / 60)
        timeText = `${remainingMin}分钟后关闭`
      }

      return {
        statusText: `待支付 · ${timeText}`,
        statusType: 'pending',
        canPay: true,
        remainingTime: remainingMs
      }
    }

    // 默认状态
    return {
      statusText: order.status || '未知',
      statusType: 'unknown',
      canPay: false,
      remainingTime: 0
    }
  },
  
  /**
   * 启动支付倒计时
   */
  startCountdown() {
    this.stopCountdown()
    
    // 检查是否有即将超时的订单（剩余时间少于2分钟）
    const hasUrgentOrder = (this.data.mallOrdersCloud || []).some(o => {
      if (o.status === 'pending' || o.status === 'pending_payment') {
        // 安全地解析创建时间
        let createdAt = 0
        if (o.createdAt) {
          if (typeof o.createdAt === 'number') {
            createdAt = o.createdAt
          } else {
            createdAt = new Date(o.createdAt).getTime()
          }
        }
        
        if (!createdAt || isNaN(createdAt)) return false
        
        const expireAt = createdAt + this.ORDER_TIMEOUT_MS
        const remainingMs = expireAt - Date.now()
        return remainingMs > 0 && remainingMs <= 2 * 60 * 1000 // 剩余时间小于2分钟
      }
      return false
    })
    
    // 如果有即将超时的订单，每秒更新一次；否则每10秒更新一次
    const interval = hasUrgentOrder ? 1000 : 10000
    
    this.data.countdownTimer = setInterval(() => {
      this.updateCountdown()
    }, interval)
  },
  
  /**
   * 停止支付倒计时
   */
  stopCountdown() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer)
      this.data.countdownTimer = null
    }
  },
  
  /**
   * 更新倒计时显示，并自动关闭超时订单
   */
  async updateCountdown() {
    const cloudOrders = this.data.mallOrdersCloud || []
    const now = Date.now()
    
    // 检查是否有待支付订单
    let hasPendingOrders = false
    const expiredOrders = [] // 记录超时订单
    
    cloudOrders.forEach(o => {
      if (o.status === 'pending' || o.status === 'pending_payment') {
        // 安全地解析创建时间
        let createdAt = 0
        if (o.createdAt) {
          if (typeof o.createdAt === 'number') {
            createdAt = o.createdAt
          } else {
            createdAt = new Date(o.createdAt).getTime()
          }
        }
        
        // 如果创建时间无效，跳过该订单
        if (!createdAt || isNaN(createdAt)) {
          console.warn('[updateCountdown] 订单创建时间无效:', o.orderNo, o.createdAt)
          return
        }
        
        const expireAt = createdAt + this.ORDER_TIMEOUT_MS
        const remainingMs = expireAt - now
        
        if (remainingMs <= 0) {
          // 订单已超时
          expiredOrders.push(o)
        } else {
          // 仍有未超时的待支付订单
          hasPendingOrders = true
        }
      }
    })
    
    // 自动关闭超时订单
    if (expiredOrders.length > 0) {
      console.log('[updateCountdown] 发现超时订单，自动关闭:', expiredOrders.map(o => o.orderNo))
      
      // 批量更新超时订单状态（同时更新 orders 和 requests 集合）
      const updatePromises = expiredOrders.map(order => 
        Promise.all([
          util.callCf('orders_update', {
            orderNo: order.orderNo,
            patch: { status: 'closed' }
          }).catch(err => {
            console.error('[updateCountdown] 更新 orders 失败:', order.orderNo, err)
          }),
          util.callCf('requests_update', {
            orderNo: order.orderNo,
            patch: { status: 'closed' }
          }).catch(err => {
            console.error('[updateCountdown] 更新 requests 失败:', order.orderNo, err)
          })
        ])
      )
      
      await Promise.all(updatePromises)
    }
    
    // 刷新显示
    if (hasPendingOrders || expiredOrders.length > 0) {
      this.reloadMallOrders()
      
      // 如果有超时订单或没有待支付订单了，重新调整倒计时器
      if (expiredOrders.length > 0 || !hasPendingOrders) {
        this.startCountdown() // 重新评估更新频率
      }
    }
  },
  
  /**
   * 去支付（重新发起支付）
   */
  onPayOrder(e) {
    const orderNo = e.currentTarget.dataset.orderno
    if (!orderNo) {
      wx.showToast({ title: '订单信息错误', icon: 'none' })
      return
    }
    
    // 跳转到订单确认页重新支付
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?orderNo=${orderNo}`
    })
  },
  onDeleteMallOrder(e){
    const id = e.currentTarget.dataset.id
    if(!id) return
    wx.showModal({
      title:'删除已撤销订单',
      content:'删除后将无法恢复，确认删除？',
      success:(res)=>{
        if(res.confirm){
          // 删除本地记录
          const list = wx.getStorageSync('mall_orders') || []
          const next = list.filter(o => String(o.id) !== String(id))
          wx.setStorageSync('mall_orders', next)
          
          // 同步云端逻辑删除（更新 orders 和 requests 表的 isDelete 字段）
          util.callCf('orders_remove', { orderNo: id }).catch(()=>{})
          util.callCf('requests_remove', { orderNo: id }).catch(()=>{})
          
          this.reloadMallOrders()
          wx.showToast({ title:'已删除', icon:'none' })
        }
      }
    })
  },
  onMallOrderTap(e){
    const id = e.currentTarget.dataset.id
    if(!id) return
    wx.navigateTo({ url: `/pages/order/detail/detail?id=${id}` })
  },
  // 跳转到设计师筛选页面，携带当前需求信息
  onGoToDesigners(e) {
    const request = e.currentTarget.dataset.request || {}
    
    // 构建 URL 参数，携带需求信息（小程序不支持 URLSearchParams，使用字符串拼接）
    let url = '/pages/designers/list/list'
    if (request.id) {
      const params = []
      params.push('requestId=' + encodeURIComponent(request.id))
      // 携带需求类型用于预选
      if (request.category) params.push('category=' + encodeURIComponent(request.category))
      if (request.source) params.push('source=' + encodeURIComponent(request.source))
      // 携带一些基本信息用于显示
      if (request.cardTitle) params.push('title=' + encodeURIComponent(request.cardTitle))
      if (request.area) params.push('area=' + encodeURIComponent(request.area))
      if (request.budget) params.push('budget=' + encodeURIComponent(request.budget))
      if (request.style) params.push('style=' + encodeURIComponent(request.style))
      url += '?' + params.join('&')
    }
    
    wx.navigateTo({ url })
    
    // 添加触觉反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }
  },

  /**
   * 跳转到登录页面
   */
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/cart/cart')
    })
  }
})
