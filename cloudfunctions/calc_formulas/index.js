const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''

    const { action, data } = event || {}

    let result

    switch (action) {
      case 'get':
        // 获取照明计算公式
        result = await getFormulas(data)
        break

      case 'list':
        // 获取公式列表
        result = await getFormulaList(data)
        break

      case 'calculate':
        // 使用公式进行计算
        result = await calculateWithFormula(data)
        break

      case 'validate':
        // 验证计算参数
        result = await validateCalculation(data)
        break

      case 'recommend':
        // 推荐照明参数
        result = await recommendParameters(data)
        break

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: 'Action must be one of: get, list, calculate, validate, recommend'
        }
    }

    return result

  } catch (err) {
    console.error('calc_formulas error:', err)
    return {
      success: false,
      code: 'CALC_FORMULAS_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}

// 获取照明计算公式
async function getFormulas(options = {}) {
  const { formulaId = '', spaceType = '' } = options

  // 照明计算公式库
  const formulaLibrary = {
    // 基础照明计算公式
    basicIlluminance: {
      id: 'basic_illuminance',
      name: '基础照度计算公式',
      formula: 'E = (ΣΦ × UF × MF) / A',
      description: '平均照度等于总光通量乘以利用系数和维护系数，再除以面积',
      variables: {
        'E': '平均照度 (lux)',
        'Φ': '总光通量 (lm)',
        'UF': '利用系数 (0-1)',
        'MF': '维护系数 (0-1)',
        'A': '面积 (m²)'
      },
      calculationMethod: 'lux_from_fixtures',
      reverseFormula: 'N = (E × A) / (UF × MF × Φ)',
      reverseDescription: '根据目标照度计算所需灯具数量'
    },

    // 灯具数量计算公式
    lampQuantity: {
      id: 'lamp_quantity',
      name: '灯具数量计算公式',
      formula: 'N = (E × A) / (UF × MF × Φ)',
      description: '所需灯具数量等于目标照度乘以面积，再除以利用系数、维护系数和单灯光通量的乘积',
      variables: {
        'N': '灯具数量 (个)',
        'E': '目标照度 (lux)',
        'A': '面积 (m²)',
        'UF': '利用系数 (0-1)',
        'MF': '维护系数 (0-1)',
        'Φ': '单灯光通量 (lm)'
      },
      calculationMethod: 'fixtures_from_lux',
      reverseFormula: 'E = (N × Φ × UF × MF) / A',
      reverseDescription: '根据灯具数量计算平均照度'
    },

    // 功率密度计算公式
    powerDensity: {
      id: 'power_density',
      name: '功率密度计算公式',
      formula: 'PD = (ΣP) / A',
      description: '功率密度等于总功率除以面积',
      variables: {
        'PD': '功率密度 (W/m²)',
        'ΣP': '总功率 (W)',
        'A': '面积 (m²)'
      },
      unit: 'W/m²'
    },

    // 维护系数参考值
    maintenanceFactors: {
      id: 'maintenance_factors',
      name: '维护系数参考值',
      type: 'reference_table',
      description: '不同环境下的维护系数建议值',
      values: {
        'clean': {
          name: '清洁环境',
          value: 0.8,
          description: '办公室、商场、学校等'
        },
        'normal': {
          name: '一般环境',
          value: 0.7,
          description: '工厂、车间等'
        },
        'dirty': {
          name: '恶劣环境',
          value: 0.6,
          description: '化工、冶金等'
        }
      }
    },

    // 利用系数参考值
    utilizationFactors: {
      id: 'utilization_factors',
      name: '利用系数参考值',
      type: 'reference_table',
      description: '不同空间类型和灯具配置的利用系数建议值',
      values: {
        'residential': {
          name: '住宅',
          description: '家庭照明',
          range: '0.6-0.8',
          typical: 0.7
        },
        'office': {
          name: '办公室',
          description: '办公场所',
          range: '0.7-0.9',
          typical: 0.8
        },
        'commercial': {
          name: '商业',
          description: '商场、店铺',
          range: '0.6-0.8',
          typical: 0.7
        },
        'industrial': {
          name: '工业',
          description: '工厂、车间',
          range: '0.5-0.7',
          typical: 0.6
        },
        'hotel': {
          name: '酒店',
          description: '客房、大堂',
          range: '0.6-0.8',
          typical: 0.7
        }
      }
    }
  }

  // 空间类型特定的照明标准
  const lightingStandards = {
    residential: {
      id: 'residential_standards',
      name: '住宅照明标准',
      description: '住宅各区域的照度标准',
      rooms: {
        'living_room': { name: '客厅', minLux: 150, maxLux: 300, typical: 200 },
        'bedroom': { name: '卧室', minLux: 75, maxLux: 150, typical: 100 },
        'kitchen': { name: '厨房', minLux: 300, maxLux: 500, typical: 400 },
        'bathroom': { name: '卫生间', minLux: 100, maxLux: 200, typical: 150 },
        'study': { name: '书房', minLux: 300, maxLux: 750, typical: 500 }
      }
    },
    office: {
      id: 'office_standards',
      name: '办公照明标准',
      description: '办公室各区域的照度标准',
      areas: {
        'general_office': { name: '一般办公室', minLux: 300, maxLux: 750, typical: 500 },
        'meeting_room': { name: '会议室', minLux: 300, maxLux: 500, typical: 400 },
        'reception': { name: '接待处', minLux: 200, maxLux: 300, typical: 250 },
        'corridor': { name: '走廊', minLux: 100, maxLux: 200, typical: 150 }
      }
    },
    commercial: {
      id: 'commercial_standards',
      name: '商业照明标准',
      description: '商业场所各区域的照度标准',
      areas: {
        'retail_general': { name: '一般零售', minLux: 300, maxLux: 750, typical: 500 },
        'retail_showcase': { name: '展示柜', minLux: 750, maxLux: 1500, typical: 1000 },
        'restaurant': { name: '餐厅', minLux: 100, maxLux: 300, typical: 200 },
        'supermarket': { name: '超市', minLux: 500, maxLux: 750, typical: 600 }
      }
    },
    hotel: {
      id: 'hotel_standards',
      name: '酒店照明标准',
      description: '酒店各区域的照度标准',
      areas: {
        'guest_room': { name: '客房', minLux: 100, maxLux: 200, typical: 150 },
        'lobby': { name: '大堂', minLux: 200, maxLux: 400, typical: 300 },
        'restaurant': { name: '餐厅', minLux: 100, maxLux: 300, typical: 200 },
        'corridor': { name: '走廊', minLux: 100, maxLux: 200, typical: 150 }
      }
    }
  }

  // 根据请求返回特定公式或所有公式
  if (formulaId) {
    return {
      success: true,
      code: 'OK',
      data: formulaLibrary[formulaId] || null
    }
  }

  if (spaceType) {
    return {
      success: true,
      code: 'OK',
      data: {
        formulas: formulaLibrary,
        standards: lightingStandards[spaceType] || null
      }
    }
  }

  return {
    success: true,
    code: 'OK',
    data: {
      formulas: formulaLibrary,
      standards: lightingStandards
    }
  }
}

// 获取公式列表
async function getFormulaList(options = {}) {
  const { category = 'all', search = '' } = options

  const formulaLibrary = await getFormulas({})

  if (!formulaLibrary.success) {
    return formulaLibrary
  }

  const formulas = formulaLibrary.data.formulas

  // 按类别筛选
  let filteredFormulas = Object.values(formulas)

  if (category !== 'all') {
    filteredFormulas = filteredFormulas.filter(formula => {
      if (category === 'basic') {
        return formula.id.includes('basic') || formula.id.includes('lamp')
      }
      if (category === 'reference') {
        return formula.type === 'reference_table'
      }
      if (category === 'standards') {
        return formula.id.includes('standards')
      }
      return true
    })
  }

  // 搜索筛选
  if (search) {
    filteredFormulas = filteredFormulas.filter(formula =>
      formula.name.toLowerCase().includes(search.toLowerCase()) ||
      formula.description.toLowerCase().includes(search.toLowerCase())
    )
  }

  // 返回列表格式
  const formulaList = filteredFormulas.map(formula => ({
    id: formula.id,
    name: formula.name,
    description: formula.description,
    type: formula.type || 'calculation',
    formula: formula.formula,
    category: formula.id.includes('standards') ? 'standards' :
               formula.type === 'reference_table' ? 'reference' : 'calculation'
  }))

  return {
    success: true,
    code: 'OK',
    data: {
      formulas: formulaList,
      total: formulaList.length
    }
  }
}

// 使用公式进行计算
async function calculateWithFormula(params) {
  const {
    formulaId = 'basic_illuminance',
    mode = 'lux_from_fixtures', // lux_from_fixtures 或 fixtures_from_lux
    area = 0,
    utilFactor = 0.8,
    maintenanceFactor = 0.8,
    lampFlux = 0,
    targetLux = 0,
    lampConfig = [] // 灯具配置数组
  } = params

  // 验证基础参数
  if (area <= 0) {
    return {
      success: false,
      code: 'INVALID_AREA',
      errorMessage: 'Area must be greater than 0'
    }
  }

  if (utilFactor <= 0 || utilFactor > 1) {
    return {
      success: false,
      code: 'INVALID_UTIL_FACTOR',
      errorMessage: 'Utilization factor must be between 0 and 1'
    }
  }

  if (maintenanceFactor <= 0 || maintenanceFactor > 1) {
    return {
      success: false,
      code: 'INVALID_MAINTENANCE_FACTOR',
      errorMessage: 'Maintenance factor must be between 0 and 1'
    }
  }

  let result = {}

  if (mode === 'lux_from_fixtures') {
    // 根据灯具计算照度
    let totalFlux = 0

    if (lampFlux > 0 && typeof params.lampCount === 'number') {
      // 使用单灯光通量和灯具数量
      totalFlux = lampFlux * params.lampCount
    } else if (Array.isArray(lampConfig) && lampConfig.length > 0) {
      // 使用灯具配置数组
      totalFlux = lampConfig.reduce((sum, lamp) => {
        const power = Number(lamp.powerW || 0)
        const efficacy = Number(lamp.efficacy || 0)
        const quantity = Number(lamp.lengthQty || 0)
        const sourceUtil = Number(lamp.sourceUtil || 0)
        return sum + (power * efficacy * quantity * sourceUtil)
      }, 0)
    }

    if (totalFlux <= 0) {
      return {
        success: false,
        code: 'INVALID_FLUX',
        errorMessage: 'Total flux must be greater than 0'
      }
    }

    const avgLux = Math.round((totalFlux * utilFactor * maintenanceFactor) / area)

    result = {
      mode: 'lux_from_fixtures',
      totalFlux: Math.round(totalFlux),
      avgLux: avgLux,
      area: area,
      utilFactor: utilFactor,
      maintenanceFactor: maintenanceFactor,
      lampConfig: lampConfig,
      calculation: {
        formula: 'E = (ΣΦ × UF × MF) / A',
        steps: [
          `总光通量 ΣΦ = ${totalFlux.toFixed(2)} lm`,
          `利用系数 UF = ${utilFactor}`,
          `维护系数 MF = ${maintenanceFactor}`,
          `面积 A = ${area} m²`,
          `平均照度 E = (${totalFlux.toFixed(2)} × ${utilFactor} × ${maintenanceFactor}) / ${area} = ${avgLux} lux`
        ]
      }
    }

  } else if (mode === 'fixtures_from_lux') {
    // 根据照度计算灯具数量
    if (targetLux <= 0) {
      return {
        success: false,
        code: 'INVALID_TARGET_LUX',
        errorMessage: 'Target illuminance must be greater than 0'
      }
    }

    if (lampFlux <= 0) {
      return {
        success: false,
        code: 'INVALID_LAMP_FLUX',
        errorMessage: 'Single lamp flux must be greater than 0'
      }
    }

    const requiredLampCount = Math.ceil((targetLux * area) / (utilFactor * maintenanceFactor * lampFlux))
    const avgPowerPerArea = ((requiredLampCount * 7) / area).toFixed(2) // 假设单灯7W

    result = {
      mode: 'fixtures_from_lux',
      targetLux: targetLux,
      calcLampCount: requiredLampCount,
      lampFlux: lampFlux,
      area: area,
      utilFactor: utilFactor,
      maintenanceFactor: maintenanceFactor,
      avgPowerPerArea: Number(avgPowerPerArea),
      calculation: {
        formula: 'N = (E × A) / (UF × MF × Φ)',
        steps: [
          `目标照度 E = ${targetLux} lux`,
          `面积 A = ${area} m²`,
          `利用系数 UF = ${utilFactor}`,
          `维护系数 MF = ${maintenanceFactor}`,
          `单灯光通量 Φ = ${lampFlux} lm`,
          `所需灯具数量 N = (${targetLux} × ${area}) / (${utilFactor} × ${maintenanceFactor} × ${lampFlux}) = ${requiredLampCount} 个`
        ]
      }
    }
  } else {
    return {
      success: false,
      code: 'INVALID_MODE',
      errorMessage: 'Mode must be either "lux_from_fixtures" or "fixtures_from_lux"'
    }
  }

  return {
    success: true,
    code: 'OK',
    data: result
  }
}

// 验证计算参数
async function validateCalculation(params) {
  const {
    area = 0,
    utilFactor = 0.8,
    maintenanceFactor = 0.8,
    targetLux = 0,
    lampFlux = 0,
    lampConfig = [],
    spaceType = ''
  } = params

  const errors = []
  const warnings = []
  const suggestions = []

  // 验证面积
  if (area <= 0) {
    errors.push('面积必须大于0')
  } else if (area > 10000) {
    warnings.push('面积较大，建议分区进行照明设计')
  } else if (area < 1) {
    warnings.push('面积较小，请确认输入单位是否为平方米')
  }

  // 验证利用系数
  if (utilFactor <= 0 || utilFactor > 1) {
    errors.push('利用系数必须在0-1之间')
  } else if (utilFactor < 0.3) {
    warnings.push('利用系数较低，可能影响照明效果')
  }

  // 验证维护系数
  if (maintenanceFactor <= 0 || maintenanceFactor > 1) {
    errors.push('维护系数必须在0-1之间')
  } else if (maintenanceFactor < 0.5) {
    warnings.push('维护系数较低，建议定期清洁灯具')
  }

  // 验证目标照度
  if (targetLux > 0) {
    const standards = await getLightingStandards(spaceType)
    if (standards && standards.areas) {
      const areas = Object.values(standards.areas)
      const matchedArea = areas.find(area =>
        targetLux >= area.minLux && targetLux <= area.maxLux
      )

      if (!matchedArea) {
        warnings.push('目标照度可能不符合该空间类型的标准要求')
        const allRanges = areas.map(area => `${area.name}: ${area.minLux}-${area.maxLux} lux`)
        suggestions.push(`建议标准值: ${allRanges.join(', ')}`)
      }
    }

    if (targetLux > 2000) {
      warnings.push('目标照度过高，可能产生眩光')
    } else if (targetLux < 50) {
      warnings.push('目标照度过低，可能影响视觉效果')
    }
  }

  // 验证灯具配置
  if (lampConfig && lampConfig.length > 0) {
    lampConfig.forEach((lamp, index) => {
      if (lamp.powerW <= 0) {
        errors.push(`灯具${index + 1}的功率必须大于0`)
      }
      if (lamp.efficacy <= 0) {
        errors.push(`灯具${index + 1}的光效必须大于0`)
      }
      if (lamp.sourceUtil <= 0 || lamp.sourceUtil > 1) {
        errors.push(`灯具${index + 1}的光源利用率必须在0-1之间`)
      }
      if (lamp.lengthQty && lamp.lengthQty < 0) {
        errors.push(`灯具${index + 1}的数量不能为负数`)
      }
    })
  }

  // 验证单灯光通量
  if (lampFlux > 0) {
    if (lampFlux < 100) {
      warnings.push('单灯光通量较低，可能需要较多灯具')
    } else if (lampFlux > 20000) {
      warnings.push('单灯光通量较高，注意眩光控制')
    }
  }

  return {
    success: true,
    code: 'OK',
    data: {
      isValid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      suggestions: suggestions,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length,
        suggestionCount: suggestions.length
      }
    }
  }
}

// 推荐照明参数
async function recommendParameters(params) {
  const {
    spaceType = '',
    area = 0,
    activityType = 'general', // general, detailed, work, relax
    energyEfficiency = 'balanced' // high, balanced, standard
  } = params

  if (!spaceType || area <= 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: 'Space type and area are required'
    }
  }

  // 获取照明标准
  const standards = await getLightingStandards(spaceType)
  let targetLux = 200 // 默认值

  if (standards && standards.areas) {
    // 根据活动类型调整照度
    const areas = Object.values(standards.areas)
    let baseArea = areas[0] // 使用第一个区域作为基准

    if (activityType === 'detailed') {
      targetLux = baseArea.maxLux || 300
    } else if (activityType === 'work') {
      targetLux = Math.round((baseArea.minLux + baseArea.maxLux) * 0.7)
    } else if (activityType === 'relax') {
      targetLux = baseArea.minLux || 100
    } else {
      targetLux = baseArea.typical || 200
    }
  }

  // 根据能效要求调整利用系数和维护系数
  let utilFactor = 0.7
  let maintenanceFactor = 0.7

  if (energyEfficiency === 'high') {
    utilFactor = 0.8
    maintenanceFactor = 0.8
  } else if (energyEfficiency === 'standard') {
    utilFactor = 0.6
    maintenanceFactor = 0.6
  }

  // 推荐灯具配置
  const lampRecommendations = [
    {
      type: 'LED筒灯',
      powerW: 7,
      efficacy: 85,
      sourceUtil: 0.9,
      description: '高效节能，适合一般照明'
    },
    {
      type: 'LED面板灯',
      powerW: 12,
      efficacy: 90,
      sourceUtil: 0.85,
      description: '光线均匀，适合大面积照明'
    },
    {
      type: 'LED灯带',
      powerW: 5,
      efficacy: 80,
      sourceUtil: 0.7,
      description: '氛围照明，辅助照明'
    }
  ]

  // 计算推荐配置
  const recommendedLampFlux = 800 // 假设单灯800流明
  const requiredLampCount = Math.ceil((targetLux * area) / (utilFactor * maintenanceFactor * recommendedLampFlux))
  const avgPowerPerArea = ((requiredLampCount * 7) / area).toFixed(2)

  // 计算灯具布局建议
  let layoutSuggestion = ''
  if (area < 10) {
    layoutSuggestion = '建议采用均匀分布，间距2-3米'
  } else if (area < 50) {
    layoutSuggestion = '建议分区照明，主照明+辅助照明结合'
  } else {
    layoutSuggestion = '建议分区控制，智能照明系统优化'
  }

  return {
    success: true,
    code: 'OK',
    data: {
      recommended: {
        targetLux: targetLux,
        utilFactor: utilFactor,
        maintenanceFactor: maintenanceFactor,
        lampFlux: recommendedLampFlux,
        estimatedLampCount: requiredLampCount,
        avgPowerPerArea: Number(avgPowerPerArea),
        layoutSuggestion: layoutSuggestion
      },
      lampTypes: lampRecommendations,
      energyEfficiency: {
        level: energyEfficiency,
        description: energyEfficiency === 'high' ? '高能效，初期投入较高但长期节省' :
                   energyEfficiency === 'balanced' ? '平衡配置，性价比最优' :
                   '标准配置，初期投入较低'
      },
      standards: standards
    }
  }
}

// 获取照明标准的辅助函数
async function getLightingStandards(spaceType) {
  const formulaLibrary = await getFormulas({ spaceType })

  if (formulaLibrary.success && formulaLibrary.data.standards) {
    return formulaLibrary.data.standards
  }

  return null
}