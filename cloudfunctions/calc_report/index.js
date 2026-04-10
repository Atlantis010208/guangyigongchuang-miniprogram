/**
 * 云函数：calc_report
 * 功能：照明计算报告生成、查询、CSV数据生成与持久化
 * 
 * 支持的 action：
 * - generate: 基于计算参数生成完整8页报告 + CSV数据 + 保存到数据库
 * - get: 按 calcId 查询完整报告
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'calculations'

// ========== 工具函数 ==========

function toNum(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * 生成唯一 calcId
 */
function generateCalcId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `CALC-${ts}-${rand}`
}

/**
 * 生成报告编号
 */
function generateReportNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `REP-${y}${m}${d}-${seq}`
}

// ========== 计算核心 ==========

/**
 * 计算平均照度
 * 公式：E = (Φ总 × UF × MF) / A
 */
function calcAvgLux(totalFlux, area, utilFactor, maintenanceFactor) {
  const flux = toNum(totalFlux)
  const a = toNum(area)
  const uf = toNum(utilFactor)
  const mf = toNum(maintenanceFactor)
  if (flux <= 0 || a <= 0 || uf <= 0 || mf <= 0) return 0
  return Math.round((flux * uf * mf) / a)
}

/**
 * 根据模式执行核心计算，返回 resultData（兼容前端结构）
 */
function computeResult(params) {
  const {
    mode, area, utilFactor, maintenanceFactor,
    targetLux, lampFlux, lampPower, lampEfficacy,
    lampCount, selectedLamps, spaceType
  } = params

  const areaNum = toNum(area)
  const uf = toNum(utilFactor)
  const mf = toNum(maintenanceFactor)

  if (mode === 'count') {
    // 按照度算数量
    const tLux = toNum(targetLux)
    const flux = toNum(lampFlux)
    const power = toNum(lampPower)
    const efficacy = toNum(lampEfficacy) || 80

    const fluxNeeded = tLux * areaNum
    const effectiveFlux = flux * uf * mf
    const count = effectiveFlux > 0 ? Math.ceil(fluxNeeded / effectiveFlux) : 0
    const powerDensity = areaNum > 0 ? ((count * power) / areaNum).toFixed(2) + 'W/㎡' : '0W/㎡'

    return {
      mode: 'count',
      mainValue: count,
      mainUnit: '盏',
      mainLabel: '建议灯具数量',
      headerLeft: { label: '功率密度', value: powerDensity },
      headerRight: { label: '目标照度', value: tLux + 'Lx' },
      details: [
        { label: '房间面积', value: areaNum + ' ㎡' },
        { label: '空间类型', value: spaceType || '自定义' },
        { label: '总光通量', value: Math.round(fluxNeeded) + ' Lm' },
        { label: '单灯功率', value: power + 'W' },
        { label: '发光效率', value: efficacy + ' lm/W' },
        { label: '单灯光通量', value: flux + ' Lm' },
        { label: '利用系数', value: uf },
        { label: '维护系数', value: mf }
      ],
      // 用于报告生成的附加计算值
      _computed: {
        luxValue: tLux,
        lampCount: count,
        totalFlux: fluxNeeded,
        totalPower: count * power,
        powerDensity: areaNum > 0 ? (count * power) / areaNum : 0,
        singleFlux: flux
      }
    }

  } else if (mode === 'quantity') {
    // 按数量算照度
    const tLux = toNum(targetLux)
    const count = toNum(lampCount)
    const efficacy = toNum(lampEfficacy) || 80

    const fluxNeeded = tLux * areaNum
    const singleFlux = (count * uf * mf) > 0 ? fluxNeeded / (count * uf * mf) : 0
    const requiredWattage = efficacy > 0 ? Math.round(singleFlux / efficacy) : 0
    const powerDensity = areaNum > 0 ? ((count * requiredWattage) / areaNum).toFixed(2) + 'W/㎡' : '0W/㎡'

    return {
      mode: 'quantity',
      mainValue: Math.round(singleFlux),
      mainUnit: 'Lm',
      mainLabel: '建议单灯光通量',
      headerLeft: { label: '灯具数量', value: count + '盏' },
      headerMiddle: { label: '需购买瓦数', value: requiredWattage + 'W' },
      headerRight: { label: '目标照度', value: tLux + 'Lx' },
      details: [
        { label: '房间面积', value: areaNum + ' ㎡' },
        { label: '空间类型', value: spaceType || '自定义' },
        { label: '功率密度', value: powerDensity },
        { label: '利用系数', value: uf },
        { label: '维护系数', value: mf },
        { label: '总光通量需求', value: Math.round(fluxNeeded) + ' Lm' }
      ],
      _computed: {
        luxValue: tLux,
        lampCount: count,
        totalFlux: fluxNeeded,
        totalPower: count * requiredWattage,
        powerDensity: areaNum > 0 ? (count * requiredWattage) / areaNum : 0,
        singleFlux: Math.round(singleFlux),
        requiredWattage
      }
    }

  } else {
    // lux 模式：按灯具算照度
    const lamps = selectedLamps || []

    const totalFlux = lamps.reduce((sum, lamp) => {
      return sum + (toNum(lamp.powerW) * toNum(lamp.efficacy) * toNum(lamp.lengthQty) * toNum(lamp.sourceUtil))
    }, 0)

    const totalPower = lamps.reduce((sum, lamp) => {
      return sum + (toNum(lamp.powerW) * toNum(lamp.lengthQty))
    }, 0)

    const avgLux = calcAvgLux(totalFlux, areaNum, uf, mf)
    const powerDensity = areaNum > 0 ? totalPower / areaNum : 0

    const lampDetails = lamps.map(lamp => {
      const lampFluxVal = toNum(lamp.powerW) * toNum(lamp.efficacy) * toNum(lamp.lengthQty) * toNum(lamp.sourceUtil)
      return {
        label: lamp.displayName || lamp.name || '未知灯具',
        value: Math.round(lampFluxVal) + ' Lm'
      }
    })

    return {
      mode: 'lux',
      mainValue: Math.round(avgLux),
      mainUnit: 'Lx',
      mainLabel: '平均照度',
      headerLeft: { label: '总光通量', value: Math.round(totalFlux) + 'Lm' },
      headerRight: { label: '功率密度', value: powerDensity.toFixed(2) + 'W/㎡' },
      details: lampDetails,
      bottomTable: lamps,
      _computed: {
        luxValue: avgLux,
        lampCount: lamps.reduce((sum, l) => sum + toNum(l.lengthQty), 0),
        totalFlux,
        totalPower,
        powerDensity,
        singleFlux: 0
      }
    }
  }
}

// ========== 报告数据生成 (P1-P8) ==========

/**
 * 生成 P1 封面参数列表（根据模式动态变化）
 */
function buildCoverParams(mode, params, resultData, reportNo) {
  const now = new Date()
  const calcTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

  const coverParams = []

  // 通用字段
  coverParams.push({ label: '空间类型', value: params.spaceType || '自定义' })
  coverParams.push({ label: '建筑面积', value: toNum(params.area) + ' ㎡' })
  coverParams.push({ label: '计算时间', value: calcTime })

  const computed = resultData._computed || {}

  if (mode === 'count') {
    // 按照度算数量：显示计算结果
    coverParams.push({ label: '建议灯具数量', value: Math.round(computed.lampCount || 0) + ' 盏' })
    coverParams.push({ label: '功率密度', value: toNum(computed.powerDensity).toFixed(2) + ' W/㎡' })
    coverParams.push({ label: '目标照度', value: toNum(params.targetLux) + ' Lx' })

  } else if (mode === 'quantity') {
    // 按数量算照度：显示计算结果
    coverParams.push({ label: '建议单灯光通量', value: Math.round(computed.singleFlux || 0) + ' Lm' })
    coverParams.push({ label: '需购买瓦数', value: Math.round(computed.requiredWattage || 0) + ' W' })
    coverParams.push({ label: '灯具数量', value: toNum(params.lampCount) + ' 盏' })
    coverParams.push({ label: '目标照度', value: toNum(params.targetLux) + ' Lx' })

  } else {
    // lux 模式：显示总光通量 + 灯具明细
    coverParams.push({ label: '总光通量', value: Math.round(computed.totalFlux || 0) + ' Lm' })
    const lamps = params.selectedLamps || []
    lamps.forEach(lamp => {
      const name = lamp.displayName || lamp.name || '未知灯具'
      const qty = toNum(lamp.lengthQty)
      const power = toNum(lamp.powerW)
      coverParams.push({ label: name, value: qty + (lamp.name && lamp.name.indexOf('灯带') !== -1 ? ' 米' : ' 盏') + ' / ' + power + 'W' })
    })
  }

  coverParams.push({ label: '报告编号', value: reportNo })

  return coverParams
}

/**
 * 生成 P2 核心结论
 */
function buildCoreResult(luxValue) {
  const isQualified = luxValue >= 150 && luxValue <= 300
  const isLow = luxValue < 150
  let statusText = '达标（处于舒适区间）'
  let tipText = '当前照度处于国家建议区间内，适合日常生活使用。'
  if (isLow) {
    statusText = '偏低（低于舒适区间）'
    tipText = '当前照度偏低，建议增加灯具数量或提升单灯亮度以改善照明效果。'
  } else if (luxValue > 300) {
    statusText = '偏高（高于舒适区间）'
    tipText = '当前照度偏高，长时间可能造成视觉疲劳，建议适当降低亮度。'
  }

  return {
    luxValue: Math.round(luxValue),
    isQualified,
    statusText,
    standardText: '住宅客厅建议照度：150–300 lx',
    tipText
  }
}

/**
 * 生成 P3 照度区间数据
 */
function buildRangeData(luxValue) {
  let markerLeft = 0
  if (luxValue <= 0) markerLeft = 0
  else if (luxValue <= 80) markerLeft = (luxValue / 80) * 16
  else if (luxValue <= 150) markerLeft = 16 + ((luxValue - 80) / 70) * 14
  else if (luxValue <= 300) markerLeft = 30 + ((luxValue - 150) / 150) * 30
  else if (luxValue <= 500) markerLeft = 60 + ((luxValue - 300) / 200) * 20
  else markerLeft = 80 + Math.min(((luxValue - 500) / 200) * 20, 18)

  let activeIndex = 2
  let currentBrightness = 1.0 // 默认亮度 100%

  if (luxValue < 80) {
    activeIndex = 0
    currentBrightness = 0.35 // 昏暗区
  } else if (luxValue < 150) {
    activeIndex = 1
    currentBrightness = 0.65 // 偏暗区
  } else if (luxValue <= 300) {
    activeIndex = 2
    currentBrightness = 1.00 // 舒适区 (原图)
  } else if (luxValue <= 500) {
    activeIndex = 3
    currentBrightness = 1.35 // 偏亮区
  } else {
    activeIndex = 4
    currentBrightness = 1.70 // 过亮区
  }

  const ranges = [
    { range: '0–80 lx', state: '昏暗区', scene: '酒吧 / 情绪氛围', colorClass: 'dot-dark', active: false },
    { range: '80–150 lx', state: '偏暗区', scene: '夜间休闲', colorClass: 'dot-dim', active: false },
    { range: '150–300 lx', state: '舒适区', scene: '客厅日常活动', colorClass: 'dot-comfort', active: false },
    { range: '300–500 lx', state: '偏亮区', scene: '阅读 / 精细活动', colorClass: 'dot-bright', active: false },
    { range: '>500 lx', state: '过亮区', scene: '商业空间', colorClass: 'dot-over', active: false }
  ]
  ranges[activeIndex].active = true

  return { luxValue: Math.round(luxValue), markerLeft, ranges, currentBrightness }
}

/**
 * 生成 P4 详细计算数据
 */
function buildDetailData(luxValue, computed) {
  const inputParams = [
    { label: '空间面积', value: computed.area + ' ㎡' },
    { label: '灯具数量', value: Math.round(computed.lampCount) + ' 盏' },
    { label: '单灯流明', value: Math.round(computed.singleFlux) + ' lm' },
    { label: '总流明', value: Math.round(computed.totalFlux) + ' lm' },
    { label: '总功率', value: Math.round(computed.totalPower) + ' W' },
    { label: '功率密度', value: toNum(computed.powerDensity).toFixed(1) + ' W/㎡' }
  ]

  const diffLow = luxValue - 150
  const diffHigh = luxValue - 300
  const calcResults = [
    { label: '平均照度', value: Math.round(luxValue) + ' lx', highlight: false },
    { label: '目标建议区间', value: '150–300 lx', highlight: false },
    { label: '与下限差值', value: (diffLow >= 0 ? '+' : '') + Math.round(diffLow) + ' lx', highlight: diffLow >= 0 },
    { label: '与上限差值', value: (diffHigh >= 0 ? '+' : '') + Math.round(diffHigh) + ' lx', highlight: false }
  ]

  return { inputParams, calcResults }
}

/**
 * 生成 P5 风险与舒适度分析
 */
function buildRiskData(luxValue) {
  const isQualified = luxValue >= 150 && luxValue <= 300
  const isLow = luxValue < 150
  const isHigh = luxValue > 300

  let statusLabel = '舒适达标'
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
    statusLabel = '照度偏低'
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
    statusLabel = '照度偏高'
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

  return { isQualified, statusLabel, impacts, suggestions }
}

/**
 * 生成 P6 舒适指数
 */
function buildComfortData(luxValue) {
  const isLow = luxValue < 150
  const isHigh = luxValue > 300

  let score = 92, levelText = 'A级：适合长期居住'
  let scoreReason = 38, scoreEfficiency = 18, scoreMatch = 18, scoreOptimize = 18

  if (isLow) {
    score = 58
    levelText = 'C级：建议优化提升'
    scoreReason = 20; scoreEfficiency = 15; scoreMatch = 10; scoreOptimize = 13
  } else if (isHigh) {
    score = 72
    levelText = 'B级：基本满足需求'
    scoreReason = 28; scoreEfficiency = 16; scoreMatch = 14; scoreOptimize = 14
  }

  return {
    score,
    levelText,
    scores: [
      { label: '照度合理性', score: scoreReason, max: 40 },
      { label: '能耗效率', score: scoreEfficiency, max: 20 },
      { label: '舒适区间匹配度', score: scoreMatch, max: 20 },
      { label: '优化空间', score: scoreOptimize, max: 20 }
    ]
  }
}

/**
 * 生成 P7 节能与能耗参考
 */
function buildEnergyData(computed, area) {
  const areaNum = toNum(area)
  const totalPower = toNum(computed.totalPower)
  const currentDensity = areaNum > 0 ? (totalPower / areaNum).toFixed(1) : '0'
  const standardDensity = '6.0'

  const currentDensityNum = parseFloat(currentDensity)
  const standardDensityNum = parseFloat(standardDensity)

  let assessTitle = '节能评估优秀'
  let assessDesc = '当前方案功率密度远低于国家标准上限，在保证照度舒适的前提下，实现了优秀的节能效果。'

  if (currentDensityNum > standardDensityNum) {
    assessTitle = '能耗偏高'
    assessDesc = '当前方案功率密度超过国家标准参考值，建议优化灯具选型或减少灯具数量以降低能耗。'
  } else if (currentDensityNum > standardDensityNum * 0.8) {
    assessTitle = '节能评估一般'
    assessDesc = '当前方案功率密度接近国家标准上限，有一定节能空间，可考虑使用更高效灯具。'
  }

  // 年度电费估算（假设每天使用6小时，电价0.6元/度）
  const hoursPerDay = 6
  const pricePerKwh = 0.6
  const daysPerYear = 365

  const currentWatt = Math.round(totalPower)
  const currentCost = Math.round(totalPower / 1000 * hoursPerDay * daysPerYear * pricePerKwh)

  const standardWatt = Math.round(standardDensityNum * areaNum)
  const standardCost = Math.round(standardWatt / 1000 * hoursPerDay * daysPerYear * pricePerKwh)

  const costPercent = standardCost > 0 ? Math.round((currentCost / standardCost) * 100) : 0

  return {
    currentDensity,
    standardDensity,
    assessTitle,
    assessDesc,
    currentWatt,
    currentCost,
    standardWatt,
    standardCost,
    costPercent
  }
}

/**
 * 生成 P8 免责声明
 */
function buildDisclaimerItems() {
  return [
    '本报告基于平均照度估算，数据通过理论公式推导得出。',
    '计算过程未考虑墙面反射率、家具遮挡、灯具实际光衰等复杂物理因素。',
    '评估结果不代表最终实际落地效果，可能存在一定偏差。',
    '本报告仅作为灯光设计与选型的参考依据，不作为任何法律或商业承诺。'
  ]
}

/**
 * 生成完整报告数据
 */
function buildReportData(params, resultData, reportNo) {
  const mode = resultData.mode
  const computed = resultData._computed
  const luxValue = computed.luxValue

  const coverParams = buildCoverParams(mode, params, resultData, reportNo)
  const coreResult = buildCoreResult(luxValue)
  const rangeData = buildRangeData(luxValue)
  const detailData = buildDetailData(luxValue, { ...computed, area: toNum(params.area) })
  const riskData = buildRiskData(luxValue)
  const comfortData = buildComfortData(luxValue)
  const energyData = buildEnergyData(computed, params.area)
  const disclaimerItems = buildDisclaimerItems()

  return {
    coverParams,
    coreResult,
    rangeData,
    detailData,
    riskData,
    comfortData,
    energyData,
    disclaimerItems
  }
}

// ========== CSV 数据生成 ==========

/**
 * 生成 CSV 结构化数据（二维数组）
 */
function buildCsvData(params, resultData, reportData) {
  const mode = resultData.mode
  const computed = resultData._computed
  const rows = []

  // 标题行
  rows.push(['照度评估报告'])
  rows.push([])

  // 基本信息
  rows.push(['基本信息'])
  reportData.coverParams.forEach(item => {
    rows.push([item.label, item.value])
  })
  rows.push([])

  // 计算结果
  rows.push(['计算结果'])
  rows.push([resultData.mainLabel, resultData.mainValue + ' ' + resultData.mainUnit])
  if (resultData.headerLeft) rows.push([resultData.headerLeft.label, resultData.headerLeft.value])
  if (resultData.headerMiddle) rows.push([resultData.headerMiddle.label, resultData.headerMiddle.value])
  if (resultData.headerRight) rows.push([resultData.headerRight.label, resultData.headerRight.value])
  rows.push([])

  // 详细参数
  rows.push(['输入参数'])
  reportData.detailData.inputParams.forEach(item => {
    rows.push([item.label, item.value])
  })
  rows.push([])

  // 计算分析
  rows.push(['计算分析'])
  reportData.detailData.calcResults.forEach(item => {
    rows.push([item.label, item.value])
  })
  rows.push([])

  // 舒适评估
  rows.push(['舒适指数'])
  rows.push(['综合评分', reportData.comfortData.score + '分'])
  rows.push(['评级', reportData.comfortData.levelText])
  reportData.comfortData.scores.forEach(item => {
    rows.push([item.label, item.score + '/' + item.max])
  })
  rows.push([])

  // 节能数据
  rows.push(['节能与能耗'])
  rows.push(['当前功率密度', reportData.energyData.currentDensity + ' W/㎡'])
  rows.push(['国标参考值', reportData.energyData.standardDensity + ' W/㎡'])
  rows.push(['节能评估', reportData.energyData.assessTitle])
  rows.push(['当前总功率', reportData.energyData.currentWatt + ' W'])
  rows.push(['年度预估电费', reportData.energyData.currentCost + ' 元'])

  // lux 模式：追加灯具明细
  if (mode === 'lux' && resultData.bottomTable) {
    rows.push([])
    rows.push(['灯具明细'])
    rows.push(['灯具名称', '功率(W)', '发光效率(lm/W)', '数量/米数', '光源利用率', '光通量(Lm)'])
    resultData.bottomTable.forEach(lamp => {
      const flux = toNum(lamp.powerW) * toNum(lamp.efficacy) * toNum(lamp.lengthQty) * toNum(lamp.sourceUtil)
      rows.push([
        lamp.displayName || lamp.name || '',
        toNum(lamp.powerW),
        toNum(lamp.efficacy),
        toNum(lamp.lengthQty),
        toNum(lamp.sourceUtil),
        Math.round(flux)
      ])
    })
  }

  return rows
}

// ========== 主函数入口 ==========

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  try {
    if (action === 'generate') {
      return await handleGenerate(event, OPENID)
    } else if (action === 'get') {
      return await handleGet(event, OPENID)
    } else {
      return { success: false, code: 'INVALID_ACTION', message: `不支持的操作: ${action}` }
    }
  } catch (err) {
    console.error(`[calc_report] action=${action} error:`, err)
    return { success: false, code: 'ERROR', message: err.message || '服务器内部错误' }
  }
}

/**
 * generate action: 生成报告 + 保存到数据库
 */
async function handleGenerate(event, openid) {
  const params = event.params || {}
  const { mode } = params

  if (!mode || !['count', 'quantity', 'lux'].includes(mode)) {
    return { success: false, code: 'INVALID_MODE', message: '无效的计算模式' }
  }

  if (!params.area || toNum(params.area) <= 0) {
    return { success: false, code: 'INVALID_AREA', message: '面积不能为空或为0' }
  }

  // 1. 核心计算
  const resultData = computeResult(params)

  // 2. 生成报告
  const calcId = generateCalcId()
  const reportNo = generateReportNo()
  const reportData = buildReportData(params, resultData, reportNo)

  // 3. 生成 CSV 数据
  const csvData = buildCsvData(params, resultData, reportData)

  // 4. 清理内部字段
  const cleanResultData = { ...resultData }
  delete cleanResultData._computed

  // 5. 保存到数据库
  const now = Date.now()
  try {
    await db.collection(COLLECTION).add({
      data: {
        calcId,
        userId: openid,
        mode,
        spaceType: params.spaceType || '自定义',
        area: toNum(params.area),
        utilFactor: toNum(params.utilFactor),
        maintenanceFactor: toNum(params.maintenanceFactor),
        avgLux: resultData._computed.luxValue,
        totalFlux: resultData._computed.totalFlux,
        totalPower: resultData._computed.totalPower,
        powerDensity: resultData._computed.powerDensity,
        reportNo,
        reportData,
        csvData,
        inputParams: params,
        resultData: cleanResultData,
        status: 'active',
        isShared: false,
        shareCode: '',
        isDelete: 0,
        createdAt: now,
        updatedAt: now
      }
    })
    console.log(`[calc_report] 保存成功: calcId=${calcId}`)
  } catch (dbErr) {
    // 数据库保存失败不影响返回报告数据
    console.error(`[calc_report] 数据库保存失败:`, dbErr)
  }

  return {
    success: true,
    code: 'OK',
    data: {
      calcId,
      reportNo,
      reportData,
      csvData,
      resultData: cleanResultData
    }
  }
}

/**
 * get action: 按 calcId 查询报告
 */
async function handleGet(event, openid) {
  const { calcId } = event

  if (!calcId) {
    return { success: false, code: 'MISSING_CALC_ID', message: '缺少 calcId 参数' }
  }

  const res = await db.collection(COLLECTION)
    .where({ calcId, isDelete: 0 })
    .limit(1)
    .get()

  if (!res.data || res.data.length === 0) {
    return { success: false, code: 'NOT_FOUND', message: '未找到该计算记录' }
  }

  const record = res.data[0]

  // 权限检查：只能查看自己的记录（分享记录除外）
  if (record.userId !== openid && !record.isShared) {
    return { success: false, code: 'FORBIDDEN', message: '无权查看该记录' }
  }

  return {
    success: true,
    code: 'OK',
    data: {
      calcId: record.calcId,
      reportNo: record.reportNo,
      reportData: record.reportData,
      csvData: record.csvData,
      resultData: record.resultData
    }
  }
}
