Page({
  data:{ title:'', price:0, image:'' },
  onLoad(options){
    try{
      if(options && options.data){
        const parsed = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          title: parsed.title || '',
          price: parsed.price || 0,
          image: parsed.image || ''
        })
      }
    }catch(err){}
  },
  onBuy(){
    wx.showToast({ title:'前往购买/咨询', icon:'none' })
  }
})

