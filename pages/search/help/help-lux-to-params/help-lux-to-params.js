Page({
  data: {
    videoUrl: '', // 视频地址，从云端配置获取
    videoLoading: true, // 视频加载状态
    showFab: false
  },

  onLoad() {
    this.loadHelpVideo()
  },

  /**
   * 从云端获取帮助视频配置
   */
  async loadHelpVideo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin_calc_config',
        data: { action: 'get_help_video' }
      })
      
      if (res.result?.success && res.result?.data) {
        const videoUrl = res.result.data.quantity || ''
        this.setData({ 
          videoUrl,
          videoLoading: false
        })
      } else {
        console.warn('[help-lux-to-params] 获取视频配置失败:', res.result)
        this.setData({ videoLoading: false })
      }
    } catch (err) {
      console.error('[help-lux-to-params] 获取视频配置出错:', err)
      this.setData({ videoLoading: false })
    }
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
      title: '按照度算参数 · 详细使用说明',
      path: '/pages/search/help/help-lux-to-params/help-lux-to-params'
    }
  }
})
