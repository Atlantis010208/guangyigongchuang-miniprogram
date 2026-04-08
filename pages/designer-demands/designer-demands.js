// 分类名称 → spaceType 映射
const CATEGORY_SPACE_MAP = {
  '全部': null,
  '住宅': '住宅',
  '商铺': '商业',
  '办公室': '办公',
  '其他': 'other'
};

Page({
  data: {
    categories: ['全部', '住宅', '商铺', '办公室', '其他'],
    currentCategory: 0,
    demands: [],
    loading: false,
    page: 1,
    hasMore: true,
    newCount: 0,
    showNewTip: false
  },

  _pollTimer: null,
  _lastTotal: 0,

  onLoad(options) {
    this.loadDemands(true);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadDemands(true);
    this._startPolling();
  },

  onHide() {
    this._stopPolling();
  },

  onUnload() {
    this._stopPolling();
  },

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      this._checkNewDemands();
    }, 15000);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  _checkNewDemands() {
    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action: 'count' },
      success: (res) => {
        if (res.result && res.result.success) {
          const total = res.result.data.total || 0;
          if (this._lastTotal > 0 && total > this._lastTotal) {
            const diff = total - this._lastTotal;
            this.setData({ newCount: diff, showNewTip: true });
          }
        }
      }
    });
  },

  onTapNewTip() {
    this.setData({ showNewTip: false, newCount: 0 });
    this.loadDemands(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadDemands(false);
    }
  },

  /**
   * 加载需求列表
   */
  loadDemands(reset) {
    const { categories, currentCategory } = this.data;
    const categoryName = categories[currentCategory];
    const spaceType = CATEGORY_SPACE_MAP[categoryName] || null;
    const page = reset ? 1 : this.data.page + 1;

    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action: 'list', page, pageSize: 20, spaceType },
      success: (res) => {
        this.setData({ loading: false });
        if (res.result && res.result.success) {
          const { list, hasMore, total } = res.result.data;
          if (reset && total !== undefined) {
            this._lastTotal = total;
          }
          this.setData({
            demands: reset ? (list || []) : [...this.data.demands, ...(list || [])],
            page,
            hasMore: !!hasMore,
            showNewTip: false,
            newCount: 0
          });
        } else {
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ loading: false });
        console.error('[designer-demands] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 切换分类
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentCategory: index, demands: [], page: 1 });
    this.loadDemands(true);
  },

  // 查看详情
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}`
    });
  },

  // 列表页快速接单
  onAcceptInList(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '灯光设计需求';
    if (!id) return;

    wx.showModal({
      title: '抢单确认',
      content: `确认要承接「${title}」吗？承接后需尽快与业主联系。`,
      confirmText: '立即抢单',
      confirmColor: '#111827',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        wx.cloud.callFunction({
          name: 'designer_demands',
          data: { action: 'accept', requestId: id },
          success: (r) => {
            wx.hideLoading();
            if (r.result && r.result.success) {
              wx.navigateTo({
                url: `/pages/designer-order-success/designer-order-success?projectName=${encodeURIComponent(title)}`
              });
            } else {
              const code = r.result ? r.result.code : '';
              const msg = r.result ? r.result.message : '抢单失败';
              if (code === 'ALREADY_TAKEN') {
                wx.showModal({
                  title: '手慢了',
                  content: '该需求已被其他设计师接单',
                  showCancel: false,
                  success: () => this.loadDemands(true)
                });
              } else if (code === 'ALREADY_MINE') {
                wx.showToast({ title: '您已接过此单', icon: 'none' });
              } else {
                wx.showModal({ title: '抢单失败', content: msg, showCancel: false });
              }
            }
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('[designer-demands] 抢单失败:', err);
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      }
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadDemands(true);
    wx.stopPullDownRefresh();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({
      delta: 1
    });
  }
});
