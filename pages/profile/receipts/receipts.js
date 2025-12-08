/**
 * 收据管理页面
 * 功能：展示收据列表、查看详情、删除收据、筛选搜索
 */
const util = require('../../../utils/util')

Page({
  data: {
    receipts: [],           // 收据列表
    loading: false,         // 加载状态
    refreshing: false,      // 下拉刷新状态
    page: 1,                // 当前页码
    pageSize: 20,           // 每页数量
    hasMore: true,          // 是否有更多数据
    total: 0,               // 总数量
    
    // 筛选相关
    showFilter: false,      // 是否显示筛选弹窗
    filterStartDate: '',    // 筛选开始日期
    filterEndDate: '',      // 筛选结束日期
    keyword: '',            // 搜索关键词
    
    // 详情弹窗
    showDetail: false,      // 是否显示详情弹窗
    currentReceipt: null,   // 当前查看的收据
    
    // 统计数据
    stats: {
      totalCount: 0,
      totalAmount: '0.00'
    },
    
    // 日期选择器配置
    minDate: '2020-01-01',
    maxDate: ''
  },

  onLoad() {
    this.initDateRange()
    this.loadReceipts()
    this.loadStats()
  },

  onShow() {
    // 页面显示时检查是否需要刷新
    if (this.needRefresh) {
      this.refreshData()
      this.needRefresh = false
    }
  },

  /**
   * 初始化日期范围
   */
  initDateRange() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    this.setData({
      maxDate: `${year}-${month}-${day}`
    })
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
    await Promise.all([
      this.loadReceipts(),
      this.loadStats()
    ])
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
    await this.loadReceipts(true)
  },

  /**
   * 加载收据列表
   * @param {boolean} append - 是否追加数据
   */
  async loadReceipts(append = false) {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      const res = await util.callCf('receipts_operations', {
        action: 'list',
        page: this.data.page,
        pageSize: this.data.pageSize,
        startDate: this.data.filterStartDate,
        endDate: this.data.filterEndDate,
        keyword: this.data.keyword
      })
      
      if (res && res.success && res.data) {
        const { list, total, hasMore } = res.data
        
        this.setData({
          receipts: append ? [...this.data.receipts, ...list] : list,
          total,
          hasMore
        })
        
        // 同步到本地存储作为缓存
        if (!append && list.length > 0) {
          wx.setStorageSync('user_receipts', list)
        }
      } else {
        console.warn('云函数获取收据列表失败:', res?.message)
        this.loadFromLocal()
      }
    } catch (err) {
      console.error('加载收据列表失败:', err)
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    try {
      const res = await util.callCf('receipts_operations', {
        action: 'stats'
      })
      
      if (res && res.success && res.data) {
        this.setData({
          stats: {
            totalCount: res.data.totalCount || 0,
            totalAmount: res.data.totalAmount || '0.00'
          }
        })
      }
    } catch (err) {
      console.error('加载统计数据失败:', err)
    }
  },

  /**
   * 从本地缓存加载数据
   */
  loadFromLocal() {
    const receipts = wx.getStorageSync('user_receipts') || []
    this.setData({
      receipts,
      total: receipts.length,
      hasMore: false
    })
  },

  /**
   * 输入搜索关键词
   */
  onKeywordInput(e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  /**
   * 执行搜索
   */
  onSearch() {
    this.setData({
      page: 1,
      hasMore: true
    })
    this.loadReceipts()
  },

  /**
   * 清除搜索
   */
  clearSearch() {
    this.setData({
      keyword: '',
      page: 1,
      hasMore: true
    })
    this.loadReceipts()
  },

  /**
   * 显示筛选弹窗
   */
  showFilterModal() {
    this.setData({ showFilter: true })
  },

  /**
   * 关闭筛选弹窗
   */
  closeFilter() {
    this.setData({ showFilter: false })
  },

  /**
   * 选择开始日期
   */
  onStartDateChange(e) {
    this.setData({
      filterStartDate: e.detail.value
    })
  },

  /**
   * 选择结束日期
   */
  onEndDateChange(e) {
    this.setData({
      filterEndDate: e.detail.value
    })
  },

  /**
   * 应用筛选
   */
  applyFilter() {
    this.setData({
      showFilter: false,
      page: 1,
      hasMore: true
    })
    this.loadReceipts()
  },

  /**
   * 重置筛选
   */
  resetFilter() {
    this.setData({
      filterStartDate: '',
      filterEndDate: '',
      showFilter: false,
      page: 1,
      hasMore: true
    })
    this.loadReceipts()
  },

  /**
   * 查看收据详情
   */
  async viewDetail(e) {
    const id = e.currentTarget.dataset.id
    
    util.showLoading('加载中...')
    
    try {
      const res = await util.callCf('receipts_operations', {
        action: 'detail',
        receiptId: id
      })
      
      util.hideLoading()
      
      if (res && res.success && res.data) {
        this.setData({
          showDetail: true,
          currentReceipt: res.data
        })
      } else {
        util.showError(res?.message || '获取详情失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('获取收据详情失败:', err)
      util.showError('获取详情失败')
    }
  },

  /**
   * 关闭详情弹窗
   */
  closeDetail() {
    this.setData({
      showDetail: false,
      currentReceipt: null
    })
  },

  /**
   * 删除收据
   */
  deleteReceipt(e) {
    const id = e.currentTarget.dataset.id
    const receipt = this.data.receipts.find(item => item.id === id)
    
    if (!receipt) {
      util.showToast('收据不存在')
      return
    }
    
    wx.showModal({
      title: '删除收据',
      content: `确定要删除"${receipt.title}"的收据吗？`,
      confirmColor: '#ff3b30',
      success: async (res) => {
        if (res.confirm) {
          await this.doDeleteReceipt(id)
        }
      }
    })
  },

  /**
   * 执行删除
   * @param {string} id - 收据ID
   */
  async doDeleteReceipt(id) {
    util.showLoading('删除中...')
    
    try {
      const res = await util.callCf('receipts_operations', {
        action: 'delete',
        receiptId: id
      })
      
      util.hideLoading()
      
      if (res && res.success) {
        util.showSuccess('删除成功')
        
        // 从列表中移除
        const receipts = this.data.receipts.filter(item => item.id !== id)
        this.setData({
          receipts,
          total: this.data.total - 1
        })
        
        // 更新本地缓存
        wx.setStorageSync('user_receipts', receipts)
        
        // 如果正在查看详情，关闭弹窗
        if (this.data.showDetail && this.data.currentReceipt?.id === id) {
          this.closeDetail()
        }
        
        // 重新加载统计
        this.loadStats()
      } else {
        util.showError(res?.message || '删除失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('删除收据失败:', err)
      util.showError('删除失败')
    }
  },

  /**
   * 导出收据
   */
  async exportReceipts() {
    util.showLoading('导出中...')
    
    try {
      const res = await util.callCf('receipts_operations', {
        action: 'export',
        startDate: this.data.filterStartDate,
        endDate: this.data.filterEndDate
      })
      
      util.hideLoading()
      
      if (res && res.success && res.data) {
        const { summary } = res.data
        
        // 显示导出结果
        wx.showModal({
          title: '导出成功',
          content: `共 ${summary.totalCount} 条收据\n总金额: ¥${summary.totalAmount}\n退款金额: ¥${summary.refundAmount}\n净金额: ¥${summary.netAmount}`,
          showCancel: false
        })
      } else {
        util.showError(res?.message || '导出失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('导出收据失败:', err)
      util.showError('导出失败')
    }
  },

  /**
   * 阻止事件穿透
   */
  preventTap() {
    // 空函数，用于阻止事件穿透
  }
})
