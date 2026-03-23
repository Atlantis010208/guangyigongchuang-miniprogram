Page({
  data: {
    tabs: [
      { name: '全部', value: 'all' },
      { name: '进行中', value: 'ongoing' },
      { name: '待确认', value: 'pending' },
      { name: '已完成', value: 'completed' }
    ],
    currentTab: 0,
  },

  onLoad(options) {
    wx.hideHomeButton();
  },

  onShow() {
    // 更新自定义 tabBar 的选中状态和角色
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 1 })
    }
  },

  // 切换标签
  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index
    });
  }
});
