// pages/order/result/result.js
Page({
  data: {
    success: false,
    amount: 0,
    orderId: ''
  },

  onLoad(query) {
    const success = query && String(query.success) === '1'
    const amount = Number(query && query.amount) || 0
    const orderId = (query && query.orderId) || ''
    this.setData({ success, amount, orderId })
  },

  goOrders() {
    wx.switchTab({ url: '/pages/cart/cart' })
  },
  goHome() {
    wx.switchTab({ url: '/pages/products/products' })
  }
})



