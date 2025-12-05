const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''

    const { calcId, action, data } = event || {}

    // 基础验证
    if (!calcId) {
      return {
        success: false,
        code: 'MISSING_CALC_ID',
        errorMessage: 'Calculation ID is required'
      }
    }

    const db = cloud.database()
    const col = db.collection('calculations')

    let result

    switch (action) {
      case 'get':
        // 获取单个计算结果
        result = await getCalculation(col, calcId, openid)
        break

      case 'list':
        // 获取用户的计算结果列表
        result = await getCalculationList(col, openid, data)
        break

      case 'update':
        // 更新计算结果
        result = await updateCalculation(col, calcId, openid, data)
        break

      case 'delete':
        // 删除计算结果（软删除）
        result = await deleteCalculation(col, calcId, openid)
        break

      case 'share':
        // 分享计算结果
        result = await shareCalculation(col, calcId, openid, data)
        break

      case 'getByShareCode':
        // 通过分享码获取计算结果
        result = await getCalculationByShareCode(col, data.shareCode)
        break

      case 'duplicate':
        // 复制计算结果
        result = await duplicateCalculation(col, calcId, openid, data)
        break

      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: 'Action must be one of: get, list, update, delete, share, getByShareCode, duplicate'
        }
    }

    return result

  } catch (err) {
    console.error('calc_results error:', err)
    return {
      success: false,
      code: 'CALC_RESULTS_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}

// 获取单个计算结果
async function getCalculation(col, calcId, openid) {
  const res = await col.where({
    calcId: calcId,
    userId: openid,
    isDelete: 0
  }).get()

  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'Calculation not found'
    }
  }

  return {
    success: true,
    code: 'OK',
    data: res.data[0]
  }
}

// 获取用户的计算结果列表
async function getCalculationList(col, openid, options = {}) {
  const {
    page = 1,
    pageSize = 20,
    mode = '', // 过滤计算模式：lux/count
    spaceType = '', // 过滤空间类型
    status = 'active', // 过滤状态
    sortBy = 'updatedAt', // 排序字段
    sortOrder = 'desc' // 排序方向
  } = options

  const skip = (page - 1) * pageSize
  const now = Date.now()

  // 构建查询条件
  const whereCondition = {
    userId: openid,
    isDelete: 0
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

  // 简化列表数据（只返回必要字段）
  const simplifiedList = listResult.data.map(item => ({
    calcId: item.calcId,
    spaceName: item.spaceName || `${item.spaceType}空间`,
    mode: item.mode,
    area: item.area,
    targetLux: item.targetLux,
    avgLux: item.avgLux,
    calcLampCount: item.calcLampCount,
    totalPrice: item.totalPrice,
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

// 更新计算结果
async function updateCalculation(col, calcId, openid, updateData) {
  const now = Date.now()

  // 验证权限
  const existing = await col.where({
    calcId: calcId,
    userId: openid,
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'Calculation not found or no permission'
    }
  }

  // 准备更新数据
  const dataToUpdate = {
    updatedAt: now
  }

  // 允许更新的字段
  const allowedFields = [
    'spaceName', 'spaceType', 'area', 'utilFactor', 'maintenanceFactor',
    'lampTypeRows', 'totalFlux', 'targetLux', 'lampFlux',
    'avgLux', 'calcLampCount', 'avgPowerPerArea',
    'lampUnitPrice', 'totalPrice', 'notes', 'status'
  ]

  allowedFields.forEach(field => {
    if (updateData.hasOwnProperty(field) && updateData[field] !== undefined) {
      dataToUpdate[field] = updateData[field]
    }
  })

  // 执行更新
  await col.where({
    calcId: calcId,
    userId: openid
  }).update({
    data: dataToUpdate
  })

  // 返回更新后的数据
  const updated = await col.where({
    calcId: calcId,
    userId: openid
  }).get()

  return {
    success: true,
    code: 'OK',
    data: updated.data[0],
    message: 'Calculation updated successfully'
  }
}

// 删除计算结果（软删除）
async function deleteCalculation(col, calcId, openid) {
  const now = Date.now()

  // 验证权限
  const existing = await col.where({
    calcId: calcId,
    userId: openid,
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'Calculation not found or no permission'
    }
  }

  // 软删除
  await col.where({
    calcId: calcId,
    userId: openid
  }).update({
    data: {
      isDelete: 1,
      updatedAt: now
    }
  })

  return {
    success: true,
    code: 'OK',
    message: 'Calculation deleted successfully'
  }
}

// 分享计算结果
async function shareCalculation(col, calcId, openid, options = {}) {
  const now = Date.now()
  const { isShared = true } = options

  // 验证权限
  const existing = await col.where({
    calcId: calcId,
    userId: openid,
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'Calculation not found or no permission'
    }
  }

  // 生成或移除分享码
  const updateData = {
    updatedAt: now,
    isShared: Boolean(isShared)
  }

  if (isShared) {
    updateData.shareCode = `SHARE${now.toString(36).toUpperCase()}`
  } else {
    updateData.shareCode = ''
  }

  await col.where({
    calcId: calcId,
    userId: openid
  }).update({
    data: updateData
  })

  // 返回更新后的数据
  const updated = await col.where({
    calcId: calcId,
    userId: openid
  }).get()

  return {
    success: true,
    code: 'OK',
    data: updated.data[0],
    message: isShared ? 'Calculation shared successfully' : 'Calculation share revoked'
  }
}

// 通过分享码获取计算结果
async function getCalculationByShareCode(col, shareCode) {
  if (!shareCode) {
    return {
      success: false,
      code: 'MISSING_SHARE_CODE',
      errorMessage: 'Share code is required'
    }
  }

  const res = await col.where({
    shareCode: shareCode,
    isShared: true,
    isDelete: 0
  }).get()

  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'SHARE_NOT_FOUND',
      errorMessage: 'Shared calculation not found or expired'
    }
  }

  // 返回分享数据（隐藏敏感信息）
  const sharedData = res.data[0]
  const publicData = {
    calcId: sharedData.calcId,
    spaceName: sharedData.spaceName || `${sharedData.spaceType}空间`,
    mode: sharedData.mode,
    spaceType: sharedData.spaceType,
    area: sharedData.area,
    utilFactor: sharedData.utilFactor,
    maintenanceFactor: sharedData.maintenanceFactor,
    lampTypeRows: sharedData.lampTypeRows,
    totalFlux: sharedData.totalFlux,
    targetLux: sharedData.targetLux,
    lampFlux: sharedData.lampFlux,
    avgLux: sharedData.avgLux,
    calcLampCount: sharedData.calcLampCount,
    avgPowerPerArea: sharedData.avgPowerPerArea,
    totalPrice: sharedData.totalPrice,
    notes: sharedData.notes,
    sharedAt: sharedData.updatedAt
  }

  return {
    success: true,
    code: 'OK',
    data: publicData
  }
}

// 复制计算结果
async function duplicateCalculation(col, calcId, openid, options = {}) {
  const { newName = '', spaceName = '' } = options
  const now = Date.now()

  // 验证权限
  const existing = await col.where({
    calcId: calcId,
    userId: openid,
    isDelete: 0
  }).get()

  if (!existing.data || existing.data.length === 0) {
    return {
      success: false,
      code: 'CALC_NOT_FOUND',
      errorMessage: 'Calculation not found or no permission'
    }
  }

  const original = existing.data[0]

  // 生成新的计算ID
  const newCalcId = `CALC${now}`

  // 准备复制的数据
  const duplicatedData = {
    ...original,
    calcId: newCalcId,
    spaceName: spaceName || `${original.spaceName || '副本'}`,
    status: 'active',
    isShared: false,
    shareCode: '',
    createdAt: now,
    updatedAt: now
  }

  // 移除原记录的_id字段
  delete duplicatedData._id

  // 添加新记录
  await col.add({ data: duplicatedData })

  // 返回复制后的数据
  const duplicated = await col.where({
    calcId: newCalcId,
    userId: openid
  }).get()

  return {
    success: true,
    code: 'OK',
    data: duplicated.data[0],
    message: 'Calculation duplicated successfully'
  }
}