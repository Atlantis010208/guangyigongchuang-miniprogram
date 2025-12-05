Page({
  data:{ tools:['Dialux','Relux'], toolText:'选择工具' },
  onTool(e){ this.setData({ toolText:this.data.tools[e.detail.value] }) },
  onCalc(){
    const id = Date.now().toString()
    const depositPaid = !!wx.getStorageSync('deposit_paid')
    const req = {
      id,
      space: '照度/UGR计算',
      area: '',
      target: `工具:${this.data.toolText}`,
      budget: '',
      note: '提交计算请求',
      createdAt: new Date().toISOString(),
      source: 'calc',
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


