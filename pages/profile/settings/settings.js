Page({
  data: {
    settings: {
      orderNotification: true,
      promotionNotification: false,
      deviceNotification: true
    },
    appVersion: 'v1.0.0'
  },

  onLoad() {
    this.loadSettings()
  },

  loadSettings() {
    const settings = wx.getStorageSync('user_settings') || {
      orderNotification: true,
      promotionNotification: false,
      deviceNotification: true
    }

    this.setData({ settings })
  },

  saveSettings() {
    wx.setStorageSync('user_settings', this.data.settings)
  },

  onOrderNotificationChange(e) {
    this.setData({
      'settings.orderNotification': e.detail.value
    })
    this.saveSettings()
  },

  onPromotionNotificationChange(e) {
    this.setData({
      'settings.promotionNotification': e.detail.value
    })
    this.saveSettings()
  },

  onDeviceNotificationChange(e) {
    this.setData({
      'settings.deviceNotification': e.detail.value
    })
    this.saveSettings()
  },

  goToAbout() {
    wx.showModal({
      title: '关于我们',
      content: '智能照明解决方案小程序\n版本：v1.0.0\n© 2024 智能照明科技有限公司',
      confirmText: '知道了',
      showCancel: false
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账户吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除用户相关数据
          wx.removeStorageSync('user_profile')
          wx.removeStorageSync('user_token')
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
          
          // 跳转到登录页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/auth/login/login'
            })
          }, 1500)
        }
      }
    })
  }
})