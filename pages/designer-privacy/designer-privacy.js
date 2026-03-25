Page({
  data: {
    publicPortfolio: true,
    allowConsult: true,
    showRating: false
  },

  onLoad(options) {
    // 这里可以从后端获取真实的隐私设置状态
  },

  onChangePortfolio(e) {
    this.setData({
      publicPortfolio: e.detail
    });
    // 可以在这里调用接口保存状态
  },

  onChangeConsult(e) {
    this.setData({
      allowConsult: e.detail
    });
    // 可以在这里调用接口保存状态
  },

  onChangeRating(e) {
    this.setData({
      showRating: e.detail
    });
    // 可以在这里调用接口保存状态
  }
});
