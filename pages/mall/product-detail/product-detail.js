// pages/mall/product-detail/product-detail.js
const util = require('../../../utils/util')

Page({
  data: {
    id: '',
    name: '',
    price: 0,
    images: [],
    desc: '',
    params: [],
    variantGroups: [],
    selectedVariants: {},
    selectedSpecsText: '',  // 已选规格文字描述
    quantity: 1,
    fav: false,
    favIcon: 'like-o',  // 收藏图标，用于 Vant 商品导航
    cartCount: 0,  // 购物车商品数量，用于 Vant 商品导航 info 徽标显示
    product: null,  // 完整商品数据 (用于 product-specs 组件)
    showSkuPopup: false,  // 规格选择弹窗显示状态
    skuAction: ''  // 当前操作类型：'cart' | 'buy' | 'preview'
  },

  onLoad(query) {
    const { id } = query || {}
    this.setData({ id })
    
    // 统一从云数据库获取真实商品数据
    this.loadProductFromCloud(id)
    
    this.syncFavState()
    this.syncCartCount()
  },

  /**
   * 从云数据库获取真实商品数据
   */
  async loadProductFromCloud(productId) {
    wx.showLoading({ title: '加载中...' })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'product_detail',
        data: { productId }
      })
      
      wx.hideLoading()
      
      if (res.result && res.result.success && res.result.data) {
        const product = res.result.data.product
        
        // 设置商品基本信息
        const images = product.images && product.images.length > 0 
          ? product.images 
          : (product.coverImage ? [product.coverImage] : this.data.images)
        
        this.setData({
          name: product.name || '商品名称',
          price: product.price || 0,
          images: images,
          desc: product.description || '暂无描述',
          // 保存原始商品数据，用于加入购物车等操作
          _cloudProduct: product,
          // 完整商品数据 (用于 product-specs 组件展示灯具参数)
          product: product
        })
        
        // 处理 SKU 规格
        if (product.skuConfig && product.skuConfig.variantGroups && product.skuConfig.variantGroups.length > 0) {
          const variantGroups = product.skuConfig.variantGroups
          const defaults = {}
          variantGroups.forEach(g => {
            if (g.options && g.options.length > 0) {
              defaults[g.key] = g.options[0]
            }
          })
          const enriched = this.enrichVariantGroups(variantGroups, defaults)
          this.setData({ 
            variantGroups: enriched, 
            selectedVariants: defaults,
            _hasCloudSku: true
          }, () => {
            this.recalcCloudPrices()
            this.recalcCloudParams(product)
            this.updateSelectedSpecsText()
          })
        } else {
          // 没有 SKU 配置，使用商品基础规格
          const params = this.buildParamsFromProduct(product)
          this.setData({ 
            params,
            variantGroups: [],
            _hasCloudSku: false,
            selectedSpecsText: ''
          })
        }
      } else {
        wx.showToast({ title: res.result?.errorMessage || '商品不存在', icon: 'none' })
        // 显示默认数据
        this.setData({
          name: '商品不存在',
          price: 0,
          desc: '该商品可能已下架或不存在'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('获取商品详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 从云端商品数据构建规格参数
   */
  buildParamsFromProduct(product) {
    const params = []
    
    if (product.specifications && product.specifications.length > 0) {
      product.specifications.forEach(spec => {
        params.push({
          key: spec.key || spec.name,
          value: spec.value + (spec.unit || '')
        })
      })
    }
    
    // 添加一些基础参数
    if (product.stock !== undefined) {
      params.push({ key: '库存', value: product.stock > 0 ? '有货' : '缺货' })
    }
    if (product.sales !== undefined) {
      params.push({ key: '销量', value: `${product.sales}件` })
    }
    
    return params.length > 0 ? params : [
      { key: '暂无规格', value: '请联系客服了解详情' }
    ]
  },

  /**
   * 重新计算云端商品价格
   */
  recalcCloudPrices() {
    const product = this.data._cloudProduct
    if (!product) return
    
    // 如果有 SKU 组合，根据选择计算价格
    if (product.skuCombinations && product.skuCombinations.length > 0) {
      const selected = this.data.selectedVariants || {}
      // 查找匹配的 SKU 组合
      const matchedSku = product.skuCombinations.find(sku => {
        if (!sku.combinations) return false
        return Object.keys(selected).every(key => sku.combinations[key] === selected[key])
      })
      
      if (matchedSku) {
        const unit = matchedSku.price || product.price
        const qty = Math.max(1, Number(this.data.quantity || 1))
        this.setData({ price: unit, totalPrice: unit * qty })
        return
      }
    }
    
    // 没有匹配的 SKU，使用基础价格
    const unit = product.price || 0
    const qty = Math.max(1, Number(this.data.quantity || 1))
    this.setData({ price: unit, totalPrice: unit * qty })
  },

  /**
   * 重新计算云端商品规格参数
   */
  recalcCloudParams(product) {
    if (!product) product = this.data._cloudProduct
    if (!product) return
    
    const sel = this.data.selectedVariants || {}
    const params = []
    
    // 添加选中的规格
    Object.keys(sel).forEach(key => {
      const group = (product.skuConfig?.variantGroups || []).find(g => g.key === key)
      if (group) {
        params.push({ key: group.name || key, value: sel[key] })
      }
    })
    
    // 添加商品基础规格
    if (product.specifications) {
      product.specifications.forEach(spec => {
        params.push({
          key: spec.key || spec.name,
          value: spec.value + (spec.unit || '')
        })
      })
    }
    
    this.setData({ params: params.length > 0 ? params : this.buildParamsFromProduct(product) })
  },

  onShow(){
    this.syncFavState()
    this.syncCartCount()
  },

  /**
   * 显示规格选择弹窗
   */
  onShowSkuPopup(e) {
    const action = e.currentTarget.dataset.action || 'preview'
    this.setData({ 
      showSkuPopup: true,
      skuAction: action
    })
  },

  /**
   * 关闭规格选择弹窗
   */
  onCloseSkuPopup() {
    this.setData({ showSkuPopup: false })
  },

  /**
   * 数量变化回调 (Vant Stepper)
   */
  onQuantityChange(e) {
    const quantity = e.detail
    this.setData({ quantity }, () => {
      if (this.data._hasCloudSku || this.data._cloudProduct) {
        this.recalcCloudPrices()
      } else {
        this.recalcPrices()
      }
    })
  },

  /**
   * 更新已选规格文字描述
   */
  updateSelectedSpecsText() {
    const { variantGroups, selectedVariants } = this.data
    if (!variantGroups || variantGroups.length === 0) {
      this.setData({ selectedSpecsText: '' })
      return
    }
    
    const texts = []
    variantGroups.forEach(group => {
      const selected = selectedVariants[group.key]
      if (selected) {
        // 移除括号及其内容，保持显示简洁
        const cleanText = selected.replace(/[\(（][^\)）]*[\)）]/g, '').trim()
        texts.push(cleanText)
      }
    })
    
    this.setData({ 
      selectedSpecsText: texts.length > 0 ? texts.join(' / ') : '请选择规格'
    })
  },

  /**
   * 弹窗内确认加入购物车
   */
  async onConfirmAddToCart() {
    // 检查登录状态
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.setData({ showSkuPopup: false })
      this.showLoginPrompt('加入购物车')
      return
    }
    
    // 关闭弹窗
    this.setData({ showSkuPopup: false })
    
    // 执行加入购物车
    await this.doAddToCart()
  },

  /**
   * 弹窗内确认立即购买
   */
  onConfirmBuyNow() {
    // 检查登录状态
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.setData({ showSkuPopup: false })
      this.showLoginPrompt('立即购买')
      return
    }
    
    // 关闭弹窗
    this.setData({ showSkuPopup: false })
    
    // 执行购买
    this.doBuyNow()
  },

  /**
   * 同步购物车商品数量（用于 Vant 商品导航 info 徽标显示）
   */
  syncCartCount() {
    try {
      const list = wx.getStorageSync('cartItems') || []
      // 计算购物车总数量
      const count = list.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
      this.setData({ cartCount: count })
    } catch (e) {
      console.error('同步购物车数量失败:', e)
    }
  },

  /**
   * 同步收藏状态（优先从云端获取，失败则从本地缓存）
   */
  async syncFavState() {
    try {
      const isFavorited = await util.checkFavorite(this.data.id)
      if (isFavorited !== this.data.fav) {
        this.setData({ fav: isFavorited, favIcon: isFavorited ? 'like' : 'like-o' })
      }
    } catch (e) {
      // 降级到本地存储
      try {
      const list = wx.getStorageSync('mall_favorites') || []
      const exists = (list || []).some(i => i.id === this.data.id)
      if (exists !== this.data.fav) this.setData({ fav: exists, favIcon: exists ? 'like' : 'like-o' })
      } catch (_) {}
    }
  },

  /**
   * 获取商品 SKU 配置（仅用于云端商品缺少 SKU 时的空返回）
   * 已移除演示商品的硬编码数据，所有商品数据均从云端获取
   */
  getSkuConfigByProductId(id){
    // 所有商品数据均从云端获取，不再使用硬编码的演示数据
    return { variantGroups: [], getUnitPrice: ()=> this.data.price || 0 }
  },

  recalcPrices(){
    const cfg = this.getSkuConfigByProductId(this.data.id)
    const unit = cfg.getUnitPrice ? cfg.getUnitPrice(this.data.selectedVariants || {}) : (this.data.price||0)
    const qty = Math.max(1, Number(this.data.quantity || 1))
    const total = unit * qty
    this.setData({ price: unit, totalPrice: total })
  },

  recalcParams(){
    const params = this.computeParamsBySelection(this.data.id, this.data.selectedVariants || {})
    this.setData({ params })
  },

  isSelected(groupKey, value) {
    const current = this.data.selectedVariants[groupKey]
    return current === value
  },
  onSelectVariant(e) {
    const group = e.currentTarget.dataset.group
    const value = e.currentTarget.dataset.value
    this.setData({ [`selectedVariants.${group}`]: value }, () => {
      // 判断是演示商品还是云端商品
      if (this.data._hasCloudSku) {
        this.recalcCloudPrices()
        this.recalcCloudParams()
        // 同步选中态到渲染用的 variantGroups
        const product = this.data._cloudProduct
        if (product && product.skuConfig) {
          const enriched = this.enrichVariantGroups(product.skuConfig.variantGroups || [], this.data.selectedVariants)
          this.setData({ variantGroups: enriched })
        }
      } else {
        this.recalcPrices()
        this.recalcParams()
        // 同步选中态到渲染用的 variantGroups
        const cfg = this.getSkuConfigByProductId(this.data.id)
        const enriched = this.enrichVariantGroups(cfg.variantGroups || [], this.data.selectedVariants)
        this.setData({ variantGroups: enriched })
      }
      // 更新已选规格文字
      this.updateSelectedSpecsText()
    })
  },
  onInc() {
    const q = Math.max(1, (this.data.quantity || 1) + 1)
    this.setData({ quantity: q }, () => {
      if (this.data._hasCloudSku || this.data._cloudProduct) {
        this.recalcCloudPrices()
      } else {
        this.recalcPrices()
        this.recalcParams()
      }
    })
  },

  enrichVariantGroups(groups, selected){
    return (groups || []).map(g => Object.assign({}, g, { selected: selected[g.key] }))
  },
  onDec() {
    const q = Math.max(1, (this.data.quantity || 1) - 1)
    this.setData({ quantity: q }, () => {
      if (this.data._hasCloudSku || this.data._cloudProduct) {
        this.recalcCloudPrices()
      } else {
        this.recalcPrices()
        this.recalcParams()
      }
    })
  },

  /**
   * 获取商品元数据（仅用于云端商品缺少数据时的默认值）
   * 已移除演示商品的硬编码数据，所有商品数据均从云端获取
   */
  getProductMetaById(id){
    // 返回空数据，让云端商品数据为主
    return {
      desc: '',
      images: []
    }
  },

  /**
   * 根据选择计算商品规格参数（仅用于本地数据时的空返回）
   * 已移除演示商品的硬编码数据，所有商品数据均从云端获取
   */
  computeParamsBySelection(id, sel){
    // 云端商品使用 recalcCloudParams，不再使用硬编码数据
    return []
  },

  /**
   * 底部导航栏加入购物车按钮 - 显示弹窗
   */
  onAddToCart(e) {
    this.onShowSkuPopup({ currentTarget: { dataset: { action: 'cart' } } })
  },

  /**
   * 执行加入购物车操作
   */
  async doAddToCart() {
    const item = {
      id: this.data.id,
      title: this.data.name,
      name: this.data.name,
      price: Number(this.data.price)||0,
      image: (this.data.images && this.data.images[0]) || '',
      quantity: Math.max(1, Number(this.data.quantity||1)),
      specs: this.data.selectedVariants || {}
    }
    
    // 显示加载中
    wx.showLoading({ title: '添加中...', mask: true })
    
    try {
      // 优先调用云函数同步到云端
      const res = await util.callCf('cart_operations', {
        action: 'add',
        product: {
          id: item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          specs: item.specs
        },
        quantity: item.quantity
      })
      
      wx.hideLoading()
      
      if (res && res.success) {
        // 同时更新本地缓存作为备份
        const list = wx.getStorageSync('cartItems') || []
        const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
        let merged = false
        for (const i of list) {
          const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
          if (k === key) { 
            i.quantity = Math.max(1, Number(i.quantity || 1)) + item.quantity
            merged = true
            break 
          }
        }
        if (!merged) list.unshift(item)
        wx.setStorageSync('cartItems', list)
        
        wx.showToast({ title: '已加入购物车', icon: 'success' })
      } else {
        // 云端失败，降级到本地存储
        console.warn('云端添加购物车失败，使用本地存储:', res?.message)
        this.addToCartLocal(item)
        wx.showToast({ title: '已加入购物车', icon: 'success' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('添加购物车失败:', err)
      // 降级到本地存储
      this.addToCartLocal(item)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    }
    
    // 更新购物车数量徽标
    this.syncCartCount()
  },
  
  /**
   * 本地存储添加购物车（降级方案）
   */
  addToCartLocal(item) {
    const list = wx.getStorageSync('cartItems') || []
    const key = JSON.stringify({ id: item.id, specs: item.specs || {} })
    let merged = false
    for (const i of list) {
      const k = JSON.stringify({ id: i.id, specs: i.specs || {} })
      if (k === key) { 
        i.quantity = Math.max(1, Number(i.quantity || 1)) + item.quantity
        merged = true
        break 
      }
    }
    if (!merged) list.unshift(item)
    wx.setStorageSync('cartItems', list)
  },
  /**
   * 底部导航栏立即购买按钮 - 显示弹窗
   */
  onBuyNow(e) {
    this.onShowSkuPopup({ currentTarget: { dataset: { action: 'buy' } } })
  },

  /**
   * 执行立即购买操作
   */
  doBuyNow() {
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
  onContact() {
    wx.navigateTo({ url: '/pages/support/contact/contact' })
  },
  /**
   * 切换收藏状态（调用云函数）
   */
  async onToggleFav() {
    // 检查登录状态
    const app = getApp()
    if (!app.isLoggedIn()) {
      this.showLoginPrompt('收藏商品')
      return
    }

    const currentFav = this.data.fav
    const product = {
        id: this.data.id,
        name: this.data.name,
        price: this.data.price,
        image: (this.data.images && this.data.images[0]) || '',
      specs: this.data.selectedVariants || {},
      description: this.data.desc || ''
    }

    // 先乐观更新 UI
    const newFav = !currentFav
    this.setData({ fav: newFav, favIcon: newFav ? 'like' : 'like-o' })

    try {
      const result = await util.toggleFavorite(product, currentFav)
      
      if (result.success) {
        wx.showToast({ title: result.message, icon: 'none' })
      } else {
        // 失败时恢复状态
        this.setData({ fav: currentFav, favIcon: currentFav ? 'like' : 'like-o' })
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err)
      // 失败时恢复状态
      this.setData({ fav: currentFav, favIcon: currentFav ? 'like' : 'like-o' })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },
  onGoCart() {
    wx.navigateTo({ url: '/pages/mall/cart/cart' })
  },

  /**
   * 显示登录提示弹窗
   * @param {string} action 操作名称，如"加入购物车"、"收藏商品"
   */
  showLoginPrompt(action) {
    wx.showModal({
      title: '需要登录',
      content: `${action}需要登录后操作，是否前往登录？`,
      confirmText: '去登录',
      cancelText: '暂不登录',
      success: (res) => {
        if (res.confirm) {
          // 登录成功后返回当前商品详情页
          const redirectUrl = `/pages/mall/product-detail/product-detail?id=${this.data.id}`
          wx.navigateTo({
            url: '/pages/auth/login/login?redirect=' + encodeURIComponent(redirectUrl)
          })
        }
      }
    })
  }
})


