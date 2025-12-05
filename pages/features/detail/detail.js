Page({
  data:{ item:{}, showPicker:false, picked:{}, qty:1, totalPrice:0 },
  onLoad({ data }){
    try{
      const item = JSON.parse(decodeURIComponent(data||'%7B%7D')) || {}
      const first = (item.variants&&item.variants[0])||{}
      this.setData({ item, picked:first }, this.recalc)
    }catch(e){ console.error(e) }
  },
  onFav(){ wx.showToast({ title:'已收藏', icon:'success' }) },
  onService(){ wx.navigateTo({ url:'/pages/support/contact/contact' }) },
  onBuy(){ this.setData({ showPicker:true }) },
  onAddToCartTap(){ this.setData({ showPicker:true }) },
  closePicker(){ this.setData({ showPicker:false }) },
  noop(){},
  pickVariant(e){
    const idx = Number(e.currentTarget.dataset.idx)
    const v = (this.data.item.variants||[])[idx] || {}
    this.setData({ picked:v }, this.recalc)
  },
  dec(){ const n=Math.max(1,(this.data.qty||1)-1); this.setData({ qty:n }, this.recalc) },
  inc(){ const n=(this.data.qty||1)+1; this.setData({ qty:n }, this.recalc) },
  recalc(){
    const base = Number(this.data.picked.price || this.data.item.minPrice || 0)
    const qty = Number(this.data.qty||1)
    const total = Math.max(0, base) * Math.max(1, qty)
    this.setData({ totalPrice: total.toFixed(0) })
  },
  confirmBuy(){
    const { picked, qty } = this.data
    if(!picked || !picked.key){ wx.showToast({ title:'请选择规格', icon:'none' }); return }
    wx.showToast({ title:`下单：${picked.key} ×${qty}`, icon:'success' })
    this.setData({ showPicker:false })
  },
  confirmCart(){
    const { picked, qty, item } = this.data
    if(!picked || !picked.key){ wx.showToast({ title:'请选择规格', icon:'none' }); return }
    const app = getApp()
    const product = {
      id: `${item.id}-${picked.key}`,
      title: `${item.name} ${picked.key}`,
      price: picked.price,
      image: item.image,
      quantity: qty
    }
    // 使用现有全局购物车方法
    for(let i=0;i<qty;i++){ app.addToCart(product) }
    this.setData({ showPicker:false })
  }
})


