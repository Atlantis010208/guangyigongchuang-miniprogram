Page({
  data: {
    // 页面数据
    showFab: false
  },

  onPageScroll(e) {
    const show = e.scrollTop > 200
    if (show !== this.data.showFab) {
      this.setData({
        showFab: show
      })
    }
  },

  onLoad(options) {
    
  },

  /**
   * 回到顶部
   */
  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    })
  },

  /**
   * 跳转到按灯具算照度详情页
   */
  goToLampToLux() {
    wx.navigateTo({
      url: '/pages/search/help/help-lamp-to-lux/help-lamp-to-lux'
    })
  },

  /**
   * 跳转到按照度算数量详情页
   */
  goToLuxToCount() {
    wx.navigateTo({
      url: '/pages/search/help/help-lux-to-count/help-lux-to-count'
    })
  },

  /**
   * 跳转到按照度算参数详情页
   */
  goToLuxToParams() {
    wx.navigateTo({
      url: '/pages/search/help/help-lux-to-params/help-lux-to-params'
    })
  },

  /**
   * 加入用户交流群
   */
  onJoinGroup() {
    wx.showModal({
      title: '加入交流群',
      content: '请保存二维码或搜索微信号加入用户交流群\n(功能开发中)',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#07C160'
    })
  },

  onShareAppMessage() {
    return {
      title: '照度计算器详细说明',
      path: '/pages/search/help/help'
    }
  }
})