/**
 * 商城商品列表页面
 * 功能：展示商品列表、分类筛选、搜索、分页加载
 */
const util = require('../../utils/util')

// 默认商品数据（云函数失败时的降级方案）
const DEFAULT_PRODUCTS = [
  { id: 'p1', name: '极简吸顶灯 40cm', price: 399, image: 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg' },
  { id: 'p2', name: '观月组合 5+6', price: 1820, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
  { id: 'p3', name: '轨道射灯 12W', price: 129, image: 'https://images.pexels.com/photos/269218/pexels-photo-269218.jpeg' },
  { id: 'p4', name: '磁吸灯套装', price: 899, image: 'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg' },
  { id: 'p5', name: '智能筒灯 10W', price: 89, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
  { id: 'p6', name: '线型吊灯 1.2m', price: 599, image: 'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg' },
  { id: 'p7', name: '床头壁灯', price: 219, image: 'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg' },
  { id: 'p8', name: '庭院草坪灯', price: 159, image: 'https://images.pexels.com/photos/462235/pexels-photo-462235.jpeg' },
  { id: 'p9', name: '落地阅读灯', price: 329, image: 'https://images.pexels.com/photos/1248583/pexels-photo-1248583.jpeg' },
  { id: 'p10', name: '氛围灯带 5m', price: 199, image: 'https://images.pexels.com/photos/7130537/pexels-photo-7130537.jpeg' },
  { id: 'p11', name: '厨房橱柜灯', price: 149, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' },
  { id: 'p12', name: '镜前灯 9W', price: 189, image: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg' }
]

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
    category: '',           // 当前分类
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
   * 使用默认商品数据（降级方案）
   */
  loadDefaultProducts() {
    console.log('[商城] 使用默认商品数据')
    this.setData({
      products: DEFAULT_PRODUCTS,
      total: DEFAULT_PRODUCTS.length,
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
      // 优先使用 images 数组的第一张图片，否则使用 image 字段
      image: (item.images && item.images[0]) || item.image || 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
      category: item.category || '',
      description: item.description || '',
      stock: item.stock || 0,
      sales: item.sales || 0
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








