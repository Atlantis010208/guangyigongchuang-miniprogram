const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) {
      return {
        success: false,
        code: 'MISSING_OPENID',
        errorMessage: 'missing openid'
      }
    }

    const calculation = event && event.calculation ? event.calculation : {}
    const now = Date.now()

    // 生成计算ID
    const calcId = calculation.calcId || `CALC${now}`

    // 验证必要字段
    if (!calculation.mode || !['lux', 'count'].includes(calculation.mode)) {
      return {
        success: false,
        code: 'INVALID_MODE',
        errorMessage: 'Calculation mode must be "lux" or "count"'
      }
    }

    if (!calculation.area || calculation.area <= 0) {
      return {
        success: false,
        code: 'INVALID_AREA',
        errorMessage: 'Area must be greater than 0'
      }
    }

    // 准备保存的数据
    const calcData = {
      calcId,
      userId: openid,
      mode: calculation.mode, // 'lux' - 根据灯具算照度, 'count' - 根据照度算灯具
      spaceType: calculation.spaceType || '', // 空间类型（residential/commercial/office/hotel）
      spaceName: calculation.spaceName || '', // 空间名称
      area: Number(calculation.area), // 房间面积（平方米）
      utilFactor: Number(calculation.utilFactor || 0.8), // 利用系数
      maintenanceFactor: Number(calculation.maintenanceFactor || 0.8), // 维护系数

      // 根据灯具计算照度的字段
      lampTypeRows: calculation.lampTypeRows || [], // 灯具类型配置数组
      totalFlux: Number(calculation.totalFlux || 0), // 总光通量

      // 根据照度计算灯具的字段
      targetLux: Number(calculation.targetLux || 0), // 目标照度
      lampFlux: Number(calculation.lampFlux || 0), // 单灯光通量

      // 计算结果
      avgLux: Number(calculation.avgLux || 0), // 平均照度
      calcLampCount: Number(calculation.calcLampCount || 0), // 计算的灯具数量
      avgPowerPerArea: Number(calculation.avgPowerPerArea || 0), // 单位面积平均功率

      // 价格信息
      lampUnitPrice: Number(calculation.lampUnitPrice || 0), // 灯具单价
      totalPrice: Number(calculation.totalPrice || 0), // 灯具总价

      // 元数据
      calculationType: calculation.calculationType || 'manual', // 计算类型：manual/template
      templateId: calculation.templateId || '', // 模板ID（如果使用模板）
      notes: calculation.notes || '', // 备注说明

      // 状态和标记
      status: 'active', // 状态：active/archived/shared
      isShared: Boolean(calculation.isShared || false), // 是否已分享
      shareCode: '', // 分享码

      // 时间戳
      createdAt: now,
      updatedAt: now,
      isDelete: 0
    }

    const db = cloud.database()
    const col = db.collection('calculations')

    // 创建集合（如果不存在）
    try {
      await col.count()
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try {
          await db.createCollection('calculations')
        } catch (_) {}
      } else {
        throw e
      }
    }

    // 保存计算记录
    const addRes = await col.add({ data: calcData })
    const id = addRes && addRes._id ? addRes._id : ''

    // 生成分享码（如果需要分享）
    if (calcData.isShared) {
      const shareCode = `SHARE${now.toString(36).toUpperCase()}`
      await col.doc(id).update({
        data: {
          shareCode,
          updatedAt: now
        }
      })
      calcData.shareCode = shareCode
    }

    // 获取保存的完整数据
    const saved = id ? (await col.doc(id).get()).data : calcData

    return {
      success: true,
      code: 'OK',
      data: saved,
      message: '照明计算记录创建成功'
    }

  } catch (err) {
    console.error('calc_create error:', err)
    return {
      success: false,
      code: 'CALC_CREATE_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}