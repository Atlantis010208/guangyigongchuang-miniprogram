// pages/profile/favorites/favorites.js
Page({
  data: {
    list: [],
    isEditing: false,
    selectedIds: []
  },

  onShow() {
    this.load()
  },

  load() {
    const list = wx.getStorageSync('mall_favorites') || []
    // 将 cloud:// 图片转为 https 临时链接，避免不显示
    const fileList = (list || []).map(i => i && i.image).filter(src => typeof src === 'string' && src.indexOf('cloud://') === 0)
    if (fileList.length && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList })
        .then(res => {
          const dict = {}
          ;(res && res.fileList || []).forEach(x => { dict[x.fileID] = x.tempFileURL })
          const mapped = (list || []).map(i => {
            if (i && typeof i.image === 'string' && i.image.indexOf('cloud://') === 0 && dict[i.image]) {
              return Object.assign({}, i, { image: dict[i.image] })
            }
            return i
          })
          this.setData({ list: mapped }, () => { this.applyCheckedState() })
        })
        .catch(() => {
          // 失败则原样展示（新基础库可直接显示 cloud://）
          this.setData({ list }, () => { this.applyCheckedState() })
        })
    } else {
      this.setData({ list }, () => { this.applyCheckedState() })
    }
  },

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
  formatSpecs(specs){
    try{ return Object.keys(specs).map(k=>`${k}: ${specs[k]}`).join('  ') }catch(e){ return '' }
  },
  onToggleEdit(){
    const isEditing = !this.data.isEditing
    this.setData({ isEditing, selectedIds: [] }, () => { this.applyCheckedState() })
  },
  isSelected(id){
    return (this.data.selectedIds || []).includes(id)
  },
  onToggleSelect(e){
    const id = e.currentTarget.dataset.id
    const set = new Set(this.data.selectedIds || [])
    if (set.has(id)) set.delete(id); else set.add(id)
    this.setData({ selectedIds: Array.from(set) }, () => { this.applyCheckedState() })
  },
  onBatchDelete(){
    const ids = new Set(this.data.selectedIds || [])
    if (ids.size === 0) return
    const next = (this.data.list || []).filter(i => !ids.has(i.id))
    wx.setStorageSync('mall_favorites', next)
    this.setData({ list: next, selectedIds: [] }, () => { this.applyCheckedState() })
    wx.showToast({ title:'已删除', icon:'none' })
  },
  onBatchBuy(){
    const ids = new Set(this.data.selectedIds || [])
    const items = (this.data.list || []).filter(i => ids.has(i.id)).map(i => ({ id:i.id, name:i.name, price:i.price, image:i.image, quantity:1, specs:{} }))
    if (items.length === 0) return wx.showToast({ title:'请选择商品', icon:'none' })
    const payload = encodeURIComponent(JSON.stringify({ items }))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?multi=${payload}` })
  },
  onOpenDetail(e){
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
  onRemove(e){
    const id = e.currentTarget.dataset.id
    const next = (this.data.list || []).filter(i => i.id !== id)
    wx.setStorageSync('mall_favorites', next)
    this.setData({ list: next }, () => { this.applyCheckedState() })
    wx.showToast({ title:'已移除', icon:'none' })
  },
  applyCheckedState(){
    const ids = new Set(this.data.selectedIds || [])
    const next = (this.data.list || []).map(i => Object.assign({}, i, { checked: ids.has(i.id) }))
    this.setData({ list: next })
  }
})


