const app = getApp();

Page({
  data: {
    cacheSize: '24.5 MB' // 模拟缓存大小
  },

  onLoad() {
    // 页面加载时的逻辑
  },

  // 跳转到账号与安全
  goToSecurity() {
    wx.navigateTo({
      url: '/pages/designer-security/designer-security'
    });
  },

  // 跳转到隐私管理
  goToPrivacy() {
    wx.navigateTo({
      url: '/pages/designer-privacy/designer-privacy'
    });
  },

  // 跳转到消息通知设置
  goToNotifications() {
    wx.navigateTo({
      url: '/pages/designer-notifications/designer-notifications'
    });
  },

  // 返回上一页
  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/designer-profile/designer-profile'
        });
      }
    });
  },

  // 模拟清除缓存
  onClearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除本地缓存吗？',
      confirmColor: '#181818',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...' });
          
          setTimeout(() => {
            wx.hideLoading();
            this.setData({ cacheSize: '0 MB' });
            wx.showToast({
              title: '清理完成',
              icon: 'success'
            });
          }, 800);
        }
      }
    });
  },

  // 切换到业主端
  switchToOwner() {
    wx.showModal({
      title: '切换到业主端',
      content: '确定要切换到业主端吗？',
      confirmText: '切换',
      confirmColor: '#181818',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('userRole', 'owner');
          if (app.globalData) app.globalData.userRole = 'owner';
          wx.switchTab({ url: '/pages/products/products' });
        }
      }
    });
  },

  // 退出登录逻辑
  onLogout() {
    wx.showModal({
      title: '退出确认',
      content: '确定要退出当前账号吗？',
      confirmColor: '#e64340',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });
          // 先调云函数使会话失效，失败不阻塑退出流程
          wx.cloud.callFunction({
            name: 'designer_settings',
            data: { action: 'logout' },
            complete: () => {
              wx.clearStorageSync();
              if (app.globalData) app.globalData.userDoc = null;
              wx.hideLoading();
              wx.reLaunch({ url: '/pages/splash/splash' });
            }
          });
        }
      }
    });
  }
});
