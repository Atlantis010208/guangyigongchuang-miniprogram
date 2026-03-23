Page({
  data: {
    categories: ['全部', '住宅', '商业', '办公', '户外', '景观'],
    currentCategory: 0,
  },

  onLoad(options) {
    // 页面加载时的逻辑
  },

  // 切换分类
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentCategory: index
    });
  },

  // 查看详情
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}`
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      delta: 1
    });
  }
});
