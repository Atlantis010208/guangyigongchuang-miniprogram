// pages/order/confirm/confirm.js
/**
 * 订单确认页
 * 功能：展示订单信息、收货地址，调用微信支付完成支付
 */
const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    address: null,
    addressText: '', // 预处理的地址文本
    item: null,
    items: null,
    specsText: '',
    subtotal: 0,
    total: 0,
    note: '',
    submitting: false,
    // 支付相关
    orderNo: '',           // 当前订单号
    paymentStatus: ''      // 支付状态: '' | 'paying' | 'success' | 'failed' | 'cancelled'
  },

  onLoad(query) {
    try {
      // 检查是否是重新支付（从订单列表进入）
      if (query && query.orderNo) {
        this.loadOrderForRepay(query.orderNo)
        return
      }

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

  /**
   * 加载订单信息用于重新支付
   */
  async loadOrderForRepay(orderNo) {
    wx.showLoading({ title: '加载订单...', mask: true })
    try {
      const res = await util.callCf('mall_orders_list', { orderNo })
      if (res && res.success && res.data && res.data.length > 0) {
        const order = res.data[0]
        const items = (order.params && order.params.items) || []
        const itemsWithLine = items.map(it => ({ 
          ...it, 
          linePrice: Number(it.amount || it.price || 0) * Number(it.quantity || 1) 
        }))
        const subtotal = itemsWithLine.reduce((s, it) => s + Number(it.linePrice || 0), 0)
        
        this.setData({
          orderNo: order.orderNo,
          items: itemsWithLine.length > 1 ? itemsWithLine : null,
          item: itemsWithLine.length === 1 ? itemsWithLine[0] : null,
          address: order.params && order.params.address,
          addressText: order.params && order.params.addressText,
          note: order.params && order.params.note,
          subtotal,
          total: order.params && order.params.totalAmount || subtotal
        })
      } else {
        wx.showToast({ title: '订单不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (err) {
      console.error('加载订单失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  loadDefaultAddress() {
    const list = wx.getStorageSync('user_addresses') || []
    const def = list.find(a => a && a.isDefault)
    // 预处理地址文本，因为 WXML 中无法调用数组的 join 方法
    let addressText = ''
    if (def) {
      if (def.full) {
        addressText = def.full
      } else {
        const regionStr = Array.isArray(def.region) ? def.region.join(' ') : ''
        addressText = [regionStr, def.town || '', def.detail || ''].filter(Boolean).join(' ')
      }
    }
    this.setData({ address: def || null, addressText: addressText })
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

  incSingle() {
    if (!this.data.item) return
    const q = Math.max(1, (this.data.item.quantity || 1) + 1)
    this.setData({ 'item.quantity': q })
    this.recalcTotal()
  },

  decSingle() {
    if (!this.data.item) return
    const q = Math.max(1, (this.data.item.quantity || 1) - 1)
    this.setData({ 'item.quantity': q })
    this.recalcTotal()
  },

  incMulti(e) {
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id === id ? { ...it, quantity: Math.max(1, (it.quantity || 1) + 1) } : it)
    this.setData({ items })
    this.recalcTotal()
  },

  decMulti(e) {
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id === id ? { ...it, quantity: Math.max(1, (it.quantity || 1) - 1) } : it)
    this.setData({ items })
    this.recalcTotal()
  },

  onAddAddress() {
    wx.navigateTo({ url: '/pages/profile/addresses/edit' })
  },

  onManageAddress() {
    wx.navigateTo({ url: '/pages/profile/addresses/addresses?select=1' })
  },

  /**
   * 提交订单并发起支付
   */
  async onSubmit() {
    if (this.data.submitting || this._submitting) return
    
    const { address, item, items, note, total, orderNo: existingOrderNo } = this.data
    
    // 验证收货地址
    if (!address) {
      wx.showToast({ title: '请先添加收货地址', icon: 'none' })
      return
    }
    
    // 验证商品信息
    const hasItems = !!item || (Array.isArray(items) && items.length > 0)
    if (!hasItems) {
      wx.showToast({ title: '商品信息缺失', icon: 'none' })
      return
    }

    this._submitting = true
    this.setData({ submitting: true, paymentStatus: 'paying' })

    const orderItems = item ? [item] : items
    
    // 如果是重新支付，使用现有订单号
    let orderId = existingOrderNo
    
    try {
      // 如果没有现有订单号，创建新订单
      if (!orderId) {
        orderId = await this.createOrder(orderItems, address, note, total)
        if (!orderId) {
          throw new Error('创建订单失败')
        }
        this.setData({ orderNo: orderId })
      }

      // 发起微信支付
      await this.initiatePayment(orderId, total, orderItems)
      
    } catch (err) {
      console.error('提交订单失败:', err)
      this.setData({ paymentStatus: 'failed' })
      wx.showToast({
        title: err.message || '支付失败，请重试',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this._submitting = false
      this.setData({ submitting: false })
    }
  },

  /**
   * 创建订单到云数据库
   */
  async createOrder(orderItems, address, note, total) {
    const orderId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const addressText = formatAddressText(address)
    
    const userDoc = wx.getStorageSync('userDoc') || {}
    const userId = (userDoc && userDoc._id) ? userDoc._id : null
    
    // 判断订单分类：根据商品的 category 字段判断
    // toolkit - 工具包，course - 课程，其他 - 普通商品(mall)
    const firstItem = orderItems && orderItems[0]
    let orderCategory = 'mall'  // 默认为普通商品
    if (firstItem && firstItem.category) {
      // 如果商品有 category 字段，使用商品的分类
      if (firstItem.category === 'toolkit' || firstItem.category === 'course') {
        orderCategory = firstItem.category
      }
    }
    
    const orderParams = {
      items: (orderItems || []).map(it => ({
        id: it.id,
        name: it.title || it.name || '',
        specs: it.specs || {},
        quantity: Number(it.quantity || 1),
        amount: Number(it.price || 0),
        image: it.image || it.img || it.thumb || it.cover || '',  // 保存商品图片
        category: it.category || ''  // 保留商品分类信息
      })),
      totalAmount: Number(total || 0),
      address: address,
      addressText: addressText,
      note: note || ''
    }
    
    // 创建订单（状态为待支付）
    const res = await util.callCf('orders_create', {
      order: {
        type: 'goods',
        orderNo: orderId,
        category: orderCategory,  // 使用商品实际分类
        params: orderParams,
        status: 'pending_payment',  // 待支付状态
        paid: false,
        userId
      }
    })
    
    if (!res || !res.success) {
      console.error('创建订单云函数返回失败:', res)
      throw new Error(res?.message || '创建订单失败')
    }
    
    // 同步创建需求记录
    util.callCf('requests_create', {
      request: {
        orderNo: orderId,
        category: 'mall',
        params: orderParams,
        userId,
        status: 'pending_payment'
      }
    }).catch(err => {
      console.warn('创建需求记录失败（非致命）:', err)
    })
    
    console.log('订单创建成功:', orderId)
    return orderId
  },

  /**
   * 发起微信支付
   */
  async initiatePayment(orderId, total, orderItems) {
    wx.showLoading({ title: '正在发起支付...', mask: true })
    
    try {
      // 生成商品描述
      const firstItemName = orderItems[0]?.name || orderItems[0]?.title || '商品'
      const description = orderItems.length > 1 
        ? `${firstItemName} 等${orderItems.length}件商品`
        : firstItemName
      
      // 调用云函数获取支付参数
      const payRes = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'wxpayFunctions',
          data: {
            type: 'wxpay_order',
            orderNo: orderId,
            totalAmount: Number(total),
            description: `光乙共创平台-${description}`
          },
          success: res => resolve(res.result),
          fail: err => reject(err)
        })
      })
      
      console.log('支付云函数返回:', payRes)
      
      wx.hideLoading()
      
      // 检查返回结果
      if (!payRes || payRes.code !== 0 || !payRes.data) {
        const errMsg = payRes?.message || '获取支付参数失败'
        console.error('获取支付参数失败:', payRes)
        throw new Error(errMsg)
      }
      
      const paymentData = payRes.data
      
      // 唤起微信支付组件
      const payResult = await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: paymentData.timeStamp,
          nonceStr: paymentData.nonceStr,
          package: paymentData.packageVal,
          signType: paymentData.signType || 'RSA',
          paySign: paymentData.paySign,
          success: res => resolve({ success: true, result: res }),
          fail: err => resolve({ success: false, error: err })
        })
      })
      
      if (payResult.success) {
        // 支付成功
        console.log('支付成功:', payResult.result)
        this.handlePaymentSuccess(orderId, total, orderItems)
      } else {
        // 支付失败或取消
        const error = payResult.error
        console.log('支付失败或取消:', error)
        
        // 判断是用户取消还是其他错误
        const isCancelled = error.errMsg && (
          error.errMsg.includes('cancel') || 
          error.errMsg.includes('fail cancel')
        )
        
        if (isCancelled) {
          this.handlePaymentCancelled(orderId, total)
        } else {
          this.handlePaymentFailed(orderId, error)
        }
      }
      
    } catch (err) {
      wx.hideLoading()
      throw err
    }
  },

  /**
   * 处理支付成功
   * 兜底机制：主动查询微信支付状态并同步订单
   */
  async handlePaymentSuccess(orderId, total, orderItems) {
    this.setData({ paymentStatus: 'success' })
    
    // 清空购物车中已购买的商品
    this.clearPurchasedItems(orderItems)
    
    // 兜底机制：主动调用查询接口同步订单状态
    // 这样即使回调失败，订单状态也能正确更新
    try {
      console.log('主动查询支付状态，同步订单:', orderId)
      const queryRes = await new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'wxpayFunctions',
          data: {
            type: 'wxpay_query_order_by_out_trade_no',
            orderNo: orderId,
            syncStatus: true  // 同步更新本地订单状态
          },
          success: res => resolve(res.result),
          fail: err => reject(err)
        })
      })
      console.log('支付状态查询结果:', queryRes)
    } catch (err) {
      // 查询失败不影响用户体验，回调会处理
      console.warn('主动查询支付状态失败（回调会处理）:', err)
    }
    
    // 跳转到支付成功页面
    wx.redirectTo({
      url: `/pages/order/result/result?success=1&amount=${total}&orderId=${orderId}`
    })
  },

  /**
   * 处理支付取消
   */
  handlePaymentCancelled(orderId, total) {
    this.setData({ paymentStatus: 'cancelled' })
    
    wx.showModal({
      title: '支付未完成',
      content: '订单已保存，您可以稍后在"我的订单"中继续支付',
      confirmText: '查看订单',
      cancelText: '继续购物',
      success: (res) => {
        if (res.confirm) {
          // 跳转到订单列表
          wx.redirectTo({
            url: `/pages/order/result/result?success=0&amount=${total}&orderId=${orderId}&cancelled=1`
          })
        } else {
          // 返回继续购物
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 处理支付失败
   */
  handlePaymentFailed(orderId, error) {
    this.setData({ paymentStatus: 'failed' })
    
    const errMsg = error.errMsg || '支付失败'
    console.error('支付失败:', errMsg)
    
    wx.showModal({
      title: '支付失败',
      content: `${errMsg}\n\n订单已保存，您可以稍后重试`,
      confirmText: '重试',
      cancelText: '稍后支付',
      success: (res) => {
        if (res.confirm) {
          // 重新发起支付
          this.onSubmit()
        } else {
          wx.redirectTo({
            url: `/pages/order/result/result?success=0&amount=${this.data.total}&orderId=${orderId}`
          })
        }
      }
    })
  },

  /**
   * 清空已购买商品
   */
  clearPurchasedItems(orderItems) {
    try {
      const cartItems = wx.getStorageSync('cartItems') || []
      const purchasedIds = (orderItems || []).map(it => it.id)
      const remainingItems = cartItems.filter(cartItem => !purchasedIds.includes(cartItem.id))
      wx.setStorageSync('cartItems', remainingItems)
      console.log('已清空购物车中已购买的商品')
    } catch (err) {
      console.warn('清空购物车失败', err)
    }
  }
})

/**
 * 格式化地址文本
 */
function formatAddressText(addr) {
  try {
    if (!addr) return ''
    const region = Array.isArray(addr.region) ? addr.region.join(' ') : (addr.region || '')
    const parts = [region, addr.town || addr.street || '', addr.detail || addr.address || ''].filter(Boolean)
    return parts.join(' ')
  } catch (e) { return '' }
}
