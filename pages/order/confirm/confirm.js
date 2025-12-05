// pages/order/confirm/confirm.js
const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    address: null,
    item: null,
    items: null,
    specsText: '',
    subtotal: 0,
    total: 0,
    note: '',
    submitting:false
  },

  onLoad(query) {
    try {
      if (query && query.multi) {
        const payload = JSON.parse(decodeURIComponent(query.multi))
        const itemsRaw = (payload && payload.items) || []
        const items = itemsRaw.map(it => ({ ...it, linePrice: Number(it.price || 0) * Number(it.quantity || 1) }))
        const subtotal = items.reduce((s, it) => s + Number(it.linePrice || 0), 0)
        this.setData({ items, item: null, specsText: '', subtotal, total: subtotal })
      } else {
        const raw = query && query.item ? decodeURIComponent(query.item) : ''
        const item = raw ? JSON.parse(raw) : null
        if (item) {
          const specsText = this.formatSpecs(item.specs)
          const subtotal = Number(item.price || 0) * Number(item.quantity || 1)
          const withLine = Object.assign({}, item, { linePrice: subtotal })
          this.setData({ item: withLine, specsText, subtotal, total: subtotal })
        }
      }
    } catch (e) {
      console.warn('invalid item payload', e)
    }
  },

  onShow() {
    this.loadDefaultAddress()
  },

  loadDefaultAddress() {
    const list = wx.getStorageSync('user_addresses') || []
    const def = list.find(a => a && a.isDefault)
    this.setData({ address: def || null })
  },

  formatSpecs(specs) {
    if (!specs) return ''
    try {
      const labelMap = {
        size: '尺寸',
        cct: '色温',
        dimming: '调光',
        color: '颜色',
        combo: '组合',
        power: '功率',
        beam: '光束角',
        track: '轨道',
        kit: '套装',
        rail: '导轨长度',
        length: '长度',
        finish: '表面处理',
        switch: '开关',
        height: '高度',
        ip: '防护等级',
        adjust: '色温可调',
        type: '类型',
        control: '控制',
        sensor: '传感器'
      }
      const keys = Object.keys(specs)
      return keys.map(k => `${labelMap[k] || k}：${specs[k]}`).join('  ')
    } catch (e) { return '' }
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value || '' })
  },
  recalcTotal() {
    if (this.data.item) {
      const subtotal = Number(this.data.item.price || 0) * Number(this.data.item.quantity || 1)
      this.setData({ subtotal, total: subtotal, 'item.linePrice': subtotal })
      return
    }
    const items = (this.data.items || []).map(it => ({ ...it, linePrice: Number(it.price || 0) * Number(it.quantity || 1) }))
    const subtotal = items.reduce((s, it) => s + Number(it.linePrice || 0), 0)
    this.setData({ items, subtotal, total: subtotal })
  },
  incSingle(){
    if (!this.data.item) return
    const q = Math.max(1, (this.data.item.quantity || 1) + 1)
    this.setData({ 'item.quantity': q })
    this.recalcTotal()
  },
  decSingle(){
    if (!this.data.item) return
    const q = Math.max(1, (this.data.item.quantity || 1) - 1)
    this.setData({ 'item.quantity': q })
    this.recalcTotal()
  },
  incMulti(e){
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id===id ? { ...it, quantity: Math.max(1, (it.quantity||1)+1) } : it)
    this.setData({ items })
    this.recalcTotal()
  },
  decMulti(e){
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id===id ? { ...it, quantity: Math.max(1, (it.quantity||1)-1) } : it)
    this.setData({ items })
    this.recalcTotal()
  },

  onAddAddress() {
    wx.navigateTo({ url: '/pages/profile/addresses/edit' })
  },
  onManageAddress() {
    wx.navigateTo({ url: '/pages/profile/addresses/addresses?select=1' })
  },

  onSubmit() {
    if (this.data.submitting || this._submitting) return
    const { address, item, items, note, total } = this.data
    if (!address) { wx.showToast({ title: '请先添加收货地址', icon: 'none' }); return }
    const hasItems = !!item || (Array.isArray(items) && items.length>0)
    if (!hasItems) { wx.showToast({ title: '商品信息缺失', icon: 'none' }); return }

    const orderId = `${Date.now()}`
    this._submitting = true
    this.setData({ submitting:true })
    const orderItems = item ? [item] : items

    // 同步到云数据库（电子商城订单：goods + requests）
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        const addressText = formatAddressText(address)
        const Orders = api.getOrdersRepo(db)
        const Requests = api.getRequestsRepo(db)
        
        // 创建订单记录
        const orderParams = {
          items: (orderItems||[]).map(it=>({ id: it.id, name: it.title||it.name||'', specs: it.specs||{}, quantity: Number(it.quantity||1), amount: Number(it.price||0) })),
          totalAmount: Number(total||0),
          address: address,
          addressText: addressText,
          note: note || ''
        }
        
        util.callCf('orders_create', { order: {
          type: 'goods',
          orderNo: orderId,
          category: 'mall',
          params: orderParams,
          status: 'pending',
          paid: false,
          userId
        } }).catch(()=>{})
        
        // 创建需求记录
        util.callCf('requests_create', { request: {
          orderNo: orderId,
          category: 'mall',
          params: orderParams,
          userId,
          status: 'pending'
        } }).catch(err => {
          const msg = (err && (err.errMsg || err.message)) || ''
          if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
            if (wx.cloud && wx.cloud.callFunction) {
              wx.cloud.callFunction({ name: 'initCollections' }).then(() => {
                util.callCf('requests_create', { request: { orderNo: orderId, category: 'mall', params: orderParams, userId, status: 'pending' } }).catch(()=>{})
              }).catch(()=>{})
            }
          } else {
            console.warn('云端创建需求失败（goods）', err)
          }
        })
      }
    }catch(err){ console.warn('云端下单失败（goods）', err) }

    // 模拟预下单 + 支付
    wx.showLoading({ title: '正在发起支付', mask: true })
    setTimeout(() => {
      wx.hideLoading()
      const paySuccess = true
      // 更新订单状态
      
      
      // 支付成功后清空购物车中已购买的商品（本地购物车）
      if (paySuccess) {
        try {
          const cartItems = wx.getStorageSync('cartItems') || []
          // 获取已购买商品的 ID 列表
          const purchasedIds = (orderItems || []).map(it => it.id)
          // 从购物车中移除已购买的商品
          const remainingItems = cartItems.filter(cartItem => {
            // 检查购物车商品是否在已购买列表中
            return !purchasedIds.includes(cartItem.id)
          })
          wx.setStorageSync('cartItems', remainingItems)
        } catch (err) {
          console.warn('清空购物车失败', err)
        }
      }
      
      // 同步支付状态到云（orders + requests）
      try{
        const updateData = { status: paySuccess ? 'paid' : 'failed', paid: !!paySuccess }
        if (paySuccess) { updateData.paidAt = Date.now() }
        util.callCf('orders_update', { orderNo: orderId, patch: updateData }).catch(()=>{})
        util.callCf('requests_update', { orderNo: orderId, patch: updateData }).catch(()=>{})
      }catch(err){ }
      wx.redirectTo({ url: `/pages/order/result/result?success=${paySuccess ? 1 : 0}&amount=${total}&orderId=${orderId}` })
      this._submitting = false
      this.setData({ submitting:false })
    }, 1000)
  }
})

function formatAddressText(addr){
  try{
    if(!addr) return ''
    const region = Array.isArray(addr.region) ? addr.region.join(' ') : (addr.region || '')
    const parts = [region, addr.town||addr.street||'', addr.detail||addr.address||''].filter(Boolean)
    return parts.join(' ')
  }catch(e){ return '' }
}
