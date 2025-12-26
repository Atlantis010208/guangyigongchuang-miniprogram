const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data:{
    activeScheme:'',
    schemeMeta:{ title:'' },
    schemeOptionsTexts:['客厅氛围方案','卧室助眠方案'],
    schemeText:'请选择',
    styleOptionsTexts:['意式极简','现代极简','原木风','奶油风','中古风','宋史美学','轻法式','新中式','轻奢风','侘寂风','美式风','其他'],
    styleText:'请选择',
    areaBucketTexts:['60㎡以下','61~90㎡','91~130㎡','130㎡以上'],
    areaBucketText:'请选择',
    avgFixturePriceOptions:['¥199/盏','¥299/盏','¥399/盏','¥499/盏','¥599/盏'],
    avgFixturePriceText:'请选择',
    designUnitTexts:['¥5/㎡（选灯配灯）','¥9/㎡','¥16/㎡','¥19/㎡','¥29/㎡','¥39/㎡','¥50/㎡及以上'],
    designUnitText:'请选择',
    renovationTypeOptions:['精装房','毛坯房','旧房改造'], renovationTypeText:'请选择',
    progressOptions:['未开工','走水电','木工已完工','油漆完工','硬装已完工','其他'], progressText:'请选择',
    diningPendantOptions:['接受','不接受','其他'], diningPendantText:'请选择',
    smartHomeOptions:['确定做','确定不做','还没考虑好','其他'], smartHomeText:'请选择',
    smartLightOptions:['全屋调光调色','做单色不调光','部分空间调光调色','其他'], smartLightText:'请选择',
    ceilingAdjustOptions:['可以改','局部改','不可以改','其他'], ceilingAdjustText:'请选择',
    note:'',
    estFixtures:0,
    estDesign:0,
    estTotal:0,
    // 搜索弹窗
    showOptionPopup:false,
    optionPopupTitle:'',
    optionList:[],
    optionFilteredList:[],
    optionSearch:'',
    optionTarget:'',
    submitting:false
  },
  // 通用分页操作表：解决 iOS showActionSheet 6 项限制
  showPagedSheet(list, onPick, pageIndex=0){
    const pageSize = 4
    const start = pageIndex * pageSize
    const slice = list.slice(start, start + pageSize)
    const hasPrev = pageIndex > 0
    const hasNext = start + pageSize < list.length
    const itemList = [
      ...slice,
      ...(hasPrev ? ['上一页'] : []),
      ...(hasNext ? ['下一页'] : [])
    ]
    wx.showActionSheet({ itemList, success: (r)=>{
      if(typeof r.tapIndex !== 'number') return
      const optionCount = slice.length
      const prevIndex = optionCount
      const nextIndex = optionCount + (hasPrev ? 1 : 0)
      if(hasPrev && r.tapIndex === prevIndex){ this.showPagedSheet(list, onPick, pageIndex-1); return }
      if(hasNext && r.tapIndex === nextIndex){ this.showPagedSheet(list, onPick, pageIndex+1); return }
      const absoluteIndex = start + r.tapIndex
      const value = list[absoluteIndex]
      if(onPick) onPick(absoluteIndex, value)
    } })
  },
  onSchemeTap(e){},
  onTapScheme(){
    wx.showActionSheet({ itemList: this.data.schemeOptionsTexts, success: (r)=>{
      if(typeof r.tapIndex==='number'){
        const title = this.data.schemeOptionsTexts[r.tapIndex]
    this.setData({ schemeText:title, activeScheme:'picker', schemeMeta:{ title } })
      }
    } })
  },
  onTapStyle(){
    const list = this.data.styleOptionsTexts || []
    this.openOptionPopup('style', '选择风格', list)
  },
  onTapAreaBucket(){ wx.showActionSheet({ itemList: this.data.areaBucketTexts, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ areaBucketText:this.data.areaBucketTexts[r.tapIndex] }, this.recalc) } } }) },
  onTapAvgPrice(){ wx.showActionSheet({ itemList: this.data.avgFixturePriceOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ avgFixturePriceText:this.data.avgFixturePriceOptions[r.tapIndex] }, this.recalc) } } }) },
  onTapDesignUnit(){
    const list = this.data.designUnitTexts || []
    this.openOptionPopup('designUnit', '选择设计单价', list)
  },

  // 通用搜索弹窗
  openOptionPopup(target, title, list){
    this.setData({
      showOptionPopup:true,
      optionPopupTitle: title,
      optionList: list,
      optionFilteredList: list,
      optionSearch:'',
      optionTarget: target
    })
  },
  closeOptionPopup(){ this.setData({ showOptionPopup:false }) },
  onOptionSearch(e){
    const q = (e.detail.value || '').trim()
    const all = this.data.optionList || []
    const filtered = q ? all.filter(t=> String(t).toLowerCase().includes(q.toLowerCase())) : all
    this.setData({ optionSearch:q, optionFilteredList: filtered })
  },
  onOptionPick(e){
    const val = e.currentTarget.dataset.value
    const target = this.data.optionTarget
    if(target==='style'){
      this.setData({ styleText: val, showOptionPopup:false }, this.recalc)
      return
    }
    if(target==='designUnit'){
      this.setData({ designUnitText: val, showOptionPopup:false }, this.recalc)
      return
    }
  },
  noop(){},
  onTapRenovationType(){ wx.showActionSheet({ itemList: this.data.renovationTypeOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ renovationTypeText:this.data.renovationTypeOptions[r.tapIndex] }) } } }) },
  onTapProgress(){ wx.showActionSheet({ itemList: this.data.progressOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ progressText:this.data.progressOptions[r.tapIndex] }) } } }) },
  onTapDiningPendant(){ wx.showActionSheet({ itemList: this.data.diningPendantOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ diningPendantText:this.data.diningPendantOptions[r.tapIndex] }) } } }) },
  onTapSmartHome(){ wx.showActionSheet({ itemList: this.data.smartHomeOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ const val=this.data.smartHomeOptions[r.tapIndex]; const next={ smartHomeText:val }; if(val!=='确定做'){ next.smartLightText='请选择' } this.setData(next) } } }) },
  onTapSmartLight(){ wx.showActionSheet({ itemList: this.data.smartLightOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ smartLightText:this.data.smartLightOptions[r.tapIndex] }) } } }) },
  onTapCeilingAdjust(){ wx.showActionSheet({ itemList: this.data.ceilingAdjustOptions, success: (r)=>{ if(typeof r.tapIndex==='number'){ this.setData({ ceilingAdjustText:this.data.ceilingAdjustOptions[r.tapIndex] }) } } }) },
  onNote(e){ this.setData({ note: e.detail.value }) },
  recalc(){
    const area = (()=>{
      const t = this.data.areaBucketText
      if(t==='60㎡以下') return 55
      if(t==='61~90㎡') return 75
      if(t==='91~130㎡') return 110
      if(t==='130㎡以上') return 130
      return 0
    })()
    const avg = (()=>{
      const m = (this.data.avgFixturePriceText||'').match(/¥(\d+)/)
      return m? parseFloat(m[1]) : 0
    })()
    const unit = (()=>{
      const m = (this.data.designUnitText||'').match(/¥(\d+)/)
      return m? parseFloat(m[1]) : 0
    })()
    const estFixtures = area>0 && avg>0 ? Math.round(area * 0.6 * avg) : 0
    const estDesign = area>0 && unit>0 ? Math.round(area * unit) : 0
    const estTotal = estFixtures + estDesign
    this.setData({ estFixtures, estDesign, estTotal })
  },
  async onSubmitOrder(){
    // 登录检查：未登录时跳转登录页
    const app = getApp()
    if (!app.requireLogin(true, '/pages/categories/residential/residential')) {
      return // 未登录，阻止提交并跳转登录页
    }
    if (this.data.submitting || this._submitting) return
    const { activeScheme, schemeMeta, styleText, areaBucketText, avgFixturePriceText, designUnitText, renovationTypeText, progressText, diningPendantText, smartHomeText, smartLightText, ceilingAdjustText, estFixtures, estDesign, estTotal, note } = this.data
    if(!activeScheme){ wx.showToast({ title:'请选择方案', icon:'none' }); return }
    if(styleText==='请选择' || areaBucketText==='请选择' || avgFixturePriceText==='请选择' || designUnitText==='请选择'){
      wx.showToast({ title:'请完善参数', icon:'none' }); return
    }
    
    // 🔥 查询云端押金状态，用于优先服务标记
    let depositPaid = false
    try {
      const depositRes = await wx.cloud.callFunction({ name: 'deposit_query' })
      if (depositRes.result && depositRes.result.code === 0) {
        depositPaid = depositRes.result.data.hasPaid === true
      }
      console.log('押金状态:', depositPaid ? '已缴纳' : '未缴纳')
    } catch (err) {
      console.warn('查询押金状态失败，使用默认值:', err)
    }
    
    const id = Date.now().toString()
    this._submitting = true
    this.setData({ submitting: true })
    const userDocLocal = wx.getStorageSync('userDoc') || {}
    const userIdLocal = (userDocLocal && userDocLocal._id) ? userDocLocal._id : null
    const order = {
      id,
      source:'scheme',
      category:'residential',
      scheme: schemeMeta.title,
      params:{ style:styleText, areaBucketText, avgFixturePriceText, designUnitText, renovationTypeText, progressText, diningPendantText, smartHomeText, smartLightText, ceilingAdjustText, estFixtures, estDesign, estTotal, note },
      createdAt: new Date().toISOString(),
      userId: userIdLocal,
      steps:[
        { key:'submitted', label:'已提交', done:true },
        { key:'review', label:'审核中', done:false }
      ]
    }
    
    try{
      const db = api.dbInit()
      if (db) {
        const userDoc = wx.getStorageSync('userDoc') || {}
        const userId = (userDoc && userDoc._id) ? userDoc._id : null
        try{
          // 🔥 添加 priority 参数
          const r1 = await util.callCf('requests_create', { request: { orderNo: id, category: 'residential', params: order.params, userId, status: 'submitted', priority: depositPaid } })
          if (!r1 || !r1.success) throw new Error((r1 && r1.errorMessage) || 'requests_create failed')
        }catch(err){
          const msg = (err && (err.message || err.errMsg)) || ''
          if (msg.indexOf('collection not exists') !== -1 || (err && err.errCode === -502005)) {
            if (wx.cloud && wx.cloud.callFunction) {
              await wx.cloud.callFunction({ name: 'initCollections' }).catch(()=>{})
              await util.callCf('requests_create', { request: { orderNo: id, category: 'residential', params: order.params, userId, status: 'submitted', priority: depositPaid } }).catch(()=>{})
            }
          }
        }
        // 🔥 添加 priority 参数
        util.callCf('orders_create', { order: { type:'products', orderNo: id, category:'residential', params: order.params, status:'submitted', paid:false, userId, priority: depositPaid } }).catch(()=>{})
      }
    }catch(err){}
    wx.showToast({ title:'已下单', icon:'success' })
    setTimeout(()=>{ wx.switchTab({ url:'/pages/cart/cart' }); this._submitting = false; this.setData({ submitting:false }) }, 500)
  },
  onDisclaimerTap(){ wx.showToast({ title:'功能开发中', icon:'none' }) }
})
