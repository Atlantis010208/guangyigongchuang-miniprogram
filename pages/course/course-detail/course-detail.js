// pages/course/course-detail/course-detail.js
const util = require('../../../utils/util')

Page({
  data: {
    id: 'course01',
    name: '十年经验二哥 灯光设计课',
    price: 365,
    current: 0,
    bannerHeight: 560,
    images: [],
    detailImage: '',
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
    desc: '系统梳理十年一线灯光设计实战经验，讲解设计思维、方法与落地技巧。',
    benefits: [
      '完整灯光设计方法论',
      '从需求到落地的流程打法',
      '常见场景案例复盘',
      '避坑与调试技巧'
    ],
    fav: false
  },

  onLoad(query){
    const { id, cover } = query || {}
    // 先加载云图
    this.fetchCloudImageUrls()
    if (cover) {
      try {
        const list = decodeURIComponent(cover)
        const first = list
        if (first) {
          const imgs = this.data.images.slice()
          if (imgs && imgs.length) {
            imgs[0] = first
            this.setData({ images: imgs })
          } else {
            this.setData({ images: [first] })
          }
        }
      } catch(e) {}
    }
    if (id) this.setData({ id })
  },

  onShow(){
    // 同步收藏状态（调用云函数）
    this.syncFavState()
  },

  /**
   * 同步收藏状态（优先从云端获取）
   */
  async syncFavState() {
    try {
      const isFavorited = await util.checkFavorite(this.data.id)
      if (isFavorited !== this.data.fav) {
        this.setData({ fav: isFavorited })
      }
    } catch (e) {
      // 降级到本地存储
      try {
      const list = wx.getStorageSync('mall_favorites') || []
      const exists = (list || []).some(i => i.id === this.data.id)
      if (exists !== this.data.fav) this.setData({ fav: exists })
      } catch (_) {}
    }
  },

  // 根据图片等比自适应高度，避免两侧留白
  onBannerLoad(e){
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

  onSwiperChange(e){
    const idx = e && e.detail ? e.detail.current : 0
    this.setData({ current: idx })
  },

  fetchCloudImageUrls(){
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

  onPreviewImage(e){
    const current = e.currentTarget.dataset.src
    const urls = this.data.images
    wx.previewImage({ current, urls })
  },

  onPreviewDetail(){
    const img = this.data.detailImage
    if (!img) return
    wx.previewImage({ current: img, urls: [img].concat(this.data.images || []) })
  },

  onBuyNow(){
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

  onContact(){ wx.navigateTo({ url:'/pages/support/contact/contact' }) },

  /**
   * 切换收藏状态（调用云函数）
   */
  async onToggleFav() {
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

    // 先乐观更新 UI
    this.setData({ fav: !currentFav })

    try {
      const result = await util.toggleFavorite(product, currentFav)
      
      if (result.success) {
        wx.showToast({ title: result.message, icon: 'none' })
      } else {
        // 失败时恢复状态
        this.setData({ fav: currentFav })
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err)
      this.setData({ fav: currentFav })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },
  onGoCart(){ wx.navigateTo({ url:'/pages/mall/cart/cart' }) },
  onAddToCart(){
    const item = {
      id: this.data.id,
      title: this.data.name,
      name: this.data.name,
      price: Number(this.data.price)||0,
      image: (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || '',
      quantity: 1,
      specs: {}
    }
    const list = wx.getStorageSync('cartItems') || []
    const key = JSON.stringify({ id:item.id, specs:item.specs||{} })
    let merged=false
    for(const i of list){
      const k = JSON.stringify({ id:i.id, specs:i.specs||{} })
      if(k===key){ i.quantity = Math.max(1, Number(i.quantity||1)) + item.quantity; merged=true; break }
    }
    if(!merged) list.unshift(item)
    wx.setStorageSync('cartItems', list)
    wx.showToast({ title: '已加入购物车', icon: 'none' })
  }
})


