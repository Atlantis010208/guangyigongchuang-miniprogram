// pages/course/course-detail/course-detail.js
const util = require('../../../utils/util')

// 默认数据（兜底方案，当数据库无数据时使用）
const DEFAULT_COURSE_DATA = {
    id: 'course01',
    name: '十年经验二哥 灯光设计课',
    price: 0.01,
  desc: '系统梳理十年一线灯光设计实战经验，讲解设计思维、方法与落地技巧。',
    cloudFileIDs: [
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图1-¥365有圈子的灯光课 5.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图2-¥365有圈子的灯光课 6.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图3-¥365有圈子的灯光课 7.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图4-¥365有圈子的灯光课 8.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图5-¥365有圈子的灯光课.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图6-¥365有圈子的灯光课 3.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图7-¥365有圈子的灯光课 2.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/详情图-¥365有圈子的灯光课 4.jpg'
    ],
    benefits: [
      '完整灯光设计方法论',
      '从需求到落地的流程打法',
      '常见场景案例复盘',
      '避坑与调试技巧'
  ]
}

Page({
  data: {
    id: 'course01',
    name: '十年经验二哥 灯光设计课',
    price: 0.01,
    current: 0,
    bannerHeight: 560,
    images: [],
    detailImage: '',
    cloudFileIDs: [],
    desc: '',
    benefits: [],
    fav: false,
    favIcon: 'like-o',
    cartCount: 0,
    loading: true,
    loadError: false
  },

  onLoad(query) {
    const { id, cover } = query || {}
    // 默认使用数据库中的 courseId
    const courseId = id || 'CO_DEFAULT_001'
    this.setData({ id: courseId, loading: true })
    
    // 优先从数据库加载数据
    this.loadCourseFromCloud(courseId)
    
    // 如果传入了 cover 参数，先设置
    if (cover) {
      try {
        const coverUrl = decodeURIComponent(cover)
        if (coverUrl) {
          this.setData({ images: [coverUrl] })
        }
      } catch (e) {}
    }
    
    this.syncFavState()
    this.syncCartCount()
  },

  onShow() {
    this.syncFavState()
    this.syncCartCount()
  },

  /**
   * 从云端加载课程数据
   */
  async loadCourseFromCloud(courseId) {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await wx.cloud.callFunction({
        name: 'course_detail',
        data: { id: courseId }
      })
      
      wx.hideLoading()
      
      if (res.result && res.result.success && res.result.data) {
        const course = res.result.data
        console.log('[course-detail] 从云端加载数据成功:', course)
        
        // 更新页面数据
        this.setData({
          id: course.id || course._id,
          name: course.name || course.title,
          price: course.price || 0,
          desc: course.desc || course.description || '',
          images: course.images || [],
          detailImage: course.detailImage || '',
          cloudFileIDs: [], // 云端已转换，无需再转
          benefits: course.benefits || [],
          loading: false,
          loadError: false
        })
      } else {
        console.warn('[course-detail] 云端数据不可用，使用默认数据')
        this.useDefaultData()
      }
    } catch (err) {
      console.error('[course-detail] 加载云端数据失败:', err)
      wx.hideLoading()
      this.useDefaultData()
    }
  },

  /**
   * 使用默认数据（兜底方案）
   */
  useDefaultData() {
    console.log('[course-detail] 使用默认硬编码数据')
    
    this.setData({
      id: DEFAULT_COURSE_DATA.id,
      name: DEFAULT_COURSE_DATA.name,
      price: DEFAULT_COURSE_DATA.price,
      desc: DEFAULT_COURSE_DATA.desc,
      cloudFileIDs: DEFAULT_COURSE_DATA.cloudFileIDs,
      benefits: DEFAULT_COURSE_DATA.benefits,
      loading: false,
      loadError: false
    })
    
    // 使用本地云存储 fileID 转换
    this.fetchCloudImageUrls()
  },

  /**
   * 同步购物车商品数量
   */
  syncCartCount() {
    try {
      const list = wx.getStorageSync('cartItems') || []
      const count = list.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
      this.setData({ cartCount: count })
    } catch (e) {
      console.error('同步购物车数量失败:', e)
    }
  },

  /**
   * 同步收藏状态
   */
  async syncFavState() {
    try {
      const isFavorited = await util.checkFavorite(this.data.id)
      if (isFavorited !== this.data.fav) {
        this.setData({ fav: isFavorited, favIcon: isFavorited ? 'like' : 'like-o' })
      }
    } catch (e) {
      try {
        const list = wx.getStorageSync('mall_favorites') || []
        const exists = (list || []).some(i => i.id === this.data.id)
        if (exists !== this.data.fav) this.setData({ fav: exists, favIcon: exists ? 'like' : 'like-o' })
      } catch (_) {}
    }
  },

  onBannerLoad(e) {
    const { width, height } = e.detail || {}
    if (!width || !height) return
    const sys = wx.getSystemInfoSync()
    const screenWidthPx = sys && sys.windowWidth ? sys.windowWidth : 375
    const ratio = height / width
    const bannerHeightPx = screenWidthPx * ratio
    const bannerHeightRpx = Math.round(bannerHeightPx * 750 / screenWidthPx)
    const clamped = Math.max(360, Math.min(bannerHeightRpx, 1200))
    if (clamped !== this.data.bannerHeight) this.setData({ bannerHeight: clamped })
  },

  onSwiperChange(e) {
    const idx = e && e.detail ? e.detail.current : 0
    this.setData({ current: idx })
  },

  /**
   * 转换云存储 fileID 为临时链接（仅用于默认数据兜底）
   */
  fetchCloudImageUrls() {
    const list = this.data.cloudFileIDs || []
    if (!list.length) return
    if (wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList: list })
        .then(res => {
          const urls = (res && res.fileList || []).map(i => i.tempFileURL).filter(Boolean)
          const all = urls.length ? urls : list
          if (all && all.length > 1) {
            this.setData({ images: all.slice(0, all.length - 1), detailImage: all[all.length - 1] })
          } else {
            this.setData({ images: all || [], detailImage: '' })
          }
        })
        .catch(() => {
          if (list && list.length > 1) {
            this.setData({ images: list.slice(0, list.length - 1), detailImage: list[list.length - 1] })
          } else {
            this.setData({ images: list || [], detailImage: '' })
          }
        })
    } else {
      if (list && list.length > 1) {
        this.setData({ images: list.slice(0, list.length - 1), detailImage: list[list.length - 1] })
      } else {
        this.setData({ images: list || [], detailImage: '' })
      }
    }
  },

  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    const urls = this.data.images
    wx.previewImage({ current, urls })
  },

  onPreviewDetail() {
    const img = this.data.detailImage
    if (!img) return
    wx.previewImage({ current: img, urls: [img].concat(this.data.images || []) })
  },

  onBuyNow() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.showLoginPrompt('立即购买')
      return
    }

    const item = {
      id: this.data.id,
      name: this.data.name,
      price: this.data.price,
      image: (this.data.images && this.data.images[0]) || '',
      quantity: 1,
      specs: {}
    }
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  },

  onContact() { 
    wx.navigateTo({ url: '/pages/support/contact/contact' }) 
  },

  async onToggleFav() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.showLoginPrompt('收藏商品')
      return
    }

    const currentFav = this.data.fav
    const primaryImage = (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || ''
    const product = {
      id: this.data.id,
      name: this.data.name,
      price: this.data.price,
      image: primaryImage,
      specs: {},
      description: this.data.desc || '',
      category: 'course'
    }

    const newFav = !currentFav
    this.setData({ fav: newFav, favIcon: newFav ? 'like' : 'like-o' })

    try {
      const result = await util.toggleFavorite(product, currentFav)
      
      if (result.success) {
        wx.showToast({ title: result.message, icon: 'none' })
      } else {
        this.setData({ fav: currentFav, favIcon: currentFav ? 'like' : 'like-o' })
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err)
      this.setData({ fav: currentFav, favIcon: currentFav ? 'like' : 'like-o' })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onGoCart() { 
    wx.navigateTo({ url: '/pages/mall/cart/cart' }) 
  },

  async onAddToCart() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.showLoginPrompt('加入购物车')
      return
    }

    const product = {
      id: this.data.id,
      name: this.data.name,
      price: Number(this.data.price) || 0,
      image: (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || '',
      specs: {}
    }

    wx.showLoading({ title: '添加中...' })
    
    try {
      // 调用云函数将商品添加到云端购物车
      const res = await wx.cloud.callFunction({
        name: 'cart_operations',
        data: {
          action: 'add',
          product: product,
          quantity: 1
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        // 同步更新本地存储，确保购物车数量立即更新
        const item = { ...product, quantity: 1, title: product.name }
        const list = wx.getStorageSync('cartItems') || []
        const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
        let merged = false
        for (const i of list) {
          const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
          if (k === key) { i.quantity = Math.max(1, Number(i.quantity || 1)) + 1; merged = true; break }
        }
        if (!merged) list.unshift(item)
        wx.setStorageSync('cartItems', list)
        
        wx.showToast({ title: '已加入购物车', icon: 'success' })
        this.syncCartCount()
      } else {
        console.error('添加购物车失败:', res.result)
        wx.showToast({ title: res.result?.message || '添加失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('添加购物车异常:', err)
      
      // 降级到本地存储
      const item = { ...product, quantity: 1, title: product.name }
      const list = wx.getStorageSync('cartItems') || []
      const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
      let merged = false
      for (const i of list) {
        const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
        if (k === key) { i.quantity = Math.max(1, Number(i.quantity || 1)) + 1; merged = true; break }
      }
      if (!merged) list.unshift(item)
      wx.setStorageSync('cartItems', list)
      wx.showToast({ title: '已加入购物车', icon: 'none' })
      this.syncCartCount()
    }
  },

  showLoginPrompt(action) {
    wx.showModal({
      title: '需要登录',
      content: `${action}需要登录后操作，是否前往登录？`,
      confirmText: '去登录',
      cancelText: '暂不登录',
      success: (res) => {
        if (res.confirm) {
          const redirectUrl = `/pages/course/course-detail/course-detail?id=${this.data.id}`
          wx.navigateTo({
            url: '/pages/auth/login/login?redirect=' + encodeURIComponent(redirectUrl)
          })
        }
      }
    })
  }
})
