const app = getApp();

Page({
  data: {
    statusBarHeight: 20, // 默认状态栏高度
    isCollected: false,
    demandId: ''
  },

  onLoad(options) {
    // 获取系统信息，适配自定义导航栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      demandId: options.id || ''
    });

    // 这里可以根据 demandId 去云数据库加载真实数据
    // this.loadDemandDetail(options.id);
  },

  // 返回上一页
  onBack() {
    wx.navigateBack({
      fail: () => {
        // 如果没有上一页，跳转到首页需求大厅
        wx.switchTab({
          url: '/pages/designer-home/designer-home'
        });
      }
    });
  },

  // 切换收藏状态
  onToggleCollect() {
    this.setData({
      isCollected: !this.data.isCollected
    });
    
    wx.showToast({
      title: this.data.isCollected ? '已收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  // 咨询按钮
  onConsult() {
    wx.showToast({
      title: '正在连接业主...',
      icon: 'none'
    });
    // 实际业务中这里可以跳转到聊天页面或拉起客服
  },

  // 立即抢单
  onTakeOrder() {
    wx.showModal({
      title: '抢单确认',
      content: '确认要承接此设计需求吗？承接后需尽快与业主联系。',
      confirmText: '立即抢单',
      confirmColor: '#111827',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          
          // 模拟网络请求
          setTimeout(() => {
            wx.hideLoading();
            wx.navigateTo({
              url: '/pages/designer-order-success/designer-order-success?projectName=上海静安区 150㎡ 住宅照明设计'
            });
          }, 800);
        }
      }
    });
  }
});
