// pages/color-temp/color-temp.js

Page({
  data: {
    // UI 控制
    headerBgFileId: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/toolbox/color-temp-bg.png',
    headerTitle: '色温调节器',
    headerSubtitle: '专业分层色温建议',
    headerDesc: '基于空间、人群和氛围智能推荐照明方案',

    // ==================== 表单数据 ====================
    // 1. 空间类别
    spaceTypes: [
      { id: 'living', name: '客厅', baseTemp: 3500, lux: 200, group: '起居' },
      { id: 'dining', name: '餐厅', baseTemp: 3500, lux: 150, group: '起居' },
      { id: 'master_bedroom', name: '主卧', baseTemp: 3500, lux: 100, group: '起居' },
      { id: 'second_bedroom', name: '次卧', baseTemp: 3500, lux: 100, group: '起居' },
      { id: 'kids_room', name: '儿童房', baseTemp: 4000, lux: 150, group: '起居' },
      { id: 'elder_room', name: '老人房', baseTemp: 3000, lux: 150, group: '起居' },
      { id: 'kitchen', name: '厨房', baseTemp: 4000, lux: 150, group: '功能' },
      { id: 'bathroom', name: '卫生间', baseTemp: 4000, lux: 100, group: '功能' },
      { id: 'cloakroom', name: '衣帽间', baseTemp: 4000, lux: 150, group: '功能' },
      { id: 'study', name: '书房/办公', baseTemp: 4000, lux: 300, group: '功能' },
      { id: 'balcony', name: '阳台', baseTemp: 3500, lux: 75, group: '功能' },
      { id: 'hotel_lobby', name: '酒店大堂', baseTemp: 3500, lux: 200, group: '商业' },
      { id: 'hotel_room', name: '酒店客房', baseTemp: 3500, lux: 100, group: '商业' },
      { id: 'cafe', name: '咖啡厅/茶室', baseTemp: 3000, lux: 150, group: '商业' },
      { id: 'restaurant', name: '餐饮空间', baseTemp: 3500, lux: 200, group: '商业' },
      { id: 'retail', name: '零售店铺', baseTemp: 4000, lux: 300, group: '商业' },
      { id: 'gallery', name: '展厅/画廊', baseTemp: 4000, lux: 300, group: '商业' },
      { id: 'office', name: '办公室', baseTemp: 4000, lux: 300, group: '商业' }
    ],
    spaceIndex: -1,
    suggestedTemp: '',
    suggestedTempSource: '',
    area: '',

    // 2. 使用人群
    ageGroups: [
      { id: 'child', name: '儿童（0-12岁）', offset: 200 },
      { id: 'youth', name: '青年（13-35岁）', offset: 0 },
      { id: 'middle', name: '中年（36-55岁）', offset: -150 },
      { id: 'elder', name: '老年（56岁以上）', offset: -300 },
      { id: 'mixed', name: '混合人群', offset: -50 }
    ],
    ageIndex: -1,

    // 3. 主要用途（生活场景，替代氛围偏好）
    usages: [
      { id: 'sleep', name: '休息睡觉', offset: -300 },
      { id: 'eat', name: '吃饭聊天', offset: -200 },
      { id: 'relax', name: '看电视休闲', offset: -100 },
      { id: 'daily', name: '日常起居', offset: 0 },
      { id: 'work', name: '读书办公', offset: 300 },
      { id: 'cook', name: '做饭家务', offset: 400 }
    ],
    usageIndex: -1,

    // 4. 灯具选择（具体灯具名称，替代照明层术语）
    fixtures: [
      { id: 'basic', name: '吸顶灯 / 筒灯 / 面板灯', layer: 'basic' },
      { id: 'ambient', name: '灯带 / 壁灯 / 落地灯', layer: 'ambient' },
      { id: 'accent', name: '射灯 / 轨道灯', layer: 'accent' },
      { id: 'task', name: '台灯 / 镜前灯 / 橱柜灯', layer: 'task' }
    ],
    selectedFixtures: [],
    fixtureAddOptions: ['请选择灯具'],
    fixtureAddValue: 0,

  },

  onLoad() {
    this._requestId = 0
    this._pendingRequest = null  // { promise, paramsKey, id }
    this._cachedResult = null    // { paramsKey, resultData }
    this._isOnPage = true
    this.loadCloudConfig()
  },

  onShow() {
    this._isOnPage = true

    // 优先处理历史记录回填
    try {
      const selected = wx.getStorageSync('color_temp_history_selected')
      if (selected && selected.params) {
        wx.removeStorageSync('color_temp_history_selected')
        const p = selected.params
        this.setData({
          spaceIndex: p.spaceIndex,
          area: p.area || '',
          suggestedTemp: p.suggestedTemp || p.targetLux || '',
          suggestedTempSource: '',
          ageIndex: p.ageIndex,
          usageIndex: p.usageIndex,
          selectedFixtures: p.selectedFixtures || (p.primaryFixtureIndex >= 0 ? [this.data.fixtures[p.primaryFixtureIndex]] : [])
        })
        this.setData({ fixtureAddOptions: this._buildFixtureAddOptions(this.data.fixtures, this.data.selectedFixtures) })
        // 将历史结果写入缓存，参数不变时可秒跳
        if (selected.result) {
          this._cachedResult = { paramsKey: this._getParamsKey(), resultData: selected.result }
        }
        this._pendingRequest = null
        console.log('[色温选择器] 已从历史记录回填参数')
        return
      }
    } catch (e) {}

    // 从结果页返回时，把 AI 结果回写到缓存，避免再次点击走本地兜底
    const app = getApp()
    const lastResult = app.globalData && app.globalData.colorTempResult
    if (lastResult && !this._cachedResult && !this._pendingRequest) {
      this._cachedResult = { paramsKey: this._getParamsKey(), resultData: lastResult }
      console.log('[色温选择器] 已从结果页回写 AI 缓存')
    }
  },

  onHide() {
    this._isOnPage = false
    wx.hideLoading()
  },

  async loadCloudConfig() {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('color_temp_config').doc('global_config').get()
      if (data) {
        const updates = {}
        if (data.spaceTypes && data.spaceTypes.length) updates.spaceTypes = data.spaceTypes
        if (data.ageGroups && data.ageGroups.length) updates.ageGroups = data.ageGroups
        if (data.usages && data.usages.length) updates.usages = data.usages
        if (data.fixtures && data.fixtures.length) {
          updates.fixtures = data.fixtures
          updates.fixtureAddOptions = this._buildFixtureAddOptions(data.fixtures, this.data.selectedFixtures)
        }
        if (data.pageConfig) {
          if (data.pageConfig.bgImage) updates.headerBgFileId = data.pageConfig.bgImage
          if (data.pageConfig.title) updates.headerTitle = data.pageConfig.title
          if (data.pageConfig.subtitle) updates.headerSubtitle = data.pageConfig.subtitle
          if (data.pageConfig.desc) updates.headerDesc = data.pageConfig.desc
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates)
          console.log('[色温选择器] 已加载云端配置')
        }
      }
    } catch (err) {
      console.warn('[色温选择器] 读取云端配置失败，使用本地默认配置:', err)
    }
  },

  // ========== 交互事件 ==========

  onHistoryTap() {
    wx.navigateTo({ url: '/pages/color-temp/history/history' })
  },

  onSpaceChange(e) {
    const index = Number(e.detail.value)
    const space = this.data.spaceTypes[index]
    const updates = { spaceIndex: index }
    if (space && space.baseTemp) {
      updates.suggestedTemp = String(space.baseTemp)
      updates.suggestedTempSource = '基于「' + space.name + '」推荐，可手动修改'
    }
    this.setData(updates)
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const updates = { [field]: e.detail.value }
    if (field === 'suggestedTemp') {
      updates.suggestedTempSource = e.detail.value ? '自定义色温' : ''
    }
    this.setData(updates)
  },

  onAgeChange(e) {
    this.setData({ ageIndex: Number(e.detail.value) })
  },

  onUsageChange(e) {
    this.setData({ usageIndex: Number(e.detail.value) })
  },

  onAddFixture(e) {
    const pickIndex = Number(e.detail.value)
    if (pickIndex <= 0) {
      this.setData({ fixtureAddValue: 0 })
      return
    }
    // 从可选列表中找到对应灯具（排除已选的）
    const available = this.data.fixtures.filter(f => !this.data.selectedFixtures.some(s => s.id === f.id))
    const fixture = available[pickIndex - 1]
    if (!fixture) {
      this.setData({ fixtureAddValue: 0 })
      return
    }
    const newSelected = [...this.data.selectedFixtures, fixture]
    this.setData({
      selectedFixtures: newSelected,
      fixtureAddOptions: this._buildFixtureAddOptions(this.data.fixtures, newSelected),
      fixtureAddValue: 0
    })
  },

  onRemoveFixture(e) {
    const id = e.currentTarget.dataset.id
    const newSelected = this.data.selectedFixtures.filter(f => f.id !== id)
    this.setData({
      selectedFixtures: newSelected,
      fixtureAddOptions: this._buildFixtureAddOptions(this.data.fixtures, newSelected)
    })
  },

  _buildFixtureAddOptions(fixtures, selected) {
    const available = (fixtures || []).filter(f => !(selected || []).some(s => s.id === f.id))
    return ['请选择灯具', ...available.map(f => f.name)]
  },

  // ========== 计算逻辑 ==========

  _getParamsKey() {
    const fixtureIds = this.data.selectedFixtures.map(f => f.id).sort().join(',')
    return [this.data.spaceIndex, this.data.suggestedTemp || '',
      this.data.ageIndex, this.data.usageIndex,
      fixtureIds].join('|')
  },

  onCalculate() {
    if (this.data.spaceIndex < 0) {
      wx.showToast({ title: '请选择空间类型', icon: 'none' })
      return
    }

    const currentKey = this._getParamsKey()

    // 1. 有缓存结果且参数匹配 → 直接用缓存，秒跳（0 token）
    if (this._cachedResult && this._cachedResult.paramsKey === currentKey) {
      console.log('[色温选择器] 使用缓存的 AI 结果')
      const cached = this._cachedResult.resultData
      this._cachedResult = null
      this._pendingRequest = null
      this._navigateToResult(cached)
      return
    }

    // 2. 有进行中的请求且参数匹配 → 恢复 loading 等待（0 token）
    if (this._pendingRequest && this._pendingRequest.paramsKey === currentKey) {
      console.log('[色温选择器] 恢复等待上一次 AI 请求')
      wx.showLoading({ title: '正在分析中，请稍候...', mask: true })
      return
    }

    // 3. 参数变了或没有旧请求 → 发起新请求
    this._requestId++
    this._cachedResult = null
    const myId = this._requestId
    wx.showLoading({ title: '正在分析中，请稍候...', mask: true })

    // 收集参数
    const space = this.data.spaceTypes[this.data.spaceIndex]
    const age = this.data.ageIndex >= 0 ? this.data.ageGroups[this.data.ageIndex] : null
    const usage = this.data.usageIndex >= 0 ? this.data.usages[this.data.usageIndex] : null
    const fixtureNames = this.data.selectedFixtures.map(f => f.name)

    const promise = wx.cloud.callFunction({
      name: 'color_temp_ai',
      config: { timeout: 300000 },
      data: {
        spaceName: space.name,
        suggestedTemp: this.data.suggestedTemp,
        ageName: age ? age.name : '',
        usageName: usage ? usage.name : '',
        fixtureNames: fixtureNames
      }
    })

    this._pendingRequest = { promise, paramsKey: currentKey, id: myId }

    promise.then(res => {
      // 过期请求，静默丢弃
      if (myId !== this._requestId) {
        console.log('[色温选择器] 过期请求(id=' + myId + ')已丢弃')
        return
      }

      this._pendingRequest = null
      const result = res.result
      console.log('[色温选择器] AI 返回:', JSON.stringify(result).substring(0, 500))

      if (result && result.success && result.data) {
        const resultData = {
          standardTemp: result.data.standardTemp,
          desc: result.data.desc,
          layers: result.data.layers || [],
          tips: result.data.tips || [],
          reasoning: result.data.reasoning || ''
        }

        if (this._isOnPage) {
          // 用户还在页面 → 直接跳转
          wx.hideLoading()
          this._navigateToResult(resultData)
        } else {
          // 用户已返回 → 静默缓存，不跳转不打断
          console.log('[色温选择器] AI 结果已缓存，等待用户再次点击')
          this._cachedResult = { paramsKey: currentKey, resultData }
        }
      } else {
        console.warn('AI 返回异常，降级到本地计算:', result)
        if (this._isOnPage) {
          wx.hideLoading()
          this.doCalculate()
        }
      }
    }).catch(err => {
      if (myId !== this._requestId) return
      this._pendingRequest = null
      console.warn('AI 调用失败，降级到本地计算:', err)
      if (this._isOnPage) {
        wx.hideLoading()
        this.doCalculate()
      }
    })
  },

  doCalculate() {
    const space = this.data.spaceTypes[this.data.spaceIndex]
    const age = this.data.ageIndex >= 0 ? this.data.ageGroups[this.data.ageIndex] : { offset: 0, id: 'youth' }
    const usage = this.data.usageIndex >= 0 ? this.data.usages[this.data.usageIndex] : { offset: 0, id: 'daily' }
    
    // 1. 用途偏移根据空间动态调整（避免儿童房/老人房色温过于极端）
    let usageOffset = usage.offset
    if (space.id === 'kids_room' && usageOffset < -300) {
      usageOffset = -300  // 儿童房"休息睡觉"偏移限制为 -300K
    }
    if (space.id === 'elder_room' && usageOffset > 200) {
      usageOffset = 200   // 老人房"读书办公"偏移限制为 +200K
    }

    // 2. 计算原始值 = 空间基准 + 人群偏移 + 用途偏移
    let rawTemp = space.baseTemp + age.offset + usageOffset
    
    // 3. 空间色温保护（硬性边界）
    const spaceMinMax = {
      master_bedroom:  { min: 2700, max: 4000 },  // 主卧 2700~4000K
      second_bedroom:  { min: 2700, max: 4000 },  // 次卧 2700~4000K
      kids_room:       { min: 3000, max: 4500 },  // 儿童房不低于 3000K
      elder_room:      { min: 2700, max: 3500 },  // 老人房不高于 3500K
      hotel_room:      { min: 2700, max: 4000 },  // 酒店客房
      study:           { min: 3500, max: 5000 },  // 书房不低于 3500K
      bathroom:        { min: 3500, max: 4500 },  // 卫生间（需要辨色）
      cloakroom:       { min: 3500, max: 4500 },  // 衣帽间（需要辨色）
      kitchen:         { min: 3500, max: 5000 }   // 厨房（需要辨色）
    }
    
    if (spaceMinMax[space.id]) {
      const { min, max } = spaceMinMax[space.id]
      rawTemp = Math.max(min, Math.min(max, rawTemp))
    }
    
    // 4. 吸附到标准档位
    const standardTemp = this.snapToStandard(rawTemp)
    
    // 5. 收集选中的灯具对应的照明层
    const selectedLayerIds = []
    this.data.selectedFixtures.forEach(f => {
      if (f.layer && !selectedLayerIds.includes(f.layer)) {
        selectedLayerIds.push(f.layer)
      }
    })
    if (selectedLayerIds.length === 0) {
      selectedLayerIds.push('basic')
    }

    // 6. 生成分层建议（所有层都受空间保护约束）
    const spaceMin = spaceMinMax[space.id] ? spaceMinMax[space.id].min : 2700
    const spaceMax = spaceMinMax[space.id] ? spaceMinMax[space.id].max : 6000
    const ambientTemp = this.snapToStandard(Math.max(spaceMin, standardTemp - 500))
    const taskTempFinal = this.snapToStandard(Math.min(spaceMax, standardTemp + 500))

    const layerRules = {
      basic:   { name: '吸顶灯 / 筒灯 / 面板灯', label: '基础照明', temp: standardTemp, desc: '提供均匀的整体亮度，是空间的主要光源' },
      ambient: { name: '灯带 / 壁灯 / 落地灯', label: '氛围照明', temp: ambientTemp, desc: '营造温馨的层次感，让空间更有情调' },
      accent:  { name: '射灯 / 轨道灯', label: '重点照明', temp: standardTemp, desc: '突出展示墙面装饰画或重点区域' },
      task:    { name: '台灯 / 镜前灯 / 橱柜灯', label: '作业照明', temp: taskTempFinal, desc: '为阅读、化妆、烹饪等操作提供清晰光线' }
    }

    const layerResults = selectedLayerIds.map(id => ({
      id: id,
      name: layerRules[id].name,
      label: layerRules[id].label,
      temp: layerRules[id].temp,
      desc: layerRules[id].desc
    }))

    // 7. 生成专业提示（与结果一致，不矛盾）
    const tips = [
      '同一空间不同灯具的色温差建议不超过 500K，光色统一看起来更舒服。',
      '买灯时认准"显色指数 Ra≥90"，比色温更影响看东西的真实感。'
    ]
    
    if (age.id === 'elder') {
      tips.push('老年人对刺眼的白光更敏感，本次推荐已将色温控制在 ' + standardTemp + 'K 以内。')
    }

    if (age.id === 'child' && standardTemp < 4000) {
      tips.push('儿童日常活动和学习时，建议将主灯切换到 4000K 中性光，有助于保护视力。')
    }

    if (usage.id === 'sleep' && standardTemp >= 3000) {
      tips.push('虽然推荐色温为 ' + standardTemp + 'K，但入睡前可将灯光调暗或切换到 2700K 暖光助眠。')
    }

    if (usage.id === 'cook' && selectedLayerIds.includes('task')) {
      tips.push('厨房操作台上方的橱柜灯建议用偏白光(4000K以上)，切菜更安全。')
    }

    if (space.id === 'bathroom' || space.id === 'cloakroom') {
      tips.push('该空间需要准确辨色，推荐已保证色温不低于 3500K。')
    }

    // 8. 色温描述（通俗化）
    let desc = '自然白光'
    if (standardTemp <= 2700) desc = '暖黄光（像烛光）'
    else if (standardTemp === 3000) desc = '暖白光（温馨舒适）'
    else if (standardTemp === 3500) desc = '自然偏暖光'
    else if (standardTemp === 4000) desc = '自然白光（明亮清晰）'
    else if (standardTemp >= 4500) desc = '冷白光（清醒专注）'

    this._navigateToResult({
      standardTemp: standardTemp,
      desc: desc,
      layers: layerResults,
      tips: tips
    })
  },

  // 跳转到结果子页面
  _navigateToResult(resultData) {
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.colorTempResult = resultData
    // 保存输入参数，供结果页写入历史记录
    app.globalData.colorTempParams = {
      spaceIndex: this.data.spaceIndex,
      spaceName: this.data.spaceIndex >= 0 ? this.data.spaceTypes[this.data.spaceIndex].name : '',
      area: this.data.area,
      suggestedTemp: this.data.suggestedTemp,
      ageIndex: this.data.ageIndex,
      ageName: this.data.ageIndex >= 0 ? this.data.ageGroups[this.data.ageIndex].name : '',
      usageIndex: this.data.usageIndex,
      usageName: this.data.usageIndex >= 0 ? this.data.usages[this.data.usageIndex].name : '',
      selectedFixtures: this.data.selectedFixtures,
      fixtureNames: this.data.selectedFixtures.map(f => f.name)
    }
    wx.navigateTo({ url: '/pages/color-temp/color-temp-result/color-temp-result' })
  },

  snapToStandard(temp) {
    const standards = [2700, 3000, 3500, 4000, 4500, 5000, 6000]
    let closest = standards[0]
    let minDiff = Math.abs(temp - closest)
    
    for (let i = 1; i < standards.length; i++) {
      const diff = Math.abs(temp - standards[i])
      if (diff < minDiff) {
        minDiff = diff
        closest = standards[i]
      }
    }
    return closest
  }
})
