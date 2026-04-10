/**
 * 照度计算结果页面 - 8页全屏报告
 * 用于展示计算结果的详细信息，支持 CSV 导出
 */

Page({
  data: {
    // 计算模式
    mode: 'count', // 'count' | 'quantity' | 'lux'
    
    // 云端记录ID
    calcId: '',
    // 后端生成的CSV数据
    csvData: null,
    // 加载状态
    loading: false,

    // 主要结果（原始数据，保留用于 CSV 导出）
    mainValue: 0,
    mainUnit: '',
    mainLabel: '',
    headerLeft: { label: '', value: '' },
    headerMiddle: null,
    headerRight: { label: '', value: '' },
    details: [],
    bottomTable: [],

    // ====== 报告页面数据 ======
    currentPage: 0,

    // P1: 封面（动态参数列表，根据计算模式变化）
    coverParams: [],

    // P2: 核心结论
    coreResult: {
      luxValue: 0,
      isQualified: true,
      statusText: '达标（处于舒适区间）',
      standardText: '住宅客厅建议照度：150–300 lx',
      tipText: '当前照度处于国家建议区间内，适合日常生活使用。'
    },

    // P3: 照度区间
    animatedMarkerLeft: 0,
    rangeData: {
      luxValue: 0,
      markerLeft: 38,
      currentBrightness: 1.0,
      ranges: [
        { range: '0–80 lx', state: '昏暗区', scene: '酒吧 / 情绪氛围', colorClass: 'dot-dark', active: false },
        { range: '80–150 lx', state: '偏暗区', scene: '夜间休闲', colorClass: 'dot-dim', active: false },
        { range: '150–300 lx', state: '舒适区', scene: '客厅日常活动', colorClass: 'dot-comfort', active: true },
        { range: '300–500 lx', state: '偏亮区', scene: '阅读 / 精细活动', colorClass: 'dot-bright', active: false },
        { range: '>500 lx', state: '过亮区', scene: '商业空间', colorClass: 'dot-over', active: false }
      ]
    },

    // P4: 详细数据
    detailData: {
      inputParams: [],
      calcResults: []
    },

    // P5: 风险与舒适度
    riskData: {
      isQualified: true,
      statusLabel: '舒适达标',
      impacts: [
        '光线柔和适中，满足日常起居需求',
        '长时间阅读或看电视不易产生视觉疲劳',
        '空间氛围自然放松，适合长期居住'
      ],
      suggestions: [
        '当前基础照明已达标，无需增减主灯',
        '若有精细阅读需求，建议在沙发旁补充落地灯',
        '可增加少量低色温氛围灯带提升层次感'
      ]
    },

    // P6: 舒适指数
    comfortData: {
      score: 92,
      levelText: 'A级：适合长期居住',
      scores: [
        { label: '照度合理性', score: 38, max: 40 },
        { label: '能耗效率', score: 18, max: 20 },
        { label: '舒适区间匹配度', score: 18, max: 20 },
        { label: '优化空间', score: 18, max: 20 }
      ]
    },

    // P7: 节能
    energyData: {
      currentDensity: '3.4',
      standardDensity: '6.0',
      assessTitle: '节能评估优秀',
      assessDesc: '当前方案功率密度远低于国家标准上限，在保证照度舒适的前提下，实现了优秀的节能效果。',
      currentWatt: 96,
      currentCost: 84,
      standardWatt: 168,
      standardCost: 147,
      costPercent: 56
    },

    // P8: 免责声明
    disclaimerItems: [
      '本报告基于平均照度估算，数据通过理论公式推导得出。',
      '计算过程未考虑墙面反射率、家具遮挡、灯具实际光衰等复杂物理因素。',
      '评估结果不代表最终实际落地效果，可能存在一定偏差。',
      '本报告仅作为灯光设计与选型的参考依据，不作为任何法律或商业承诺。'
    ]
  },

  onLoad(options) {
    console.log('[calc-result] onLoad, options:', options)

    // 方式1：从页面栈读取后端返回的完整报告数据（正常计算流程）
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]

    if (prevPage && prevPage.data._cloudReportData) {
      // 后端云函数返回的完整数据
      const cloudData = prevPage.data._cloudReportData
      this._applyCloudReportData(cloudData)
      return
    }

    // 方式2：通过 calcId 参数从云端加载（历史记录/分享场景）
    if (options && options.calcId) {
      this._loadFromCloud(options.calcId)
      return
    }

    // 方式3：兜底 - 从页面栈读取 resultData 并在前端本地生成报告
    if (prevPage && prevPage.data.resultData) {
      const resultData = prevPage.data.resultData
      this._applyResultData(resultData)
      this._buildReportData(resultData)
      return
    }

    // 无数据可用
    wx.showToast({ title: '无法加载报告数据', icon: 'none' })
  },

  /**
   * 应用后端云函数返回的完整报告数据
   */
  _applyCloudReportData(cloudData) {
    const { calcId, reportData, csvData, resultData } = cloudData

    // 设置原始结果数据（用于CSV兜底导出）
    if (resultData) {
      this._applyResultData(resultData)
    }

    // 直接使用后端生成的报告数据渲染
    this.setData({
      calcId: calcId || '',
      csvData: csvData || null,
      coverParams: (reportData && reportData.coverParams) || [],
      coreResult: (reportData && reportData.coreResult) || this.data.coreResult,
      rangeData: (reportData && reportData.rangeData) || this.data.rangeData,
      detailData: (reportData && reportData.detailData) || this.data.detailData,
      riskData: (reportData && reportData.riskData) || this.data.riskData,
      comfortData: (reportData && reportData.comfortData) || this.data.comfortData,
      energyData: (reportData && reportData.energyData) || this.data.energyData,
      disclaimerItems: (reportData && reportData.disclaimerItems) || this.data.disclaimerItems
    }, () => {
      // 页面初始加载时如果就在 P3 (currentPage === 2)，也需要触发一下动效
      if (this.data.currentPage === 2) {
        setTimeout(() => {
          this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
        }, 50)
      }
    })
  },

  /**
   * 设置原始结果数据字段
   */
  _applyResultData(resultData) {
    this.setData({
      mode: resultData.mode || 'count',
      mainValue: resultData.mainValue || 0,
      mainUnit: resultData.mainUnit || '',
      mainLabel: resultData.mainLabel || '',
      headerLeft: resultData.headerLeft || { label: '', value: '' },
      headerMiddle: resultData.headerMiddle || null,
      headerRight: resultData.headerRight || { label: '', value: '' },
      details: resultData.details || [],
      bottomTable: resultData.bottomTable || []
    })
  },

  /**
   * 通过 calcId 从云端加载完整报告
   */
  _loadFromCloud(calcId) {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载报告中...' })

    wx.cloud.callFunction({
      name: 'calc_report',
      data: { action: 'get', calcId }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.success && result.data) {
        this._applyCloudReportData(result.data)
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
      }
      this.setData({ loading: false })
    }).catch(err => {
      wx.hideLoading()
      console.error('[calc-result] 云端加载失败:', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  onShow() {
    wx.setNavigationBarTitle({ title: '照度评估报告' })
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#F8FAFC'
    })
  },

  // ========== Swiper 切换 ==========
  onSwiperChange(e) {
    const current = e.detail.current
    this.setData({ currentPage: current })

    // 处理 P3 照度区间分布页的进度条滑动动效
    if (current === 2) {
      // 稍微延迟以确保页面已切换，触发过渡动画
      setTimeout(() => {
        this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
      }, 50)
    } else {
      // 离开 P3 页面时重置，以便下次进入重新播放动效
      if (this.data.animatedMarkerLeft !== 0) {
        this.setData({ animatedMarkerLeft: 0 })
      }
    }
  },

  // ========== 报告数据生成 ==========

  /**
   * 根据原始计算数据生成8页报告所需的各项数据
   */
  _buildReportData(resultData) {
    const mode = resultData.mode || 'count'
    const details = resultData.details || []
    const mainValue = parseFloat(resultData.mainValue) || 0

    // --- 从 details 中提取关键参数 ---
    const getDetailVal = (label) => {
      const item = details.find(d => d.label && d.label.indexOf(label) !== -1)
      return item ? item.value : ''
    }

    const area = parseFloat(getDetailVal('面积')) || 28
    const lampCount = parseInt(getDetailVal('灯具数量') || getDetailVal('数量')) || 12
    const singleFlux = parseFloat(getDetailVal('单灯流明') || getDetailVal('光通量')) || 850
    const totalFlux = parseFloat(getDetailVal('总流明')) || (singleFlux * lampCount)
    const totalPower = parseFloat(getDetailVal('总功率') || getDetailVal('功率')) || 96
    const powerDensity = totalPower > 0 && area > 0 ? (totalPower / area).toFixed(1) : '3.4'
    const lampModel = getDetailVal('灯具') || getDetailVal('型号') || 'XXX 型号'

    // 计算照度值（根据模式取不同值）
    let luxValue = 0
    if (mode === 'lux') {
      luxValue = mainValue
    } else {
      // count/quantity 模式主值可能不是照度，尝试从 details 中取
      const luxFromDetail = parseFloat(getDetailVal('照度') || getDetailVal('Eavg'))
      luxValue = luxFromDetail || mainValue
    }

    // --- P1: 封面 ---
    const now = new Date()
    const calcTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
    const reportNo = `REP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`

    // --- P2: 核心结论 ---
    const isQualified = luxValue >= 150 && luxValue <= 300
    const isLow = luxValue < 150
    const isHigh = luxValue > 300
    let statusText = '达标（处于舒适区间）'
    let tipText = '当前照度处于国家建议区间内，适合日常生活使用。'
    if (isLow) {
      statusText = '偏低（低于舒适区间）'
      tipText = '当前照度偏低，建议增加灯具数量或提升单灯亮度以改善照明效果。'
    } else if (isHigh) {
      statusText = '偏高（高于舒适区间）'
      tipText = '当前照度偏高，长时间可能造成视觉疲劳，建议适当降低亮度。'
    }

    // --- P3: 照度区间标记位置 ---
    let markerLeft = 0
    if (luxValue <= 0) markerLeft = 0
    else if (luxValue <= 80) markerLeft = (luxValue / 80) * 16
    else if (luxValue <= 150) markerLeft = 16 + ((luxValue - 80) / 70) * 14
    else if (luxValue <= 300) markerLeft = 30 + ((luxValue - 150) / 150) * 30

    // 确定当前所在区间
    let activeIndex = 2
    if (luxValue < 80) activeIndex = 0
    else if (luxValue < 150) activeIndex = 1
    else if (luxValue <= 300) activeIndex = 2
    else if (luxValue <= 500) activeIndex = 3
    else activeIndex = 4

    const ranges = [
      { range: '0–80 lx', state: '昏暗区', scene: '酒吧 / 情绪氛围', colorClass: 'dot-dark', active: false },
      { range: '80–150 lx', state: '偏暗区', scene: '夜间休闲', colorClass: 'dot-dim', active: false },
      { range: '150–300 lx', state: '舒适区', scene: '客厅日常活动', colorClass: 'dot-comfort', active: false },
      { range: '300–500 lx', state: '偏亮区', scene: '阅读 / 精细活动', colorClass: 'dot-bright', active: false },
      { range: '>500 lx', state: '过亮区', scene: '商业空间', colorClass: 'dot-over', active: false }
    ]
    ranges[activeIndex].active = true

    // --- P4: 详细数据 ---
    const inputParams = [
      { label: '空间面积', value: area + ' ㎡' },
      { label: '灯具数量', value: lampCount + ' 盏' },
      { label: '单灯流明', value: singleFlux + ' lm' },
      { label: '总流明', value: Math.round(totalFlux) + ' lm' },
      { label: '总功率', value: Math.round(totalPower) + ' W' },
      { label: '功率密度', value: powerDensity + ' W/㎡' }
    ]

    const diffLow = luxValue - 150
    const diffHigh = luxValue - 300
    const calcResults = [
      { label: '平均照度', value: Math.round(luxValue) + ' lx', highlight: false },
      { label: '目标建议区间', value: '150–300 lx', highlight: false },
      { label: '与下限差值', value: (diffLow >= 0 ? '+' : '') + Math.round(diffLow) + ' lx', highlight: diffLow >= 0 },
      { label: '与上限差值', value: (diffHigh >= 0 ? '+' : '') + Math.round(diffHigh) + ' lx', highlight: false }
    ]

    // --- P5: 风险评估 ---
    let riskStatusLabel = '舒适达标'
    let impacts = [
      '光线柔和适中，满足日常起居需求',
      '长时间阅读或看电视不易产生视觉疲劳',
      '空间氛围自然放松，适合长期居住'
    ]
    let suggestions = [
      '当前基础照明已达标，无需增减主灯',
      '若有精细阅读需求，建议在沙发旁补充落地灯',
      '可增加少量低色温氛围灯带提升层次感'
    ]
    if (isLow) {
      riskStatusLabel = '照度偏低'
      impacts = [
        '光线不足可能导致长期视觉疲劳',
        '阅读和精细工作时容易眼睛酸涩',
        '空间整体偏暗，可能影响日常活动效率'
      ]
      suggestions = [
        '建议增加灯具数量或更换更高流明灯具',
        '在主要活动区域增加补充照明',
        '考虑增加台灯或落地灯提升局部照度'
      ]
    } else if (isHigh) {
      riskStatusLabel = '照度偏高'
      impacts = [
        '过亮的环境可能造成眩光不适',
        '长时间处于高照度下容易产生视觉疲劳',
        '不利于放松和休息的氛围营造'
      ]
      suggestions = [
        '建议减少灯具数量或降低单灯亮度',
        '可考虑增加调光功能以适应不同场景',
        '使用间接照明方式降低直射光线'
      ]
    }

    // --- P6: 舒适指数 ---
    let comfortScore = 92
    let levelText = 'A级：适合长期居住'
    let scoreReason = 38
    let scoreEfficiency = 18
    let scoreMatch = 18
    let scoreOptimize = 18

    if (isLow) {
      comfortScore = 58
      levelText = 'C级：建议优化提升'
      scoreReason = 20
      scoreEfficiency = 15
      scoreMatch = 10
      scoreOptimize = 13
    } else if (isHigh) {
      comfortScore = 65
      levelText = 'B级：基本满足需求'
      scoreReason = 22
      scoreEfficiency = 12
      scoreMatch = 15
      scoreOptimize = 16
    }

    // --- P7: 节能 ---
    const stdDensity = 6.0
    const currentDensityNum = parseFloat(powerDensity)
    const stdWatt = Math.round(stdDensity * area)
    const currentCost = Math.round(totalPower * 4 * 365 * 0.6 / 1000)
    const stdCost = Math.round(stdWatt * 4 * 365 * 0.6 / 1000)
    const costPercent = stdCost > 0 ? Math.round((currentCost / stdCost) * 100) : 56

    let assessTitle = '节能评估优秀'
    let assessDesc = '当前方案功率密度远低于国家标准上限，在保证照度舒适的前提下，实现了优秀的节能效果。'
    if (currentDensityNum > stdDensity) {
      assessTitle = '能耗偏高'
      assessDesc = '当前方案功率密度超出国家标准上限，建议优化灯具选型以降低能耗。'
    } else if (currentDensityNum > stdDensity * 0.7) {
      assessTitle = '节能评估良好'
      assessDesc = '当前方案功率密度接近国家标准上限，照明效果良好，仍有一定节能优化空间。'
    }

    // --- P1: 根据模式动态生成封面参数 ---
    const coverParams = []
    coverParams.push({ label: '空间类型', value: '客厅' })
    coverParams.push({ label: '建筑面积', value: area + ' ㎡' })
    coverParams.push({ label: '计算时间', value: calcTime })

    if (mode === 'count') {
      // 按照度算数量：显示计算结果
      coverParams.push({ label: '建议灯具数量', value: lampCount + ' 盏' })
      coverParams.push({ label: '功率密度', value: powerDensity + ' W/㎡' })
      const targetLuxVal = getDetailVal('目标') || getDetailVal('照度')
      if (targetLuxVal) coverParams.push({ label: '目标照度', value: targetLuxVal })
    } else if (mode === 'quantity') {
      // 按数量算照度：显示计算结果
      coverParams.push({ label: '建议单灯光通量', value: singleFlux + ' Lm' })
      const reqWattage = getDetailVal('购买') || getDetailVal('瓦数')
      if (reqWattage) coverParams.push({ label: '需购买瓦数', value: reqWattage })
      coverParams.push({ label: '灯具数量', value: lampCount + ' 盏' })
      const targetLuxVal = getDetailVal('目标') || getDetailVal('照度')
      if (targetLuxVal) coverParams.push({ label: '目标照度', value: targetLuxVal })
    } else {
      // lux 模式：显示总光通量 + 灯具明细
      coverParams.push({ label: '总光通量', value: Math.round(totalFlux) + ' Lm' })
      const bottomTable = this.data.bottomTable || []
      bottomTable.forEach(lamp => {
        const name = lamp.displayName || lamp.name || '未知灯具'
        const qty = parseFloat(lamp.lengthQty) || 0
        const pw = parseFloat(lamp.powerW) || 0
        const unit = (name.indexOf('灯带') !== -1) ? ' 米' : ' 盏'
        coverParams.push({ label: name, value: qty + unit + ' / ' + pw + 'W' })
      })
    }
    coverParams.push({ label: '报告编号', value: reportNo })

    // --- 统一 setData ---
    this.setData({
      coverParams: coverParams,
      coreResult: {
        luxValue: Math.round(luxValue),
        isQualified: isQualified,
        statusText: statusText,
        standardText: '住宅客厅建议照度：150–300 lx',
        tipText: tipText
      },
      rangeData: {
        luxValue: Math.round(luxValue),
        markerLeft: Math.round(markerLeft),
        currentBrightness: currentBrightness,
        ranges: ranges
      },
      detailData: {
        inputParams: inputParams,
        calcResults: calcResults
      },
      riskData: {
        isQualified: isQualified,
        statusLabel: riskStatusLabel,
        impacts: impacts,
        suggestions: suggestions
      },
      comfortData: {
        score: comfortScore,
        levelText: levelText,
        scores: [
          { label: '照度合理性', score: scoreReason, max: 40 },
          { label: '能耗效率', score: scoreEfficiency, max: 20 },
          { label: '舒适区间匹配度', score: scoreMatch, max: 20 },
          { label: '优化空间', score: scoreOptimize, max: 20 }
        ]
      },
      energyData: {
        currentDensity: powerDensity,
        standardDensity: stdDensity.toFixed(1),
        assessTitle: assessTitle,
        assessDesc: assessDesc,
        currentWatt: Math.round(totalPower),
        currentCost: currentCost,
        standardWatt: stdWatt,
        standardCost: stdCost,
        costPercent: Math.min(costPercent, 100)
      }
    }, () => {
      if (this.data.currentPage === 2) {
        setTimeout(() => {
          this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
        }, 50)
      }
    })
  },

  // ========== CSV 导出功能 ==========

  /**
   * 导出计算结果为 CSV 文件
   * 支持两种导出方式：发送给微信好友、复制到剪贴板
   */
  onExportCSV() {
    // 优先使用后端生成的 CSV 数据
    if (this.data.csvData && this.data.csvData.length > 0) {
      this._exportCsvFromRows(this.data.csvData)
      return
    }

    // 兜底：使用前端本地生成的 CSV 数据
    const { mode, mainValue, mainUnit, mainLabel, headerLeft, headerMiddle, headerRight, details, bottomTable } = this.data

    // 计算模式中文名
    const modeNames = {
      count: '按照度算灯具',
      quantity: '按数量算灯具',
      lux: '按灯具算照度'
    }
    const modeName = modeNames[mode] || '计算结果'

    // 构建 CSV 行数据（每行是一个数组）
    const csvRows = []

    // 报告标题
    csvRows.push(['照明计算报告'])
    csvRows.push([])

    // 计算模式
    csvRows.push(['计算模式', modeName])
    csvRows.push([])

    // === 主要结果 ===
    csvRows.push(['【主要结果】'])
    csvRows.push([mainLabel, mainValue + ' ' + mainUnit])

    if (headerLeft && headerLeft.label) {
      csvRows.push([headerLeft.label, headerLeft.value])
    }
    if (headerMiddle && headerMiddle.label) {
      csvRows.push([headerMiddle.label, headerMiddle.value])
    }
    if (headerRight && headerRight.label) {
      csvRows.push([headerRight.label, headerRight.value])
    }

    csvRows.push([])

    // === 详细参数 ===
    if (mode === 'lux') {
      // lux 模式：details 内容是各灯具的光通量，标题改为"灯具光通量"
      csvRows.push(['【灯具光通量明细】'])
    } else {
      csvRows.push(['【计算参数】'])
    }

    if (details && details.length > 0) {
      details.forEach(item => {
        csvRows.push([item.label, item.value])
      })
    }

    // === lux 模式额外灯具参数明细 ===
    if (mode === 'lux' && bottomTable && bottomTable.length > 0) {
      csvRows.push([])
      csvRows.push(['【灯具参数明细】'])
      csvRows.push(['灯具名称', '功率(W)', '光效(lm/W)', '数量', '光源利用率', '单灯总光通量(Lm)'])

      bottomTable.forEach(lamp => {
        const name = lamp.displayName || lamp.name || '未知灯具'
        const powerW = parseFloat(lamp.powerW) || 0
        const efficacy = parseFloat(lamp.efficacy) || 0
        const lengthQty = parseFloat(lamp.lengthQty) || 0
        const sourceUtil = parseFloat(lamp.sourceUtil) || 0
        const lampFlux = Math.round(powerW * efficacy * lengthQty * sourceUtil)
        csvRows.push([name, powerW, efficacy, lengthQty, sourceUtil, lampFlux])
      })
    }

    csvRows.push([])

    // === 导出信息 ===
    csvRows.push(['【导出信息】'])
    csvRows.push(['导出时间', this._formatDateTime(new Date())])
    csvRows.push(['计算工具', '二哥灯光照明计算'])

    // 生成 CSV 字符串（加 UTF-8 BOM 头，确保 Excel 正确显示中文）
    const csvContent = '\uFEFF' + csvRows.map(row => {
      return row.map(cell => {
        const str = String(cell != null ? cell : '')
        // 包含逗号、引号、换行符时用双引号包裹并转义
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }).join(',')
    }).join('\n')

    // 生成文件名
    const dateStr = this._formatDateCompact(new Date())
    const fileName = `照明计算_${modeName}_${dateStr}.csv`

    // 写入临时文件
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    try {
      fs.writeFileSync(filePath, csvContent, 'utf8')
      console.log('[calc-result] CSV 文件已写入:', filePath)
    } catch (err) {
      console.error('[calc-result] 写入 CSV 文件失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
      return
    }

    // 直接发送文件给朋友
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => {
        wx.showToast({ title: '发送成功', icon: 'success' })
      },
      fail: (err) => {
        console.error('[calc-result] 分享文件失败:', err)
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '发送失败，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 从后端返回的 CSV 行数据导出文件
   * @param {Array} rows - 二维数组，每项为一行
   */
  _exportCsvFromRows(rows) {
    const modeNames = {
      count: '按照度算灯具',
      quantity: '按数量算灯具',
      lux: '按灯具算照度'
    }
    const modeName = modeNames[this.data.mode] || '计算结果'

    const csvContent = '\uFEFF' + rows.map(row => {
      return (row || []).map(cell => {
        const str = String(cell != null ? cell : '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }).join(',')
    }).join('\n')

    const dateStr = this._formatDateCompact(new Date())
    const fileName = `照明计算_${modeName}_${dateStr}.csv`
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    try {
      fs.writeFileSync(filePath, csvContent, 'utf8')
    } catch (err) {
      console.error('[calc-result] 写入 CSV 文件失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
      return
    }

    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => { wx.showToast({ title: '发送成功', icon: 'success' }) },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '发送失败，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 格式化日期时间（用于显示）
   * @param {Date} date
   * @returns {string} 如 "2026-02-06 17:13:00"
   */
  _formatDateTime(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}:${s}`
  },

  /**
   * 格式化日期（紧凑格式，用于文件名）
   * @param {Date} date
   * @returns {string} 如 "20260206_1713"
   */
  _formatDateCompact(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}${m}${d}_${h}${min}`
  },

  // ========== 页面操作 ==========

  // 重新计算（返回上一页）
  onRecalculate() {
    wx.navigateBack({
      delta: 1
    })
  }
})
