// 设计师详情页：查看详情与邀请接单
const util = require('../../../utils/util')

Page({
  data: {
    designer: null,
    loading: true,
    // Tab 状态
    activeTab: 'works',
    // 从订单列表预选的需求
    preselectedRequestId: '',
    // 是否从已接单订单进入（from=order）：隐藏邀请抢单，改为联系设计师
    fromOrder: false,
    fromSelf: false
  },

  onLoad(options) {
    const { id, requestId, from } = options
    
    // 保存预选需求信息
    if (requestId) {
      this.setData({ preselectedRequestId: requestId })
      console.log('[designer/detail] 预选需求ID:', requestId)
    }
    
    // 识别“来自订单详情页”场景
    if (from === 'order') {
      this.setData({ fromOrder: true })
      console.log('[designer/detail] 来源: 已接单订单，隐藏邀请抢单按钮')
    }
    if (from === 'self') {
      this.setData({ fromSelf: true })
    }
    
    if (id) {
      this.loadDesigner(id)
    }
  },

  // 加载设计师详情
  async loadDesigner(id) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'designer_detail', data: { id } })
      const item = (res && res.result && res.result.item) ? res.result.item : null
      this.setData({ designer: item, loading: false })
    } catch (e) {
      this.setData({ designer: null, loading: false })
    }
  },

  // Tab 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    util.hapticFeedback('light')
  },

  // 私信咨询
  onConsult() {
    util.showToast('咨询功能开发中')
    util.hapticFeedback('medium')
  },

  // 预览作品图片
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: urls || [url]
    })
  },

  /**
   * 邀请设计师接单
   */
  async onInvite() {
    const { designer, preselectedRequestId } = this.data
    if (!designer || !designer._id) return

    util.hapticFeedback('medium')

    // 请求订阅消息授权（用户拒绝也不影响邀请流程）
    try {
      await wx.requestSubscribeMessage({
        tmplIds: ['bxor0x4ZJ_JoEnPct2ieOZ1tGcMuzNZrceQonfMhkFI']
      })
    } catch (subErr) {
      console.warn('[designer/detail] 订阅消息授权跳过:', subErr)
    }

    wx.showLoading({ title: '发送邀请...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'invitations_create',
        data: {
          designerId: designer._id,
          requestId: preselectedRequestId || ''
        }
      })

      wx.hideLoading()
      const result = res.result || {}

      if (result.success) {
        util.showToast('邀请已发送')
        util.hapticFeedback('light')
        return
      }

      // 需要选择需求
      if (result.code === 'NEED_SELECT_REQUEST' && result.data && result.data.requests) {
        this._showRequestPicker(designer._id, result.data.requests)
        return
      }

      // 没有需求
      if (result.code === 'NO_REQUEST') {
        wx.showModal({
          title: '提示',
          content: '您还没有发布照明需求，是否先去发布？',
          confirmText: '去发布',
          cancelText: '取消',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.switchTab({ url: '/pages/services/services' })
            }
          }
        })
        return
      }

      // 重复邀请
      if (result.code === 'DUPLICATE_INVITE') {
        util.showToast('已邀请该设计师，请耐心等待回复')
        return
      }

      util.showToast(result.message || '邀请失败')
    } catch (err) {
      wx.hideLoading()
      console.error('[designer/detail] 邀请失败:', err)
      util.showToast('网络错误，请重试')
    }
  },

  /**
   * 弹出需求选择器
   */
  _showRequestPicker(designerId, requests) {
    const items = requests.map(r => `${r.title || '灯光设计需求'} (${r.area || '?'}m²)`)

    wx.showActionSheet({
      itemList: items,
      success: async (res) => {
        const selected = requests[res.tapIndex]
        if (!selected) return

        wx.showLoading({ title: '发送邀请...', mask: true })
        try {
          const cfRes = await wx.cloud.callFunction({
            name: 'invitations_create',
            data: { designerId, requestId: selected._id }
          })
          wx.hideLoading()

          const result = cfRes.result || {}
          if (result.success) {
            util.showToast('邀请已发送')
            util.hapticFeedback('light')
          } else if (result.code === 'DUPLICATE_INVITE') {
            util.showToast('已邀请该设计师，请耐心等待回复')
          } else {
            util.showToast(result.message || '邀请失败')
          }
        } catch (err) {
          wx.hideLoading()
          util.showToast('网络错误，请重试')
        }
      }
    })
  },

  // 收藏设计师
  onCollect() {
    util.showToast('收藏功能开发中')
    util.hapticFeedback('light')
  },

  // 分享
  onShareTap() {
    util.showToast('请点击右上角分享')
    util.hapticFeedback('light')
  },

  // 联系客服（预留，当前页面底部不再使用）
  onContact() {
    wx.makePhoneCall({
      phoneNumber: '400-888-8888',
      fail: () => {
        util.showToast('无法拨打电话')
      }
    })
  },

  // 联系设计师本人（从订单进入时使用）
  onContactDesigner() {
    const d = this.data.designer
    if (!d) {
      util.showToast('设计师信息不完整')
      return
    }
    util.hapticFeedback('light')

    const items = []
    const handlers = []

    if (d.phone) {
      items.push('拨打电话 ' + d.phone)
      handlers.push(() => {
        wx.makePhoneCall({
          phoneNumber: String(d.phone),
          fail: () => util.showToast('拨号已取消')
        })
      })
    }
    if (d.wechat) {
      items.push('复制微信号 ' + d.wechat)
      handlers.push(() => {
        wx.setClipboardData({
          data: String(d.wechat),
          success: () => wx.showToast({ title: '微信号已复制', icon: 'success' })
        })
      })
    }

    if (items.length === 0) {
      util.showToast('设计师未填写联系方式')
      return
    }
    if (items.length === 1) {
      handlers[0]()
      return
    }
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (typeof res.tapIndex === 'number' && handlers[res.tapIndex]) {
          handlers[res.tapIndex]()
        }
      }
    })
  },

  // 分享
  onShareAppMessage() {
    const { designer } = this.data
    if (!designer) return {}
    return {
      title: `${designer.name} - ${designer.title || '照明设计师'}`,
      path: `/pages/designers/detail/detail?id=${designer._id}`,
      imageUrl: designer.portfolioImages?.[0] || designer.avatar  // 修复：使用正确字段
    }
  }
})
