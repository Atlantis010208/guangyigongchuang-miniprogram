const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    files:[],
    serviceWeChat:'gy-lighting',
    needs:[],
    deliverables:[],
    contact:'',
    note:'',
    submitting:false
  },
  onChooseFile(){
    const that = this
    wx.chooseMessageFile({
      count: 6,
      type: 'file',
      success(res){
        const picked = (res.tempFiles||[]).map(f=>{
          const sizeMb = f.size/1024/1024
          return { path:f.path, name:f.name||'文件', size:f.size, sizeText: sizeMb.toFixed(2)+'MB' }
        })
        that.setData({ files: picked })
      }
    })
  },
  onNeedsChange(e){ this.setData({ needs: e.detail.value }) },
  onDeliverablesChange(e){ this.setData({ deliverables: e.detail.value }) },
  onContact(e){ this.setData({ contact: e.detail.value }) },
  onNote(e){ this.setData({ note: e.detail.value }) },
  onSubmit(){
    if (this.data.submitting || this._submitting) return
    const depositPaid = !!wx.getStorageSync('deposit_paid')
    const paid = !!wx.getStorageSync('deposit_paid')
    const userDoc = wx.getStorageSync('userDoc') || {}
    const userIdLocal = (userDoc && userDoc._id) ? userDoc._id : null
    if(!paid){
      wx.showModal({
        title:'温馨提示',
        content:'发布需求前需缴纳¥100押金，订单完成后自动原路退回。是否前往缴纳并查看押金规则？',
        cancelText:'稍后',
        confirmText:'前往押金',
        success:(r)=>{ if(r.confirm){ wx.navigateTo({ url:'/pages/profile/deposit/deposit' }) } }
      })
      return
    }

    if(!this.data.files.length){ wx.showToast({ title:'请先上传图纸文件', icon:'none' }); return }
    if(!this.data.contact){ wx.showToast({ title:'请填写联系方式', icon:'none' }); return }
    const totalSize = this.data.files.reduce((s,f)=>s+f.size,0)
    const totalMb = totalSize/1024/1024
    if(totalMb > 20){
      wx.showModal({
        title:'文件较大',
        content:`当前选择的文件总大小约为 ${totalMb.toFixed(1)}MB，建议添加客服微信（${this.data.serviceWeChat}）进行专人对接。是否复制微信号？`,
        confirmText:'复制微信号',
        cancelText:'取消',
        success:(r)=>{
          if(r.confirm){
            wx.setClipboardData({ data: this.data.serviceWeChat, success: ()=>{
              wx.showToast({ title:'已复制', icon:'success' })
            } })
          }
        }
      })
      return
    }

    const id = Date.now().toString()
    this._submitting = true
    this.setData({ submitting: true })
    // 生成单行摘要（不换行）
    const joinOrDash = (arr)=> (arr && arr.length) ? arr.join('/') : '-'
    const compactNote = (this.data.note||'').replace(/\s+/g,' ')
    const compactContact = (this.data.contact||'').replace(/\s+/g,'')
    const target = [
      `方向:${joinOrDash(this.data.needs)}`,
      `交付:${joinOrDash(this.data.deliverables)}`,
      `联系:${compactContact}`,
      compactNote ? `备注:${compactNote}` : ''
    ].filter(Boolean).join(' · ')
    const req = {
      id,
      space: '灯光施工图优化',
      target,
      files: this.data.files.map(f=>({ name:f.name, size:f.size })),
      
      needs: this.data.needs,
      deliverables: this.data.deliverables,
      contact: this.data.contact,
      note: this.data.note,
      createdAt: new Date().toISOString(),
      source: 'optimize',
      priority: depositPaid,
      status: 'submitted',
      userId: userIdLocal,
      steps: [
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false },
        { key:'design', label:'优化中', done:false },
        { key:'done', label:'已完成', done:false }
      ]
    }
    // 云端保存：requests + orders
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        const params = { target, files: this.data.files.map(f=>({ name:f.name, size:f.size })), needs: this.data.needs, deliverables: this.data.deliverables, contact: this.data.contact, note: this.data.note }
        util.callCf('requests_create', { request: { orderNo: id, category: 'optimize', params, userId, status: 'submitted' } })
          .catch(err => {
            const msg = (err && (err.message || err.errMsg)) || ''
            if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
              if (wx.cloud && wx.cloud.callFunction) {
                wx.cloud.callFunction({ name: 'initCollections' }).then(() => {
                  util.callCf('requests_create', { request: { orderNo: id, category: 'optimize', params, userId, status: 'submitted' } }).catch(()=>{})
                }).catch(()=>{})
              }
            }
          })
        util.callCf('orders_create', { order: { type:'products', orderNo: id, category:'optimize', params, status:'submitted', paid:false, userId } })
          .catch(()=>{})
      }
    }catch(err){}
    wx.switchTab({ url:'/pages/cart/cart' })
    this._submitting = false
    this.setData({ submitting:false })
  }
})
