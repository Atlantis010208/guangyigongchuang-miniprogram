Page({
  data:{
    amount: 100,
    serviceWeChat: 'gy-lighting',
    servicePhone: '17200000000',
    paid: false
  },
  onLoad(){
    const paid = !!wx.getStorageSync('deposit_paid')
    this.setData({ paid })
  },
  onPrimaryTap(){
    if(this.data.paid){ this.onRefundDeposit(); return }
    this.onPayDeposit()
  },
  onPayDeposit(){
    const amountFen = this.data.amount * 100
    wx.showModal({
      title:'确认支付押金',
      content:`需要支付押金 ¥${this.data.amount}，用于发布需求。订单完成后将自动原路退回。是否继续？`,
      success: (r)=>{
        if(!r.confirm) return
        // 这里应由后端下单返回支付参数；演示用模拟成功
        wx.showToast({ title:'支付成功', icon:'success' })
        wx.setStorageSync('deposit_paid', true)
        this.setData({ paid:true })
        setTimeout(()=>{
          wx.switchTab({ url: '/pages/cart/cart' })
        }, 300)
      }
    })
  },
  onRefundDeposit(){
    wx.showModal({
      title:'确认申请退回押金',
      content:'订单完成后押金将自动退回。若你已完成订单，现在可申请退回押金。是否继续？',
      success: (r)=>{
        if(!r.confirm) return
        // 演示：直接成功
        wx.showToast({ title:'已申请退回', icon:'success' })
        wx.removeStorageSync('deposit_paid')
        this.setData({ paid:false })
      }
    })
  },
  onOpenRules(){
    wx.showModal({
      title:'押金规则',
      content:'（1）收取与可选：押金¥100为可选支付，不缴纳亦可发布需求。\n（2）优先服务：若已缴押金，您的需求将标记为“优先”，可享受优先处理、客服优先对接等服务。\n（3）退回时机：订单完成后，系统自动原路退回。\n（4）用途说明：用于减少恶意提交、保障服务资源并提升优先客户体验。\n（5）退款路径：原路退回为主，如遇异常请联系人工客服处理。',
      showCancel:false,
      confirmText:'我知道了'
    })
  },
  copyWeChat(){ wx.setClipboardData({ data: this.data.serviceWeChat, success: ()=>{ wx.showToast({ title:'已复制', icon:'success' }) } }) },
  callPhone(){ wx.makePhoneCall({ phoneNumber: this.data.servicePhone }) }
})


