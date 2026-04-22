// pages/toolbox/toolbox.js
const DEFAULT_GALLERY_COVER = 'https://picsum.photos/seed/luxuryinterior/800/800'
const DEFAULT_CT_BG = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/toolbox/color-temp-bg.png'
const DEFAULT_CALC_BG = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/toolbox/calculator-bg.jpeg'

Page({
  data: {
    galleryCover: '',
    coverLoaded: false,
    ctBgImage: DEFAULT_CT_BG,
    calcBgImage: DEFAULT_CALC_BG
  },

  onLoad: function (options) {
    this.loadGalleryCover()
    this.loadCtBgImage()
  },

  onPullDownRefresh: function () {
    this.loadGalleryCover()
    this.loadCtBgImage()
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

  loadCtBgImage: function () {
    const db = wx.cloud.database()
    db.collection('color_temp_config').doc('global_config').get().then(res => {
      const data = res.data
      if (data && data.pageConfig) {
        const img = data.pageConfig.cardBgImage || data.pageConfig.bgImage
        if (img) {
          this.setData({ ctBgImage: img })
        }
      }
    }).catch(err => {
      console.warn('[toolbox] 加载色温背景图配置失败，使用默认图:', err)
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
