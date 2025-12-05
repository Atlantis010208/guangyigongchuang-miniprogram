// pages/order/detail/detail.js
const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    order:null,
    orderTime:''
  },
  async onLoad(query){
    const id = query && query.id
    try{
      const db = api.dbInit()
      if (db) {
        const Orders = api.getOrdersRepo(db)
        const doc = await Orders.getByOrderNo(id)
        if (doc){
          const items = ((doc.params && doc.params.items) || []).map(it => ({
            id: it.id,
            name: it.name,
            quantity: Number(it.quantity||1),
            amount: Number(it.amount||0),
            image: it.image || ''
          }))
          const order = {
            id: String(doc.orderNo || doc._id || ''),
            status: doc.status || 'pending',
            createdAt: doc.createdAt || Date.now(),
            addressSnapshot: (doc.params && doc.params.address) || null,
            items,
            note: (doc.params && doc.params.note) || '',
            total: Number((doc.params && doc.params.totalAmount) || 0)
          }
          const withPairs = Object.assign({}, order, { items: items.map(it=> Object.assign({}, it, { paramPairs: this.specsToPairs(it.specs||{}) })) })
          this.setData({ order: withPairs, orderTime: this.formatTime(order.createdAt) })
          return
        }
      }
      wx.showToast({ title: '订单不存在', icon: 'none' })
    }catch(e){ wx.showToast({ title: '订单不存在', icon: 'none' }) }
  },
  formatTime(ts){
    if (!ts) return ''
    try{
      const d = new Date(Number(ts))
      const y = d.getFullYear()
      const m = String(d.getMonth()+1).padStart(2,'0')
      const day = String(d.getDate()).padStart(2,'0')
      const hh = String(d.getHours()).padStart(2,'0')
      const mm = String(d.getMinutes()).padStart(2,'0')
      return `${y}-${m}-${day} ${hh}:${mm}`
    }catch(e){ return '' }
  },
  formatSpecs(specs){
    if (!specs) return ''
    try{
      const labelMap = {
        size: '尺寸', cct: '色温', dimming: '调光', color: '颜色', combo:'组合', power:'功率', beam:'光束角', track:'轨道', kit:'套装', rail:'导轨长度', length:'长度', finish:'表面处理', switch:'开关', height:'高度', ip:'防护等级', adjust:'色温可调', type:'类型', control:'控制', sensor:'传感器'
      }
      return Object.keys(specs).map(k=>`${labelMap[k]||k}：${specs[k]}`).join('  ')
    }catch(e){ return '' }
  },
  specsToPairs(specs){
    if (!specs) return []
    const labelMap = { size:'尺寸', cct:'色温', dimming:'调光', color:'颜色', combo:'组合', power:'功率', beam:'光束角', track:'轨道', kit:'套装', rail:'导轨长度', length:'长度', finish:'表面处理', switch:'开关', height:'高度', ip:'防护等级', adjust:'色温可调', type:'类型', control:'控制', sensor:'传感器' }
    try{
      return Object.keys(specs).map(k=>({ key: k, label: labelMap[k] || k, value: specs[k] }))
    }catch(e){ return [] }
  },
  onCancel(){
    if(!this.data.order) return
    wx.showModal({
      title:'撤销确认',
      content:'确定要撤销该订单吗？',
      success: async (res)=>{
        if(res.confirm){
          try{
            const r1 = await util.callCf('orders_update', { orderNo: this.data.order.id, patch: { status: 'canceled' } })
            const r2 = await util.callCf('requests_update', { orderNo: this.data.order.id, patch: { status: 'canceled' } })
            if ((r1 && r1.success) || (r2 && r2.success)) {
              this.setData({ 'order.status':'canceled' })
              wx.showToast({ title:'已撤销', icon:'none' })
            } else {
              wx.showToast({ title:'撤销失败', icon:'none' })
            }
          }catch(err){ wx.showToast({ title:'撤销失败', icon:'none' }) }
        }
      }
    })
  },
  onDelete(){
    if(!this.data.order) return
    if(this.data.order.status!=='canceled'){
      wx.showToast({ title:'请先撤销订单', icon:'none' })
      return
    }
    wx.showModal({
      title:'删除订单',
      content:'删除后将无法恢复，确认删除？',
      success: async (res)=>{
        if(res.confirm){
          const orderId = this.data.order.id
          try{
            await util.callCf('orders_remove', { orderNo: orderId })
            await util.callCf('requests_remove', { orderNo: orderId })
          }catch(err){ }
          wx.showToast({ title:'已删除', icon:'none' })
          setTimeout(()=>{ wx.navigateBack({}) }, 300)
        }
      }
    })
  },
  onModify(){
    if(!this.data.order) return
    wx.navigateTo({ url: `/pages/order/edit/edit?id=${this.data.order.id}` })
  },
  onContact(){
    wx.showToast({ title:'联系客服', icon:'none' })
  },
  onMoreTap(){
    wx.showActionSheet({
      itemList:['撤销订单','删除订单'],
      success:(res)=>{
        if(typeof res.tapIndex !== 'number') return
        if(res.tapIndex===0){ this.onCancel(); return }
        if(res.tapIndex===1){ this.onDelete(); return }
      }
    })
  }
})
