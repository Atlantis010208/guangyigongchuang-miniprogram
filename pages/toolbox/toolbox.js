// pages/toolbox/toolbox.js
Page({
  data: {
    
  },

  onLoad: function (options) {

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
  }
})
