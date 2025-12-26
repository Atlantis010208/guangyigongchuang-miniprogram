const api = require('../../../utils/api')
const util = require('../../../utils/util')

Page({
  data: {
    loading: true,
    saving: false,
    orderNo: '',
    category: '',
    params: {},
    // 选项数据
    ageOptions: ['30岁以下', '30-40岁', '40-50岁', '50岁以上'],
    ageIndex: 0,
    budgetOptions: ['20万以内', '30万以内', '40万以内', '50万以内', '80万以内', '100万以内', '其他'],
    budgetIndex: 0,
    styleOptions: ['意式极简', '现代极简', '原木风', '奶油风', '中古风', '宋史美学', '轻法式', '新中式', '轻奢风', '侘寂风', '美式风', '其他'],
    styleIndex: 0,
    renoTypeOptions: ['精装房', '毛坯房', '旧房改造'],
    renoTypeIndex: 0,
    progressOptions: ['未开工', '走水电', '木工已完工', '油漆完工', '硬装已完工', '其他'],
    progressIndex: 0,
    layoutOptions: ['已确定', '还有局部要调整', '其他'],
    layoutIndex: 0,
    smartHomeOptions: ['确定做', '确定不做', '还没考虑好', '其他'],
    smartHomeIndex: 0,
    smartLightingOptions: ['全屋调光调色', '做单色不调光', '部分空间调光调色', '其他'],
    smartLightingIndex: 0,
    decorLightsOptions: ['壁灯', '吊灯', '落地灯', '台灯', '其他'],
    decorLightsChecked: {},
    dislikesOptions: ['吊灯', '壁灯', '射灯', '灯带', '台灯', '落地灯', '磁吸灯', '线性灯', '吸顶灯', '不清楚', '其他'],
    dislikesChecked: {},
    // 选配服务选项
    selectionStageOptions: ['未开工', '走水电', '木工已完工', '油漆完工', '硬装已完工'],
    selectionStageIndex: 0,
    ceilingDropOptions: ['不下吊', '下吊了5cm', '下吊了8cm', '下吊了10cm', '下吊了12cm', '下吊了15cm', '下吊了20cm'],
    ceilingDropIndex: 0,
    bodyHeightOptions: ['薄型 ≤40mm', '常规 40-60mm', '厚型 ≥60mm'],
    bodyHeightIndex: 1,
    trimlessOptions: ['未做', '计划做', '已做'],
    trimlessIndex: 0,
    spotPriceOptions: ['70-100（国产优质光源）', '100-160（进口品牌光源）', '160-300（品牌高端款）'],
    spotPriceIndex: 0
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      return
    }
    this.setData({ orderNo: id })
    this.loadData(id)
  },

  async loadData(id) {
    try {
      const db = api.dbInit()
      if (!db) {
        wx.showToast({ title: '数据库初始化失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const res = await db.collection('requests').where({ orderNo: id }).limit(1).get()
      const doc = res && res.data && res.data[0]
      
      if (!doc) {
        wx.showToast({ title: '订单不存在', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const category = doc.category || ''
      const params = doc.params || {}

      // 初始化选项索引
      const updates = {
        loading: false,
        category,
        params,
        ageIndex: Math.max(0, this.data.ageOptions.indexOf(params.age || '')),
        budgetIndex: Math.max(0, this.data.budgetOptions.indexOf(params.budgetTotal || '')),
        styleIndex: Math.max(0, this.data.styleOptions.indexOf(params.style || '')),
        renoTypeIndex: Math.max(0, this.data.renoTypeOptions.indexOf(params.renoType || '')),
        progressIndex: Math.max(0, this.data.progressOptions.indexOf(params.progress || '')),
        layoutIndex: Math.max(0, this.data.layoutOptions.indexOf(params.layout || '')),
        smartHomeIndex: Math.max(0, this.data.smartHomeOptions.indexOf(params.smartHome || '')),
        smartLightingIndex: Math.max(0, this.data.smartLightingOptions.indexOf(params.smartLighting || ''))
      }

      // 初始化多选框状态
      const decorLightsChecked = {}
      const dislikesChecked = {}
      
      if (Array.isArray(params.decorLights)) {
        params.decorLights.forEach(v => { decorLightsChecked[v] = true })
      }
      if (Array.isArray(params.dislikes)) {
        params.dislikes.forEach(v => { dislikesChecked[v] = true })
      }
      
      updates.decorLightsChecked = decorLightsChecked
      updates.dislikesChecked = dislikesChecked

      // 选配服务字段索引初始化
      if (category === 'selection') {
        updates.selectionStageIndex = Math.max(0, this.data.selectionStageOptions.indexOf(params.stage || ''))
        // 吊顶下吊需要特殊处理（可能是"不下吊"或"下吊了Xcm"）
        const dropVal = params.ceilingDrop || '不下吊'
        updates.ceilingDropIndex = Math.max(0, this.data.ceilingDropOptions.indexOf(dropVal))
        updates.bodyHeightIndex = Math.max(0, this.data.bodyHeightOptions.indexOf(params.bodyHeight || ''))
        updates.trimlessIndex = Math.max(0, this.data.trimlessOptions.indexOf(params.trimless || ''))
        updates.spotPriceIndex = Math.max(0, this.data.spotPriceOptions.indexOf(params.spotPrice || ''))
      }

      this.setData(updates)
    } catch (err) {
      console.error('加载订单失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 通用输入处理
  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    this.setData({ [`params.${key}`]: value })
  },

  // Picker 选择处理
  onAgePick(e) {
    const i = e.detail.value
    this.setData({ ageIndex: i, 'params.age': this.data.ageOptions[i] })
  },
  onBudgetPick(e) {
    const i = e.detail.value
    this.setData({ budgetIndex: i, 'params.budgetTotal': this.data.budgetOptions[i] })
  },
  onStylePick(e) {
    const i = e.detail.value
    this.setData({ styleIndex: i, 'params.style': this.data.styleOptions[i] })
  },
  onRenoTypePick(e) {
    const i = e.detail.value
    this.setData({ renoTypeIndex: i, 'params.renoType': this.data.renoTypeOptions[i] })
  },
  onProgressPick(e) {
    const i = e.detail.value
    this.setData({ progressIndex: i, 'params.progress': this.data.progressOptions[i] })
  },
  onLayoutPick(e) {
    const i = e.detail.value
    this.setData({ layoutIndex: i, 'params.layout': this.data.layoutOptions[i] })
  },
  onSmartHomePick(e) {
    const i = e.detail.value
    this.setData({ smartHomeIndex: i, 'params.smartHome': this.data.smartHomeOptions[i] })
  },
  onSmartLightingPick(e) {
    const i = e.detail.value
    this.setData({ smartLightingIndex: i, 'params.smartLighting': this.data.smartLightingOptions[i] })
  },

  // 多选处理：装饰灯
  onDecorLightsTap(e) {
    const value = e.currentTarget.dataset.value
    const checked = { ...this.data.decorLightsChecked }
    checked[value] = !checked[value]
    
    // 转换为数组存储
    const arr = Object.keys(checked).filter(k => checked[k])
    this.setData({ 
      decorLightsChecked: checked,
      'params.decorLights': arr
    })
  },

  // 多选处理：不喜欢的灯
  onDislikesTap(e) {
    const value = e.currentTarget.dataset.value
    const checked = { ...this.data.dislikesChecked }
    checked[value] = !checked[value]
    
    // 转换为数组存储
    const arr = Object.keys(checked).filter(k => checked[k])
    this.setData({ 
      dislikesChecked: checked,
      'params.dislikes': arr
    })
  },

  // 选配服务 Picker 处理
  onSelectionStagePick(e) {
    const i = e.detail.value
    this.setData({ selectionStageIndex: i, 'params.stage': this.data.selectionStageOptions[i] })
  },
  onCeilingDropPick(e) {
    const i = e.detail.value
    this.setData({ ceilingDropIndex: i, 'params.ceilingDrop': this.data.ceilingDropOptions[i] })
  },
  onBodyHeightPick(e) {
    const i = e.detail.value
    this.setData({ bodyHeightIndex: i, 'params.bodyHeight': this.data.bodyHeightOptions[i] })
  },
  onTrimlessPick(e) {
    const i = e.detail.value
    this.setData({ trimlessIndex: i, 'params.trimless': this.data.trimlessOptions[i] })
  },
  onSpotPricePick(e) {
    const i = e.detail.value
    this.setData({ spotPriceIndex: i, 'params.spotPrice': this.data.spotPriceOptions[i] })
  },

  // 保存修改
  async onSave() {
    if (this.data.saving) return
    
    this.setData({ saving: true })
    
    try {
      const { orderNo, params } = this.data
      
      // 调用云函数更新
      const result = await util.callCf('requests_update', {
        orderNo,
        patch: { params }
      })
      
      if (result && result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 500)
      } else {
        // 云函数失败时，尝试直接更新数据库
        const db = api.dbInit()
        if (db) {
          await db.collection('requests').where({ orderNo }).update({
            data: { params, updatedAt: Date.now() }
          })
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => {
            wx.navigateBack()
          }, 500)
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    } catch (err) {
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})

