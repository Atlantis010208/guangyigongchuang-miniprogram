Page({
  data: {
    categories: ['全部', '住宅', '商业', '办公', '户外'],
    currentCategory: 0,
    showFilter: false, // 控制筛选弹窗显示
    user: { avatar: '' },
    userAvatarDisplay: '', // 用于显示的头像临时链接
    userAvatarFileID: '', // 原始 cloud:// fileID
    demands: [] // 需求列表数据
  },

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
  },

  /**
   * 加载需求列表数据（目前使用 mock，结构与真实数据一致）
   */
  loadDemands() {
    // TODO: 后续联调时，替换为真实的云端请求： db.collection('requests').where({ category: 'publish', status: 'submitted' }).get()
    const mockDemands = [
      {
        _id: '1',
        space: '住宅',
        service: '整套灯光设计',
        budget: '¥19/m²',
        area: '150',
        stage: '未开始',
        priority: true,
        createdAt: new Date().toISOString()
      },
      {
        _id: '2',
        space: '商铺',
        service: '只深化灯光施工图',
        budget: '¥9/m²',
        area: '85',
        stage: '装修中',
        priority: false,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString() // 2天前
      },
      {
        _id: '3',
        space: '办公室',
        service: '选灯配灯服务',
        budget: '¥5/m²（只针对选灯配灯）',
        area: '450',
        stage: '正在设计',
        priority: false,
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString() // 10天前
      }
    ];

    // 处理标签显示逻辑
    const formattedDemands = mockDemands.map(item => {
      let tagType = '';
      let tagText = '';
      
      const isNew = (Date.now() - new Date(item.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
      
      if (item.priority) {
        tagType = 'purple';
        tagText = '加急';
      } else if (isNew) {
        tagType = 'blue';
        tagText = '新需求';
      }

      return {
        ...item,
        title: `${item.space}灯光设计需求`,
        tagType,
        tagText
      };
    });

    this.setData({ demands: formattedDemands });
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
  wx.showLoading({ title: '处理中...' });
  
  // 模拟抢单请求延迟
  setTimeout(() => {
    wx.hideLoading();
    wx.navigateTo({
      url: '/pages/designer-order-success/designer-order-success?projectName=上海静安区 150㎡ 住宅照明设计'
    });
  }, 800);
},
});
