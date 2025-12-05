const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''

    const { action, timeRange, statistics = false, compare = false } = event || {}

    // 基础验证
    if (!openid) {
      return {
        success: false,
        code: 'MISSING_OPENID',
        errorMessage: 'missing openid'
      }
    }

    const db = cloud.database()
    const col = db.collection('calculations')

    let result

    switch (action) {
      case 'list':
        // 获取计算历史列表
        result = await getCalcHistoryList(col, openid, timeRange, event)
        break

      case 'statistics':
        // 获取计算统计数据
        result = await getCalcStatistics(col, openid, timeRange, event)
        break

      case 'trend':
        // 获取计算趋势数据
        result = await getCalcTrends(col, openid, timeRange, event)
        break

      case 'export':
        // 导出计算历史数据
        result = await exportCalcHistory(col, openid, timeRange, event)
        break

      case 'favorites':
        // 获取收藏的计算记录
        result = await getFavoriteCalculations(col, openid, event)
        break

      case 'recent':
        // 获取最近的计算记录
        result = await getRecentCalculations(col, openid, event)
        break

      case 'compare':
        // 比较多个计算结果
        result = await compareCalculations(col, openid, event.calculationIds || [])
        break

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: 'Action must be one of: list, statistics, trend, export, favorites, recent, compare'
        }
    }

    return result

  } catch (err) {
    console.error('calc_history error:', err)
    return {
      success: false,
      code: 'CALC_HISTORY_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}

// 获取计算历史列表
async function getCalcHistoryList(col, openid, timeRange, options = {}) {
  const {
    page = 1,
    pageSize = 20,
    mode = '', // 过滤计算模式：lux/count
    spaceType = '', // 过滤空间类型
    status = 'active', // 过滤状态
    sortBy = 'updatedAt', // 排序字段
    sortOrder = 'desc', // 排序方向
    keyword = '' // 搜索关键词
  } = options

  const skip = (page - 1) * pageSize

  // 构建时间范围查询
  const now = Date.now()
  let timeCondition = {}

  if (timeRange) {
    switch (timeRange) {
      case 'week':
        timeCondition = {
          [Symbol.for('gte')]: now - 7 * 24 * 60 * 60 * 1000
        }
        break
      case 'month':
        timeCondition = {
          [Symbol.for('gte')]: now - 30 * 24 * 60 * 60 * 1000
        }
        break
      case 'quarter':
        timeCondition = {
          [Symbol.for('gte')]: now - 90 * 24 * 60 * 60 * 1000
        }
        break
      case 'year':
        timeCondition = {
          [Symbol.for('gte')]: now - 365 * 24 * 60 * 60 * 1000
        }
        break
      default:
        if (typeof timeRange === 'object' && timeRange.start && timeRange.end) {
          timeCondition = {
            [Symbol.for('gte')]: timeRange.start,
            [Symbol.for('lte')]: timeRange.end
          }
        }
    }
  }

  // 构建查询条件
  const whereCondition = {
    userId: openid,
    isDelete: 0,
    ...timeCondition
  }

  if (mode) {
    whereCondition.mode = mode
  }
  if (spaceType) {
    whereCondition.spaceType = spaceType
  }
  if (status && status !== 'all') {
    whereCondition.status = status
  }
  if (keyword) {
    whereCondition.spaceName = db.command.regex({
      regexp: keyword,
      options: 'i'
    })
  }

  // 获取总数
  const countResult = await col.where(whereCondition).count()
  const total = countResult.total

  // 获取数据列表
  const listResult = await col
    .where(whereCondition)
    .orderBy(sortBy, sortOrder)
    .skip(skip)
    .limit(pageSize)
    .get()

  // 简化列表数据
  const simplifiedList = listResult.data.map(item => ({
    calcId: item.calcId,
    spaceName: item.spaceName || `${item.spaceType}空间`,
    mode: item.mode,
    spaceType: item.spaceType,
    area: item.area,
    targetLux: item.targetLux || 0,
    avgLux: item.avgLux || 0,
    calcLampCount: item.calcLampCount || 0,
    totalPrice: item.totalPrice || 0,
    avgPowerPerArea: item.avgPowerPerArea || 0,
    status: item.status,
    isShared: item.isShared,
    shareCode: item.shareCode,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }))

  return {
    success: true,
    code: 'OK',
    data: {
      list: simplifiedList,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: total,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  }
}

// 获取计算统计数据
async function getCalcStatistics(col, openid, timeRange, options = {}) {
  const now = Date.now()
  let timeCondition = {}

  if (timeRange) {
    switch (timeRange) {
      case 'week':
        timeCondition = {
          [Symbol.for('gte')]: now - 7 * 24 * 60 * 60 * 1000
        }
        break
      case 'month':
        timeCondition = {
          [Symbol.for('gte')]: now - 30 * 24 * 60 * 60 * 1000
        }
        break
      case 'quarter':
        timeCondition = {
          [Symbol.for('gte')]: now - 90 * 24 * 60 * 60 * 1000
        }
        break
      case 'year':
        timeCondition = {
          [Symbol.for('gte')]: now - 365 * 24 * 60 * 60 * 1000
        }
        break
      default:
        if (typeof timeRange === 'object' && timeRange.start && timeRange.end) {
          timeCondition = {
            [Symbol.for('gte')]: timeRange.start,
            [Symbol.for('lte')]: timeRange.end
          }
        }
    }
  }

  const whereCondition = {
    userId: openid,
    isDelete: 0,
    ...timeCondition
  }

  // 获取所有符合条件的记录
  const allResults = await col.where(whereCondition).get()
  const calculations = allResults.data

  if (!calculations || calculations.length === 0) {
    return {
      success: true,
      code: 'OK',
      data: {
        totalCalculations: 0,
        statistics: {
          modeStats: {},
          spaceTypeStats: {},
          avgLux: 0,
          avgArea: 0,
          avgLampCount: 0,
          avgPowerPerArea: 0,
          totalPrice: 0,
          totalArea: 0
        }
      }
    }
  }

  // 统计计算模式分布
  const modeStats = {}
  calculations.forEach(calc => {
    const mode = calc.mode
    modeStats[mode] = (modeStats[mode] || 0) + 1
  })

  // 统计空间类型分布
  const spaceTypeStats = {}
  calculations.forEach(calc => {
    const spaceType = calc.spaceType || 'other'
    spaceTypeStats[spaceType] = (spaceTypeStats[spaceType] || 0) + 1
  })

  // 计算平均值和总和
  const totals = calculations.reduce((acc, calc) => {
    acc.totalLux += calc.avgLux || 0
    acc.totalArea += calc.area || 0
    acc.totalLampCount += calc.calcLampCount || 0
    acc.totalPowerPerArea += calc.avgPowerPerArea || 0
    acc.totalPrice += calc.totalPrice || 0
    return acc
  }, {
    totalLux: 0,
    totalArea: 0,
    totalLampCount: 0,
    totalPowerPerArea: 0,
    totalPrice: 0
  })

  const count = calculations.length

  return {
    success: true,
    code: 'OK',
    data: {
      totalCalculations: count,
      statistics: {
        modeStats,
        spaceTypeStats,
        avgLux: Math.round(totals.totalLux / count),
        avgArea: Math.round(totals.totalArea * 100) / 100,
        avgLampCount: Math.round(totals.totalLampCount / count * 100) / 100,
        avgPowerPerArea: Math.round(totals.totalPowerPerArea / count * 100) / 100,
        totalPrice: Math.round(totals.totalPrice * 100) / 100,
        totalArea: Math.round(totals.totalArea * 100) / 100
      }
    }
  }
}

// 获取计算趋势数据
async function getCalcTrends(col, openid, timeRange, options = {}) {
  const { unit = 'day' } = options // 趋势单位：day/week/month
  const now = Date.now()

  let timeCondition = {}
  let timeRangeLength = 30 // 默认30天

  switch (timeRange) {
    case 'week':
      timeRangeLength = 7
      timeCondition = {
        [Symbol.for('gte')]: now - 7 * 24 * 60 * 60 * 1000
      }
      break
    case 'month':
      timeRangeLength = 30
      timeCondition = {
        [Symbol.for('gte')]: now - 30 * 24 * 60 * 60 * 1000
      }
      break
    case 'quarter':
      timeRangeLength = 90
      timeCondition = {
        [Symbol.for('gte')]: now - 90 * 24 * 60 * 60 * 1000
      }
      break
    case 'year':
      timeRangeLength = 365
      timeCondition = {
        [Symbol.for('gte')]: now - 365 * 24 * 60 * 60 * 1000
      }
      break
    default:
      if (typeof timeRange === 'object' && timeRange.start && timeRange.end) {
        timeRangeLength = Math.ceil((timeRange.end - timeRange.start) / (24 * 60 * 60 * 1000))
        timeCondition = {
          [Symbol.for('gte')]: timeRange.start,
          [Symbol.for('lte')]: timeRange.end
        }
      }
  }

  const whereCondition = {
    userId: openid,
    isDelete: 0,
    ...timeCondition
  }

  // 获取所有符合条件的记录
  const allResults = await col.where(whereCondition).get()
  const calculations = allResults.data

  if (!calculations || calculations.length === 0) {
    return {
      success: true,
      code: 'OK',
      data: {
        trends: []
      }
    }
  }

  // 按时间单位分组统计
  const trends = {}
  const msPerUnit = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  }

  calculations.forEach(calc => {
    const timestamp = calc.createdAt
    const timeKey = Math.floor(timestamp / msPerUnit[unit]) * msPerUnit[unit]

    if (!trends[timeKey]) {
      trends[timeKey] = {
        date: timeKey,
        count: 0,
        totalLux: 0,
        totalArea: 0,
        totalLampCount: 0,
        totalPrice: 0
      }
    }

    trends[timeKey].count++
    trends[timeKey].totalLux += calc.avgLux || 0
    trends[timeKey].totalArea += calc.area || 0
    trends[timeKey].totalLampCount += calc.calcLampCount || 0
    trends[timeKey].totalPrice += calc.totalPrice || 0
  })

  // 计算平均值并转换为数组
  const trendArray = Object.values(trends).map(trend => ({
    date: trend.date,
    count: trend.count,
    avgLux: trend.count > 0 ? Math.round(trend.totalLux / trend.count) : 0,
    avgArea: trend.count > 0 ? Math.round(trend.totalArea / trend.count * 100) / 100 : 0,
    avgLampCount: trend.count > 0 ? Math.round(trend.totalLampCount / trend.count * 100) / 100 : 0,
    totalPrice: Math.round(trend.totalPrice * 100) / 100
  })).sort((a, b) => a.date - b.date)

  return {
    success: true,
    code: 'OK',
    data: {
      trends: trendArray
    }
  }
}

// 导出计算历史数据
async function exportCalcHistory(col, openid, timeRange, options = {}) {
  const { format = 'json' } = options // 导出格式：json/csv/excel

  // 获取计算历史列表
  const listResult = await getCalcHistoryList(col, openid, timeRange, {
    page: 1,
    pageSize: 1000, // 获取所有数据
    ...options
  })

  if (!listResult.success) {
    return listResult
  }

  const calculations = listResult.data.list

  // 准备导出数据
  const exportData = calculations.map(calc => ({
    计算ID: calc.calcId,
    空间名称: calc.spaceName,
    计算模式: calc.mode === 'lux' ? '根据灯具算照度' : '根据照度算灯具',
    空间类型: calc.spaceType,
    面积: calc.area,
    目标照度: calc.targetLux,
    平均照度: calc.avgLux,
    灯具数量: calc.calcLampCount,
    总价: calc.totalPrice,
    单位面积功率: calc.avgPowerPerArea,
    状态: calc.status,
    创建时间: new Date(calc.createdAt).toLocaleString(),
    更新时间: new Date(calc.updatedAt).toLocaleString()
  }))

  if (format === 'json') {
    return {
      success: true,
      code: 'OK',
      data: {
        exportData,
        filename: `calculation_history_${openid}_${Date.now()}.json`
      }
    }
  } else if (format === 'csv') {
    // 转换为CSV格式
    const headers = Object.keys(exportData[0] || {})
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
    ].join('\n')

    return {
      success: true,
      code: 'OK',
      data: {
        csvContent,
        filename: `calculation_history_${openid}_${Date.now()}.csv`
      }
    }
  }

  return {
    success: false,
    code: 'UNSUPPORTED_FORMAT',
    errorMessage: 'Supported formats: json, csv'
  }
}

// 获取收藏的计算记录
async function getFavoriteCalculations(col, openid, options = {}) {
  const { page = 1, pageSize = 20 } = options
  const skip = (page - 1) * pageSize

  const whereCondition = {
    userId: openid,
    isDelete: 0,
    status: 'favorite'
  }

  // 获取总数
  const countResult = await col.where(whereCondition).count()
  const total = countResult.total

  // 获取数据列表
  const listResult = await col
    .where(whereCondition)
    .orderBy('updatedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  // 简化列表数据
  const simplifiedList = listResult.data.map(item => ({
    calcId: item.calcId,
    spaceName: item.spaceName || `${item.spaceType}空间`,
    mode: item.mode,
    spaceType: item.spaceType,
    area: item.area,
    targetLux: item.targetLux || 0,
    avgLux: item.avgLux || 0,
    calcLampCount: item.calcLampCount || 0,
    totalPrice: item.totalPrice || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }))

  return {
    success: true,
    code: 'OK',
    data: {
      list: simplifiedList,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: total,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  }
}

// 获取最近的计算记录
async function getRecentCalculations(col, openid, options = {}) {
  const { limit = 10 } = options

  const whereCondition = {
    userId: openid,
    isDelete: 0
  }

  const listResult = await col
    .where(whereCondition)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  // 简化列表数据
  const simplifiedList = listResult.data.map(item => ({
    calcId: item.calcId,
    spaceName: item.spaceName || `${item.spaceType}空间`,
    mode: item.mode,
    spaceType: item.spaceType,
    area: item.area,
    avgLux: item.avgLux || 0,
    calcLampCount: item.calcLampCount || 0,
    updatedAt: item.updatedAt
  }))

  return {
    success: true,
    code: 'OK',
    data: simplifiedList
  }
}

// 比较多个计算结果
async function compareCalculations(col, openid, calculationIds) {
  if (!calculationIds || calculationIds.length < 2) {
    return {
      success: false,
      code: 'INSUFFICIENT_IDS',
      errorMessage: 'At least 2 calculation IDs are required for comparison'
    }
  }

  const whereCondition = {
    userId: openid,
    calcId: db.command.in(calculationIds),
    isDelete: 0
  }

  const listResult = await col.where(whereCondition).get()
  const calculations = listResult.data

  if (calculations.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'No calculations found'
    }
  }

  // 准备比较数据
  const compareData = calculations.map(calc => ({
    calcId: calc.calcId,
    spaceName: calc.spaceName || `${calc.spaceType}空间`,
    mode: calc.mode,
    spaceType: calc.spaceType,
    area: calc.area,
    targetLux: calc.targetLux || 0,
    avgLux: calc.avgLux || 0,
    calcLampCount: calc.calcLampCount || 0,
    totalPrice: calc.totalPrice || 0,
    avgPowerPerArea: calc.avgPowerPerArea || 0,
    utilFactor: calc.utilFactor,
    maintenanceFactor: calc.maintenanceFactor
  }))

  // 计算比较统计
  const comparison = {
    count: calculations.length,
    avgArea: Math.round(compareData.reduce((sum, calc) => sum + calc.area, 0) / compareData.length * 100) / 100,
    maxLux: Math.max(...compareData.map(calc => calc.avgLux)),
    minLux: Math.min(...compareData.map(calc => calc.avgLux)),
    avgLux: Math.round(compareData.reduce((sum, calc) => sum + calc.avgLux, 0) / compareData.length),
    avgLampCount: Math.round(compareData.reduce((sum, calc) => sum + calc.calcLampCount, 0) / compareData.length * 100) / 100,
    avgTotalPrice: Math.round(compareData.reduce((sum, calc) => sum + calc.totalPrice, 0) / compareData.length * 100) / 100
  }

  return {
    success: true,
    code: 'OK',
    data: {
      calculations: compareData,
      comparison
    }
  }
}