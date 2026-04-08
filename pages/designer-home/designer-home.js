Page({
  data: {
    categories: ['全部', '住宅', '商业', '办公', '户外'],
    currentCategory: 0,
    showFilter: false, // 控制筛选弹窗显示
    user: { avatar: '' },
    userAvatarDisplay: '', // 用于显示的头像临时链接
    userAvatarFileID: '', // 原始 cloud:// fileID
    demands: [], // 需求列表数据
    newCount: 0,
    showNewTip: false
  },

  _pollTimer: null,
  _lastTotal: 0,

  onLoad(options) {
    // 隐藏返回首页按钮，因为这是设计师的首页
    wx.hideHomeButton();
    this.loadDemands();
  },

  onShow() {
    // 更新自定义 tabBar 的选中状态和角色
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 0 })
    }
    
    // 获取用户数据
    this.loadUserData();
    // 刷新需求列表
    this.loadDemands();
    // 启动轮询
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
    this.loadDemands();
  },

  onPullDownRefresh() {
    this.loadDemands();
    this.loadUserData();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载需求列表数据（首页展示最新3条）
   */
  loadDemands() {
    const categories = this.data.categories;
    const idx = this.data.currentCategory;
    const spaceType = (idx === 0) ? null : categories[idx];

    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action: 'list', page: 1, pageSize: 3, spaceType },
      success: (res) => {
        if (res.result && res.result.success) {
          const total = res.result.data.total;
          if (total !== undefined) {
            this._lastTotal = total;
          }
          this.setData({ demands: res.result.data.list || [], showNewTip: false, newCount: 0 });
        } else {
          console.warn('[designer-home] 加载需求失败:', res.result && res.result.message);
        }
      },
      fail: (err) => {
        console.error('[designer-home] 加载需求失败:', err);
      }
    });
  },

  /**
   * 加载用户数据
   */
  async loadUserData() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      this.setData({
        user: { avatar: '' },
        userAvatarDisplay: ''
      });
      return;
    }

    try {
      const cachedDoc = wx.getStorageSync('userDoc') || {};
      const userId = cachedDoc && cachedDoc._id ? cachedDoc._id : '';
      const openid = wx.getStorageSync('openid') || '';
      
      if (!wx.cloud || (!userId && !openid)) {
        this.loadFromLocalStorage();
        return;
      }

      const db = wx.cloud.database();
      let doc = null;

      if (userId) {
        try {
          const d = await db.collection('users').doc(userId).get();
          doc = d && d.data;
        } catch (e) {}
      }

      if (!doc && openid) {
        try {
          const q = await db.collection('users').where({ _openid: openid }).limit(1).get();
          doc = (q && q.data && q.data[0]) || null;
        } catch (e) {}
      }

      if (doc) {
        wx.setStorageSync('userDoc', doc);
        this.setData({
          user: { avatar: doc.avatarUrl || '' }
        });
        if (doc.avatarUrl) {
          await this.convertAvatarUrl(doc.avatarUrl);
        }
      } else {
        this.loadFromLocalStorage();
      }
    } catch (err) {
      console.error('加载用户信息失败', err);
      this.loadFromLocalStorage();
    }
  },

  /**
   * 从本地存储加载用户信息
   */
  async loadFromLocalStorage() {
    const local = wx.getStorageSync('user_profile') || {};
    const cachedDoc = wx.getStorageSync('userDoc') || {};
    const avatarUrl = local.avatar || cachedDoc.avatarUrl || '';
    
    this.setData({
      user: { avatar: avatarUrl }
    });

    if (avatarUrl) {
      await this.convertAvatarUrl(avatarUrl);
    }
  },

  /**
   * 转换头像 URL
   */
  async convertAvatarUrl(avatarUrl) {
    if (!avatarUrl) {
      this.setData({ userAvatarDisplay: '', userAvatarFileID: '' });
      return;
    }

    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] });
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ 
            userAvatarDisplay: res.fileList[0].tempFileURL,
            userAvatarFileID: avatarUrl 
          });
        } else {
          this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl });
        }
      } catch (e) {
        this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl });
      }
    } else {
      this.setData({ userAvatarDisplay: avatarUrl, userAvatarFileID: '' });
    }
  },

  /**
   * 头像加载失败时的处理
   */
  async onAvatarError() {
    const { userAvatarFileID } = this.data;
    if (userAvatarFileID && userAvatarFileID.startsWith('cloud://') && wx.cloud) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [userAvatarFileID] });
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ userAvatarDisplay: res.fileList[0].tempFileURL });
          return;
        }
      } catch (e) {}
    }
    this.setData({ userAvatarDisplay: '' });
  },

  /**
   * 跳转到个人中心
   */
  goToProfile() {
    wx.navigateTo({
      url: '/pages/designer-profile/designer-profile'
    });
  },

  // 切换分类
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentCategory: index
    });
    this.loadDemands();
  },

  // 显示筛选弹窗
  goToFilter() {
    this.setData({
      showFilter: true
    });
    // 隐藏 tabBar 避免遮挡弹窗
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: false });
    }
  },

  // 关闭筛选弹窗
  onCloseFilter() {
    this.setData({
      showFilter: false
    });
    // 恢复 tabBar 显示
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: true });
    }
  },

  // 确认筛选条件
  onConfirmFilter(e) {
    const filters = e.detail;
    console.log('接收到筛选条件:', filters);
    // 恢复 tabBar 显示
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ show: true });
    }
    // TODO: 根据筛选条件重新加载需求列表
    wx.showToast({
      title: '已应用筛选',
      icon: 'success'
    });
  },

  // 查看全部需求
  viewAllDemands() {
    wx.navigateTo({
      url: '/pages/designer-demands/designer-demands'
    });
  },

  // 查看需求详情
  onViewDemand(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}`
    });
  },

/**
 * 头像加载失败时的处理
 */
async onAvatarError() {
  const { userAvatarFileID } = this.data;
  if (userAvatarFileID && userAvatarFileID.startsWith('cloud://') && wx.cloud) {
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [userAvatarFileID] });
      if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
        this.setData({ userAvatarDisplay: res.fileList[0].tempFileURL });
        return;
      }
    } catch (e) {}
  }
  this.setData({ userAvatarDisplay: '' });
},

/**
 * 跳转到个人中心
 */
goToProfile() {
  wx.navigateTo({
    url: '/pages/designer-profile/designer-profile'
  });
},

// 切换分类
switchCategory(e) {
  const index = e.currentTarget.dataset.index;
  this.setData({
    currentCategory: index
  });
},

// 显示筛选弹窗
goToFilter() {
  this.setData({
    showFilter: true
  });
  // 隐藏 tabBar 避免遮挡弹窗
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    this.getTabBar().setData({ show: false });
  }
},

// 关闭筛选弹窗
onCloseFilter() {
  this.setData({
    showFilter: false
  });
  // 恢复 tabBar 显示
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    this.getTabBar().setData({ show: true });
  }
},

// 确认筛选条件
onConfirmFilter(e) {
  const filters = e.detail;
  console.log('接收到筛选条件:', filters);
  // 恢复 tabBar 显示
  if (typeof this.getTabBar === 'function' && this.getTabBar()) {
    this.getTabBar().setData({ show: true });
  }
  // TODO: 根据筛选条件重新加载需求列表
  wx.showToast({
    title: '已应用筛选',
    icon: 'success'
  });
},

// 查看全部需求
viewAllDemands() {
  wx.navigateTo({
    url: '/pages/designer-demands/designer-demands'
  });
},

// 查看需求详情
onViewDemand(e) {
  const id = e.currentTarget.dataset.id;
  wx.navigateTo({
    url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}`
  });
},

// 立即接单
acceptOrder(e) {
  const id = e.currentTarget.dataset.id;
  if (!id) return;
  const demands = this.data.demands || [];
  const demand = demands.find(d => d._id === id);
  const title = (demand && demand.title) || '灯光设计需求';

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
                success: () => this.loadDemands()
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
          console.error('[designer-home] 抢单失败:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    }
  });
},
});
