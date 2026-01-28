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
      title: '按照度算数量 · 详细使用说明',
      path: '/pages/search/help/help-lux-to-count/help-lux-to-count'
    }
  }
})
