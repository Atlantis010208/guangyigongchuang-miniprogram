// 搜索页：照度计算器（双标签）
Page({
  data: {
    activeTab: 'count',
    // 公共字段
    lampFlux: '', // 单灯光通量（lm）
    // 图2：按灯具类型累计总光通量 = Σ(功率×效率×米数/数量×光源利用率)
    lampTypeRows: [
      { name:'反灯槽灯带', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.15, flux:0 },
      { name:'正灯槽灯带', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.30, flux:0 },
      { name:'线性灯', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.80, flux:0 },
      { name:'筒射灯', displayName:'筒射灯(3W)', powerW:3, efficacy:65, lengthQty:'', sourceUtil:1.00, flux:0 },
      { name:'筒射灯', displayName:'筒射灯(7W)', powerW:7, efficacy:65, lengthQty:'', sourceUtil:1.00, flux:0 },
      { name:'吊灯', powerW:25, efficacy:80, lengthQty:'', sourceUtil:0.90, flux:0 },
      { name:'装饰灯', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.90, flux:0 },
    ],
    totalFluxCalc: 0,
    area: '', // 面积（㎡）
    utilFactor: 0.8,
    maintenanceFactor: 0.8,
    // 目标照度模式
    targetLux: '',
    // 灯具数量模式
    lampCount: '',
    // 价格
    lampUnitPrice: '',
    // 结果
    avgLux: 0,
    calcLampCount: 0,
    avgPowerPerArea: 0,
    totalPrice: 0,
    // 弹窗状态
    showLampParams: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 首次展示时，确保两行筒射灯标题带功率
    this.updateDownlightTitles()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.recalc();
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [field]: value });
    this.recalc();
  },

  recalc() {
    const toNum = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    const lampFlux = toNum(this.data.lampFlux);
    // 汇总每种灯具的光通量
    const totalFlux = (this.data.lampTypeRows||[]).reduce((sum, it)=>{
      const phi = toNum(it.powerW) * toNum(it.efficacy) * toNum(it.lengthQty) * toNum(it.sourceUtil);
      return sum + phi;
    }, 0);
    const area = toNum(this.data.area);
    const util = toNum(this.data.utilFactor) || 0;
    const mnt = toNum(this.data.maintenanceFactor) || 0;
    const targetLux = toNum(this.data.targetLux);
    const lampCountInput = toNum(this.data.lampCount);

    // 图2：根据灯具计算照度（使用总光通量）：E = (总光通量 × UF × MF) / 面积
    let avgLux = 0;
    if (totalFlux > 0 && area > 0 && util > 0 && mnt > 0) {
      avgLux = Math.round((totalFlux * util * mnt) / area);
    }

    // 图1：根据照度计算灯具：N = (目标照度 × 面积) / (UF × MF × 单灯光通量)
    let calcLampCount = 0;
    if (targetLux > 0 && lampFlux > 0 && area > 0 && util > 0 && mnt > 0) {
      calcLampCount = Math.ceil((targetLux * area) / (util * mnt * lampFlux));
    }

    // 单位面积平均功率 = (灯具数量 × 7W) / 面积
    const avgPowerPerArea = area > 0 && calcLampCount > 0 ? Number(((calcLampCount * 7) / area).toFixed(2)) : 0;

    // 总价
    const unitPrice = toNum(this.data.lampUnitPrice);
    const priceCount = this.data.activeTab === 'count' ? calcLampCount : lampCountInput;
    const totalPrice = unitPrice > 0 && priceCount > 0 ? priceCount * unitPrice : 0;

    // 同时回写每行的单项光通量，便于展示
    const lampTypeRows = (this.data.lampTypeRows||[]).map(it=>({
      ...it,
      flux: Math.round(toNum(it.powerW) * toNum(it.efficacy) * toNum(it.lengthQty) * toNum(it.sourceUtil))
    }))
    this.setData({ avgLux, calcLampCount, avgPowerPerArea, totalPrice, totalFluxCalc: Math.round(totalFlux), lampTypeRows });
  },
  onLampLenInput(e){
    const idx = Number(e.currentTarget.dataset.index)
    const rows = [...this.data.lampTypeRows]
    rows[idx].lengthQty = e.detail.value
    this.setData({ lampTypeRows: rows }, ()=>{ this.updateDownlightTitles(); this.recalc() })
  },
  onLampMetaInput(e){
    const idx = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const rows = [...this.data.lampTypeRows]
    rows[idx][field] = e.detail.value
    this.setData({ lampTypeRows: rows }, ()=>{ this.updateDownlightTitles(); this.recalc() })
  },
  
  // 当两个同名“筒射灯”的功率变化时，标题显示也随之更新（如：筒射灯(3W)/(7W)）
  updateDownlightTitles(){
    const rows = [...(this.data.lampTypeRows||[])]
    let count = 0
    for(let i=0;i<rows.length;i++){
      if(rows[i].name==='筒射灯'){
        const w = rows[i].powerW
        rows[i].displayName = `筒射灯(${w || 0}W)`
        count++
      }
    }
    if(count>0) this.setData({ lampTypeRows: rows })
  },

  // 灯具参数弹窗
  openLampParams(){ this.setData({ showLampParams:true }) },
  closeLampParams(){ this.setData({ showLampParams:false }) },
  
  // no operation for catchtap
  noop(){},
  
  // 重置与保存
  resetLampParams(){
    const defaults = [
      { name:'反灯槽灯带', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.15, flux:0 },
      { name:'正灯槽灯带', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.30, flux:0 },
      { name:'线性灯', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.80, flux:0 },
      { name:'筒射灯(3W)', powerW:3, efficacy:65, lengthQty:'', sourceUtil:1.00, flux:0 },
      { name:'筒射灯(7W)', powerW:7, efficacy:65, lengthQty:'', sourceUtil:1.00, flux:0 },
      { name:'吊灯', powerW:25, efficacy:80, lengthQty:'', sourceUtil:0.90, flux:0 },
      { name:'装饰灯', powerW:10, efficacy:80, lengthQty:'', sourceUtil:0.90, flux:0 },
    ]
    this.setData({ lampTypeRows: defaults })
    this.recalc()
  },
  saveLampParams(){
    this.setData({ showLampParams:false })
    this.recalc()
  },

  onOpenRules() {
    wx.showModal({
      title: '照度计算器规则',
      content: '1) 平均照度 E = N × Φ ÷ (A × UF × MF)\n2) 灯具数量 N = E × A × UF × MF ÷ Φ（向上取整）\n3) 变量含义：E 为目标照度(勒克斯)，N 为灯具数量(套)，Φ 为单灯光通量(流明)，A 为房间面积(㎡)，UF 为利用系数，MF 为维护系数。',
      showCancel: false,
      confirmText: '我知道了'
    });
  }
});


