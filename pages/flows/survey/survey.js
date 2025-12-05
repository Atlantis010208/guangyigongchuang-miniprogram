Page({
  data:{ date:'', name:'', addr:'', contact:'', phone:'' },
  onDate(e){ this.setData({ date:e.detail.value }) },
  onBook(){
    const id = Date.now().toString()
    const depositPaid = !!wx.getStorageSync('deposit_paid')
    const req = {
      id,
      space: '未指定',
      area: '',
      target: `预约勘测:${this.data.date||''}`,
      budget: '',
      note: `项目:${this.data.name||''}; 地址:${this.data.addr||''}; 联系人:${this.data.contact||''}; 电话:${this.data.phone||''}`,
      createdAt: new Date().toISOString(),
      source: 'survey',
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
    wx.showToast({ title:'已预约', icon:'success' })
    setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }) }, 400)
  }
})


