Page({
  data: {
    publicPortfolio: true,
    allowConsult: true,
    showRating: false
  },

  onLoad(options) {
    this.loadPrivacySettings();
  },

  // 加载隐私设置
  loadPrivacySettings() {
    wx.cloud.callFunction({
      name: 'designer_settings',
      data: { action: 'get_privacy' },
      success: (res) => {
        if (res.result && res.result.success) {
          const s = res.result.data;
          this.setData({
            publicPortfolio: s.publicPortfolio !== undefined ? s.publicPortfolio : true,
            allowConsult: s.allowConsult !== undefined ? s.allowConsult : true,
            showRating: s.showRating !== undefined ? s.showRating : false
          });
        }
      },
      fail: (err) => {
        console.error('[designer-privacy] 加载失败:', err);
      }
    });
  },

  // 通用保存单个隐私设置
  savePrivacySetting(key, value, rollbackValue) {
    wx.cloud.callFunction({
      name: 'designer_settings',
      data: { action: 'update_privacy', settings: { [key]: value } },
      success: (res) => {
        if (!res.result || !res.result.success) {
          this.setData({ [key]: rollbackValue });
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[designer-privacy] 保存失败:', err);
        this.setData({ [key]: rollbackValue });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  onChangePortfolio(e) {
    const prev = this.data.publicPortfolio;
    this.setData({ publicPortfolio: e.detail });
    this.savePrivacySetting('publicPortfolio', e.detail, prev);
  },

  onChangeConsult(e) {
    const prev = this.data.allowConsult;
    this.setData({ allowConsult: e.detail });
    this.savePrivacySetting('allowConsult', e.detail, prev);
  },

  onChangeRating(e) {
    const prev = this.data.showRating;
    this.setData({ showRating: e.detail });
    this.savePrivacySetting('showRating', e.detail, prev);
  }
});
