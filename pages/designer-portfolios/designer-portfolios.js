// 前端 tab → 后端 spaceType 映射
const TAB_MAP = {
  '全部': null,
  '住宅': '住宅',
  '商业': '商业',
  '办公': '办公',
  '艺术装置': '艺术装置',
  '景观': '景观'
};

Page({
  data: {
    currentTab: '全部',
    filteredPortfolios: [],
    loading: false,
    page: 1,
    hasMore: true
  },

  onLoad(options) {
    this.loadPortfolios();
  },

  onShow() {
    // 添加作品后返回需要刷新
    this.loadPortfolios();
  },

  // 从云函数加载作品数据
  loadPortfolios(reset) {
    const tab = this.data.currentTab;
    const spaceType = TAB_MAP[tab];
    const page = reset ? 1 : this.data.page;

    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'designer_portfolios',
      data: { action: 'list', page, pageSize: 20, spaceType },
      success: (res) => {
        this.setData({ loading: false });
        if (res.result && res.result.success) {
          const { list, hasMore } = res.result.data;
          this.setData({
            filteredPortfolios: list || [],
            page,
            hasMore: !!hasMore
          });
        } else {
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ loading: false });
        console.error('[designer-portfolios] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 标签点击切换（切换时重新从后端获取）
  onTabClick(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    this.setData({ currentTab: tab, filteredPortfolios: [], page: 1 });
    this.loadPortfolios(true);
  },

  // 长按删除作品
  onPortfolioLongPress(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除作品',
      content: `确定删除「${title}」吗？`,
      confirmColor: '#ff3b30',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        wx.cloud.callFunction({
          name: 'designer_portfolios',
          data: { action: 'delete', portfolioId: id },
          success: (r) => {
            wx.hideLoading();
            if (r.result && r.result.success) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadPortfolios(true);
            } else {
              wx.showToast({ title: r.result ? r.result.message : '删除失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      }
    });
  },

  // 点击作品进入详情
  onPortfolioDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: '作品详情开发中', icon: 'none' });
  }
});
