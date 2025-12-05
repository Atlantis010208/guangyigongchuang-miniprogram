Page({
  data:{
    hasService:false
  },
  contact(){
    wx.navigateTo({ url: '/pages/support/contact/contact' })
  },
  support(){
    wx.showToast({ title:'敬请期待', icon:'none' })
  }
})

