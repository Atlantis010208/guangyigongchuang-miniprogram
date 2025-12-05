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
        // 获取模板详情
        result = await getTemplate(data)
        break

      case 'list':
        // 获取模板列表
        result = await getTemplateList(data)
        break

      case 'create':
        // 创建用户自定义模板
        result = await createUserTemplate(openid, data)
        break

      case 'update':
        // 更新用户模板
        result = await updateUserTemplate(openid, data)
        break

      case 'delete':
        // 删除用户模板
        result = await deleteUserTemplate(openid, data)
        break

      case 'apply':
        // 应用模板到计算
        result = await applyTemplate(data)
        break

      case 'recommend':
        // 推荐适合的模板
        result = await recommendTemplates(data)
        break

      case 'favorite':
        // 收藏/取消收藏模板
        result = await toggleFavoriteTemplate(openid, data)
        break

      case 'favorites':
        // 获取收藏的模板
        result = await getFavoriteTemplates(openid, data)
        break

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: 'Action must be one of: get, list, create, update, delete, apply, recommend, favorite, favorites'
        }
    }

    return result

  } catch (err) {
    console.error('calc_templates error:', err)
    return {
      success: false,
      code: 'CALC_TEMPLATES_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}

// 获取模板详情
async function getTemplate(params = {}) {
  const { templateId } = params

  if (!templateId) {
    return {
      success: false,
      code: 'MISSING_TEMPLATE_ID',
      errorMessage: 'Template ID is required'
    }
  }

  const db = cloud.database()
  const col = db.collection('calc_templates')

  const res = await col.where({
    templateId: templateId,
    isDelete: 0
  }).get()

  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'TEMPLATE_NOT_FOUND',
      errorMessage: 'Template not found'
    }
  }

  const template = res.data[0]

  // 增加使用次数（如果是系统模板）
  if (template.type === 'system') {
    await col.doc(template._id).update({
      data: {
        usageCount: (template.usageCount || 0) + 1,
        lastUsedAt: Date.now()
      }
    })
  }

  return {
    success: true,
    code: 'OK',
    data: template
  }
}

// 获取模板列表
async function getTemplateList(params = {}) {
  const {
    page = 1,
    pageSize = 20,
    category = '', // 空间类型分类
    type = 'all', // system/user/favorite
    sort = 'popular', // popular/latest/usage/rating
    keyword = '', // 搜索关键词
    areaRange = '', // 面积范围 small/medium/large
    luxLevel = '', // 照度水平 low/medium/high
    onlyFavorites = false // 只显示收藏的模板
  } = params

  const skip = (page - 1) * pageSize
  const db = cloud.database()
  const col = db.collection('calc_templates')

  // 构建查询条件
  const whereCondition = {
    isDelete: 0
  }

  // 按模板类型筛选
  if (type === 'system') {
    whereCondition.type = 'system'
  } else if (type === 'user') {
    whereCondition.type = 'user'
  }

  // 按分类筛选
  if (category && category !== 'all') {
    whereCondition.spaceType = category
  }

  // 按面积范围筛选
  if (areaRange) {
    switch (areaRange) {
      case 'small':
        whereCondition.areaRange = '0-20'
        break
      case 'medium':
        whereCondition.areaRange = '20-100'
        break
      case 'large':
        whereCondition.areaRange = '100+'
        break
    }
  }

  // 按照度水平筛选
  if (luxLevel) {
    switch (luxLevel) {
      case 'low':
        whereCondition.targetLuxRange = '0-200'
        break
      case 'medium':
        whereCondition.targetLuxRange = '200-500'
        break
      case 'high':
        whereCondition.targetLuxRange = '500+'
        break
    }
  }

  // 搜索筛选
  if (keyword) {
    whereCondition.title = db.command.regex({
      regexp: keyword,
      options: 'i'
    })
  }

  // 排序设置
  let orderBy = 'createdAt'
  let sortOrder = 'desc'

  switch (sort) {
    case 'popular':
      orderBy = 'usageCount'
      sortOrder = 'desc'
      break
    case 'latest':
      orderBy = 'createdAt'
      sortOrder = 'desc'
      break
    case 'usage':
      orderBy = 'lastUsedAt'
      sortOrder = 'desc'
      break
    case 'rating':
      orderBy = 'rating'
      sortOrder = 'desc'
      break
  }

  // 获取总数
  const countResult = await col.where(whereCondition).count()
  const total = countResult.total

  // 获取数据列表
  const listResult = await col
    .where(whereCondition)
    .orderBy(orderBy, sortOrder)
    .skip(skip)
    .limit(pageSize)
    .get()

  // 简化列表数据
  const simplifiedList = listResult.data.map(item => ({
    templateId: item.templateId,
    title: item.title,
    description: item.description,
    spaceType: item.spaceType,
    areaRange: item.areaRange,
    targetLuxRange: item.targetLuxRange,
    type: item.type,
    category: item.category,
    difficulty: item.difficulty,
    estimatedCost: item.estimatedCost,
    energyEfficiency: item.energyEfficiency,
    usageCount: item.usageCount || 0,
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    isPopular: (item.usageCount || 0) > 100,
    isNew: (Date.now() - item.createdAt) < 7 * 24 * 60 * 60 * 1000,
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
      },
      filters: {
        category: category || 'all',
        type: type || 'all',
        sort: sort || 'popular',
        areaRange: areaRange || '',
        luxLevel: luxLevel || ''
      }
    }
  }
}

// 创建用户自定义模板
async function createUserTemplate(userId, params) {
  const {
    title = '',
    description = '',
    spaceType = '',
    area = 0,
    targetLux = 0,
    lampConfig = [],
    utilFactor = 0.8,
    maintenanceFactor = 0.8,
    category = 'custom',
    difficulty = 'beginner',
    tags = [],
    isPublic = false
  } = params

  // 基础验证
  if (!title.trim()) {
    return {
      success: false,
      code: 'MISSING_TITLE',
      errorMessage: 'Template title is required'
    }
  }

  if (!spaceType) {
    return {
      success: false,
      code: 'MISSING_SPACE_TYPE',
      errorMessage: 'Space type is required'
    }
  }

  if (area <= 0) {
    return {
      success: false,
      code: 'INVALID_AREA',
      errorMessage: 'Area must be greater than 0'
    }
  }

  const now = Date.now()
  const templateId = `TMPL_USER_${now}`

  const db = cloud.database()
  const col = db.collection('calc_templates')

  // 创建集合（如果不存在）
  try {
    await col.count()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try {
        await db.createCollection('calc_templates')
      } catch (_) {}
    } else {
      throw e
    }
  }

  // 准备模板数据
  const templateData = {
    templateId,
    title: title.trim(),
    description: description.trim(),
    type: 'user',
    userId: userId,
    spaceType,
    area: Number(area),
    targetLux: Number(targetLux),
    lampConfig: Array.isArray(lampConfig) ? lampConfig : [],
    utilFactor: Number(utilFactor),
    maintenanceFactor: Number(maintenanceFactor),
    category,
    difficulty,
    tags: Array.isArray(tags) ? tags : [],
    isPublic: Boolean(isPublic),
    estimatedCost: calculateEstimatedCost(lampConfig),
    energyEfficiency: calculateEnergyEfficiency(lampConfig, area, targetLux),
    areaRange: getAreaRange(area),
    targetLuxRange: getLuxRange(targetLux),
    usageCount: 0,
    rating: 0,
    ratingCount: 0,
    favoriteCount: 0,
    createdAt: now,
    updatedAt: now,
    isDelete: 0
  }

  // 保存模板
  const addRes = await col.add({ data: templateData })
  const id = addRes && addRes._id ? addRes._id : ''

  // 获取保存的完整数据
  const saved = id ? (await col.doc(id).get()).data : templateData

  return {
    success: true,
    code: 'OK',
    data: saved,
    message: 'User template created successfully'
  }
}

// 更新用户模板
async function updateUserTemplate(userId, params) {
  const {
    templateId = '',
    title = '',
    description = '',
    spaceType = '',
    area = 0,
    targetLux = 0,
    lampConfig = [],
    utilFactor = 0.8,
    maintenanceFactor = 0.8,
    category = 'custom',
    difficulty = 'beginner',
    tags = [],
    isPublic = false
  } = params

  if (!templateId) {
    return {
      success: false,
      code: 'MISSING_TEMPLATE_ID',
      errorMessage: 'Template ID is required'
    }
  }

  const db = cloud.database()
  const col = db.collection('calc_templates')

  // 验证权限
  const existing = await col.where({
    templateId: templateId,
    userId: userId,
    type: 'user',
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'TEMPLATE_NOT_FOUND_OR_NO_PERMISSION',
      errorMessage: 'Template not found or no permission to update'
    }
  }

  // 基础验证
  if (!title.trim()) {
    return {
      success: false,
      code: 'MISSING_TITLE',
      errorMessage: 'Template title is required'
    }
  }

  if (!spaceType) {
    return {
      success: false,
      code: 'MISSING_SPACE_TYPE',
      errorMessage: 'Space type is required'
    }
  }

  if (area <= 0) {
    return {
      success: false,
      code: 'INVALID_AREA',
      errorMessage: 'Area must be greater than 0'
    }
  }

  const now = Date.now()

  // 准备更新数据
  const updateData = {
    title: title.trim(),
    description: description.trim(),
    spaceType,
    area: Number(area),
    targetLux: Number(targetLux),
    lampConfig: Array.isArray(lampConfig) ? lampConfig : [],
    utilFactor: Number(utilFactor),
    maintenanceFactor: Number(maintenanceFactor),
    category,
    difficulty,
    tags: Array.isArray(tags) ? tags : [],
    isPublic: Boolean(isPublic),
    estimatedCost: calculateEstimatedCost(lampConfig),
    energyEfficiency: calculateEnergyEfficiency(lampConfig, area, targetLux),
    areaRange: getAreaRange(area),
    targetLuxRange: getLuxRange(targetLux),
    updatedAt: now
  }

  // 执行更新
  await col.where({
    templateId: templateId,
    userId: userId
  }).update({
    data: updateData
  })

  // 返回更新后的数据
  const updated = await col.where({
    templateId: templateId,
    userId: userId
  }).get()

  return {
    success: true,
    code: 'OK',
    data: updated.data[0],
    message: 'User template updated successfully'
  }
}

// 删除用户模板
async function deleteUserTemplate(userId, params) {
  const { templateId = '' } = params

  if (!templateId) {
    return {
      success: false,
      code: 'MISSING_TEMPLATE_ID',
      errorMessage: 'Template ID is required'
    }
  }

  const db = cloud.database()
  const col = db.collection('calc_templates')

  // 验证权限
  const existing = await col.where({
    templateId: templateId,
    userId: userId,
    type: 'user',
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'TEMPLATE_NOT_FOUND_OR_NO_PERMISSION',
      errorMessage: 'Template not found or no permission to delete'
    }
  }

  // 软删除
  await col.where({
    templateId: templateId,
    userId: userId
  }).update({
    data: {
      isDelete: 1,
      updatedAt: Date.now()
    }
  })

  return {
    success: true,
    code: 'OK',
    message: 'User template deleted successfully'
  }
}

// 应用模板到计算
async function applyTemplate(params) {
  const { templateId = '', customization = {} } = params

  if (!templateId) {
    return {
      success: false,
      code: 'MISSING_TEMPLATE_ID',
      errorMessage: 'Template ID is required'
    }
  }

  // 获取模板
  const templateResult = await getTemplate({ templateId })
  if (!templateResult.success) {
    return templateResult
  }

  const template = templateResult.data

  // 应用自定义参数
  const appliedData = {
    // 基础照明参数
    spaceType: customization.spaceType || template.spaceType,
    area: customization.area || template.area,
    targetLux: customization.targetLux || template.targetLux,
    utilFactor: customization.utilFactor || template.utilFactor,
    maintenanceFactor: customization.maintenanceFactor || template.maintenanceFactor,

    // 灯具配置
    lampConfig: customization.lampConfig || template.lampConfig,

    // 计算模式
    mode: customization.mode || 'count', // 默认根据照度计算灯具

    // 模板信息
    templateId: template.templateId,
    templateTitle: template.title,
    templateType: template.type,

    // 源数据标识
    isFromTemplate: true,
    appliedAt: Date.now()
  }

  // 执行快速计算
  const calcResult = await quickCalculation(appliedData)

  return {
    success: true,
    code: 'OK',
    data: {
      template: {
        id: template.templateId,
        title: template.title,
        description: template.description,
        spaceType: template.spaceType,
        difficulty: template.difficulty,
        estimatedCost: template.estimatedCost,
        energyEfficiency: template.energyEfficiency
      },
      appliedParams: appliedData,
      calculation: calcResult,
      recommendations: generateApplyRecommendations(template, customization)
    },
    message: 'Template applied successfully'
  }
}

// 推荐适合的模板
async function recommendTemplates(params) {
  const {
    spaceType = '',
    area = 0,
    targetLux = 0,
    usageScenario = 'general', // general/detailed/work/relax
    budgetLevel = 'medium', // low/medium/high
    energyPreference = 'balanced' // economy/balance/premium
  } = params

  if (!spaceType || area <= 0) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: 'Space type and area are required'
    }
  }

  const db = cloud.database()
  const col = db.collection('calc_templates')

  // 构建推荐条件
  const whereCondition = {
    isDelete: 0,
    spaceType: spaceType
  }

  // 根据面积筛选
  const areaRange = getAreaRange(area)
  whereCondition.areaRange = db.command.in([areaRange, 'all'])

  // 根据照度筛选
  if (targetLux > 0) {
    const luxRange = getLuxRange(targetLux)
    whereCondition.targetLuxRange = db.command.in([luxRange, 'all'])
  }

  // 获取符合条件的模板
  const res = await col.where(whereCondition).get()
  const templates = res.data || []

  if (templates.length === 0) {
    return {
      success: true,
      code: 'OK',
      data: {
        recommendations: [],
        message: 'No matching templates found'
      }
    }
  }

  // 计算匹配分数
  const scoredTemplates = templates.map(template => {
    let score = 0

    // 面积匹配分数 (30%)
    const templateArea = template.area || 50
    const areaDiff = Math.abs(templateArea - area)
    const areaScore = Math.max(0, 30 - areaDiff / 10)
    score += areaScore

    // 照度匹配分数 (25%)
    if (targetLux > 0 && template.targetLux > 0) {
      const luxDiff = Math.abs(template.targetLux - targetLux)
      const luxScore = Math.max(0, 25 - luxDiff / 50)
      score += luxScore
    }

    // 预算匹配分数 (20%)
    if (budgetLevel && template.estimatedCost) {
      let budgetScore = 10
      if (budgetLevel === 'low' && template.estimatedCost < 1000) budgetScore = 20
      else if (budgetLevel === 'medium' && template.estimatedCost >= 500 && template.estimatedCost < 3000) budgetScore = 20
      else if (budgetLevel === 'high' && template.estimatedCost >= 2000) budgetScore = 20
      score += budgetScore
    }

    // 能效匹配分数 (15%)
    if (energyPreference && template.energyEfficiency) {
      let energyScore = 7.5
      if (energyPreference === 'economy' && template.energyEfficiency >= 4) energyScore = 15
      else if (energyPreference === 'balanced' && template.energyEfficiency >= 3 && template.energyEfficiency < 5) energyScore = 15
      else if (energyPreference === 'premium' && template.energyEfficiency <= 4) energyScore = 15
      score += energyScore
    }

    // 使用频率分数 (10%)
    const usageScore = Math.min(10, (template.usageCount || 0) / 10)
    score += usageScore

    return {
      ...template,
      matchScore: Math.round(score * 100) / 100,
      matchReason: generateMatchReason(template, params, score)
    }
  })

  // 按匹配分数排序
  const recommendations = scoredTemplates
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10) // 返回前10个推荐

  return {
    success: true,
    code: 'OK',
    data: {
      recommendations: recommendations.map(item => ({
        templateId: item.templateId,
        title: item.title,
        description: item.description,
        spaceType: item.spaceType,
        area: item.area,
        targetLux: item.targetLux,
        estimatedCost: item.estimatedCost,
        energyEfficiency: item.energyEfficiency,
        difficulty: item.difficulty,
        usageCount: item.usageCount,
        rating: item.rating,
        matchScore: item.matchScore,
        matchReason: item.matchReason,
        isRecommended: item.matchScore >= 70
      })),
      searchCriteria: {
        spaceType,
        area,
        targetLux,
        usageScenario,
        budgetLevel,
        energyPreference
      },
      totalFound: recommendations.length
    }
  }
}

// 收藏/取消收藏模板
async function toggleFavoriteTemplate(userId, params) {
  const { templateId = '' } = params

  if (!templateId) {
    return {
      success: false,
      code: 'MISSING_TEMPLATE_ID',
      errorMessage: 'Template ID is required'
    }
  }

  const db = cloud.database()
  const favCol = db.collection('template_favorites')

  // 创建收藏集合（如果不存在）
  try {
    await favCol.count()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try {
        await db.createCollection('template_favorites')
      } catch (_) {}
    } else {
      throw e
    }
  }

  // 检查是否已收藏
  const existing = await favCol.where({
    userId: userId,
    templateId: templateId
  }).get()

  const now = Date.now()
  let isFavorite = false

  if (existing.data && existing.data.length > 0) {
    // 取消收藏
    await favCol.doc(existing.data[0]._id).remove()
    isFavorite = false
  } else {
    // 添加收藏
    await favCol.add({
      data: {
        userId: userId,
        templateId: templateId,
        createdAt: now
      }
    })
    isFavorite = true
  }

  // 更新模板的收藏计数
  const templateCol = db.collection('calc_templates')
  const templateRes = await templateCol.where({ templateId }).get()

  if (templateRes.data && templateRes.data.length > 0) {
    const template = templateRes.data[0]
    const currentCount = template.favoriteCount || 0
    const newCount = isFavorite ? currentCount + 1 : currentCount - 1

    await templateCol.doc(template._id).update({
      data: {
        favoriteCount: Math.max(0, newCount),
        updatedAt: now
      }
    })
  }

  return {
    success: true,
    code: 'OK',
    data: {
      isFavorite: isFavorite,
      templateId: templateId,
      action: isFavorite ? 'favorited' : 'unfavorited'
    },
    message: isFavorite ? 'Template added to favorites' : 'Template removed from favorites'
  }
}

// 获取收藏的模板
async function getFavoriteTemplates(userId, params = {}) {
  const { page = 1, pageSize = 20 } = params

  const skip = (page - 1) * pageSize
  const db = cloud.database()
  const favCol = db.collection('template_favorites')
  const templateCol = db.collection('calc_templates')

  // 获取收藏记录
  const favRes = await favCol
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  if (!favRes.data || favRes.data.length === 0) {
    return {
      success: true,
      code: 'OK',
      data: {
        list: [],
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total: 0,
          totalPages: 0
        }
      }
    }
  }

  // 获取对应的模板详情
  const templateIds = favRes.data.map(fav => fav.templateId)
  const templateRes = await templateCol
    .where({
      templateId: db.command.in(templateIds),
      isDelete: 0
    })
    .get()

  const templateMap = {}
  templateRes.data.forEach(template => {
    templateMap[template.templateId] = template
  })

  // 组合数据
  const combinedList = favRes.data.map(fav => {
    const template = templateMap[fav.templateId]
    return template ? {
      templateId: template.templateId,
      title: template.title,
      description: template.description,
      spaceType: template.spaceType,
      area: template.area,
      targetLux: template.targetLux,
      estimatedCost: template.estimatedCost,
      energyEfficiency: template.energyEfficiency,
      difficulty: template.difficulty,
      usageCount: template.usageCount,
      rating: template.rating,
      favoritedAt: fav.createdAt
    } : null
  }).filter(item => item !== null)

  return {
    success: true,
    code: 'OK',
    data: {
      list: combinedList,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: combinedList.length,
        totalPages: Math.ceil(combinedList.length / pageSize)
      }
    }
  }
}

// 辅助函数

// 计算预估成本
function calculateEstimatedCost(lampConfig) {
  if (!Array.isArray(lampConfig) || lampConfig.length === 0) {
    return 0
  }

  const totalPower = lampConfig.reduce((sum, lamp) => {
    const power = Number(lamp.powerW || 0)
    const quantity = Number(lamp.lengthQty || 0)
    return sum + (power * quantity)
  }, 0)

  // 假设LED灯具平均价格50元/瓦
  return Math.round(totalPower * 50)
}

// 计算能效等级
function calculateEnergyEfficiency(lampConfig, area, targetLux) {
  if (!Array.isArray(lampConfig) || lampConfig.length === 0 || area <= 0) {
    return 3 // 默认中等能效
  }

  const totalPower = lampConfig.reduce((sum, lamp) => {
    const power = Number(lamp.powerW || 0)
    const quantity = Number(lamp.lengthQty || 0)
    return sum + (power * quantity)
  }, 0)

  const powerPerArea = totalPower / area
  const luxPerWatt = targetLux > 0 ? targetLux / powerPerArea : 0

  // 能效评分（1-5分，5分最高）
  if (luxPerWatt >= 100) return 5
  if (luxPerWatt >= 80) return 4
  if (luxPerWatt >= 60) return 3
  if (luxPerWatt >= 40) return 2
  return 1
}

// 获取面积范围
function getAreaRange(area) {
  if (area <= 20) return '0-20'
  if (area <= 100) return '20-100'
  return '100+'
}

// 获取照度范围
function getLuxRange(lux) {
  if (lux <= 200) return '0-200'
  if (lux <= 500) return '200-500'
  return '500+'
}

// 快速计算
async function quickCalculation(params) {
  const { lampConfig = [], area = 0, utilFactor = 0.8, maintenanceFactor = 0.8, mode = 'count', targetLux = 0, lampFlux = 0 } = params

  if (area <= 0) return { error: 'Invalid area' }

  let totalFlux = 0

  if (mode === 'lux' && lampConfig.length > 0) {
    // 根据灯具计算照度
    totalFlux = lampConfig.reduce((sum, lamp) => {
      const power = Number(lamp.powerW || 0)
      const efficacy = Number(lamp.efficacy || 0)
      const quantity = Number(lamp.lengthQty || 0)
      const sourceUtil = Number(lamp.sourceUtil || 0)
      return sum + (power * efficacy * quantity * sourceUtil)
    }, 0)

    const avgLux = Math.round((totalFlux * utilFactor * maintenanceFactor) / area)
    return {
      mode: 'lux',
      totalFlux: Math.round(totalFlux),
      avgLux,
      area,
      utilFactor,
      maintenanceFactor
    }
  } else if (mode === 'count' && lampFlux > 0 && targetLux > 0) {
    // 根据照度计算灯具数量
    const requiredLampCount = Math.ceil((targetLux * area) / (utilFactor * maintenanceFactor * lampFlux))
    const avgPowerPerArea = ((requiredLampCount * 7) / area).toFixed(2)

    return {
      mode: 'count',
      targetLux,
      calcLampCount: requiredLampCount,
      avgPowerPerArea: Number(avgPowerPerArea),
      area,
      utilFactor,
      maintenanceFactor,
      lampFlux
    }
  }

  return { error: 'Invalid calculation parameters' }
}

// 生成应用建议
function generateApplyRecommendations(template, customization) {
  const recommendations = []

  if (customization.area && template.area) {
    const areaDiff = Math.abs(customization.area - template.area)
    if (areaDiff > template.area * 0.3) {
      recommendations.push(`面积差异较大（${Math.round(areaDiff/template.area*100)}%），建议调整灯具数量`)
    }
  }

  if (customization.targetLux && template.targetLux) {
    const luxDiff = Math.abs(customization.targetLux - template.targetLux)
    if (luxDiff > template.targetLux * 0.3) {
      recommendations.push(`照度需求差异较大，建议重新计算灯具配置`)
    }
  }

  if (template.difficulty === 'advanced') {
    recommendations.push('这是一个高级模板，建议根据实际需求调整参数')
  }

  if (recommendations.length === 0) {
    recommendations.push('模板参数与您的需求匹配良好，可直接使用')
  }

  return recommendations
}

// 生成匹配原因
function generateMatchReason(template, params, score) {
  const reasons = []

  if (score >= 80) {
    reasons.push('高度匹配您的设计需求')
  } else if (score >= 60) {
    reasons.push('基本匹配，建议微调参数')
  } else {
    reasons.push('部分匹配，建议查看其他选项')
  }

  if (template.area && params.area) {
    const areaMatch = Math.abs(template.area - params.area) / params.area < 0.3
    if (areaMatch) reasons.push('面积大小合适')
  }

  if (template.energyEfficiency >= 4) {
    reasons.push('高能效设计')
  }

  if (template.usageCount > 50) {
    reasons.push('广泛使用验证')
  }

  return reasons.join('；')
}