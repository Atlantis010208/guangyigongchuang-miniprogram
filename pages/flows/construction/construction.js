Page({
  onUpload(){ wx.showToast({ title:'已上传(演示)', icon:'none' }) },
  onSubmit(){
    const depositPaid = !!wx.getStorageSync('deposit_paid')

    const id = Date.now().toString()
    const req = {
      id,
      space: '施工配合指导',
      area: '',
      target: '施工配合',
      budget: '',
      note: '上传施工资料',
      createdAt: new Date().toISOString(),
      source: 'construction',
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


