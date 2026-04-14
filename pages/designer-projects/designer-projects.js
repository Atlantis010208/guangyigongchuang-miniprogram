Page({
  data: {
    tabs: [
      { name: '全部', value: 'all' },
      { name: '进行中', value: 'ongoing' },
      { name: '待确认', value: 'pending' },
      { name: '已完成', value: 'completed' }
    ],
    currentTab: 0,
    projects: [],
    filteredProjects: [], // 供渲染的列表
    searchQuery: '',
    loading: false,
    refreshing: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad(options) {
    wx.hideHomeButton();
    this._scrollLowerTimer = null;
    this.loadProjects(true);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 1 })
    }
    // 返回页面时静默刷新
    this.loadProjects(true);
  },

  // 加载项目列表
  loadProjects(reset = false) {
    if (this.data.loading) return;
    if (reset) {
      this.setData({ page: 1, hasMore: true });
    } else if (!this.data.hasMore) {
      return;
    }

    const { tabs, currentTab, page, pageSize } = this.data;
    const statusFilter = tabs[currentTab].value;
    
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'designer_projects',
      data: { action: 'list', page, pageSize, statusFilter },
      success: (res) => {
        if (res.result && res.result.success) {
          const list = res.result.data.list || [];
          const newProjects = reset ? list : [...this.data.projects, ...list];
          
          // 合并为一次 setData，避免双重渲染
          const query = this.data.searchQuery.trim().toLowerCase();
          let filteredProjects = newProjects;
          if (query) {
            filteredProjects = newProjects.filter(p => {
              const titleMatch = p.title && p.title.toLowerCase().includes(query);
              const clientMatch = p.clientInfo && p.clientInfo.nickname && p.clientInfo.nickname.toLowerCase().includes(query);
              return titleMatch || clientMatch;
            });
          }

          this.setData({ 
            loading: false,
            refreshing: false,
            projects: newProjects,
            filteredProjects,
            hasMore: res.result.data.hasMore,
            page: page + 1
          });
        } else {
          this.setData({ loading: false, refreshing: false });
          console.warn('[designer-projects] 加载失败:', res.result && res.result.message);
        }
      },
      fail: (err) => {
        this.setData({ loading: false, refreshing: false });
        console.error('[designer-projects] 加载失败:', err);
      }
    });
  },

  // 切换标签
  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index, projects: [], filteredProjects: [] });
    this.loadProjects(true);
  },

  // 本地搜索过滤
  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    this.filterProjects();
  },

  filterProjects() {
    const query = this.data.searchQuery.trim().toLowerCase();
    const list = this.data.projects;
    
    if (!query) {
      this.setData({ filteredProjects: list });
      return;
    }

    const filtered = list.filter(p => {
      const titleMatch = p.title && p.title.toLowerCase().includes(query);
      const clientMatch = p.clientInfo && p.clientInfo.nickname && p.clientInfo.nickname.toLowerCase().includes(query);
      return titleMatch || clientMatch;
    });

    this.setData({ filteredProjects: filtered });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadProjects(true);
  },

  // 触底加载更多（节流防抖，避免快速滚动重复触发）
  onReachBottom() {
    if (this._scrollLowerTimer) return;
    this._scrollLowerTimer = setTimeout(() => {
      this._scrollLowerTimer = null;
    }, 500);
    this.loadProjects();
  },

  // 跳转详情页
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({
        url: `/pages/designer-project-detail/designer-project-detail?id=${id}`
      });
    }
  }
});
