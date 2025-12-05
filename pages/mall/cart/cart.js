Page({
  data:{ items:[], total:0, isEditing:false, selectedIds:[] },
  onShow(){ this.load() },
  load(){
    const items = wx.getStorageSync('cartItems') || []
    console.log('加载购物车，原始 items:', items)
    
    // 为每个商品生成唯一的 key（如果没有的话）
    const itemsWithKeys = items.map((item, index) => {
      if (!item._key) {
        const newKey = `${item.id}_${index}_${Date.now()}`
        console.log(`为商品 ${item.id} 生成新 key:`, newKey)
        return Object.assign({}, item, { _key: newKey })
      }
      console.log(`商品 ${item.id} 已有 key:`, item._key)
      return item
    })
    
    console.log('带 key 的 items:', itemsWithKeys)
    
    // 转换 cloud:// 图片为临时链接，避免不显示
    const fileList = (itemsWithKeys||[]).map(i=>i&&i.image).filter(src=> typeof src==='string' && src.indexOf('cloud://')===0)
    if (fileList.length && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList }).then(res=>{
        const dict = {}
        ;(res && res.fileList || []).forEach(x=>{ dict[x.fileID] = x.tempFileURL })
        const mapped = (itemsWithKeys||[]).map(i=>{
          if(i && typeof i.image==='string' && i.image.indexOf('cloud://')===0 && dict[i.image]){
            return Object.assign({}, i, { image: dict[i.image] })
          }
          return i
        })
        this.setData({ items: mapped }, () => this.calcTotal())
      }).catch(()=>{
        this.setData({ items: itemsWithKeys }, () => this.calcTotal())
      })
    } else {
      this.setData({ items: itemsWithKeys }, () => this.calcTotal())
    }
  },
  calcTotal(){
    const total = (this.data.items||[]).reduce((s,i)=> s + (Number(i.price)||0) * Math.max(1, Number(i.quantity||1)), 0)
    this.setData({ total })
  },
  formatSpecs(specs){ try{ return Object.keys(specs||{}).map(k=>`${k}: ${specs[k]}`).join('  ') }catch(e){ return '' } },
  findIndexById(id){ return (this.data.items||[]).findIndex(i=>i.id===id) },
  inc(e){ const id = e.currentTarget.dataset.id; const idx = this.findIndexById(id); if(idx<0) return; const items=[...this.data.items]; items[idx].quantity = Math.max(1, Number(items[idx].quantity||1))+1; this.update(items) },
  dec(e){ const id = e.currentTarget.dataset.id; const idx = this.findIndexById(id); if(idx<0) return; const items=[...this.data.items]; items[idx].quantity = Math.max(1, Number(items[idx].quantity||1))-1; if(items[idx].quantity<=0) items[idx].quantity=1; this.update(items) },
  remove(e){ const id = e.currentTarget.dataset.id; const items=(this.data.items||[]).filter(i=>i.id!==id); this.update(items) },
  update(items){ this.setData({ items }, ()=>{ wx.setStorageSync('cartItems', items); this.calcTotal() }) },
  checkout(){ if(!(this.data.items||[]).length) return wx.showToast({ title:'请选择商品', icon:'none' }); wx.showToast({ title:'前往结算', icon:'none' }) },

  // 编辑模式
  onToggleEdit(){
    const isEditing = !this.data.isEditing
    this.setData({
      isEditing,
      selectedIds: []
    })
  },
  onToggleSelect(e){
    const key = e.currentTarget.dataset.key
    console.log('点击勾选框，key:', key)
    console.log('当前 selectedIds:', this.data.selectedIds)
    
    if (!key) {
      console.warn('商品 key 不存在')
      wx.showToast({ title: 'key不存在', icon: 'none' })
      return
    }
    
    let selectedIds = [...(this.data.selectedIds || [])]
    const index = selectedIds.indexOf(key)
    
    if (index > -1) {
      // 已选中，取消选中
      selectedIds.splice(index, 1)
      console.log('取消选中，新的 selectedIds:', selectedIds)
    } else {
      // 未选中，添加选中
      selectedIds.push(key)
      console.log('添加选中，新的 selectedIds:', selectedIds)
    }
    
    // 强制更新数据以触发视图刷新
    this.setData({
      selectedIds: selectedIds
    }, () => {
      console.log('setData 完成，当前 selectedIds:', this.data.selectedIds)
    })
  },
  onBatchDelete(){
    const keys = new Set(this.data.selectedIds||[])
    if(!keys.size) return
    const next = (this.data.items||[]).filter(i=> !keys.has(i._key))
    this.update(next)
    this.setData({ selectedIds:[] })
    wx.showToast({ title:'已删除', icon:'none' })
  },
  onBatchCheckout(){
    const keys = new Set(this.data.selectedIds||[])
    const items = (this.data.items||[]).filter(i=> keys.has(i._key))
    if(!items.length) return wx.showToast({ title:'请选择商品', icon:'none' })
    const payload = encodeURIComponent(JSON.stringify({ items }))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?multi=${payload}` })
  },
  onBuySingle(e){
    const id = e.currentTarget.dataset.id
    const i = (this.data.items||[]).find(x=>x.id===id)
    if(!i) return
    const item = { id:i.id, name:i.name, price:i.price, image:i.image, quantity: Math.max(1, Number(i.quantity||1)), specs: i.specs||{} }
    const query = encodeURIComponent(JSON.stringify(item))
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  }
  ,goMall(){ wx.navigateTo({ url: '/pages/mall/mall' }) }
  ,onContact(){ wx.navigateTo({ url: '/pages/support/contact/contact' }) }
})


