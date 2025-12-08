/**
 * 购物车页面
 * 功能：展示购物车列表、增减数量、删除商品、批量操作、结算
 */
const util = require('../../../utils/util')

Page({
  data: {
    items: [],              // 购物车商品列表
    total: 0,               // 总金额
    totalQuantity: 0,       // 总数量
    isEditing: false,       // 是否编辑模式
    selectedIds: [],        // 选中的商品 key 数组
    loading: false,         // 加载状态
    syncing: false          // 同步状态
  },

  onLoad() {
    this.load()
  },

  onShow() {
    this.load()
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
        const { items, totalAmount, totalQuantity } = res.data
        
        // 确保每个商品有唯一 key，并格式化规格文本
        const itemsWithKeys = (items || []).map((item, index) => {
          if (!item._key) {
            item._key = `${item.id}_${index}_${Date.now()}`
          }
          // 预先格式化规格文本
          item.specsText = this.formatSpecs(item.specs)
          return item
        })
        
        this.setData({
          items: itemsWithKeys,
          total: parseFloat(totalAmount) || 0,
          totalQuantity: totalQuantity || 0
        })
        
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
   * @param {array} items - 商品列表
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
   * 计算总价
   */
  calcTotal() {
    const total = (this.data.items || []).reduce((sum, item) => {
      const price = parseFloat(item.price) || 0
      const quantity = Math.max(1, parseInt(item.quantity) || 1)
      return sum + price * quantity
    }, 0)
    
    const totalQuantity = (this.data.items || []).reduce((sum, item) => {
      return sum + Math.max(1, parseInt(item.quantity) || 1)
    }, 0)
    
    this.setData({ total, totalQuantity })
  },

  /**
   * 格式化规格显示
   * @param {object} specs - 规格对象
   * @returns {string} 格式化后的字符串
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
   * @param {string} id - 商品ID
   * @returns {number} 索引
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
    
    // 先更新本地显示
    const items = [...this.data.items]
    items[idx].quantity = newQuantity
    this.setData({ items }, () => this.calcTotal())
    
    // 同步到云端
    try {
      await util.callCf('cart_operations', {
        action: 'update',
        cartItemId: item.cartItemId || item._key,
        productId: id,
        quantity: newQuantity
      })
      
      // 更新本地缓存
      wx.setStorageSync('cartItems', this.data.items)
    } catch (err) {
      console.error('更新数量失败:', err)
    }
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
    
    // 数量为1时不能再减
    if (currentQty <= 1) {
      util.showToast('商品数量不能小于1')
      return
    }
    
    const newQuantity = currentQty - 1
    
    // 先更新本地显示
    const items = [...this.data.items]
    items[idx].quantity = newQuantity
    this.setData({ items }, () => this.calcTotal())
    
    // 同步到云端
    try {
      await util.callCf('cart_operations', {
        action: 'update',
        cartItemId: item.cartItemId || item._key,
        productId: id,
        quantity: newQuantity
      })
      
      // 更新本地缓存
      wx.setStorageSync('cartItems', this.data.items)
    } catch (err) {
      console.error('更新数量失败:', err)
    }
  },

  /**
   * 移除单个商品
   */
  async remove(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find(i => i.id === id)
    
    if (!item) return
    
    // 先更新本地显示
    const items = (this.data.items || []).filter(i => i.id !== id)
    this.setData({ items }, () => this.calcTotal())
    
    // 同步到云端
    try {
      await util.callCf('cart_operations', {
        action: 'remove',
        cartItemId: item.cartItemId || item._key,
        productId: id
      })
      
      // 更新本地缓存
      wx.setStorageSync('cartItems', items)
    } catch (err) {
      console.error('移除商品失败:', err)
    }
  },

  /**
   * 切换编辑模式
   */
  onToggleEdit() {
    const isEditing = !this.data.isEditing
    this.setData({
      isEditing,
      selectedIds: []
    })
  },

  /**
   * 切换选中状态
   */
  onToggleSelect(e) {
    const key = e.currentTarget.dataset.key
    console.log('切换选中:', key)
    
    if (!key) {
      console.warn('商品 key 不存在')
      return
    }
    
    let selectedIds = [...(this.data.selectedIds || [])]
    const index = selectedIds.indexOf(key)
    
    if (index > -1) {
      selectedIds.splice(index, 1)
    } else {
      selectedIds.push(key)
    }
    
    this.setData({ selectedIds })
  },

  /**
   * 全选/取消全选
   */
  onToggleSelectAll() {
    const { items, selectedIds } = this.data
    
    if (selectedIds.length === items.length) {
      // 已全选，取消全选
      this.setData({ selectedIds: [] })
    } else {
      // 未全选，执行全选
      const allKeys = items.map(item => item._key)
      this.setData({ selectedIds: allKeys })
    }
  },

  /**
   * 批量删除
   */
  async onBatchDelete() {
    const keys = this.data.selectedIds || []
    if (keys.length === 0) {
      util.showToast('请选择要删除的商品')
      return
    }
    
    const confirm = await util.showConfirm(`确定删除选中的 ${keys.length} 件商品吗？`)
    if (!confirm) return
    
    const keySet = new Set(keys)
    
    // 先更新本地显示
    const items = (this.data.items || []).filter(i => !keySet.has(i._key))
    this.setData({
      items,
      selectedIds: []
    }, () => this.calcTotal())
    
    // 同步到云端
    try {
      await util.callCf('cart_operations', {
        action: 'batch_remove',
        keys: keys
      })
      
      // 更新本地缓存
      wx.setStorageSync('cartItems', items)
      util.showSuccess('已删除')
    } catch (err) {
      console.error('批量删除失败:', err)
      util.showError('删除失败')
    }
  },

  /**
   * 批量购买（一键结算）
   */
  onBatchCheckout() {
    const keys = new Set(this.data.selectedIds || [])
    const items = (this.data.items || []).filter(i => keys.has(i._key))
    
    if (items.length === 0) {
      util.showToast('请选择要购买的商品')
      return
    }
    
    const payload = encodeURIComponent(JSON.stringify({ items }))
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?multi=${payload}`
    })
  },

  /**
   * 购买单个商品
   */
  onBuySingle(e) {
    const id = e.currentTarget.dataset.id
    const item = (this.data.items || []).find(x => x.id === id)
    
    if (!item) return
    
    const orderItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      quantity: Math.max(1, parseInt(item.quantity) || 1),
      specs: item.specs || {}
    }
    
    const query = encodeURIComponent(JSON.stringify(orderItem))
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?item=${query}`
    })
  },

  /**
   * 同步本地数据到云端
   */
  async syncToCloud() {
    if (this.data.syncing) return
    
    const localItems = wx.getStorageSync('cartItems') || []
    if (localItems.length === 0) {
      util.showToast('购物车为空')
      return
    }
    
    this.setData({ syncing: true })
    util.showLoading('同步中...')
    
    try {
      const res = await util.callCf('cart_operations', {
        action: 'sync',
        cartItems: localItems
      })
      
      util.hideLoading()
      
      if (res && res.success) {
        util.showSuccess('同步成功')
        // 重新加载
        await this.load()
      } else {
        util.showError(res?.message || '同步失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('同步失败:', err)
      util.showError('同步失败')
    } finally {
      this.setData({ syncing: false })
    }
  },

  /**
   * 清空购物车
   */
  async clearCart() {
    if (this.data.items.length === 0) {
      util.showToast('购物车已经是空的')
      return
    }
    
    const confirm = await util.showConfirm('确定要清空购物车吗？')
    if (!confirm) return
    
    util.showLoading('清空中...')
    
    try {
      const res = await util.callCf('cart_operations', {
        action: 'clear'
      })
      
      util.hideLoading()
      
      if (res && res.success) {
        this.setData({
          items: [],
          total: 0,
          totalQuantity: 0,
          selectedIds: []
        })
        wx.setStorageSync('cartItems', [])
        util.showSuccess('已清空')
      } else {
        util.showError(res?.message || '清空失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('清空购物车失败:', err)
      util.showError('清空失败')
    }
  },

  /**
   * 跳转到商城
   */
  goMall() {
    wx.navigateTo({
      url: '/pages/mall/mall'
    })
  },

  /**
   * 联系客服
   */
  onContact() {
    wx.navigateTo({
      url: '/pages/support/contact/contact'
    })
  }
})
