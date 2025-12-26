// pages/mall/product-detail/product-detail.js
const util = require('../../../utils/util')

Page({
  data: {
    id: '',
    name: '商品名称',
    price: 0,
    images: [
      'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
    ],
    desc: '以简约设计还原真实光影，显指高、眩光低，适配多种空间。',
    params: [
      { key: '色温', value: '3000K / 4000K 可选' },
      { key: '显色指数', value: 'Ra ≥ 90' },
      { key: '功率', value: '24W / 36W' },
      { key: '材质', value: '铝合金 + PMMA' }
    ],
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
    
    // 检查是否是演示商品 (p1-p12)
    const demoIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']
    if (demoIds.includes(id)) {
      // 使用演示数据
      this.loadDemoProduct(id)
    } else {
      // 从云数据库获取真实商品数据
      this.loadProductFromCloud(id)
    }
    
    this.syncFavState()
    this.syncCartCount()
  },

  /**
   * 加载演示商品数据（p1-p12）
   */
  loadDemoProduct(id) {
    let name = '商品名称', price = 0
    if (id === 'p1') { name = '极简吸顶灯 40cm'; price = 399 }
    if (id === 'p2') { name = '观月组合 5+6'; price = 1820 }
    if (id === 'p3') { name = '轨道射灯 12W'; price = 129 }
    if (id === 'p4') { name = '磁吸灯套装'; price = 899 }
    if (id === 'p5') { name = '智能筒灯 10W'; price = 89 }
    if (id === 'p6') { name = '线型吊灯 1.2m'; price = 599 }
    if (id === 'p7') { name = '床头壁灯'; price = 219 }
    if (id === 'p8') { name = '庭院草坪灯'; price = 159 }
    if (id === 'p9') { name = '落地阅读灯'; price = 329 }
    if (id === 'p10') { name = '氛围灯带 5m'; price = 199 }
    if (id === 'p11') { name = '厨房橱柜灯'; price = 149 }
    if (id === 'p12') { name = '镜前灯 9W'; price = 189 }
    
    const meta = this.getProductMetaById(id)
    this.setData({ name, price, images: meta.images, desc: meta.desc })
    
    // 初始化规格配置与默认选择
    const cfg = this.getSkuConfigByProductId(id)
    const defaults = {}
    ;(cfg.variantGroups || []).forEach(g => { defaults[g.key] = g.options[0] })
    const enriched = this.enrichVariantGroups(cfg.variantGroups || [], defaults)
    this.setData({ variantGroups: enriched, selectedVariants: defaults }, () => {
      this.recalcPrices()
      this.recalcParams()
      this.updateSelectedSpecsText()
    })
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

  getSkuConfigByProductId(id){
    // 定义每个商品的规格项与定价规则
    switch(id){
      case 'p1': // 极简吸顶灯
        return {
          variantGroups: [
            { key: 'size', name: '尺寸', options: ['40cm', '50cm', '60cm', '70cm'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '3500K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['无', '三段调光', '无极调光', '蓝牙Mesh'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色', '灰色', '香槟金'] }
          ],
          getUnitPrice: (sel)=>{
            // 基础价按尺寸
            const baseMap = { '40cm': 399, '50cm': 549, '60cm': 699, '70cm': 899 }
            const base = baseMap[sel.size] || 399
            // 无极调光加价
            const dimmingDelta = sel.dimming === '无极调光' ? 100 : (sel.dimming === '蓝牙Mesh' ? 80 : 0)
            return base + dimmingDelta
          }
        }
      case 'p2': // 观月组合
        return {
          variantGroups: [
            { key: 'combo', name: '组合', options: ['5+6', '4+5+6', '6+8'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色', '香槟金'] }
          ],
          getUnitPrice: (sel)=>{
            const map = { '5+6': 1820, '4+5+6': 2470, '6+8': 2990 }
            return map[sel.combo] || 1820
          }
        }
      case 'p3': // 轨道射灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['10W', '12W', '20W', '30W', '35W'] },
            { key: 'beam', name: '光束角', options: ['10°', '15°', '24°', '36°', '55°'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '4000K', '5000K'] },
            { key: 'track', name: '轨道', options: ['二线', '三线', '四线(DALI)'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '10W': 109, '12W': 129, '20W': 169, '30W': 219, '35W': 259 }
            const base = baseMap[sel.power] || 129
            const trackDelta = sel.track === '四线(DALI)' ? 60 : 0
            return base + trackDelta
          }
        }
      case 'p4': // 磁吸灯套装
        return {
          variantGroups: [
            { key: 'kit', name: '套装', options: ['S', 'M', 'L', 'Pro'] },
            { key: 'rail', name: '导轨长度', options: ['1m', '1.5m', '2m', '2.5m'] },
            { key: 'dimming', name: '调光', options: ['无', '蓝牙Mesh', '0-10V', 'DALI'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { 'S': 899, 'M': 1299, 'L': 1699, 'Pro': 2199 }
            const base = baseMap[sel.kit] || 899
            const railDelta = sel.rail==='1.5m' ? 120 : (sel.rail==='2m' ? 220 : (sel.rail==='2.5m' ? 320 : 0))
            const dimmingDelta = sel.dimming==='蓝牙Mesh' ? 200 : (sel.dimming==='0-10V' ? 300 : (sel.dimming==='DALI' ? 400 : 0))
            return base + railDelta + dimmingDelta
          }
        }
      case 'p5': // 智能筒灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['5W', '7W', '10W', '13W', '18W'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '3500K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['可控硅', '0-10V', 'DALI'] },
            { key: 'color', name: '颜色', options: ['白色', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '5W': 69, '7W': 79, '10W': 89, '13W': 109, '18W': 139 }
            const base = baseMap[sel.power] || 89
            const dimmingDelta = sel.dimming==='0-10V' ? 30 : (sel.dimming==='DALI' ? 60 : 0)
            return base + dimmingDelta
          }
        }
      case 'p6': // 线型吊灯
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['0.6m', '0.9m', '1.2m', '1.5m', '1.8m', '2.4m'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K', '5000K'] },
            { key: 'dimming', name: '调光', options: ['无', '0-10V', 'DALI'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '0.6m': 399, '0.9m': 499, '1.2m': 599, '1.5m': 699, '1.8m': 899, '2.4m': 1199 }
            const base = baseMap[sel.length] || 599
            const dimmingDelta = sel.dimming==='0-10V' ? 120 : (sel.dimming==='DALI' ? 220 : 0)
            return base + dimmingDelta
          }
        }
      case 'p7': // 床头壁灯
        return {
          variantGroups: [
            { key: 'finish', name: '表面处理', options: ['黄铜', '拉丝镍', '黑色', '白色'] },
            { key: 'cct', name: '色温', options: ['2700K', '3000K', '4000K'] },
            { key: 'switch', name: '开关', options: ['带开关', '不带开关', '带USB'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '黄铜': 279, '黑色': 219, '白色': 219 }
            const base = baseMap[sel.finish] || 219
            const switchDelta = sel.switch==='不带开关' ? -20 : (sel.switch==='带USB' ? 30 : 0)
            return base + switchDelta
          }
        }
      case 'p8': // 庭院草坪灯
        return {
          variantGroups: [
            { key: 'height', name: '高度', options: ['30cm', '45cm', '60cm', '80cm'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K'] },
            { key: 'ip', name: '防护等级', options: ['IP65', 'IP67'] },
            { key: 'color', name: '颜色', options: ['深空灰', '黑色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '30cm': 159, '45cm': 189, '60cm': 229, '80cm': 289 }
            const base = baseMap[sel.height] || 159
            const ipDelta = sel.ip==='IP67' ? 40 : 0
            return base + ipDelta
          }
        }
      case 'p9': // 落地阅读灯
        return {
          variantGroups: [
            { key: 'adjust', name: '色温可调', options: ['否', '是', '无极可调'] },
            { key: 'color', name: '颜色', options: ['黑色', '白色', '灰色'] }
          ],
          getUnitPrice: (sel)=>{
            const base = 329
            const adj = sel.adjust==='是' ? 70 : (sel.adjust==='无极可调' ? 120 : 0)
            return base + adj
          }
        }
      case 'p10': // 氛围灯带
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['2m', '5m', '10m', '15m'] },
            { key: 'type', name: '类型', options: ['单色', 'RGBW', 'RGBIC'] },
            { key: 'control', name: '控制', options: ['无', '蓝牙', 'Wi-Fi', 'Zigbee'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '2m': 79, '5m': 199, '10m': 349, '15m': 499 }
            const base = baseMap[sel.length] || 199
            const typeDelta = sel.type==='RGBIC' ? 80 : (sel.type==='RGBW' ? 60 : 0)
            const ctrlDelta = sel.control==='蓝牙' ? 40 : (sel.control==='Wi-Fi' ? 60 : (sel.control==='Zigbee' ? 80 : 0))
            return base + typeDelta + ctrlDelta
          }
        }
      case 'p11': // 厨房橱柜灯
        return {
          variantGroups: [
            { key: 'length', name: '长度', options: ['30cm', '60cm', '90cm', '120cm'] },
            { key: 'sensor', name: '传感器', options: ['否', '手扫', '人体感应'] },
            { key: 'cct', name: '色温', options: ['4000K'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '30cm': 99, '60cm': 149, '90cm': 199, '120cm': 239 }
            const base = baseMap[sel.length] || 149
            const sensor = sel.sensor==='人体感应' ? 30 : (sel.sensor==='手扫' ? 40 : 0)
            return base + sensor
          }
        }
      case 'p12': // 镜前灯
        return {
          variantGroups: [
            { key: 'power', name: '功率', options: ['9W', '12W', '18W', '24W'] },
            { key: 'cct', name: '色温', options: ['3000K', '4000K', '5000K'] },
            { key: 'color', name: '颜色', options: ['镀铬', '黑色', '金色'] }
          ],
          getUnitPrice: (sel)=>{
            const baseMap = { '9W': 189, '12W': 229, '18W': 269, '24W': 329 }
            const base = baseMap[sel.power] || 189
            return base
          }
        }
      default:
        return { variantGroups: [], getUnitPrice: ()=> this.data.price || 0 }
    }
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

  getProductMetaById(id){
    switch(id){
      case 'p1':
        return {
          desc: '极简圆形吸顶灯，均匀面光，适合卧室客厅等空间。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg'
          ]
        }
      case 'p2':
        return {
          desc: '环形吊灯组合，适配多种户型空间，营造柔和氛围。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg'
          ]
        }
      case 'p3':
        return {
          desc: '高显指轨道射灯，支持多种光束角度，突出重点陈列。',
          images: [
            'https://images.pexels.com/photos/269218/pexels-photo-269218.jpeg',
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg'
          ]
        }
      case 'p4':
        return {
          desc: '通用磁吸轨道照明套装，按需自由组合，快速部署。',
          images: [
            'https://images.pexels.com/photos/269063/pexels-photo-269063.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p5':
        return {
          desc: '智能筒灯，支持多种调光协议，显指高，防眩舒适。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg'
          ]
        }
      case 'p6':
        return {
          desc: '线型吊灯，光线均匀，适用于餐桌与办公工位。',
          images: [
            'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p7':
        return {
          desc: '床头壁灯，局部阅读照明与氛围兼顾，低眩光设计。',
          images: [
            'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg',
            'https://images.pexels.com/photos/704590/pexels-photo-704590.jpeg'
          ]
        }
      case 'p8':
        return {
          desc: '户外草坪灯，出光柔和，耐候型涂层，支持高防护等级。',
          images: [
            'https://images.pexels.com/photos/462235/pexels-photo-462235.jpeg',
            'https://images.pexels.com/photos/271618/pexels-photo-271618.jpeg'
          ]
        }
      case 'p9':
        return {
          desc: '可调光阅读落地灯，指向性强，适合沙发与书桌旁。',
          images: [
            'https://images.pexels.com/photos/1248583/pexels-photo-1248583.jpeg',
            'https://images.pexels.com/photos/331692/pexels-photo-331692.jpeg'
          ]
        }
      case 'p10':
        return {
          desc: '氛围灯带，支持 RGBIC 与蓝牙/Wi‑Fi 控制，多场景联动。',
          images: [
            'https://images.pexels.com/photos/7130537/pexels-photo-7130537.jpeg',
            'https://images.pexels.com/photos/1121123/pexels-photo-1121123.jpeg'
          ]
        }
      case 'p11':
        return {
          desc: '橱柜线性灯，磁吸安装与手扫感应可选，明亮不刺眼。',
          images: [
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg'
          ]
        }
      case 'p12':
        return {
          desc: '防雾镜前灯，显色真实，IP44 防护适配卫浴环境。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/842946/pexels-photo-842946.jpeg'
          ]
        }
      default:
        return {
          desc: '以简约设计还原真实光影，显指高、眩光低，适配多种空间。',
          images: [
            'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg',
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg'
          ]
        }
    }
  },

  computeParamsBySelection(id, sel){
    switch(id){
      case 'p1': {
        const powerMap = { '40cm': '24W', '50cm': '36W', '60cm': '48W', '70cm': '60W' }
        return [
          { key: '尺寸', value: sel.size || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率', value: powerMap[sel.size] || '—' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金 + PMMA 导光板' }
        ]
      }
      case 'p2': {
        const wattMap = { '5+6': '120W', '4+5+6': '180W', '6+8': '240W' }
        return [
          { key: '组合', value: sel.combo || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率范围', value: wattMap[sel.combo] || '—' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p3': {
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '光束角', value: sel.beam || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '轨道', value: sel.track || '-' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金压铸灯体' }
        ]
      }
      case 'p4': {
        return [
          { key: '套装', value: sel.kit || '-' },
          { key: '导轨长度', value: sel.rail || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '系统电压', value: 'DC48V 磁吸系统' }
        ]
      }
      case 'p5': {
        const cutoutMap = { '5W': '55mm', '7W': '70mm', '10W': '90mm', '13W': '105mm', '18W': '120mm' }
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '开孔', value: cutoutMap[sel.power] || '—' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p6': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '调光', value: sel.dimming || '-' },
          { key: '材质', value: '铝型材 + 亚克力' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p7': {
        return [
          { key: '表面处理', value: sel.finish || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '开关', value: sel.switch || '-' },
          { key: '功率', value: '6W' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p8': {
        return [
          { key: '高度', value: sel.height || '-' },
          { key: '色温', value: sel.cct || '3000K' },
          { key: '防护等级', value: sel.ip || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' },
          { key: '材质', value: '铝合金机身，钢化玻璃' }
        ]
      }
      case 'p9': {
        return [
          { key: '色温可调', value: sel.adjust || '-' },
          { key: '颜色', value: sel.color || '-' },
          { key: '功率', value: '10W' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      case 'p10': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '类型', value: sel.type || '-' },
          { key: '控制', value: sel.control || '-' },
          { key: '工作电压', value: 'DC24V' },
          { key: '防护等级', value: 'IP20（室内）' }
        ]
      }
      case 'p11': {
        return [
          { key: '长度', value: sel.length || '-' },
          { key: '传感器', value: sel.sensor || '-' },
          { key: '色温', value: '4000K' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '工作电压', value: 'DC12V' },
          { key: '安装方式', value: '磁吸 / 螺丝固定' }
        ]
      }
      case 'p12': {
        return [
          { key: '功率', value: sel.power || '-' },
          { key: '色温', value: sel.cct || '-' },
          { key: '防护等级', value: 'IP44' },
          { key: '颜色', value: sel.color || '-' },
          { key: '输入电压', value: 'AC220V' }
        ]
      }
      default:
        return [
          { key: '色温', value: '3000K / 4000K 可选' },
          { key: '显色指数', value: 'Ra ≥ 90' },
          { key: '功率', value: '视规格而定' },
          { key: '材质', value: '铝合金 + PMMA' }
        ]
    }
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


