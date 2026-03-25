Page({
  data: {
    projectName: ''
  },

  onLoad(options) {
    // 隐藏自带的返回按钮，防止用户通过原生按钮返回
    wx.hideHomeButton && wx.hideHomeButton();
    
    // 获取传递过来的项目名称
    if (options.projectName) {
      this.setData({
        projectName: decodeURIComponent(options.projectName)
      });
    }
  },

  // 进入项目管理
  goToProject() {
    wx.switchTab({
      url: '/pages/designer-projects/designer-projects'
    });
  },

  // 返回需求大厅
  goBackToDemands() {
    wx.switchTab({
      url: '/pages/designer-home/designer-home'
    });
  }
});
