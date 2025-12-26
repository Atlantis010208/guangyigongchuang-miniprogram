// pages/order/result/result.js
/**
 * 支付结果页
 * 功能：展示支付结果，支持重新支付、查看订单等操作
 */
const util = require('../../../utils/util')

Page({
  data: {
    success: false,
    amount: 0,
    orderId: '',
    cancelled: false,  // 是否是用户取消支付
    loading: false
  },

  onLoad(query) {
    const success = query && String(query.success) === '1'
    const amount = Number(query && query.amount) || 0
    const orderId = (query && query.orderId) || ''
    const cancelled = query && String(query.cancelled) === '1'
    
    this.setData({ success, amount, orderId, cancelled })
    
    // 如果支付成功，显示成功动画
    if (success) {
      util.hapticFeedback('medium')
    }
  },

  /**
   * 重新支付
   */
  async onRepay() {
    if (this.data.loading) return
    
    const { orderId, amount } = this.data
    if (!orderId) {
      wx.showToast({ title: '订单信息不完整', icon: 'none' })
      return
    }
    
    this.setData({ loading: true })
    
    try {
      // 跳转到订单确认页重新支付
      wx.redirectTo({
        url: `/pages/order/confirm/confirm?orderNo=${orderId}`
      })
    } catch (err) {
      console.error('重新支付失败:', err)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 查看订单详情
   */
  goOrderDetail() {
    const { orderId } = this.data
    if (orderId) {
      wx.navigateTo({
        url: `/pages/order/detail/detail?orderNo=${orderId}`
      })
    } else {
      this.goOrders()
    }
  },

  /**
   * 跳转到订单列表（灯光清单 - 电子商城标签）
   */
  goOrders() {
    // 跳转到 TabBar 的订单管理页面
    wx.switchTab({
      url: '/pages/cart/cart'
    })
  },

  /**
   * 返回首页继续购物
   */
  goHome() {
    wx.switchTab({ url: '/pages/products/products' })
  },

  /**
   * 返回商城
   */
  goMall() {
    wx.navigateTo({ url: '/pages/mall/mall' })
  }
})
