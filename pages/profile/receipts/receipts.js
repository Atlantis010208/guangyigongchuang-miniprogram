Page({
  data:{
    receipts:[]
  },
  onShow(){
    const receipts = wx.getStorageSync('user_receipts') || []
    this.setData({ receipts })
  }
})
Page({})

