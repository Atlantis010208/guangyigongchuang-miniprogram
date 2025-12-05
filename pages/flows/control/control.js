Page({
  data:{ protocols:['DALI','0-10V','蓝牙 Mesh'], protocolText:'选择协议' },
  onProtocol(e){ this.setData({ protocolText:this.data.protocols[e.detail.value] }) },
  onDesign(){
    const id = Date.now().toString()
    const req = {
      id,
      space: '控制系统设计',
      area: '',
      target: `协议:${this.data.protocolText}`,
      budget: '',
      note: '提交控制需求',
      createdAt: new Date().toISOString(),
      source: 'control',
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


