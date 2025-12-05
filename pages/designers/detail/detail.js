// 设计师详情页：查看详情与预约
const util = require('../../../utils/util')

Page({
  data: {
    designer: null,
    loading: true,
    // Tab 状态
    activeTab: 'works',
    // 预约表单
    showBookingModal: false,
    bookingForm: {
      spaceType: '',
      area: '',
      budget: '',
      contactType: '',   // 联系方式类型
      contact: '',       // 联系方式内容
      remark: ''
    },
    spaceOptions: ['住宅', '商业', '办公', '酒店', '其他'],
    budgetOptions: ['5000以下', '5000-10000', '10000-30000', '30000以上'],
    contactTypeOptions: ['微信', '电话', 'QQ'],
    spaceIndex: 0,
    budgetIndex: 0,
    contactTypeIndex: 0,
    // 案例展示
    currentCaseIndex: 0
  },

  onLoad(options) {
    const { id, action } = options
    if (id) {
      this.loadDesigner(id)
    }
    // 如果是从快速预约进入，自动打开预约弹窗
    if (action === 'book') {
      setTimeout(() => {
        this.setData({ showBookingModal: true })
      }, 500)
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

  // 预约相关
  openBooking() {
    this.setData({ showBookingModal: true })
    util.hapticFeedback('light')
  },

  closeBooking() {
    this.setData({ showBookingModal: false })
  },

  noop() {},

  onSpaceChange(e) {
    const index = e.detail.value
    this.setData({
      spaceIndex: index,
      'bookingForm.spaceType': this.data.spaceOptions[index]
    })
  },

  onBudgetChange(e) {
    const index = e.detail.value
    this.setData({
      budgetIndex: index,
      'bookingForm.budget': this.data.budgetOptions[index]
    })
  },

  onContactTypeChange(e) {
    const index = e.detail.value
    this.setData({
      contactTypeIndex: index,
      'bookingForm.contactType': this.data.contactTypeOptions[index]
    })
  },

  onAreaInput(e) {
    this.setData({ 'bookingForm.area': e.detail.value })
  },

  onContactInput(e) {
    this.setData({ 'bookingForm.contact': e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ 'bookingForm.remark': e.detail.value })
  },

  // 提交预约
  async submitBooking() {
    const { bookingForm, designer } = this.data

    // 验证
    if (!bookingForm.spaceType) {
      util.showToast('请选择空间类型')
      return
    }
    if (!bookingForm.area) {
      util.showToast('请输入设计面积')
      return
    }
    if (!bookingForm.budget) {
      util.showToast('请选择预算范围')
      return
    }
    if (!bookingForm.contactType) {
      util.showToast('请选择联系方式类型')
      return
    }
    if (!bookingForm.contact) {
      util.showToast('请填写联系方式')
      return
    }

    util.showLoading('提交中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'appointments_create',
        data: {
          form: bookingForm,
          designerId: designer && designer._id ? designer._id : '',
          designerName: designer && designer.name ? designer.name : ''
        }
      })

      util.hideLoading()
      this.setData({ showBookingModal: false })

      wx.showModal({
        title: '预约成功',
        content: `已向${designer.name}发送预约请求，请保持联系方式畅通`,
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          util.hapticFeedback('medium')
        }
      })

      // 重置表单
      this.setData({
        bookingForm: {
          spaceType: '',
          area: '',
          budget: '',
          contactType: '',
          contact: '',
          remark: ''
        },
        spaceIndex: 0,
        budgetIndex: 0,
        contactTypeIndex: 0
      })

    } catch (err) {
      util.hideLoading()
      console.error('预约失败:', err)
      util.showToast('预约失败，请重试')
    }
  },

  // 联系设计师
  onContact() {
    wx.makePhoneCall({
      phoneNumber: '400-888-8888',
      fail: () => {
        util.showToast('无法拨打电话')
      }
    })
  },

  // 分享
  onShareAppMessage() {
    const { designer } = this.data
    return {
      title: `${designer.name} - ${designer.title}`,
      path: `/pages/designers/detail/detail?id=${designer._id}`,
      imageUrl: designer.avatarUrl
    }
  }
})
