/**
 * 我的邀请页面（业主端）
 * 展示业主发出的所有邀请及其状态
 */
Page({
  data: {
    invitations: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    total: 0,
    currentStatus: '',
    statusTabs: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待回应' },
      { key: 'accepted', label: '已接受' },
      { key: 'rejected', label: '已拒绝' }
    ]
  },

  // 状态 → 标签样式映射
  _statusTagMap: {
    pending: 'blue',
    accepted: 'green',
    rejected: 'gray',
    cancelled: 'gray',
    expired: 'gray',
    conflict: 'purple'
  },

  onLoad() {
    this.loadInvitations()
  },

  onShow() {
    this.refreshData()
  },

  onPullDownRefresh() {
    this.refreshData()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  async refreshData() {
    this.setData({ page: 1, hasMore: true })
    await this.loadInvitations()
    wx.stopPullDownRefresh()
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    await this.loadInvitations(true)
  },

  async loadInvitations(append = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'invitations_operations',
        data: {
          action: 'list_by_owner',
          page: this.data.page,
          pageSize: this.data.pageSize,
          status: this.data.currentStatus
        }
      })

      const result = res.result || {}
      if (result.success && result.data) {
        const { list, total, hasMore } = result.data

        // 添加标签样式
        const formatted = (list || []).map(item => ({
          ...item,
          statusTagType: this._statusTagMap[item.status] || 'gray'
        }))

        this.setData({
          invitations: append ? [...this.data.invitations, ...formatted] : formatted,
          total,
          hasMore: !!hasMore
        })
      }
    } catch (err) {
      console.error('[invitations] 加载失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) return
    this.setData({ currentStatus: status, page: 1, hasMore: true, invitations: [] })
    this.loadInvitations()
  },

  async onCancel(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    wx.showModal({
      title: '取消邀请',
      content: '确定要取消这条邀请吗？',
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          const cfRes = await wx.cloud.callFunction({
            name: 'invitations_operations',
            data: { action: 'cancel', invitationId: id }
          })
          wx.hideLoading()
          const result = cfRes.result || {}
          if (result.success) {
            wx.showToast({ title: '邀请已取消', icon: 'success' })
            // 更新本地列表
            const invitations = this.data.invitations.map(item => {
              if (item.id === id) {
                return { ...item, status: 'cancelled', statusText: '已取消', statusTagType: 'gray' }
              }
              return item
            })
            this.setData({ invitations })
          } else {
            wx.showToast({ title: result.message || '取消失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  },

  onViewProgress(e) {
    const orderId = e.currentTarget.dataset.order || e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/request/progress/progress?id=${orderId}`
    })
  },

  onReselect() {
    wx.navigateTo({
      url: '/pages/designers/list/list'
    })
  },

  goToDesigners() {
    wx.navigateTo({
      url: '/pages/designers/list/list'
    })
  }
})
