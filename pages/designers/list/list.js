/**
 * 设计师列表页：筛选与搜索
 * 
 * 功能：
 * - 设计师列表展示
 * - 关键词搜索（按姓名）
 * - 空间类型筛选
 * - 多种排序方式（评分、项目数、价格、经验）
 */
const util = require('../../../utils/util')

// 空间类型映射
const SPACE_TYPE_MAP = {
  'residential': '住宅照明',
  'commercial': '商业照明',
  'office': '办公照明',
  'hotel': '酒店照明'
}

Page({
  data: {
    // 搜索关键词
    searchKeyword: '',
    // 筛选条件
    filters: {
      spaceType: '',      // 擅长空间类型
      minRating: 0,       // 最低评分
      hasCalcExp: false   // 有照度计算认证
    },
    // 选中的空间类型
    selectedSpace: '',
    // 选中的空间类型标签
    selectedSpaceLabel: '',
    // 设计师列表
    designers: [],
    loading: true,
    // 排序
    sortBy: 'rating', // rating, projects, price, experience
    // 搜索防抖定时器
    searchTimer: null,
    // 🔥 从订单列表携带的需求信息
    preselectedRequest: null,
    // 选中的设计师ID
    selectedDesignerId: ''
  },

  onLoad(options) {
    // 🔥 接收从订单列表传来的需求信息
    if (options.requestId) {
      const preselectedRequest = {
        id: options.requestId,
        category: options.category || '',
        source: options.source || '',
        title: decodeURIComponent(options.title || ''),
        area: decodeURIComponent(options.area || ''),
        budget: decodeURIComponent(options.budget || ''),
        style: decodeURIComponent(options.style || '')
      }
      this.setData({ preselectedRequest })
      console.log('[designers/list] 携带需求信息:', preselectedRequest)
    }
    this.loadDesigners()
  },

  onShow() {
    // 不在 onShow 重复加载，避免频繁请求
  },

  /**
   * 加载设计师列表
   */
  async loadDesigners() {
    this.setData({ loading: true })
    try {
      const { filters, sortBy, searchKeyword } = this.data
      const page = 1
      const pageSize = 20
      
      const res = await wx.cloud.callFunction({
        name: 'designers_list',
        data: { 
          filters, 
          sortBy, 
          page, 
          pageSize,
          keyword: searchKeyword  // 传递搜索关键词
        }
      })
      
      const result = res && res.result
      const items = (result && result.items) ? result.items : []
      const total = (result && result.total) || 0
      
      this.setData({ 
        designers: items, 
        loading: false 
      })
      
      console.log('[designers_list] 获取设计师列表成功，共', total, '条')
    } catch (e) {
      console.error('[designers_list] 获取设计师列表失败:', e)
      this.setData({ designers: [], loading: false })
      util.showToast('加载失败，请重试')
    }
  },

  /**
   * 搜索输入（带防抖）
   */
  onSearchInput(e) {
    const value = e.detail.value
    this.setData({ searchKeyword: value })
    
    // 清除之前的定时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
    
    // 设置新的定时器（500ms 防抖）
    const timer = setTimeout(() => {
      this.loadDesigners()
    }, 500)
    
    this.setData({ searchTimer: timer })
  },

  /**
   * 搜索确认（按下回车）
   */
  onSearchConfirm() {
    // 清除防抖定时器，立即搜索
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
    this.loadDesigners()
  },

  /**
   * 清除搜索
   */
  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.loadDesigners()
  },

  /**
   * 排序标签点击
   */
  onFilterTap(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ sortBy: filter })
    this.loadDesigners()
  },

  /**
   * 空间类型筛选
   */
  toggleSpaceFilter() {
    const items = ['住宅照明', '商业照明', '办公照明', '酒店照明', '清除筛选']
    const spaceTypes = ['residential', 'commercial', 'office', 'hotel', '']
    
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const selected = spaceTypes[res.tapIndex]
        const label = res.tapIndex < 4 ? items[res.tapIndex] : ''
        
        this.setData({ 
          selectedSpace: selected,
          selectedSpaceLabel: label,
          'filters.spaceType': selected
        })
        this.loadDesigners()
        
        if (selected) {
          util.hapticFeedback('light')
        }
      }
    })
  },

  /**
   * 查看设计师详情
   */
  onDesignerTap(e) {
    const id = e.currentTarget.dataset.id
    const { preselectedRequest } = this.data
    
    // 🔥 携带预选需求信息到详情页
    let url = `/pages/designers/detail/detail?id=${id}`
    if (preselectedRequest && preselectedRequest.id) {
      url += `&requestId=${preselectedRequest.id}`
      if (preselectedRequest.category) url += `&category=${preselectedRequest.category}`
      if (preselectedRequest.source) url += `&source=${preselectedRequest.source}`
      if (preselectedRequest.title) url += `&title=${encodeURIComponent(preselectedRequest.title)}`
      if (preselectedRequest.area) url += `&area=${preselectedRequest.area}`
      if (preselectedRequest.budget) url += `&budget=${preselectedRequest.budget}`
    }
    
    util.navigateTo(url)
    util.hapticFeedback('light')
  },

  /**
   * 邀请设计师接单
   */
  async onConfirmSelect(e) {
    const designerId = e.currentTarget.dataset.id
    const designerName = e.currentTarget.dataset.name || '设计师'

    util.hapticFeedback('medium')

    // 如果有预选需求，直接带上 requestId
    const { preselectedRequest } = this.data
    const requestId = (preselectedRequest && preselectedRequest.id) ? preselectedRequest.id : ''

    // 请求订阅消息授权（用户拒绝也不影响邀请流程）
    try {
      await wx.requestSubscribeMessage({
        tmplIds: ['bxor0x4ZJ_JoEnPct2ieOZ1tGcMuzNZrceQonfMhkFI']
      })
    } catch (subErr) {
      console.warn('[designers/list] 订阅消息授权跳过:', subErr)
    }

    wx.showLoading({ title: '发送邀请...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'invitations_create',
        data: { designerId, requestId }
      })

      wx.hideLoading()
      const result = res.result || {}

      if (result.success) {
        util.showToast('邀请已发送')
        util.hapticFeedback('light')
        // 标记该设计师已邀请（UI上可做已邀请状态）
        this.setData({ selectedDesignerId: designerId })
        return
      }

      // 需要选择需求
      if (result.code === 'NEED_SELECT_REQUEST' && result.data && result.data.requests) {
        wx.hideLoading()
        this._showRequestPicker(designerId, designerName, result.data.requests)
        return
      }

      // 没有需求，提示去发布
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

      // 其他错误
      util.showToast(result.message || '邀请失败')

    } catch (err) {
      wx.hideLoading()
      console.error('[designers/list] 邀请失败:', err)
      util.showToast('网络错误，请重试')
    }
  },

  /**
   * 弹出需求选择器（业主有多个待处理需求时）
   */
  _showRequestPicker(designerId, designerName, requests) {
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
            this.setData({ selectedDesignerId: designerId })
          } else if (result.code === 'DUPLICATE_INVITE') {
            util.showToast('已邀请该设计师，请耐心等待回复')
          } else {
            util.showToast(result.message || '邀请失败')
          }
        } catch (err) {
          wx.hideLoading()
          console.error('[designers/list] 邀请失败:', err)
          util.showToast('网络错误，请重试')
        }
      }
    })
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadDesigners().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面卸载时清理定时器
   */
  onUnload() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
  },
  
  /**
   * 🔥 清除预选需求
   */
  clearPreselect() {
    this.setData({ preselectedRequest: null })
    util.hapticFeedback('light')
  }
})
