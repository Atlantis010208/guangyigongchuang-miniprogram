const app = getApp();

Page({
  data: {
    statusBarHeight: 20, // 默认状态栏高度
    isCollected: false,
    demandId: '',
    demand: null // 需求详情数据
  },

  onLoad(options) {
    // 获取系统信息，适配自定义导航栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      demandId: options.id || ''
    });

    this.loadDemandDetail(options.id);
  },

  // 加载需求详情
  loadDemandDetail(id) {
    if (!id) {
      wx.showToast({ title: '需求不存在', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加载中...', mask: true });
    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action: 'detail', requestId: id },
      success: (res) => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          const d = res.result.data;
          this.setData({
            demand: {
              ...d,
              title: `${d.space || ''}灯光设计需求`,
              tagText: d.tagText || (d.space ? d.space + '照明' : '')
            }
          });
          // 查询收藏状态
          this.checkCollectStatus(id);
        } else {
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[designer-demand-detail] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
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

  // 查询收藏状态
  checkCollectStatus(requestId) {
    if (!requestId) return;
    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action: 'check_collect', requestId },
      success: (res) => {
        if (res.result && res.result.success) {
          this.setData({ isCollected: !!res.result.data.isCollected });
        }
      }
    });
  },

  // 切换收藏状态（云函数持久化）
  onToggleCollect() {
    const { demandId, isCollected } = this.data;
    if (!demandId) return;

    const action = isCollected ? 'uncollect' : 'collect';
    // 先乐观更新UI
    this.setData({ isCollected: !isCollected });

    wx.cloud.callFunction({
      name: 'designer_demands',
      data: { action, requestId: demandId },
      success: (res) => {
        if (res.result && res.result.success) {
          wx.showToast({ title: isCollected ? '已取消收藏' : '已收藏', icon: 'none' });
        } else {
          // 失败回滚
          this.setData({ isCollected });
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: () => {
        // 网络失败回滚
        this.setData({ isCollected });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
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
    const { demandId, demand } = this.data;
    if (!demandId) {
      wx.showToast({ title: '需求信息错误', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '抢单确认',
      content: '确认要承接此设计需求吗？承接后需尽快与业主联系。',
      confirmText: '立即抢单',
      confirmColor: '#111827',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        wx.cloud.callFunction({
          name: 'designer_demands',
          data: { action: 'accept', requestId: demandId },
          success: (r) => {
            wx.hideLoading();
            if (r.result && r.result.success) {
              const projectName = demand
                ? `${demand.space || ''} ${demand.area || ''}㎡ 灯光设计`
                : '灯光设计项目';
              wx.navigateTo({
                url: `/pages/designer-order-success/designer-order-success?projectName=${encodeURIComponent(projectName)}`
              });
            } else {
              const code = r.result ? r.result.code : '';
              const msg = r.result ? r.result.message : '抢单失败';
              if (code === 'ALREADY_TAKEN') {
                wx.showModal({
                  title: '手慢了',
                  content: '该需求已被其他设计师接单',
                  showCancel: false,
                  success: () => this.onBack()
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
            console.error('[designer-demand-detail] 抢单失败:', err);
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        });
      }
    });
  }
});
