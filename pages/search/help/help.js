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
   * 滚动到指定章节
   */
  scrollToSection(e) {
    const target = e.currentTarget.dataset.target
    if (!target) return
    
    console.log('[help] 点击跳转到:', target)
    
    const query = wx.createSelectorQuery()
    query.select('#' + target).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      console.log('[help] 查询结果:', res)
      if (res && res[0] && res[1]) {
        const rect = res[0]
        const scrollOffset = res[1]
        const targetScrollTop = scrollOffset.scrollTop + rect.top - 20
        
        console.log('[help] 目标滚动位置:', targetScrollTop)
        
        wx.pageScrollTo({
          scrollTop: targetScrollTop,
          duration: 300
        })
      }
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