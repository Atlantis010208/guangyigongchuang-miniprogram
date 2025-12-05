Page({
  data: {
    appointments: []
  },

  onLoad() {
    this.loadAppointments()
  },

  onShow() {
    this.loadAppointments()
  },

  loadAppointments() {
    // 模拟预约数据，实际应从后端获取
    const appointments = wx.getStorageSync('user_appointments') || [
      {
        id: 1,
        serviceName: '光环境体验',
        status: 'confirmed',
        statusText: '已确认',
        appointmentTime: '2024-01-15 14:00',
        address: '上海市黄浦区南京东路299号',
        phone: '13800138000'
      },
      {
        id: 2,
        serviceName: '现场勘测',
        status: 'pending',
        statusText: '待确认',
        appointmentTime: '2024-01-20 10:00',
        address: '上海市徐汇区淮海中路1045号',
        phone: '13800138000'
      }
    ]

    this.setData({
      appointments
    })
  },

  cancelAppointment(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '取消预约',
      content: '确定要取消这个预约吗？',
      success: (res) => {
        if (res.confirm) {
          const appointments = this.data.appointments.map(item => {
            if (item.id === id) {
              return {
                ...item,
                status: 'cancelled',
                statusText: '已取消'
              }
            }
            return item
          })
          
          this.setData({ appointments })
          wx.setStorageSync('user_appointments', appointments)
          
          wx.showToast({
            title: '预约已取消',
            icon: 'success'
          })
        }
      }
    })
  },

  rescheduleAppointment(e) {
    const id = e.currentTarget.dataset.id
    wx.showToast({
      title: '改期功能开发中',
      icon: 'none'
    })
  },

  contactService() {
    wx.navigateTo({
      url: '/pages/support/contact/contact'
    })
  },

  makeAppointment() {
    wx.switchTab({
      url: '/pages/products/products'
    })
  }
})