const app = getApp();

Page({
  data: {
    maskedPhone: '',
    wechatBound: '',
    realNameVerified: ''
  },

  onLoad(options) {
    this.loadSecurityInfo();
  },

  // 加载账号安全信息
  loadSecurityInfo() {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'designer_settings',
      data: { action: 'get_security_info' },
      success: (res) => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          const d = res.result.data;
          this.setData({
            maskedPhone: d.maskedPhone,
            wechatBound: d.wechatBound,
            realNameVerified: d.realNameVerified
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[designer-security] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});
