Page({
  data:{
    orders:[
      {id:'A001', title:'居住空间光环境方案', status:'进行中', desc:'已完成勘测，概念方案评审中', time:'2025-08-10'},
      {id:'A002', title:'商业重点照明项目', status:'已完成', desc:'已验收，等待结算', time:'2025-07-28'}
    ]
  },
  onDetail(e){
    const id=e.currentTarget.dataset.id
    const type=e.currentTarget.dataset.type
    if (type === 'mall') {
      wx.navigateTo({ url: `/pages/order/detail/detail?id=${id}` })
      return
    }
    wx.showModal({title:'订单详情',content:`订单 ${id} 详情展示（演示）`,showCancel:false})
  },
  onShow(){
    // 合并电子商城订单
    const mallOrders = wx.getStorageSync('mall_orders') || []
    const mapped = (mallOrders || []).map(o=>({
      id: o.id,
      title: `商城订单 · ${o.items && o.items.length>0 ? (o.items[0].name || '商品') : '商品'}`,
      status: o.status || '待支付',
      desc: `共 ${o.items ? o.items.length : 0} 件 · 金额 ¥${o.total || 0}`,
      time: this.formatTime(o.createdAt),
      _type: 'mall'
    }))
    // 合并显示（商城订单在上）
    const current = this.data.orders || []
    // 去重（以 id 去重）
    const merged = [...mapped, ...current]
    const seen = new Set()
    const deduped = merged.filter(o => {
      if (seen.has(o.id)) return false
      seen.add(o.id)
      return true
    })
    this.setData({ orders: deduped })
  },
  formatTime(ts){
    if (!ts) return ''
    try{
      const d = new Date(Number(ts))
      const y = d.getFullYear()
      const m = String(d.getMonth()+1).padStart(2,'0')
      const day = String(d.getDate()).padStart(2,'0')
      return `${y}-${m}-${day}`
    }catch(e){ return '' }
  }
})


