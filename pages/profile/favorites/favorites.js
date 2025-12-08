/**
 * 我的收藏页面
 * 功能：展示收藏列表、编辑模式下批量操作、购买跳转
 * 数据来源：云函数 favorites_operations
 */
const util = require('../../../utils/util')

Page({
  data: {
    list: [],
    isEditing: false,
    selectedIds: [],
    loading: false,
    page: 1,
    pageSize: 50,
    hasMore: true,
    total: 0
  },

  onLoad() {
    // 页面加载时获取收藏列表
  },

  onShow() {
    this.loadFavorites(true)
  },

  /**
   * 加载收藏列表
   * @param {boolean} refresh - 是否刷新（重置页码）
   */
  async loadFavorites(refresh = false) {
    if (this.data.loading) return
    
    // 刷新时重置页码
    if (refresh) {
      this.setData({ page: 1, hasMore: true, list: [] })
    }

    // 没有更多数据时不再请求
    if (!refresh && !this.data.hasMore) return

    this.setData({ loading: true })

    try {
      // 调用云函数获取收藏列表
      const res = await util.callCf('favorites_operations', {
        action: 'get',
        page: this.data.page,
        pageSize: this.data.pageSize
      })

      if (res && res.success && res.data) {
        const { list: newList, total, totalPages } = res.data
        
        // 处理列表数据，添加 id 字段用于前端标识
        const processedList = (newList || []).map(item => ({
          id: item.productId || item._id,
          _id: item._id,
          name: item.name,
          price: item.price,
          image: item.imageUrl || item.image,
          specs: item.specs || {},
          checked: false
        }))

        // 刷新或追加
        const finalList = refresh ? processedList : [...this.data.list, ...processedList]
        
        this.setData({
          list: finalList,
          total,
          hasMore: this.data.page < totalPages,
          page: this.data.page + 1
        })

      } else {
        // 云函数调用失败，尝试从本地存储恢复
        console.warn('云函数获取收藏失败，使用本地数据:', res)
        this.loadFromLocal()
      }

    } catch (err) {
      console.error('加载收藏列表异常:', err)
      // 降级到本地存储
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 从本地存储加载（兜底方案）
   */
  loadFromLocal() {
    const list = wx.getStorageSync('mall_favorites') || []
    // 将 cloud:// 图片转为 https 临时链接
    const fileList = (list || []).map(i => i && i.image).filter(src => typeof src === 'string' && src.indexOf('cloud://') === 0)
    
    if (fileList.length && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList })
        .then(res => {
          const dict = {}
          ;(res && res.fileList || []).forEach(x => { dict[x.fileID] = x.tempFileURL })
          const mapped = (list || []).map(i => {
            if (i && typeof i.image === 'string' && i.image.indexOf('cloud://') === 0 && dict[i.image]) {
              return { ...i, image: dict[i.image] }
            }
            return i
          })
          this.setData({ list: mapped, total: mapped.length }, () => { this.applyCheckedState() })
        })
        .catch(() => {
          this.setData({ list, total: list.length }, () => { this.applyCheckedState() })
        })
    } else {
      this.setData({ list, total: list.length }, () => { this.applyCheckedState() })
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadFavorites(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadFavorites(false)
    }
  },

  /**
   * 购买单个商品
   */
  onBuy(e) {
    const id = e.currentTarget.dataset.id
    const itemData = (this.data.list || []).find(i => i.id === id) || {}
    const item = {
      id: itemData.id,
      name: itemData.name,
      price: Number(itemData.price) || 0,
      image: itemData.image,
      quantity: 1,
      specs: itemData.specs || {}
    }
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  },

  /**
   * 格式化规格
   */
  formatSpecs(specs) {
    try { return Object.keys(specs).map(k => `${k}: ${specs[k]}`).join('  ') } catch (e) { return '' }
  },

  /**
   * 切换编辑模式
   */
  onToggleEdit() {
    const isEditing = !this.data.isEditing
    this.setData({ isEditing, selectedIds: [] }, () => { this.applyCheckedState() })
  },

  /**
   * 判断是否选中
   */
  isSelected(id) {
    return (this.data.selectedIds || []).includes(id)
  },

  /**
   * 切换选中状态
   */
  onToggleSelect(e) {
    const id = e.currentTarget.dataset.id
    const set = new Set(this.data.selectedIds || [])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    this.setData({ selectedIds: Array.from(set) }, () => { this.applyCheckedState() })
  },

  /**
   * 批量删除
   */
  async onBatchDelete() {
    const ids = this.data.selectedIds || []
    if (ids.length === 0) return

    wx.showLoading({ title: '删除中...', mask: true })

    try {
      // 调用云函数批量删除
      const res = await util.callCf('favorites_operations', {
        action: 'batch_remove',
        productIds: ids
      })

      if (res && res.success) {
        // 更新本地列表
        const next = (this.data.list || []).filter(i => !ids.includes(i.id))
        this.setData({ 
          list: next, 
          selectedIds: [],
          total: this.data.total - ids.length 
        }, () => { this.applyCheckedState() })
        
        // 同步更新本地存储
        this.syncToLocal(next)
        
        wx.showToast({ title: `已删除 ${ids.length} 件`, icon: 'success' })
      } else {
        // 云函数失败，降级到本地删除
        this.batchDeleteLocal(ids)
      }

    } catch (err) {
      console.error('批量删除异常:', err)
      this.batchDeleteLocal(ids)
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 本地批量删除（兜底）
   */
  batchDeleteLocal(ids) {
    const idsSet = new Set(ids)
    const next = (this.data.list || []).filter(i => !idsSet.has(i.id))
    wx.setStorageSync('mall_favorites', next)
    this.setData({ list: next, selectedIds: [], total: next.length }, () => { this.applyCheckedState() })
    wx.showToast({ title: '已删除', icon: 'none' })
  },

  /**
   * 批量购买
   */
  onBatchBuy() {
    const ids = new Set(this.data.selectedIds || [])
    const items = (this.data.list || []).filter(i => ids.has(i.id)).map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      image: i.image,
      quantity: 1,
      specs: {}
    }))
    if (items.length === 0) return wx.showToast({ title: '请选择商品', icon: 'none' })
    const payload = encodeURIComponent(JSON.stringify({ items }))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?multi=${payload}` })
  },

  /**
   * 打开商品详情
   */
  onOpenDetail(e) {
    const rawId = e.currentTarget.dataset.id
    const id = String(rawId || '')
    if (!id) return
    
    // 简单规则：工具包/课程自定义跳转，其余跳商城详情
    if (id === 'toolkit') {
      wx.navigateTo({ url: '/pages/toolkit/toolkit-detail/toolkit-detail' })
      return
    }
    if (id.indexOf('course') === 0) {
      wx.navigateTo({ url: '/pages/course/course-detail/course-detail' })
      return
    }
    wx.navigateTo({ url: `/pages/mall/product-detail/product-detail?id=${id}` })
  },

  /**
   * 单个移除收藏
   */
  async onRemove(e) {
    const id = e.currentTarget.dataset.id
    
    try {
      // 调用云函数移除
      const res = await util.callCf('favorites_operations', {
        action: 'remove',
        productId: id
      })

      if (res && res.success) {
        const next = (this.data.list || []).filter(i => i.id !== id)
        this.setData({ list: next, total: this.data.total - 1 }, () => { this.applyCheckedState() })
        this.syncToLocal(next)
        wx.showToast({ title: '已移除', icon: 'none' })
      } else {
        // 降级到本地删除
        this.removeLocal(id)
      }

    } catch (err) {
      console.error('移除收藏异常:', err)
      this.removeLocal(id)
    }
  },

  /**
   * 本地移除（兜底）
   */
  removeLocal(id) {
    const next = (this.data.list || []).filter(i => i.id !== id)
    wx.setStorageSync('mall_favorites', next)
    this.setData({ list: next, total: next.length }, () => { this.applyCheckedState() })
    wx.showToast({ title: '已移除', icon: 'none' })
  },

  /**
   * 同步到本地存储
   */
  syncToLocal(list) {
    try {
      // 将列表同步到本地存储作为缓存
      const localList = (list || []).map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        specs: item.specs || {}
      }))
      wx.setStorageSync('mall_favorites', localList)
    } catch (err) {
      console.warn('同步本地存储失败:', err)
    }
  },

  /**
   * 应用选中状态到列表
   */
  applyCheckedState() {
    const ids = new Set(this.data.selectedIds || [])
    const next = (this.data.list || []).map(i => ({ ...i, checked: ids.has(i.id) }))
    this.setData({ list: next })
  }
})
