/**
 * 预约列表页面
 * 功能：展示用户预约列表、取消预约、联系设计师
 */
const util = require('../../../utils/util')

Page({
  data: {
    appointments: [],       // 预约列表
    loading: false,         // 加载状态
    refreshing: false,      // 下拉刷新状态
    page: 1,                // 当前页码
    pageSize: 20,           // 每页数量
    hasMore: true,          // 是否有更多数据
    total: 0,               // 总数量
    
    // 详情弹窗
    showDetail: false,
    currentAppointment: null,
    
    // 状态筛选
    currentStatus: '',      // 当前筛选状态
    statusTabs: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待确认' },
      { key: 'confirmed', label: '已确认' },
      { key: 'completed', label: '已完成' },
      { key: 'cancelled', label: '已取消' }
    ]
  },

  onLoad() {
    this.loadAppointments()
  },

  onShow() {
    // 页面显示时刷新数据
    this.refreshData()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshData()
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    this.setData({
      page: 1,
      hasMore: true,
      refreshing: true
    })
    await this.loadAppointments()
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  /**
   * 加载更多数据
   */
  async loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    
    this.setData({
      page: this.data.page + 1
    })
    await this.loadAppointments(true)
  },

  /**
   * 加载预约列表
   * @param {boolean} append - 是否追加数据（加载更多时为true）
   */
  async loadAppointments(append = false) {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      const res = await util.callCf('appointments_operations', {
        action: 'list',
        page: this.data.page,
        pageSize: this.data.pageSize,
        status: this.data.currentStatus
      })
      
      if (res && res.success && res.data) {
        const { list, total, hasMore } = res.data
        
        // 格式化数据
        const formattedList = list.map(item => {
          let createdAtText = '-'
          if (item.createdAt) {
            const date = new Date(item.createdAt)
            createdAtText = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
          }
          return {
            ...item,
            createdAtText
          }
        })
        
        this.setData({
          appointments: append ? [...this.data.appointments, ...formattedList] : formattedList,
          total,
          hasMore
        })
        
        // 同步到本地存储作为缓存
        if (!append && formattedList.length > 0) {
          wx.setStorageSync('user_appointments', formattedList)
        }
      } else {
        // 云函数调用失败，尝试从本地缓存读取
        console.warn('云函数获取预约列表失败:', res?.message)
        this.loadFromLocal()
      }
    } catch (err) {
      console.error('加载预约列表失败:', err)
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 从本地缓存加载数据（降级方案）
   */
  loadFromLocal() {
    const appointments = wx.getStorageSync('user_appointments') || []
    
    // 如果有状态筛选，过滤数据
    let filtered = appointments
    if (this.data.currentStatus) {
      filtered = appointments.filter(item => item.status === this.data.currentStatus)
    }

    this.setData({
      appointments: filtered,
      total: filtered.length,
      hasMore: false
    })
  },

  /**
   * 切换状态筛选
   */
  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) return
    
    this.setData({
      currentStatus: status,
      page: 1,
      hasMore: true
    })
    this.loadAppointments()
  },

  /**
   * 取消预约
   */
  cancelAppointment(e) {
    const id = e.currentTarget.dataset.id
    const appointment = this.data.appointments.find(item => item.id === id)
    
    if (!appointment) {
      util.showToast('预约不存在')
      return
    }
    
    wx.showModal({
      title: '取消预约',
      content: `确定要取消"${appointment.serviceName}"的预约吗？`,
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (res.confirm) {
          await this.doCancelAppointment(id)
        }
      }
    })
  },

  /**
   * 执行取消预约
   * @param {string} id - 预约ID
   */
  async doCancelAppointment(id) {
    util.showLoading('取消中...')
    
    try {
      const res = await util.callCf('appointments_operations', {
        action: 'cancel',
        appointmentId: id
      })
      
      util.hideLoading()
      
      if (res && res.success) {
        util.showSuccess('预约已取消')
        
        // 更新本地列表状态
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
        
        // 同步更新本地缓存
          wx.setStorageSync('user_appointments', appointments)
      } else {
        util.showError(res?.message || '取消失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('取消预约失败:', err)
      util.showError('取消失败')
        }
  },

  /**
   * 查看预约详情
   */
  viewDetail(e) {
    const id = e.currentTarget.dataset.id
    const appointment = this.data.appointments.find(item => item.id === id)
    
    if (!appointment) {
      util.showToast('预约不存在')
      return
    }
    
    this.setData({
      showDetail: true,
      currentAppointment: appointment
    })
  },

  /**
   * 关闭详情弹窗
   */
  closeDetail() {
    this.setData({
      showDetail: false,
      currentAppointment: null
    })
  },

  /**
   * 拨打电话
   */
  makeCall(e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone) {
      util.showToast('暂无电话号码')
      return
    }
    
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: (err) => {
        if (err.errMsg !== 'makePhoneCall:fail cancel') {
          util.showToast('拨打失败')
        }
      }
    })
  },

  /**
   * 复制联系方式
   */
  copyContact(e) {
    const { type, value } = e.currentTarget.dataset
    if (!value) {
      util.showToast('内容为空')
      return
    }
    
    wx.setClipboardData({
      data: value,
      success: () => {
        util.showSuccess(`已复制${type}`)
      }
    })
  },

  /**
   * 阻止弹窗穿透
   */
  preventTap() {
    // 空函数，用于阻止事件穿透
  },

  /**
   * 联系客服
   */
  contactService() {
    wx.navigateTo({
      url: '/pages/support/contact/contact'
    })
  },

  /**
   * 立即预约（跳转到设计师页）
   */
  makeAppointment() {
    wx.navigateTo({
      url: '/pages/designers/list/list'
    })
  }
})
