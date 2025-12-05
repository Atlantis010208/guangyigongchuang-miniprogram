// pages/toolkit/toolkit-detail/toolkit-detail.js
Page({
  data: {
    id: 'toolkit',
    name: '灯光设计工具包',
    price: 69,
    current: 0,
    bannerHeight: 560,
    images: [],
    // 若提供云存储 fileID，将在 onLoad 时转换为 https 并覆盖 images
    cloudFileIDs: [
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图2.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图3.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图4.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图5.jpg',
      'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图6.jpg'
    ],
    desc: '十年灯光设计知识沉淀、方法技巧、核心工具、灯光资源、避坑经验全都在这里！告别盲目设计灯光的烦恼，科学专业的灯光设计方法让你对设计决策更加笃定。',
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
      {
        key: 'version',
        name: '版本选择',
        options: ['标准版']
      }
    ],
    selectedVariants: { version: '标准版' },
    quantity: 1,
    fav: false
  },

  onLoad(query) {
    const { id } = query || {}
    if (id) this.setData({ id })
    this.fetchCloudImageUrls()
    this.recalcPrices()
  },

  onShow(){
    // 同步收藏状态
    try{
      const list = wx.getStorageSync('mall_favorites') || []
      const exists = (list || []).some(i => i.id === this.data.id)
      if (exists !== this.data.fav) this.setData({ fav: exists })
    }catch(e){}
  },

  fetchCloudImageUrls(){
    const list = this.data.cloudFileIDs || []
    if (!list.length) return
    if (wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList: list })
        .then(res => {
          const files = (res && res.fileList) || []
          const urls = files.filter(i => i && i.status === 0 && i.tempFileURL).map(i => i.tempFileURL)
          const failed = files.filter(i => !i || i.status !== 0).length
          if (failed === files.length) wx.showToast({ title: '图片权限受限，请设置为所有用户可读', icon: 'none' })
          try { console.log('工具包主图临时链接', files) } catch (_) {}
          this.setData({ images: (urls && urls.length ? urls : list), current: 0 })
        })
        .catch(() => {
          this.setData({ images: list, current: 0 })
        })
    } else {
      this.setData({ images: list, current: 0 })
    }
  },


  // 根据图片实际尺寸动态计算 banner 高度，避免黑边
  onBannerLoad(e){
    const { width, height } = e.detail || {}
    if (!width || !height) return
    // 以屏幕宽度为基准，按图片宽高比计算高度
    const sys = wx.getSystemInfoSync()
    const screenWidthPx = sys && sys.windowWidth ? sys.windowWidth : 375
    // rpx 与 px：1rpx = screenWidthPx / 750 px
    const containerWidthRpx = 750
    const containerWidthPx = screenWidthPx
    const ratio = height / width
    const bannerHeightPx = containerWidthPx * ratio
    const bannerHeightRpx = Math.round(bannerHeightPx * 750 / screenWidthPx)
    // 限制一个合理区间，避免极端长图
    const clamped = Math.max(360, Math.min(bannerHeightRpx, 1200))
    if (clamped !== this.data.bannerHeight) this.setData({ bannerHeight: clamped })
  },

  onSwiperChange(e){
    const idx = e && e.detail ? e.detail.current : 0
    this.setData({ current: idx })
  },

  recalcPrices() {
    const unitPrice = 69
    const qty = Math.max(1, Number(this.data.quantity || 1))
    const total = unitPrice * qty
    this.setData({ price: unitPrice, totalPrice: total })
  },

  onSelectVariant(e) {
    const group = e.currentTarget.dataset.group
    const value = e.currentTarget.dataset.value
    this.setData({ [`selectedVariants.${group}`]: value }, () => {
      this.recalcPrices()
      // 同步选中态到渲染用的 variantGroups
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

  onAddToCart() {
    const item = {
      id: this.data.id,
      title: this.data.name,
      name: this.data.name,
      price: Number(this.data.price)||0,
      image: (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || '',
      quantity: Math.max(1, Number(this.data.quantity||1)) || 1,
      specs: this.data.selectedVariants || {}
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
  },

  onBuyNow() {
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

  onPreviewImage(e){
    const current = e.currentTarget.dataset.src
    const urls = this.data.images && this.data.images.length ? this.data.images : [current]
    try {
      wx.previewImage({ current, urls })
    } catch (err) {
      // 兼容性兜底：如果 previewImage 不可用，尝试用单张
      if (urls && urls[0]) wx.previewImage({ urls: [urls[0]] })
    }
  },

  onContact() {
    wx.navigateTo({ url: '/pages/support/contact/contact' })
  },

  onToggleFav() {
    const fav = !this.data.fav
    this.setData({ fav })
    try{
      const list = wx.getStorageSync('mall_favorites') || []
      if (fav) {
        const primaryImage = (this.data.images && this.data.images[0]) || (this.data.cloudFileIDs && this.data.cloudFileIDs[0]) || ''
        const item = {
          id: this.data.id,
          name: this.data.name,
          price: this.data.price,
          image: primaryImage,
          specs: this.data.selectedVariants || {}
        }
        const exists = list.some(i => i.id === item.id)
        if (!exists) list.unshift(item)
        wx.setStorageSync('mall_favorites', list)
      } else {
        const next = (list || []).filter(i => i.id !== this.data.id)
        wx.setStorageSync('mall_favorites', next)
      }
    }catch(e){}
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'none' })
  },

  onGoCart() {
    wx.navigateTo({ url: '/pages/mall/cart/cart' })
  }
})
