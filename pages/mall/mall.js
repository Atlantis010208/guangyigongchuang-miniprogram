/**
 * 商城商品列表页面
 * 功能：展示商品列表、分类筛选、搜索、分页加载
 */
const util = require('../../utils/util')

Page({
  data: {
    products: [],           // 商品列表
    loading: false,         // 加载状态
    loadingMore: false,     // 加载更多状态
    hasMore: true,          // 是否还有更多数据
    page: 1,                // 当前页码
    pageSize: 20,           // 每页数量
    total: 0,               // 总数量
    keyword: '',            // 搜索关键词
    category: '灯具',       // 当前分类（默认灯具，与侧边栏高亮一致）
    sortBy: 'createdAt',    // 排序字段
    sortOrder: 'desc',      // 排序方向
    isFromCloud: false      // 数据来源标识（云端/本地）
  },

  onLoad() {
    this.loadProducts()
  },

  onShow() {
    // 页面显示时刷新数据
    if (this.data.products.length === 0) {
      this.loadProducts()
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadProducts().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  /**
   * 从云函数加载商品列表
   */
  async loadProducts() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const res = await util.callCf('products_list', {
        page: 1,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        category: this.data.category,
        sortBy: this.data.sortBy,
        sortOrder: this.data.sortOrder
      })

      if (res && res.success && res.data) {
        const { products, pagination } = res.data
        
        // 格式化商品数据
        const formattedProducts = this.formatProducts(products)
        
        this.setData({
          products: formattedProducts,
          page: 1,
          total: pagination.total,
          hasMore: pagination.page < pagination.totalPages,
          isFromCloud: true
        })
        
        console.log('[商城] 从云端加载商品成功:', formattedProducts.length, '件')
      } else {
        console.warn('[商城] 云函数返回异常，使用默认数据:', res?.message)
        this.loadDefaultProducts()
      }
    } catch (err) {
      console.error('[商城] 加载商品失败:', err)
      this.loadDefaultProducts()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载更多商品
   */
  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return

    this.setData({ loadingMore: true })

    try {
      const nextPage = this.data.page + 1
      
      const res = await util.callCf('products_list', {
        page: nextPage,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        category: this.data.category,
        sortBy: this.data.sortBy,
        sortOrder: this.data.sortOrder
      })

      if (res && res.success && res.data) {
        const { products, pagination } = res.data
        const formattedProducts = this.formatProducts(products)
        
        this.setData({
          products: [...this.data.products, ...formattedProducts],
          page: nextPage,
          hasMore: pagination.page < pagination.totalPages
        })
        
        console.log('[商城] 加载更多成功，当前共:', this.data.products.length, '件')
      }
    } catch (err) {
      console.error('[商城] 加载更多失败:', err)
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  /**
   * 云函数加载失败时的降级处理
   * 不再使用测试数据，页面会自动显示空状态
   */
  loadDefaultProducts() {
    console.log('[商城] 云函数加载失败，显示空状态')
    this.setData({
      products: [],
      total: 0,
      hasMore: false,
      isFromCloud: false
    })
  },

  /**
   * 格式化商品数据
   * @param {array} products - 原始商品数据
   * @returns {array} 格式化后的商品数据
   */
  formatProducts(products) {
    return (products || []).map(item => ({
      id: item._id || item.id,
      name: item.name || '',
      price: item.price || 0,
      image: (item.images && item.images[0]) || item.image || '',
      category: item.category || '',
      description: item.description || '',
      stock: item.stock || 0,
      sales: item.sales || 0,
      type: item.type || '',
      virtualCategory: item.virtualCategory || '',
      deliveryType: item.deliveryType || '',
      isVirtual: item.type === 'virtual',
      deliveryLabel: item.type === 'virtual'
        ? (item.deliveryType === 'service' ? '服务交付' : '网盘下载')
        : ''
    }))
  },

  /**
   * 搜索商品
   */
  onSearch(e) {
    const keyword = e.detail.value || ''
    this.setData({ 
      keyword,
      page: 1,
      hasMore: true
    })
    this.loadProducts()
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({ 
      keyword: '',
      page: 1,
      hasMore: true
    })
    this.loadProducts()
  },

  /**
   * 切换分类
   */
  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category || ''
    this.setData({ 
      category,
      page: 1,
      hasMore: true
    })
    this.loadProducts()
  },

  /**
   * 点击商品跳转详情
   */
  onProductTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/mall/product-detail/product-detail?id=${id}` })
  }
})








