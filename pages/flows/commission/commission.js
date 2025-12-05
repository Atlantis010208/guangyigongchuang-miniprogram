Page({
  data:{ date:'', linkage:true, note:'' },
  onDate(e){ this.setData({ date:e.detail.value }) },
  onLink(e){ this.setData({ linkage:e.detail.value }) },
  onNote(e){ this.setData({ note:e.detail.value }) },
  onSubmit(){
    const depositPaid = !!wx.getStorageSync('deposit_paid')

    const id = Date.now().toString()
    const req = {
      id,
      space: '调试与验收',
      area: '',
      target: `联动:${this.data.linkage?'是':'否'}`,
      budget: '',
      note: this.data.note||'',
      createdAt: new Date().toISOString(),
      source: 'commission',
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


