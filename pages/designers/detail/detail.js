// 设计师详情页：查看详情与预约
const util = require('../../../utils/util')
const api = require('../../../utils/api')

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
    // 用户需求列表
    userRequests: [],
    selectedRequestIndex: 0,
    selectedRequest: null,
    loadingRequests: false,
    contactTypeOptions: ['微信', '电话', 'QQ'],
    contactTypeIndex: 0,
    // 案例展示
    currentCaseIndex: 0,
    // 🔥 从订单列表预选的需求
    preselectedRequestId: ''
  },

  onLoad(options) {
    const { id, action, requestId, category, source, title, area, budget } = options
    
    // 🔥 保存预选需求信息
    if (requestId) {
      this.setData({ 
        preselectedRequestId: requestId,
        preselectedRequestInfo: {
          id: requestId,
          category: category || '',
          source: source || '',
          title: title ? decodeURIComponent(title) : '',
          area: area || '',
          budget: budget || ''
        }
      })
      console.log('[designer/detail] 预选需求ID:', requestId)
    }
    
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

  // 预览作品图片
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: urls || [url]
    })
  },

  // 预约相关
  async openBooking() {
    this.setData({ showBookingModal: true, loadingRequests: true })
    util.hapticFeedback('light')
    
    // 自动加载用户的需求记录
    await this.loadUserRequests()
  },

  /**
   * 加载用户的需求记录，用于自动填充预约表单
   */
  async loadUserRequests() {
    try {
      const userDoc = wx.getStorageSync('userDoc') || {}
      const userId = userDoc._id
      const openid = wx.getStorageSync('openid') || ''
      
      if (!userId && !openid) {
        this.setData({ loadingRequests: false, userRequests: [] })
        return
      }
      
      const db = api.dbInit()
      if (!db) {
        this.setData({ loadingRequests: false })
        return
      }
      
      const _ = db.command
      
      // 🔥 构建可能的用户 ID 列表
      const possibleIds = [userId, openid].filter(id => id && id.trim())
      
      if (possibleIds.length === 0) {
        this.setData({ loadingRequests: false, userRequests: [] })
        return
      }
      
      // 使用 _.in 匹配多个可能的 userId 值
      const res = await db.collection('requests')
        .where({
          userId: possibleIds.length === 1 ? possibleIds[0] : _.in(possibleIds),
          isDelete: _.neq(1),
          // 排除商城订单
          category: _.neq('mall'),
          // 排除已完成的
          status: _.neq('done')
        })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()
      
      const docs = res.data || []
      
      // 转换为预约所需的格式
      const categoryMap = {
        'residential': '住宅',
        'commercial': '商业',
        'office': '办公',
        'hotel': '酒店',
        'custom': '住宅',
        'selection': '住宅',
        'publish': '住宅',
        'optimize': '住宅',
        'full': '住宅'
      }
      
      const requests = docs.map(doc => {
        const params = doc.params || {}
        // 提取面积：优先 params.area，其次从 areaBucketText 提取数字
        let area = params.area || ''
        if (!area && params.areaBucketText) {
          // 从 "130㎡以上" 或 "61~90㎡" 这类文本中提取
          area = params.areaBucketText
        }
        
        return {
          id: doc.orderNo || doc._id,           // 用于显示
          _id: doc._id,                          // 🔥 数据库真实ID（用于关联）
          orderNo: doc.orderNo || '',            // 订单号
          category: doc.category,
          // 空间类型
          spaceType: categoryMap[doc.category] || '住宅',
          // 面积
          area: area,
          // 预算
          budget: this.formatBudget(params),
          // 显示标题
          title: this.getRequestTitle(doc),
          // 用户手机（可能已填写）
          phone: doc.userPhone || '',
          // 风格
          style: params.style || ''
        }
      })
      
      // 🔥 如果有预选需求ID，将其排到首位并选中
      const preselectedId = this.data.preselectedRequestId
      let selectedIndex = 0
      
      if (preselectedId && requests.length > 0) {
        // 查找预选需求的位置
        const foundIndex = requests.findIndex(r => 
          r.id === preselectedId || r._id === preselectedId || r.orderNo === preselectedId
        )
        
        if (foundIndex > 0) {
          // 将预选需求移到首位
          const preselected = requests.splice(foundIndex, 1)[0]
          requests.unshift(preselected)
          console.log('[designer/detail] 已将预选需求移至首位:', preselected.title)
        } else if (foundIndex === 0) {
          console.log('[designer/detail] 预选需求已在首位')
        } else {
          console.log('[designer/detail] 未找到预选需求，使用默认排序')
        }
      }
      
      this.setData({ 
        loadingRequests: false, 
        userRequests: requests,
        selectedRequestIndex: selectedIndex,
        selectedRequest: requests.length > 0 ? requests[selectedIndex] : null
      })
      
      // 如果有需求，自动填充表单
      if (requests.length > 0) {
        this.fillFormFromRequest(requests[selectedIndex])
      }
      
    } catch (err) {
      console.error('加载用户需求失败:', err)
      this.setData({ loadingRequests: false, userRequests: [] })
    }
  },
  
  /**
   * 格式化预算显示
   */
  formatBudget(params) {
    if (params.budget) return params.budget
    if (params.budgetTotal) return params.budgetTotal
    if (params.estTotal) return `¥${params.estTotal}`
    return ''
  },
  
  /**
   * 获取需求标题
   */
  getRequestTitle(doc) {
    const categoryNames = {
      'residential': '住宅照明',
      'commercial': '商业照明',
      'office': '办公照明',
      'hotel': '酒店照明',
      'custom': '个性需求定制',
      'selection': '选配服务',
      'publish': '发布需求',
      'optimize': '方案优化',
      'full': '整套设计'
    }
    const catName = categoryNames[doc.category] || '照明需求'
    const params = doc.params || {}
    
    // 尝试获取面积
    let area = params.area || ''
    // 如果没有直接的 area，尝试从 areaBucketText 提取
    if (!area && params.areaBucketText) {
      area = params.areaBucketText
    }
    
    // 获取风格
    const style = params.style || ''
    
    // 构建标题
    let title = catName
    if (area && style) {
      title = `${catName} · ${area} · ${style}`
    } else if (area) {
      title = `${catName} (${area})`
    } else if (style) {
      title = `${catName} · ${style}`
    }
    
    return title
  },
  
  /**
   * 从需求记录填充表单
   */
  fillFormFromRequest(request) {
    if (!request) return
    this.setData({
      'bookingForm.spaceType': request.spaceType || '',
      'bookingForm.area': request.area || '',
      'bookingForm.budget': request.budget || ''
    })
  },
  
  /**
   * 切换选中的需求
   */
  onRequestChange(e) {
    const index = parseInt(e.detail.value)
    const request = this.data.userRequests[index] || null
    this.setData({
      selectedRequestIndex: index,
      selectedRequest: request
    })
    this.fillFormFromRequest(request)
  },

  closeBooking() {
    this.setData({ showBookingModal: false })
  },

  noop() {},

  onContactTypeChange(e) {
    const index = e.detail.value
    this.setData({
      contactTypeIndex: index,
      'bookingForm.contactType': this.data.contactTypeOptions[index]
    })
  },

  onContactInput(e) {
    this.setData({ 'bookingForm.contact': e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ 'bookingForm.remark': e.detail.value })
  },

  // 提交预约
  async submitBooking() {
    const { bookingForm, designer, selectedRequest, userRequests } = this.data

    // 验证：只需要联系方式
    if (!bookingForm.contactType) {
      util.showToast('请选择联系方式类型')
      return
    }
    if (!bookingForm.contact) {
      util.showToast('请填写联系方式')
      return
    }
    
    // 如果没有关联需求，提示用户先发布需求
    if (userRequests.length === 0) {
      wx.showModal({
        title: '提示',
        content: '您还没有发布照明需求，是否先去发布？',
        confirmText: '去发布',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({ showBookingModal: false })
            wx.switchTab({ url: '/pages/services/services' })
          }
        }
      })
      return
    }

    util.showLoading('提交中...')

    try {
      // 构建完整的表单数据
      const fullForm = {
        ...bookingForm,
        // 从选中的需求中补全信息
        spaceType: bookingForm.spaceType || (selectedRequest && selectedRequest.spaceType) || '住宅',
        area: bookingForm.area || (selectedRequest && selectedRequest.area) || '',
        budget: bookingForm.budget || (selectedRequest && selectedRequest.budget) || ''
      }
      
      const res = await wx.cloud.callFunction({
        name: 'appointments_create',
        data: {
          form: fullForm,
          designerId: designer && designer._id ? designer._id : '',
          designerName: designer && designer.name ? designer.name : '',
          // 🔥 修复：传递正确的数据库 _id 和订单号
          requestId: selectedRequest ? selectedRequest._id : '',
          requestOrderNo: selectedRequest ? selectedRequest.orderNo : ''
        }
      })

      util.hideLoading()
      this.setData({ showBookingModal: false })

      wx.showModal({
        title: '预约成功 🎉',
        content: `已向${designer.name}发送预约请求，请保持联系方式畅通。是否前往订单管理查看？`,
        showCancel: true,
        cancelText: '留在此页',
        confirmText: '查看订单',
        success: (res) => {
          util.hapticFeedback('medium')
          if (res.confirm) {
            // 🔥 设置标记，让 cart 页面 onShow 时自动切换到方案订单 tab
            wx.setStorageSync('cart_switch_to_scheme', true)
            wx.switchTab({ url: '/pages/cart/cart' })
          }
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
        contactTypeIndex: 0,
        userRequests: [],
        selectedRequest: null
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
    if (!designer) return {}
    return {
      title: `${designer.name} - ${designer.title || '照明设计师'}`,
      path: `/pages/designers/detail/detail?id=${designer._id}`,
      imageUrl: designer.portfolioImages?.[0] || designer.avatar  // 修复：使用正确字段
    }
  }
})
