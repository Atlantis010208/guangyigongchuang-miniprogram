Page({
  data:{
    isOnline:false,
    avatarUrl:'@cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/小程序/小程序头像.png',
    faqs:[
      { q:'如何预约现场勘测？', a:'在“我的灯光需求”中选择预约现场勘测，提交信息后会与您确认时间。' },
      { q:'是否支持无主灯方案？', a:'支持，您可在发布需求时选择“无主灯”，我们会按此设计。' },
      { q:'如何查看订单进度？', a:'在购物袋页面“发布的照明需求”列表，点击可查看进度详情。' }
    ]
  },
  onLoad(){ this.updateOnlineStatus(); this.initAvatar() },
  onShow(){ this.updateOnlineStatus() },
  initAvatar(){
    const fileID = '@cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/小程序/小程序头像.png'
    try{
      if(wx.cloud && wx.cloud.getTempFileURL){
        wx.cloud.getTempFileURL({
          fileList:[fileID],
          success: res => {
            const list = (res && res.fileList) || []
            if(list.length && list[0].tempFileURL){
              this.setData({ avatarUrl: list[0].tempFileURL })
            } else {
              this.setData({ avatarUrl: fileID })
            }
          },
          fail: ()=>{ this.setData({ avatarUrl: fileID }) }
        })
      } else {
        this.setData({ avatarUrl: fileID })
      }
    } catch(e){ this.setData({ avatarUrl: fileID }) }
  },
  updateOnlineStatus(){
    const now = new Date()
    const day = now.getDay() // 0 Sun - 6 Sat
    const isWeekday = day >= 1 && day <= 5
    const minutes = now.getHours() * 60 + now.getMinutes()
    const start = 9 * 60 // 09:00
    const end = 17 * 60 + 30 // 17:30
    const online = isWeekday && minutes >= start && minutes <= end
    this.setData({ isOnline: online })
  },
  onChat(){},
  onCall(){
    const numbers = ['17728117703','17728117010']
    wx.showActionSheet({
      itemList: numbers.map(n => `拨打 ${n}`),
      success: (res)=>{
        const idx = res.tapIndex
        if(idx >= 0 && idx < numbers.length){
          wx.makePhoneCall({ phoneNumber: numbers[idx] })
        }
      }
    })
  }
})


