// pages/toolkit/toolkit-detail/toolkit-detail.js
const util = require('../../../utils/util')

// 默认数据（兜底方案，当数据库无数据时使用）
const DEFAULT_TOOLKIT_DATA = {
    id: 'toolkit',
    name: '灯光设计工具包',
    price: 0.01,
  desc: '十年灯光设计知识沉淀、方法技巧、核心工具、灯光资源、避坑经验全都在这里！告别盲目设计灯光的烦恼，科学专业的灯光设计方法让你对设计决策更加笃定。',
    cloudFileIDs: [
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图2.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图3.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图4.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图5.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图6.jpg'
    ],
    contentList: [
      { title: '空间照度验算计算文件', desc: '多维度综合智能照度计算表，包含常用材质利用系数参考' },
      { title: '住宅建筑照明设计标准', desc: '专业标准化可编辑的施工图模板，CAD直接可用' },
      { title: '深化施工图纸模板', desc: '施工节点大样图库，包含各种灯具安装节点详图' },
      { title: '品牌灯具选型报价表', desc: '进口/国产专业照明品牌库推荐，包含详细参数对比' },
      { title: '灯具安装节点大样案例图', desc: '灯光设计施工安装翻车黑名单，避免常见错误' },
      { title: '灯光设计常用灯具使用规则', desc: '灯光设计常用灯具参数运用规则，科学选型指导' }
    ],
    params: [
      { key: '产品类型', value: '数字工具包' },
      { key: '文件格式', value: 'PDF、DWG、XLSX、PNG、JPG' },
      { key: '适用场景', value: '住宅、商业、办公、酒店照明设计' },
      { key: '更新频率', value: '季度更新' },
      { key: '技术支持', value: '专业社群交流学习' },
      { key: '授权方式', value: '个人使用授权' }
    ],
    variantGroups: [
    { key: 'version', name: '版本选择', options: ['标准版'] }
  ]
      }

Page({
  data: {
    id: 'toolkit',
    name: '灯光设计工具包',
    price: 0.01,
    current: 0,
    bannerHeight: 560,
    images: [],
    cloudFileIDs: [],
    desc: '',
    contentList: [],
    params: [],
    variantGroups: [],
    selectedVariants: { version: '标准版' },
    quantity: 1,
    fav: false,
    favIcon: 'like-o',
    cartCount: 0,
    loading: true,
    loadError: false
  },

  onLoad(query) {
    const { id } = query || {}
    // 默认使用数据库中的 toolkitId
    const toolkitId = id || 'TK_DEFAULT_001'
    this.setData({ id: toolkitId, loading: true })
    
    // 优先从数据库加载数据
    this.loadToolkitFromCloud(toolkitId)
    
    this.syncFavState()
    this.syncCartCount()
  },

  onShow() {
    this.syncFavState()
    this.syncCartCount()
  },

  /**
   * 从云端加载工具包数据
   */
  async loadToolkitFromCloud(toolkitId) {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await wx.cloud.callFunction({
        name: 'toolkit_detail',
        data: { id: toolkitId }
      })
      
      wx.hideLoading()
      
      if (res.result && res.result.success && res.result.data) {
        const toolkit = res.result.data
        console.log('[toolkit-detail] 从云端加载数据成功:', toolkit)
        
        // 更新页面数据
        this.setData({
          id: toolkit.id || toolkit._id,
          name: toolkit.name || toolkit.title,
          price: toolkit.price || 0,
          desc: toolkit.desc || toolkit.description || '',
          images: toolkit.images || [],
          cloudFileIDs: [], // 云端已转换，无需再转
          contentList: toolkit.contentList || [],
          params: toolkit.params || [],
          variantGroups: this.enrichVariantGroups(toolkit.variantGroups || [], this.data.selectedVariants),
          loading: false,
          loadError: false
        })
        
        this.recalcPrices()
      } else {
        console.warn('[toolkit-detail] 云端数据不可用，使用默认数据')
        this.useDefaultData()
      }
    } catch (err) {
      console.error('[toolkit-detail] 加载云端数据失败:', err)
      wx.hideLoading()
      this.useDefaultData()
    }
  },

  /**
   * 使用默认数据（兜底方案）
   */
  useDefaultData() {
    console.log('[toolkit-detail] 使用默认硬编码数据')
    
    this.setData({
      id: DEFAULT_TOOLKIT_DATA.id,
      name: DEFAULT_TOOLKIT_DATA.name,
      price: DEFAULT_TOOLKIT_DATA.price,
      desc: DEFAULT_TOOLKIT_DATA.desc,
      cloudFileIDs: DEFAULT_TOOLKIT_DATA.cloudFileIDs,
      contentList: DEFAULT_TOOLKIT_DATA.contentList,
      params: DEFAULT_TOOLKIT_DATA.params,
      variantGroups: this.enrichVariantGroups(DEFAULT_TOOLKIT_DATA.variantGroups, this.data.selectedVariants),
      loading: false,
      loadError: false
    })
    
    // 使用本地云存储 fileID 转换
    this.fetchCloudImageUrls()
    this.recalcPrices()
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

  /**
   * 转换云存储 fileID 为临时链接（仅用于默认数据兜底）
   */
  fetchCloudImageUrls() {
    const list = this.data.cloudFileIDs || []
    if (!list.length) return
    if (wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList: list })
        .then(res => {
          const files = (res && res.fileList) || []
          const urls = files.filter(i => i && i.status === 0 && i.tempFileURL).map(i => i.tempFileURL)
          const failed = files.filter(i => !i || i.status !== 0).length
          if (failed === files.length) wx.showToast({ title: '图片权限受限，请设置为所有用户可读', icon: 'none' })
          console.log('工具包主图临时链接', files)
          this.setData({ images: (urls && urls.length ? urls : list), current: 0 })
        })
        .catch(() => {
          this.setData({ images: list, current: 0 })
        })
    } else {
      this.setData({ images: list, current: 0 })
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

  recalcPrices() {
    const unitPrice = this.data.price || 0.01
    const qty = Math.max(1, Number(this.data.quantity || 1))
    const total = unitPrice * qty
    this.setData({ totalPrice: total })
  },

  onSelectVariant(e) {
    const group = e.currentTarget.dataset.group
    const value = e.currentTarget.dataset.value
    this.setData({ [`selectedVariants.${group}`]: value }, () => {
      this.recalcPrices()
      const enriched = this.enrichVariantGroups(this.data.variantGroups, this.data.selectedVariants)
      this.setData({ variantGroups: enriched })
    })
  },

  enrichVariantGroups(groups, selected) {
    return (groups || []).map(g => Object.assign({}, g, { selected: selected[g.key] }))
  },

  onInc() {
    const q = Math.max(1, (this.data.quantity || 1) + 1)
    this.setData({ quantity: q }, () => {
      this.recalcPrices()
    })
  },

  onDec() {
    const q = Math.max(1, (this.data.quantity || 1) - 1)
    this.setData({ quantity: q }, () => {
      this.recalcPrices()
    })
  },

  async onAddToCart() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.showLoginPrompt('加入购物车')
      return
    }

    const quantity = Math.max(1, Number(this.data.quantity || 1)) || 1
    const product = {
      id: this.data.id,
      name: this.data.name,
      price: Number(this.data.price) || 0,
      image: (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || '',
      specs: this.data.selectedVariants || {}
    }

    wx.showLoading({ title: '添加中...' })
    
    try {
      // 调用云函数将商品添加到云端购物车
      const res = await wx.cloud.callFunction({
        name: 'cart_operations',
        data: {
          action: 'add',
          product: product,
          quantity: quantity
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        // 同步更新本地存储，确保购物车数量立即更新
        const item = { ...product, quantity, title: product.name }
        const list = wx.getStorageSync('cartItems') || []
        const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
        let merged = false
        for (const i of list) {
          const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
          if (k === key) { i.quantity = Math.max(1, Number(i.quantity || 1)) + quantity; merged = true; break }
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
      const item = { ...product, quantity, title: product.name }
      const list = wx.getStorageSync('cartItems') || []
      const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
      let merged = false
      for (const i of list) {
        const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
        if (k === key) { i.quantity = Math.max(1, Number(i.quantity || 1)) + item.quantity; merged = true; break }
      }
      if (!merged) list.unshift(item)
      wx.setStorageSync('cartItems', list)
      wx.showToast({ title: '已加入购物车', icon: 'none' })
      this.syncCartCount()
    }
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
      quantity: this.data.quantity,
      specs: this.data.selectedVariants
    }
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  },

  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    const urls = this.data.images && this.data.images.length ? this.data.images : [current]
    try {
      wx.previewImage({ current, urls })
    } catch (err) {
      if (urls && urls[0]) wx.previewImage({ urls: [urls[0]] })
    }
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
      specs: this.data.selectedVariants || {},
      description: this.data.desc || '',
      category: 'toolkit'
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

  showLoginPrompt(action) {
    wx.showModal({
      title: '需要登录',
      content: `${action}需要登录后操作，是否前往登录？`,
      confirmText: '去登录',
      cancelText: '暂不登录',
      success: (res) => {
        if (res.confirm) {
          const redirectUrl = `/pages/toolkit/toolkit-detail/toolkit-detail?id=${this.data.id}`
          wx.navigateTo({
            url: '/pages/auth/login/login?redirect=' + encodeURIComponent(redirectUrl)
          })
        }
      }
    })
  }
})
