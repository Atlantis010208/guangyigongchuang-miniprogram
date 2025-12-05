Page({
  data:{ imgs:[] },
  onUpload(){
    wx.chooseImage({ count: 6, success: (res)=>{
      this.setData({ imgs: this.data.imgs.concat(res.tempFilePaths).slice(0,6) })
    }})
  },
  onApply(){
    const id = Date.now().toString()
    const depositPaid = !!wx.getStorageSync('deposit_paid')
    const req = {
      id,
      space: '概念方案',
      area: '',
      target: '提交概念方案申请',
      budget: '',
      note: `参考图数量:${this.data.imgs.length}`,
      createdAt: new Date().toISOString(),
      source: 'concept',
      priority: depositPaid,
      steps: [
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false },
        { key:'design', label:'设计中', done:false },
        { key:'done', label:'已完成', done:false }
      ]
    }
    const list = wx.getStorageSync('lighting_requests') || []
    list.unshift(req)
    wx.setStorageSync('lighting_requests', list)
    wx.showToast({ title:'已提交', icon:'success' })
    setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }) }, 400)
  }
})


