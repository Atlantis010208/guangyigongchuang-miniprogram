Page({
  data: {
    devices: []
  },

  onLoad() {
    this.loadDevices()
  },

  onShow() {
    this.loadDevices()
  },

  loadDevices() {
    // 模拟设备数据，实际应从后端获取
    const devices = wx.getStorageSync('user_devices') || [
      {
        id: 1,
        name: '客厅主灯',
        model: 'Smart Light Pro',
        icon: '/images/light-icon.png',
        status: 'online',
        statusText: '在线',
        location: '客厅',
        addedTime: '2024-01-10',
        brightness: 80
      },
      {
        id: 2,
        name: '卧室台灯',
        model: 'Desk Light Mini',
        icon: '/images/desk-light-icon.png',
        status: 'offline',
        statusText: '离线',
        location: '主卧室',
        addedTime: '2024-01-05',
        brightness: 0
      }
    ]

    this.setData({
      devices
    })
  },

  controlDevice(e) {
    const id = e.currentTarget.dataset.id
    const device = this.data.devices.find(d => d.id === id)
    
    if (device && device.status === 'online') {
      wx.showActionSheet({
        itemList: ['调节亮度', '切换颜色', '定时开关'],
        success: (res) => {
          const actions = ['调节亮度', '切换颜色', '定时开关']
          wx.showToast({
            title: `${actions[res.tapIndex]}功能开发中`,
            icon: 'none'
          })
        }
      })
    } else {
      wx.showToast({
        title: '设备离线，无法控制',
        icon: 'none'
      })
    }
  },

  deviceSettings(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({
      title: '设备设置功能开发中',
      icon: 'none'
    })
  },

  removeDevice(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '移除设备',
      content: '确定要移除这个设备吗？',
      success: (res) => {
        if (res.confirm) {
          const devices = this.data.devices.filter(device => device.id !== id)
          this.setData({ devices })
          wx.setStorageSync('user_devices', devices)
          
          wx.showToast({
            title: '设备已移除',
            icon: 'success'
          })
        }
      }
    })
  },

  addDevice() {
    wx.showModal({
      title: '添加设备',
      content: '请在智能照明APP中扫码添加设备，或手动输入设备序列号',
      confirmText: '知道了',
      showCancel: false
    })
  }
})