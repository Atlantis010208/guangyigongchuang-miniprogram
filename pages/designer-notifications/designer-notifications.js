Page({
  data: {
    notifyNewDemand: true,
    notifyOrderProgress: true,
    notifySystem: false,
    dndMode: false
  },

  onLoad(options) {
    this.loadNotificationSettings();
  },

  // 从云函数加载通知设置
  loadNotificationSettings() {
    wx.cloud.callFunction({
      name: 'designer_settings',
      data: { action: 'get_notifications' },
      success: (res) => {
        if (res.result && res.result.success) {
          const s = res.result.data;
          this.setData({
            notifyNewDemand: s.notifyNewDemand !== undefined ? s.notifyNewDemand : true,
            notifyOrderProgress: s.notifyOrderProgress !== undefined ? s.notifyOrderProgress : true,
            notifySystem: s.notifySystem !== undefined ? s.notifySystem : false,
            dndMode: s.dndMode !== undefined ? s.dndMode : false
          });
        }
      },
      fail: (err) => {
        console.error('[designer-notifications] 加载设置失败:', err);
      }
    });
  },

  // 通用保存单个设置
  saveNotificationSetting(key, value, rollbackValue) {
    wx.cloud.callFunction({
      name: 'designer_settings',
      data: { action: 'update_notifications', settings: { [key]: value } },
      success: (res) => {
        if (!res.result || !res.result.success) {
          // 回滚开关状态
          this.setData({ [key]: rollbackValue });
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('[designer-notifications] 保存失败:', err);
        this.setData({ [key]: rollbackValue });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  onChangeNewDemand(e) {
    const prev = this.data.notifyNewDemand;
    this.setData({ notifyNewDemand: e.detail });
    this.saveNotificationSetting('notifyNewDemand', e.detail, prev);
  },

  onChangeOrderProgress(e) {
    const prev = this.data.notifyOrderProgress;
    this.setData({ notifyOrderProgress: e.detail });
    this.saveNotificationSetting('notifyOrderProgress', e.detail, prev);
  },

  onChangeSystem(e) {
    const prev = this.data.notifySystem;
    this.setData({ notifySystem: e.detail });
    this.saveNotificationSetting('notifySystem', e.detail, prev);
  },

  onChangeDnd(e) {
    const prev = this.data.dndMode;
    this.setData({ dndMode: e.detail });
    this.saveNotificationSetting('dndMode', e.detail, prev);
  }
});
