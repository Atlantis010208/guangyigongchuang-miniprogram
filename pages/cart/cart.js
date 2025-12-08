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
    filterType: 'mall'
  },

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
    this.reloadRequests()
    this.reloadMallOrders()
    this.startDepositMonitor()
    this.startWatchers()
    this.ensureNetworkMonitor()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this.stopDepositMonitor()
    this.stopWatchers()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.stopDepositMonitor()
    this.stopWatchers()
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

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

        try{
          Orders.listByUser(userId, { limit: 200 }).then(list => {
            console.log('[startWatchers] Orders.listByUser 返回:', list)
            const mall = (list||[]).filter(d => d && d.type === 'goods' && d.isDelete !== 1)
            console.log('[startWatchers] 过滤后的商城订单:', mall)
            this.setData({ mallOrdersCloud: mall })
            this.reloadMallOrders()
          }).catch((err)=>{
            console.error('[startWatchers] Orders.listByUser 失败:', err)
          })
        }catch(_){ }
        try{
          Requests.listByUser(userId, { limit: 200 }).then(list => {
            console.log('[startWatchers] Requests.listByUser 返回:', list)
            const reqs = (list||[]).filter(d => d && d.isDelete !== 1)
            console.log('[startWatchers] 过滤后的请求:', reqs)
            this.setData({ requestsCloud: reqs })
            this.reloadRequests()
          }).catch((err)=>{
            console.error('[startWatchers] Requests.listByUser 失败:', err)
          })
        }catch(_){ }
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
            this.setData({ requestsCloud: docs })
            this.reloadRequests()
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
  onRequestModify(e){
    const id = e.currentTarget.dataset.id
    const list = wx.getStorageSync('lighting_requests') || []
    const req = list.find(i=> i.id===id) || {}
    if (req && req.params) {
      wx.navigateTo({ url:`/pages/request/params-edit/params-edit?id=${id}` })
      return
    }
    wx.navigateTo({ url:`/pages/request/edit/edit?id=${id}` })
  },
  onDeleteRequest(e){
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title:'删除已撤销订单',
      content:'删除后可在发布需求重新提交，确认删除？',
      success:(res)=>{
        if(res.confirm){
          const list = wx.getStorageSync('lighting_requests') || []
          const next = list.filter(i=>i.id!==id)
          wx.setStorageSync('lighting_requests', next)
          // 同步云端逻辑删除（更新 orders 和 requests 表的 isDelete 字段）
          util.callCf('orders_remove', { orderNo: id }).catch(()=>{})
          util.callCf('requests_remove', { orderNo: id }).catch(()=>{})
          this.reloadRequests()
          wx.showToast({ title:'已删除', icon:'none' })
        }
      }
    })
  },
  reloadRequests(){
    const cloud = this.data.requestsCloud || []
    console.log('[reloadRequests] 云端数据总数:', cloud.length)
    console.log('[reloadRequests] 原始云端数据:', cloud)

    const depositPaid = !!wx.getStorageSync('deposit_paid')
    const mapStatus = (r)=>{
      const statusText = this.getUnifiedStatusText(r)
      const cover = this.getCoverForRequest(r)
      const priority = depositPaid
      // derive a better card title by source
      let cardTitle = r.space || '照明需求'
      if(r.source === 'scheme'){
        const cat = r.category ? String(r.category) : ''
        const scheme = r.scheme ? String(r.scheme) : ''
        if (cat === 'custom') {
          cardTitle = '个性需求定制'
        } else {
          cardTitle = `${cat || '方案'}${scheme ? ' · ' + scheme : ''}`
        }
      } else if (r.source === 'selection') {
        cardTitle = '选配服务'
      } else if (r.source === 'optimize') {
        cardTitle = '方案优化'
      } else if (r.source === 'full') {
        cardTitle = '整套设计'
      }
      return Object.assign({}, r, { statusText, cover, priority, cardTitle })
    }
    const fromCloud = cloud.filter(doc => {
      console.log('[reloadRequests] 检查文档:', {
        orderNo: doc.orderNo,
        category: doc.category,
        isDelete: doc.isDelete,
        params: doc.params
      })
      return doc && doc.isDelete !== 1
    }).map(doc => {
      const cat = String(doc.category || 'publish')
      const scheme = String((doc.params && (doc.params.scheme || doc.params.schemeText)) || '')
      const isScheme = ['residential','commercial','office','hotel'].indexOf(cat) > -1
      const isCustomForm = cat === 'custom'
      const normalizedSource = (isScheme || isCustomForm) ? 'scheme' : cat
      return {
        id: String(doc.orderNo || doc._id || ''),
        source: normalizedSource,
        category: cat,
        scheme: scheme,
        space: (doc.params && doc.params.space) || '',
        status: doc.status || 'submitted',
        steps: [],
        createdAt: doc.createdAt || '',
        priority: depositPaid
      }
    }).map(mapStatus)

    console.log('[reloadRequests] 过滤后请求数:', fromCloud.length)
    console.log('[reloadRequests] 请求详情:', fromCloud)

    const requests = fromCloud
    this.setData({ requests })
  }
  ,
  reloadMallOrders(){
    const docs = this.data.mallOrdersCloud || []
    console.log('[reloadMallOrders] 云端数据总数:', docs.length)

    const fallbackImg = 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg'
    const mapped = docs.filter(d=> {
      console.log('[reloadMallOrders] 检查文档:', {
        orderNo: d.orderNo,
        type: d.type,
        isDelete: d.isDelete,
        hasItems: !!(d.items || (d.params && d.params.items)),
        items: d.items,
        paramsItems: d.params && d.params.items
      })

      if (!d || d.isDelete === 1 || d.type !== 'goods') return false
      // 支持两种数据结构：新版本使用 d.items，旧版本使用 d.params.items
      const items = d.items || (d.params && d.params.items) || []
      return Array.isArray(items) && items.length > 0
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
      return {
        id: String(doc.orderNo || doc._id || ''),
        status: doc.status === 'paid' ? '已支付' : (doc.status === 'failed' ? '支付失败' : (doc.status === 'canceled' ? '已取消' : '待支付')),
        createdAt: doc.createdAt || Date.now(),
        items,
        // 支持两种数据结构：新版本使用 doc.totalAmount，旧版本使用 doc.params.totalAmount
        total: Number(doc.totalAmount || (doc.params && doc.params.totalAmount) || 0)
      }
    })

    console.log('[reloadMallOrders] 过滤后订单数:', mapped.length)
    console.log('[reloadMallOrders] 订单详情:', mapped)

    this.setData({ mallOrders: mapped })
  },
  onFilterTap(e){
    const type = e.currentTarget.dataset.type
    if (!type) return
    this.setData({ filterType: type })
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
  // 跳转到设计师筛选页面
  onGoToDesigners() {
    wx.navigateTo({
      url: '/pages/designers/list/list'
    })
    // 添加触觉反馈
    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }
  }
})
