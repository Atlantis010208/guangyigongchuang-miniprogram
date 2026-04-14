/**
 * 设计师端邀请列表页
 * 展示设计师收到的所有邀请，支持接受/拒绝操作
 */
Page({
  data: {
    invitations: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    newCount: 0,
    showNewTip: false,
    currentStatus: '',
    statusTabs: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'accepted', label: '已接受' },
      { key: 'rejected', label: '已拒绝' }
    ]
  },

  _statusTagMap: {
    pending: 'blue',
    accepted: 'green',
    rejected: 'gray',
    cancelled: 'gray',
    expired: 'gray',
    conflict: 'purple'
  },

  _pollTimer: null,
  _lastCount: 0,

  onLoad() {
    this.loadInvitations(true)
  },

  onShow() {
    this.loadInvitations(true)
    this._startPolling()
  },

  onHide() {
    this._stopPolling()
  },

  onUnload() {
    this._stopPolling()
  },

  onPullDownRefresh() {
    this.loadInvitations(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 轮询新邀请
  _startPolling() {
    this._stopPolling()
    this._pollTimer = setInterval(() => {
      this._checkNewInvites()
    }, 15000)
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  _checkNewInvites() {
    wx.cloud.callFunction({
      name: 'invitations_operations',
      data: { action: 'count_pending' },
      success: (res) => {
        if (res.result && res.result.success) {
          const count = res.result.data.count || 0
          if (this._lastCount > 0 && count > this._lastCount) {
            const diff = count - this._lastCount
            this.setData({ newCount: diff, showNewTip: true })
          }
          this._lastCount = count
        }
      }
    })
  },

  onTapNewTip() {
    this.setData({ showNewTip: false, newCount: 0 })
    this.loadInvitations(true)
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    await this.loadInvitations(false)
  },

  async loadInvitations(reset) {
    const page = reset ? 1 : this.data.page
    if (reset) this.setData({ page: 1 })

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'invitations_operations',
        data: {
          action: 'list_by_designer',
          page,
          pageSize: this.data.pageSize,
          status: this.data.currentStatus
        }
      })

      const result = res.result || {}
      if (result.success && result.data) {
        const { list, total, hasMore } = result.data

        // 记录初始计数
        if (reset && total !== undefined) {
          this._lastCount = (list || []).filter(i => i.status === 'pending').length
        }

        const formatted = (list || []).map(item => ({
          ...item,
          statusTagType: this._statusTagMap[item.status] || 'gray'
        }))

        this.setData({
          invitations: reset ? formatted : [...this.data.invitations, ...formatted],
          hasMore: !!hasMore,
          showNewTip: false,
          newCount: 0
        })
      }
    } catch (err) {
      console.error('[designer-invites] 加载失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) return
    this.setData({ currentStatus: status, invitations: [], page: 1 })
    this.loadInvitations(true)
  },

  // 查看需求详情
  onViewDetail(e) {
    const id = e.currentTarget.dataset.id
    const inviteId = e.currentTarget.dataset.inviteId || ''
    wx.navigateTo({
      url: `/pages/designer-demand-detail/designer-demand-detail?id=${id}&inviteId=${inviteId}`
    })
  },

  // 接受邀请
  onAccept(e) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title || '灯光设计需求'
    if (!id) return

    wx.showModal({
      title: '接受邀请',
      content: `确认要承接「${title}」吗？承接后需尽快与业主联系。`,
      confirmText: '确认接受',
      confirmColor: '#111827',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })

        try {
          const cfRes = await wx.cloud.callFunction({
            name: 'invitations_operations',
            data: { action: 'accept', invitationId: id }
          })
          wx.hideLoading()

          const result = cfRes.result || {}
          if (result.success) {
            wx.showToast({ title: '已接受邀请', icon: 'success' })
            // 更新本地列表
            const invitations = this.data.invitations.map(item => {
              if (item.id === id) {
                return { ...item, status: 'accepted', statusText: '已接受', statusTagType: 'green' }
              }
              return item
            })
            this.setData({ invitations })
          } else {
            const code = result.code || ''
            if (code === 'REQUEST_TAKEN') {
              wx.showModal({
                title: '提示',
                content: '该需求已被其他设计师接单',
                showCancel: false,
                success: () => this.loadInvitations(true)
              })
            } else if (code === 'EXPIRED') {
              wx.showToast({ title: '邀请已过期', icon: 'none' })
              this.loadInvitations(true)
            } else {
              wx.showToast({ title: result.message || '操作失败', icon: 'none' })
            }
          }
        } catch (err) {
          wx.hideLoading()
          console.error('[designer-invites] 接受邀请失败:', err)
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  },

  // 拒绝邀请（从详情页调用，此处预留快速拒绝）
  onReject(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    wx.showModal({
      title: '婉拒邀请',
      content: '确定要婉拒这条邀请吗？',
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })

        try {
          const cfRes = await wx.cloud.callFunction({
            name: 'invitations_operations',
            data: { action: 'reject', invitationId: id }
          })
          wx.hideLoading()

          const result = cfRes.result || {}
          if (result.success) {
            wx.showToast({ title: '已婉拒', icon: 'none' })
            const invitations = this.data.invitations.map(item => {
              if (item.id === id) {
                return { ...item, status: 'rejected', statusText: '已拒绝', statusTagType: 'gray' }
              }
              return item
            })
            this.setData({ invitations })
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  }
})
