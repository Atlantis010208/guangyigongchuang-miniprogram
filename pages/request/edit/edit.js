Page({
  data:{
    id:'',
    space:'',
    area:'',
    budget:'',
    target:'',
    note:'',
    mainLightOptions:['有主灯','无主灯'],
    mainLightText:'请选择',
    mainLightIndex:0,
    styles:['现代简约','北欧清新','工业风','新中式','法式优雅'],
    styleText:'请选择',
    styleIndex:0
  },
  onLoad(options){
    const id = options.id
    const list = wx.getStorageSync('lighting_requests') || []
    const req = list.find(i=>i.id===id) || {}
    const mlIdx = Math.max(0, this.data.mainLightOptions.indexOf(req.mainLight || '有主灯'))
    const stIdx = Math.max(0, this.data.styles.indexOf(req.style || '现代简约'))
    this.setData({
      id,
      space:req.space||'',
      area:req.area||'',
      budget:req.budget||'',
      target:req.target||'',
      note:req.note||'',
      mainLightIndex: mlIdx,
      mainLightText: this.data.mainLightOptions[mlIdx],
      styleIndex: stIdx,
      styleText: this.data.styles[stIdx]
    })
  },
  onSpace(e){ this.setData({ space:e.detail.value }) },
  onArea(e){ this.setData({ area:e.detail.value }) },
  onBudget(e){ this.setData({ budget:e.detail.value }) },
  onTarget(e){ this.setData({ target:e.detail.value }) },
  onNote(e){ this.setData({ note:e.detail.value }) },
  onMainLight(e){
    const i = e.detail.value
    this.setData({ mainLightIndex:i, mainLightText:this.data.mainLightOptions[i] })
  },
  onStyle(e){
    const i = e.detail.value
    this.setData({ styleIndex:i, styleText:this.data.styles[i] })
  },
  onSave(){
    const list = wx.getStorageSync('lighting_requests') || []
    const idx = list.findIndex(i=>i.id===this.data.id)
    if(idx>-1){
      Object.assign(list[idx], {
        space:this.data.space,
        area:this.data.area,
        budget:this.data.budget,
        target:this.data.target,
        note:this.data.note,
        mainLight:this.data.mainLightText,
        style:this.data.styleText
      })
      wx.setStorageSync('lighting_requests', list)
      wx.showToast({ title:'已保存', icon:'success' })
      setTimeout(()=>{ wx.navigateBack() }, 400)
    }
  }
})


