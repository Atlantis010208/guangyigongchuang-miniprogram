/**
 * 购物车页面
 * 功能：展示购物车列表、增减数量、删除商品、批量操作、结算
 */
const util = require('../../../utils/util')

Page({
  data: {
    items: [],              // 购物车商品列表
    total: 0,               // 总金额 (元) - 仅作为参考或显示
    totalPrice: 0,          // 总金额 (分) - 用于 SubmitBar
    totalQuantity: 0,       // 总数量
    selectedIds: [],        // 选中的商品 key 数组
    allChecked: false,      // 是否全选
    loading: false,         // 加载状态
    syncing: false          // 同步状态
  },

  onLoad() {
    this.load()
  },

  onShow() {
    this.load()
    // 每次显示时更新 TabBar 徽标（如果有）
    this.updateTabBarBadge()
  },

  updateTabBarBadge() {
    const count = this.data.totalQuantity
    if (count > 0) {
      wx.setTabBarBadge({
        index: 2, // 假设购物车是第3个 tab
        text: count + ''
      }).catch(e => {})
    } else {
      wx.removeTabBarBadge({
        index: 2
      }).catch(e => {})
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.load().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载购物车数据
   */
  async load() {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      const res = await util.callCf('cart_operations', {
        action: 'get'
      })
      
      if (res && res.success && res.data) {
        const { items } = res.data
        
        // 确保每个商品有唯一 key，并格式化规格文本
        const itemsWithKeys = (items || []).map((item, index) => {
          if (!item._key) {
            item._key = `${item.id}_${index}_${Date.now()}`
          }
          // 预先格式化规格文本
          item.specsText = this.formatSpecs(item.specs)
          return item
        })
        
        // 默认全选？通常购物车加载时不全选，或者记住上次选择。这里保持不全选或根据逻辑。
        // 为了方便用户，可以默认全选。
        // const allKeys = itemsWithKeys.map(i => i._key)
        
        this.setData({
          items: itemsWithKeys,
          // selectedIds: allKeys 
        }, () => this.calcTotal())
        
        // 同步到本地缓存作为备份
        wx.setStorageSync('cartItems', itemsWithKeys)
      } else {
        console.warn('云函数获取购物车失败:', res?.message)
        this.loadFromLocal()
      }
    } catch (err) {
      console.error('加载购物车失败:', err)
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 从本地缓存加载数据（降级方案）
   */
  loadFromLocal() {
    const items = wx.getStorageSync('cartItems') || []
    console.log('从本地加载购物车:', items.length, '件商品')
    
    // 为每个商品生成唯一 key，并格式化规格文本
    const itemsWithKeys = items.map((item, index) => {
      if (!item._key) {
        item._key = `${item.id}_${index}_${Date.now()}`
      }
      // 预先格式化规格文本
      item.specsText = this.formatSpecs(item.specs)
      return item
    })
    
    // 处理 cloud:// 图片
    this.processCloudImages(itemsWithKeys)
  },

  /**
   * 处理云存储图片链接
   */
  processCloudImages(items) {
    // 确保每个商品都有 specsText
    const itemsWithSpecs = (items || []).map(item => {
      if (!item.specsText) {
        item.specsText = this.formatSpecs(item.specs)
      }
      return item
    })
    
    const fileList = itemsWithSpecs
      .map(i => i && i.image)
      .filter(src => typeof src === 'string' && src.startsWith('cloud://'))
    
    if (fileList.length && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList }).then(res => {
        const dict = {}
        ;(res && res.fileList || []).forEach(x => {
          dict[x.fileID] = x.tempFileURL
        })
        
        const mapped = itemsWithSpecs.map(i => {
          if (i && typeof i.image === 'string' && i.image.startsWith('cloud://') && dict[i.image]) {
            return Object.assign({}, i, { image: dict[i.image] })
          }
          return i
        })
        
        this.setData({ items: mapped }, () => this.calcTotal())
      }).catch(() => {
        this.setData({ items: itemsWithSpecs }, () => this.calcTotal())
      })
    } else {
      this.setData({ items: itemsWithSpecs }, () => this.calcTotal())
    }
  },

  /**
   * 计算总价 (基于选中商品)
   */
  calcTotal() {
    const { items, selectedIds } = this.data
    const selectedSet = new Set(selectedIds)
    
    let total = 0
    let totalQuantity = 0
    let selectedPrice = 0 // 单位: 元
    
    // 计算购物车总数量（不管是否选中）
    totalQuantity = items.reduce((sum, item) => sum + (Math.max(1, parseInt(item.quantity) || 1)), 0)
    
    // 计算选中商品的总价
    items.forEach(item => {
      if (selectedSet.has(item._key)) {
        const price = parseFloat(item.price) || 0
        const quantity = Math.max(1, parseInt(item.quantity) || 1)
        selectedPrice += price * quantity
      }
    })
    
    const allChecked = items.length > 0 && selectedIds.length === items.length

    this.setData({
      total: selectedPrice.toFixed(2),
      totalPrice: Math.round(selectedPrice * 100), // 转换为分
      totalQuantity,
      allChecked
    })
    
    this.updateTabBarBadge()
  },

  /**
   * 格式化规格显示
   */
  formatSpecs(specs) {
    try {
      return Object.keys(specs || {}).map(k => `${k}: ${specs[k]}`).join('  ')
    } catch (e) {
      return ''
    }
  },

  /**
   * 根据 ID 查找商品索引
   */
  findIndexById(id) {
    return (this.data.items || []).findIndex(i => i.id === id)
  },

  /**
   * 增加数量
   */
  async inc(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.findIndexById(id)
    if (idx < 0) return
    
    const item = this.data.items[idx]
    const newQuantity = Math.max(1, parseInt(item.quantity) || 1) + 1
    
    this.updateItemQuantity(idx, newQuantity)
  },

  /**
   * 减少数量
   */
  async dec(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.findIndexById(id)
    if (idx < 0) return
    
    const item = this.data.items[idx]
    const currentQty = Math.max(1, parseInt(item.quantity) || 1)
    
    if (currentQty <= 1) {
      // 数量为1时减少，询问是否删除
      const confirm = await util.showConfirm('确定要删除该商品吗？')
      if (confirm) {
        this.remove(id)
      }
      return
    }
    
    const newQuantity = currentQty - 1
    this.updateItemQuantity(idx, newQuantity)
  },

  /**
   * 更新商品数量（封装）
   */
  async updateItemQuantity(idx, newQuantity) {
    const item = this.data.items[idx]
    
    // 先乐观更新
    const items = [...this.data.items]
    items[idx].quantity = newQuantity
    this.setData({ items }, () => this.calcTotal())
    
    // 同步到云端
    try {
      await util.callCf('cart_operations', {
        action: 'update',
        cartItemId: item.cartItemId || item._key,
        productId: item.id,
        quantity: newQuantity
      })
      wx.setStorageSync('cartItems', this.data.items)
    } catch (err) {
      console.error('更新数量失败:', err)
      // 回滚? 暂时不做复杂回滚，重新加载即可
    }
  },

  /**
   * 移除单个商品
   * @param {Event|string} eOrId - 事件对象或商品ID
   */
  async remove(eOrId) {
    // 兼容两种调用方式：事件对象 或 直接传入 id
    const id = typeof eOrId === 'string' ? eOrId : eOrId?.currentTarget?.dataset?.id
    
    if (!id) {
      console.error('删除失败：未获取到商品ID')
      return
    }
    
    const item = this.data.items.find(i => i.id === id)
    if (!item) {
      console.error('删除失败：未找到商品', id)
      return
    }
    
    // 先乐观更新
    const items = (this.data.items || []).filter(i => i.id !== id)
    // 同时移除选中状态
    const selectedIds = this.data.selectedIds.filter(k => k !== item._key)
    
    this.setData({ items, selectedIds }, () => this.calcTotal())
    
    // 显示删除成功提示
    wx.showToast({
      title: '已删除',
      icon: 'success',
      duration: 1500
    })
    
    try {
      await util.callCf('cart_operations', {
        action: 'remove',
        cartItemId: item.cartItemId || item._key,
        productId: id
      })
      wx.setStorageSync('cartItems', items)
    } catch (err) {
      console.error('移除商品失败:', err)
    }
  },

  /**
   * 切换选中状态
   */
  onToggleSelect(e) {
    const key = e.currentTarget.dataset.key
    let selectedIds = [...this.data.selectedIds]
    const index = selectedIds.indexOf(key)
    
    if (index > -1) {
      selectedIds.splice(index, 1)
    } else {
      selectedIds.push(key)
    }
    
    this.setData({ selectedIds }, () => this.calcTotal())
  },

  /**
   * 全选/取消全选
   */
  onToggleSelectAll(e) {
    // Vant checkbox change event returns detail as boolean
    // But sometimes we trigger this from a button. 
    // If e.detail is boolean, use it. Otherwise toggle based on allChecked.
    const isChecked = typeof e.detail === 'boolean' ? e.detail : !this.data.allChecked
    
    let selectedIds = []
    if (isChecked) {
      selectedIds = this.data.items.map(item => item._key)
    }
    
    this.setData({ 
      selectedIds,
      allChecked: isChecked
    }, () => this.calcTotal())
  },

  /**
   * 提交订单
   */
  onSubmit() {
    const { selectedIds, items } = this.data
    
    if (selectedIds.length === 0) {
      util.showToast('请选择要结算的商品')
      return
    }
    
    const selectedItems = items.filter(i => selectedIds.includes(i._key))
    
    const payload = encodeURIComponent(JSON.stringify({ items: selectedItems }))
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?multi=${payload}`
    })
  },

  /**
   * 跳转到商城
   */
  goMall() {
    wx.switchTab({
      url: '/pages/index/index' // 假设首页是 index
    }).catch(() => {
      wx.navigateTo({
        url: '/pages/mall/mall'
      })
    })
  },
  
  /**
   * 跳转商品详情
   */
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/mall/product-detail/product-detail?id=${id}`
      })
    }
  },

  /**
   * 联系客服
   */
  onContact() {
    wx.navigateTo({
      url: '/pages/support/contact/contact'
    })
  },
  
  // 防止事件冒泡的空函数
  stopBubble() {}
})
