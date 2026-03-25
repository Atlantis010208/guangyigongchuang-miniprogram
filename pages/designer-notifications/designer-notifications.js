Page({
  data: {
    notifyNewDemand: true,
    notifyOrderProgress: true,
    notifySystem: false,
    dndMode: false
  },

  onLoad(options) {
    // 这里可以从后端获取真实的通知设置状态
  },

  onChangeNewDemand(e) {
    this.setData({
      notifyNewDemand: e.detail
    });
    // 保存设置请求
  },

  onChangeOrderProgress(e) {
    this.setData({
      notifyOrderProgress: e.detail
    });
    // 保存设置请求
  },

  onChangeSystem(e) {
    this.setData({
      notifySystem: e.detail
    });
    // 保存设置请求
  },

  onChangeDnd(e) {
    this.setData({
      dndMode: e.detail
    });
    // 保存设置请求
  }
});
