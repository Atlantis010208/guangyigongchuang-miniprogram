/**
 * 照明计算工具函数库
 * 
 * 用途：提供统一的照明计算逻辑，确保免费版和付费版的计算结果完全一致
 * 创建时间：2026-01-14
 */

/**
 * 数值转换工具函数
 * 将输入值转换为数字，如果无效则返回 0
 * @param {any} value - 输入值
 * @returns {number} 转换后的数字
 */
function toNum(value) {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 计算平均照度
 * 公式：平均照度 = (总光通量 × 利用系数 × 维护系数) / 面积
 * 
 * 说明：
 * - 总光通量：所有灯具的总光通量之和（已包含光源利用率）
 * - 利用系数：考虑空间反射和光分布的光利用效率（0-1）
 * - 维护系数：考虑灯具老化、积尘等因素的维护效率（0-1）
 * - 面积：房间面积（平方米）
 * 
 * @param {number} totalFlux - 总光通量（流明，lm）
 * @param {number} area - 房间面积（平方米，㎡）
 * @param {number} utilFactor - 利用系数（0-1）
 * @param {number} maintenanceFactor - 维护系数（0-1）
 * @returns {number} 平均照度（勒克斯，lx），四舍五入取整
 * 
 * @example
 * // 总光通量 1440 Lm，面积 9 ㎡，利用系数 0.8，维护系数 0.8
 * calcAvgLux(1440, 9, 0.8, 0.8) // 返回 102
 */
export function calcAvgLux(totalFlux, area, utilFactor, maintenanceFactor) {
  const flux = toNum(totalFlux)
  const a = toNum(area)
  const uf = toNum(utilFactor)
  const mf = toNum(maintenanceFactor)
  
  // 边界检查：任一参数为 0 或负数，返回 0
  if (flux <= 0 || a <= 0 || uf <= 0 || mf <= 0) {
    return 0
  }
  
  // 计算：平均照度 = (总光通量 × 利用系数 × 维护系数) / 面积
  // 使用 Math.round 进行四舍五入取整
  return Math.round((flux * uf * mf) / a)
}

/**
 * 计算灯具数量
 * 公式：N = (目标照度 × 面积) / (UF × MF × 单灯光通量)
 * 
 * @param {number} targetLux - 目标照度（勒克斯，lx）
 * @param {number} area - 房间面积（平方米，㎡）
 * @param {number} utilFactor - 利用系数（0-1）
 * @param {number} maintenanceFactor - 维护系数（0-1）
 * @param {number} lampFlux - 单灯光通量（流明，lm）
 * @returns {number} 灯具数量（套），向上取整
 * 
 * @example
 * calcLampCount(200, 30, 0.8, 0.8, 500) // 返回 15
 */
export function calcLampCount(targetLux, area, utilFactor, maintenanceFactor, lampFlux) {
  const lux = toNum(targetLux)
  const a = toNum(area)
  const uf = toNum(utilFactor)
  const mf = toNum(maintenanceFactor)
  const flux = toNum(lampFlux)
  
  // 边界检查：任一参数为 0 或负数，返回 0
  if (lux <= 0 || a <= 0 || uf <= 0 || mf <= 0 || flux <= 0) {
    return 0
  }
  
  // 计算并向上取整
  return Math.ceil((lux * a) / (uf * mf * flux))
}

/**
 * 计算单位面积平均功率
 * 公式：P = (灯具数量 × 单灯功率) / 面积
 * 
 * @param {number} lampCount - 灯具数量（套）
 * @param {number} lampPower - 单灯功率（瓦特，W）
 * @param {number} area - 房间面积（平方米，㎡）
 * @returns {number} 单位面积平均功率（W/㎡），保留 2 位小数
 * 
 * @example
 * calcAvgPowerPerArea(15, 7, 30) // 返回 3.50
 */
export function calcAvgPowerPerArea(lampCount, lampPower, area) {
  const count = toNum(lampCount)
  const power = toNum(lampPower)
  const a = toNum(area)
  
  // 边界检查：面积或灯具数量为 0，返回 0
  if (a <= 0 || count <= 0) {
    return 0
  }
  
  // 计算并保留 2 位小数
  return Number(((count * power) / a).toFixed(2))
}

/**
 * 汇总灯具总光通量
 * 公式：灯具的单灯总通光量 = 功率 × 发光效率 × 数量 × 光源利用率
 * 
 * 说明：
 * - 发光效率（efficacy）：灯具将电能转换为光能的效率（lm/W）
 *   反灯槽/正灯槽/线性灯/吊灯/装饰灯：80 lm/W
 *   筒灯/射灯：65 lm/W
 * 
 * - 光源利用率（sourceUtil）：考虑灯具结构和照明方式的光损失
 *   筒灯/射灯（直接照明无灯罩）：0.95
 *   线性灯/吊灯/装饰灯（直接照明带灯罩）：0.80-0.90
 *   正灯槽灯带（1次反射）：0.30
 *   反灯槽灯带（2次反射）：0.15
 * 
 * @param {Array} lampTypeRows - 灯具类型数组
 * @param {number} lampTypeRows[].powerW - 功率（瓦特，W）
 * @param {number} lampTypeRows[].efficacy - 发光效率（lm/W）
 * @param {number} lampTypeRows[].lengthQty - 米数/数量
 * @param {number} lampTypeRows[].sourceUtil - 光源利用率（0-1）
 * @returns {number} 总光通量（流明，lm），向下取整
 * 
 * @example
 * const lamps = [
 *   { powerW: 10, efficacy: 80, lengthQty: 5, sourceUtil: 0.8 },  // 线性灯
 *   { powerW: 7, efficacy: 65, lengthQty: 3, sourceUtil: 0.95 }   // 筒灯
 * ]
 * calcTotalFlux(lamps) // 返回 3200 + 1366 = 4566
 */
export function calcTotalFlux(lampTypeRows) {
  if (!Array.isArray(lampTypeRows)) {
    return 0
  }
  
  const totalFlux = lampTypeRows.reduce((sum, item) => {
    const power = toNum(item.powerW)
    const efficacy = toNum(item.efficacy)
    const lengthQty = toNum(item.lengthQty)
    const sourceUtil = toNum(item.sourceUtil)
    
    // 计算单个灯具的光通量
    const itemFlux = power * efficacy * lengthQty * sourceUtil
    
    return sum + itemFlux
  }, 0)
  
  // 向下取整
  return Math.round(totalFlux)
}

/**
 * 获取默认灯具参数
 * 根据《建筑照明设计标准》及实际经验分类
 * 
 * @returns {Array} 灯具类型数组
 */
export function getDefaultLampTypes() {
  return [
    // 直射重点照明 (75%)
    { category: '直射重点照明', name: '射灯', displayName: '射灯', powerW: 7, efficacy: 65, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    { category: '直射重点照明', name: '磁吸射灯', displayName: '磁吸射灯', powerW: 7, efficacy: 65, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    { category: '直射重点照明', name: '格栅灯', displayName: '格栅灯', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    
    // 直接基础照明 (70%)
    { category: '直接基础照明', name: '筒灯', displayName: '筒灯', powerW: 7, efficacy: 65, lengthQty: '', sourceUtil: 0.70, flux: 0 },
    { category: '直接基础照明', name: '吸顶灯', displayName: '吸顶灯', powerW: 24, efficacy: 80, lengthQty: '', sourceUtil: 0.70, flux: 0 },
    { category: '直接基础照明', name: '平板灯', displayName: '平板灯', powerW: 24, efficacy: 80, lengthQty: '', sourceUtil: 0.70, flux: 0 },
    { category: '直接基础照明', name: '面板灯', displayName: '面板灯', powerW: 24, efficacy: 80, lengthQty: '', sourceUtil: 0.70, flux: 0 },
    
    // 间接基础照明 (35%)
    { category: '间接基础照明', name: '正灯槽', displayName: '正灯槽', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.35, flux: 0 },
    { category: '间接基础照明', name: '下发光灯槽', displayName: '下发光灯槽', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.35, flux: 0 },
    { category: '间接基础照明', name: '双眼皮灯带', displayName: '双眼皮灯带', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.35, flux: 0 },
    
    // 间接氛围照明 (20%)
    { category: '间接氛围照明', name: '反灯槽', displayName: '反灯槽', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.20, flux: 0 },
    { category: '间接氛围照明', name: '悬浮灯带', displayName: '悬浮灯带', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.20, flux: 0 },
    { category: '间接氛围照明', name: '窗帘灯带', displayName: '窗帘灯带', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.20, flux: 0 },
    { category: '间接氛围照明', name: '踢脚线灯带', displayName: '踢脚线灯带', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.20, flux: 0 },
    
    // 近距离任务照明 (85%)
    { category: '近距离任务照明', name: '柜体灯', displayName: '柜体灯', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.85, flux: 0 },
    { category: '近距离任务照明', name: '层板灯', displayName: '层板灯', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.85, flux: 0 },
    { category: '近距离任务照明', name: '书桌灯', displayName: '书桌灯', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.85, flux: 0 },
    
    // 装饰类直接照明 (75%)
    { category: '装饰类直接照明', name: '长条吊灯', displayName: '长条吊灯', powerW: 20, efficacy: 80, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    { category: '装饰类直接照明', name: '小吊灯', displayName: '小吊灯', powerW: 7, efficacy: 80, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    { category: '装饰类直接照明', name: '壁灯', displayName: '壁灯', powerW: 7, efficacy: 80, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    { category: '装饰类直接照明', name: '镜前灯', displayName: '镜前灯', powerW: 10, efficacy: 80, lengthQty: '', sourceUtil: 0.75, flux: 0 },
    
    // 柔光漫射照明 (60%)
    { category: '柔光漫射照明', name: '软膜天花', displayName: '软膜天花', powerW: 24, efficacy: 80, lengthQty: '', sourceUtil: 0.60, flux: 0 },
    { category: '柔光漫射照明', name: '洗墙射灯', displayName: '洗墙射灯', powerW: 7, efficacy: 65, lengthQty: '', sourceUtil: 0.60, flux: 0 },
    { category: '柔光漫射照明', name: '线性洗墙灯', displayName: '线性洗墙灯', powerW: 15, efficacy: 80, lengthQty: '', sourceUtil: 0.60, flux: 0 }
  ]
}

/**
 * 更新筒射灯标题（动态显示功率）
 * 当筒射灯的功率发生变化时，更新 displayName 字段
 * 
 * @param {Array} lampTypeRows - 灯具类型数组
 * @returns {Array} 更新后的灯具类型数组
 */
export function updateDownlightTitles(lampTypeRows) {
  if (!Array.isArray(lampTypeRows)) {
    return []
  }
  
  return lampTypeRows.map(item => {
    if (item.name === '筒灯') {
      const power = toNum(item.powerW) || 0
      return {
        ...item,
        displayName: `筒灯`
      }
    }
    if (item.name === '射灯') {
      const power = toNum(item.powerW) || 0
      return {
        ...item,
        displayName: `射灯`
      }
    }
    return item
  })
}

/**
 * 计算总价格
 * 公式：总价 = 灯具数量 × 单价
 * 
 * @param {number} lampCount - 灯具数量（套）
 * @param {number} unitPrice - 灯具单价（元）
 * @returns {number} 总价格（元），保留 2 位小数
 * 
 * @example
 * calcTotalPrice(15, 25) // 返回 375.00
 */
export function calcTotalPrice(lampCount, unitPrice) {
  const count = toNum(lampCount)
  const price = toNum(unitPrice)
  
  if (count <= 0 || price <= 0) {
    return 0
  }
  
  return Number((count * price).toFixed(2))
}

