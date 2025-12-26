// pages/order/edit/edit.js
Page({
  data:{ order:null, items:[], address:null, addressText:'', subtotal:0, total:0 },
  onLoad(query){
    const id = query && query.id
    const list = wx.getStorageSync('mall_orders') || []
    const order = list.find(o => String(o.id)===String(id)) || null
    if(!order){ wx.showToast({ title:'订单不存在', icon:'none' }); return }
    const address = order.addressSnapshot || this.getDefaultAddress()
    // 预处理商品数据，包括规格文本和小计
    const items = (order.items || []).map(it => {
      const specs = it.specs || {}
      const quantity = Number(it.quantity || 1)
      const price = Number(it.amount || it.price || 0)
      return {
        ...it,
        price: price,
        quantity: quantity,
        specsText: this.formatSpecs(specs),
        subtotal: Math.round(price * quantity * 100) / 100
      }
    })
    // 预处理地址文本
    const addressText = this.formatAddress(address)
    this.setData({ order, items, address, addressText }, ()=>{ this.recalc() })
  },
  getDefaultAddress(){
    const list = wx.getStorageSync('user_addresses') || []
    return list.find(a=>a && a.isDefault) || null
  },
  formatAddress(addr){
    if(!addr) return ''
    if(addr.full) return addr.full
    const regionStr = Array.isArray(addr.region) ? addr.region.join(' ') : ''
    return [regionStr, addr.town || '', addr.detail || ''].filter(Boolean).join(' ')
  },
  recalc(){
    // 更新每个商品的 subtotal 并计算总价
    const items = (this.data.items || []).map(it => {
      const price = Number(it.price || 0)
      const quantity = Number(it.quantity || 1)
      return { ...it, subtotal: Math.round(price * quantity * 100) / 100 }
    })
    const subtotal = items.reduce((s, it) => s + (it.subtotal || 0), 0)
    this.setData({ items, subtotal, total: Math.round(subtotal * 100) / 100 })
  },
  inc(e){
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id===id ? { ...it, quantity: Math.max(1, Number(it.quantity||1)+1) } : it)
    this.setData({ items }, ()=> this.recalc())
  },
  dec(e){
    const id = e.currentTarget.dataset.id
    const items = (this.data.items || []).map(it => it.id===id ? { ...it, quantity: Math.max(1, Number(it.quantity||1)-1) } : it)
    this.setData({ items }, ()=> this.recalc())
  },
  onAddAddress(){ wx.navigateTo({ url:'/pages/profile/addresses/edit' }) },
  onManageAddress(){ wx.navigateTo({ url:'/pages/profile/addresses/addresses' }) },
  onSave(){
    const list = wx.getStorageSync('mall_orders') || []
    const idx = list.findIndex(o => o.id===this.data.order.id)
    if(idx>-1){
      const next = Object.assign({}, list[idx], { items: this.data.items, addressSnapshot: this.data.address, total: this.data.total })
      list[idx] = next
      wx.setStorageSync('mall_orders', list)
      wx.showToast({ title:'已保存', icon:'success' })
      setTimeout(()=>{ wx.navigateBack({}) }, 500)
    }
  },
  formatSpecs(specs){
    if(!specs) return ''
    try{
      const labelMap = { size:'尺寸', cct:'色温', dimming:'调光', color:'颜色', combo:'组合', power:'功率', beam:'光束角', track:'轨道', kit:'套装', rail:'导轨长度', length:'长度', finish:'表面处理', switch:'开关', height:'高度', ip:'防护等级', adjust:'色温可调', type:'类型', control:'控制', sensor:'传感器' }
      return Object.keys(specs).map(k=>`${labelMap[k]||k}：${specs[k]}`).join('  ')
    }catch(e){ return '' }
  }
})


