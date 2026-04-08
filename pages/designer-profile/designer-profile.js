Page({
  data: {
    user: null,
    portfolios: [],
    loading: true
  },

  onLoad(options) {
    this.loadProfile();
  },

  onShow() {
    // 每次显示时刷新（编辑后返回需更新）
    if (!this.data.loading) {
      this.loadProfile();
    }
  },

  loadProfile() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'designer_profile',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.success) {
          const designer = res.result.data;
          this.setData({ user: designer, loading: false });
          this.loadPortfolios(designer._id);
        } else {
          this.setData({ loading: false });
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ loading: false });
        console.error('[designer-profile] 加载档案失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  loadPortfolios(designerId) {
    wx.cloud.callFunction({
      name: 'designer_portfolios',
      data: { action: 'list', page: 1, pageSize: 4 },
      success: (res) => {
        if (res.result && res.result.success) {
          this.setData({ portfolios: res.result.data.list || [] });
        }
      },
      fail: (err) => {
        console.error('[designer-profile] 加载作品集失败:', err);
      }
    });
  },

  onSettings() {
    wx.navigateTo({
      url: '/pages/designer-settings/designer-settings'
    });
  },

  onEditProfile() {
    wx.navigateTo({
      url: '/pages/designer-profile-edit/designer-profile-edit'
    });
  },

  onAddPortfolio() {
    wx.navigateTo({
      url: '/pages/designer-portfolio-add/designer-portfolio-add'
    });
  },

  onViewAllPortfolios() {
    wx.navigateTo({
      url: '/pages/designer-portfolios/designer-portfolios'
    });
  },

  onPortfolioDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({
      title: '作品详情: ' + id,
      icon: 'none'
    });
  }
});
