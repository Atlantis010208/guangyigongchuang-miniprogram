Page({
  data: {
    showFab: false
  },

  onPageScroll(e) {
    const show = e.scrollTop > 200
    if (show !== this.data.showFab) {
      this.setData({ showFab: show })
    }
  },

  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    })
  },

  onShareAppMessage() {
    return {
      title: '按灯具算照度 · 详细使用说明',
      path: '/pages/search/help/help-lamp-to-lux/help-lamp-to-lux'
    }
  }
})
