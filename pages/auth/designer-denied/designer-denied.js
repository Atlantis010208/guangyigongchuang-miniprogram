Page({
  data: {
    phoneNumber: '177-2811-7703',
    wechatId: 'kevin55819'
  },

  onLoad() {
    // 可以在这里从云端或全局配置获取联系方式
  },

  makePhoneCall() {
    wx.makePhoneCall({
      phoneNumber: this.data.phoneNumber,
      fail: (err) => {
        console.warn('拨打电话失败', err)
      }
    })
  },

  copyWechat() {
    wx.setClipboardData({
      data: this.data.wechatId,
      success: () => {
        wx.showToast({
          title: '微信号已复制',
          icon: 'success'
        })
      }
    })
  },

  contactAdmin() {
    wx.showActionSheet({
      title: '联系管理员',
      itemList: ['拨打客服电话', '复制客服微信号'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.makePhoneCall()
        } else if (res.tapIndex === 1) {
          this.copyWechat()
        }
      }
    })
  },

  switchIdentity() {
    // 跳转回身份选择页并清除所有页面栈
    wx.reLaunch({
      url: '/pages/identity/identity'
    })
  }
})
