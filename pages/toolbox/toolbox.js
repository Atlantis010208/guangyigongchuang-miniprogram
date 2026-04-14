// pages/toolbox/toolbox.js
const DEFAULT_GALLERY_COVER = 'https://picsum.photos/seed/luxuryinterior/800/800'

Page({
  data: {
    galleryCover: '',
    coverLoaded: false
  },

  onLoad: function (options) {
    this.loadGalleryCover()
  },

  onPullDownRefresh: function () {
    this.loadGalleryCover()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 800)
  },

  onShow: function () {
    // 切换自定义 tabBar 的激活状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3 // 0:首页 1:商城 2:课程 3:工具 4:订单
      })
    }
  },

  navigateToSearch: function() {
    wx.navigateTo({
      url: '/pages/search/search'
    })
  },

  navigateToGallery: function() {
    wx.navigateTo({
      url: '/pages/gallery/gallery'
    })
  },

  navigateToComingSoon: function() {
    wx.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none',
      duration: 2000
    })
  },

  navigateToColorTemp: function () {
    wx.navigateTo({
      url: '/pages/color-temp/color-temp'
    })
  },

  loadGalleryCover: function () {
    wx.cloud.callFunction({
      name: 'gallery_list',
      data: { action: 'getCover' }
    }).then(res => {
      const result = res.result
      if (result && result.success && result.data && result.data.coverUrl) {
        this.setData({ galleryCover: result.data.coverUrl, coverLoaded: true })
      } else {
        this.setData({ galleryCover: DEFAULT_GALLERY_COVER, coverLoaded: true })
      }
    }).catch(err => {
      console.warn('[toolbox] 加载图库封面图失败:', err)
      this.setData({ galleryCover: DEFAULT_GALLERY_COVER, coverLoaded: true })
    })
  }
})
