Page({
  data:{ title:'iPhone 16 Pro', price:7999, image:'' },
  onLoad(options){
    try{
      if(options && options.data){
        const parsed = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          title: parsed.title || this.data.title,
          price: parsed.price || this.data.price,
          image: parsed.image || this.data.image
        })
      }
    }catch(err){}
  },
  onBuy(){
    wx.showToast({ title:'前往购买/咨询', icon:'none' })
  }
})

