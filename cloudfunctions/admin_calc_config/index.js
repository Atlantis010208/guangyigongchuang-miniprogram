/**
 * 云函数：admin_calc_config
 * 功能：照度计算页面配置管理（获取/更新）
 * 权限：仅管理员
 * 
 * 支持的操作：
 * - get: 获取完整配置
 * - update: 更新完整配置
 * - update_mode: 更新单个计算方式配置
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 集合名称
const COLLECTION_NAME = 'calc_page_config'
// 文档 ID
const DOC_ID = 'global_config'

/**
 * 获取默认配置
 * 当数据库中不存在配置时使用
 */
function getDefaultConfig() {
  return {
    _id: DOC_ID,
    modes: {
      count: {
        title: '按照度算灯具',
        subtitle: '已知单一空间灯具数量，反推单盏灯所需亮度参数\n*仅限单一灯具类型',
        bgImage: ''
      },
      quantity: {
        title: '按数量算灯具',
        subtitle: '已知单一空间目标照度/亮度，反推所需灯具数量\n*仅限单一灯具类型',
        bgImage: ''
      },
      lux: {
        title: '按灯具算照度(Pro版)',
        subtitle: '已知灯具参数和数量，计算整体照度/亮度是否符合国家标准\n*适合复杂灯具组合',
        bgImage: ''
      }
    },
    roomTypes: [
      { name: '客厅', lux: 200 },
      { name: '餐厅', lux: 150 },
      { name: '卫生间', lux: 100 },
      { name: '主卧', lux: 100 },
      { name: '次卧', lux: 100 },
      { name: '衣帽间', lux: 150 },
      { name: '阳台', lux: 75 },
      { name: '厨房', lux: 150 },
      { name: '自定义', lux: 0 }
    ],
    colorOptions: [
      { name: '浅色', factor: 0.9 },
      { name: '木质类', factor: 0.8 },
      { name: '细腻深色', factor: 0.5 },
      { name: '粗糙深色', factor: 0.2 }
    ],
    maintenanceOptions: [
      { name: '干净', value: 0.8 },
      { name: '一般', value: 0.7 },
      { name: '污染', value: 0.6 }
    ],
    lampTypes: [
      { id: 'lamp_1', name: '反灯槽灯带', displayName: '反灯槽灯带', powerW: 10, efficacy: 80, sourceUtil: 0.15, order: 0 },
      { id: 'lamp_2', name: '正灯槽灯带', displayName: '正灯槽灯带', powerW: 10, efficacy: 80, sourceUtil: 0.30, order: 1 },
      { id: 'lamp_3', name: '线性灯', displayName: '线性灯', powerW: 10, efficacy: 80, sourceUtil: 0.80, order: 2 },
      { id: 'lamp_4', name: '射灯', displayName: '射灯', powerW: 3, efficacy: 65, sourceUtil: 0.95, order: 3 },
      { id: 'lamp_5', name: '筒灯', displayName: '筒灯', powerW: 7, efficacy: 65, sourceUtil: 0.95, order: 4 },
      { id: 'lamp_6', name: '吊灯', displayName: '吊灯', powerW: 25, efficacy: 80, sourceUtil: 0.90, order: 5 },
      { id: 'lamp_7', name: '装饰灯', displayName: '装饰灯', powerW: 10, efficacy: 80, sourceUtil: 0.90, order: 6 }
    ],
    updatedAt: new Date(),
    updatedBy: ''
  }
}

/**
 * 获取配置
 */
async function getConfig() {
  try {
    const res = await db.collection(COLLECTION_NAME).doc(DOC_ID).get()
    return res.data
  } catch (err) {
    // 文档不存在，返回默认配置
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      console.log('[admin_calc_config] 配置不存在，返回默认配置')
      return getDefaultConfig()
    }
    throw err
  }
}

/**
 * 更新完整配置
 */
async function updateConfig(data, userId) {
  const updateData = {
    ...data,
    updatedAt: new Date(),
    updatedBy: userId
  }
  
  // 移除 _id 字段（不允许更新）
  delete updateData._id
  
  try {
    // 尝试更新
    const res = await db.collection(COLLECTION_NAME).doc(DOC_ID).update({
      data: updateData
    })
    
    if (res.stats.updated === 0) {
      // 文档不存在，创建新文档
      console.log('[admin_calc_config] 配置不存在，创建新配置')
      await db.collection(COLLECTION_NAME).add({
        data: {
          _id: DOC_ID,
          ...getDefaultConfig(),
          ...updateData
        }
      })
    }
    
    return { success: true }
  } catch (err) {
    // 文档不存在，创建新文档
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      console.log('[admin_calc_config] 配置不存在，创建新配置')
      await db.collection(COLLECTION_NAME).add({
        data: {
          _id: DOC_ID,
          ...getDefaultConfig(),
          ...updateData
        }
      })
      return { success: true }
    }
    throw err
  }
}

/**
 * 更新单个计算方式的配置
 */
async function updateModeConfig(mode, config, userId) {
  if (!['count', 'quantity', 'lux'].includes(mode)) {
    throw new Error('无效的计算方式')
  }
  
  const updateData = {
    [`modes.${mode}`]: config,
    updatedAt: new Date(),
    updatedBy: userId
  }
  
  try {
    const res = await db.collection(COLLECTION_NAME).doc(DOC_ID).update({
      data: updateData
    })
    
    if (res.stats.updated === 0) {
      // 文档不存在，先创建默认配置再更新
      const defaultConfig = getDefaultConfig()
      defaultConfig.modes[mode] = { ...defaultConfig.modes[mode], ...config }
      defaultConfig.updatedAt = new Date()
      defaultConfig.updatedBy = userId
      
      await db.collection(COLLECTION_NAME).add({
        data: defaultConfig
      })
    }
    
    return { success: true }
  } catch (err) {
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      const defaultConfig = getDefaultConfig()
      defaultConfig.modes[mode] = { ...defaultConfig.modes[mode], ...config }
      defaultConfig.updatedAt = new Date()
      defaultConfig.updatedBy = userId
      
      await db.collection(COLLECTION_NAME).add({
        data: defaultConfig
      })
      return { success: true }
    }
    throw err
  }
}

/**
 * 初始化配置（如果不存在）
 */
async function initConfigIfNotExist() {
  try {
    await db.collection(COLLECTION_NAME).doc(DOC_ID).get()
    console.log('[admin_calc_config] 配置已存在')
  } catch (err) {
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      console.log('[admin_calc_config] 初始化默认配置')
      const defaultConfig = getDefaultConfig()
      await db.collection(COLLECTION_NAME).add({
        data: defaultConfig
      })
    }
  }
}

exports.main = async (event) => {
  try {
    const { action = 'get', data, mode, config } = event
    
    // 公开接口：获取帮助视频配置（不需要管理员权限）
    if (action === 'get_help_video') {
      const configData = await getConfig()
      // 只返回视频相关配置
      const helpVideos = {
        count: configData.modes?.count?.helpVideo || '',
        quantity: configData.modes?.quantity?.helpVideo || '',
        lux: configData.modes?.lux?.helpVideo || ''
      }
      return {
        success: true,
        code: 'OK',
        data: helpVideos,
        message: '获取帮助视频配置成功'
      }
    }
    
    // 以下操作需要管理员权限
    // 权限验证
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_calc_config] 权限验证失败:', authResult.errorCode)
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const userId = authResult.user?._id || ''
    
    switch (action) {
      case 'get':
        // 获取配置
        const configData = await getConfig()
        return {
          success: true,
          code: 'OK',
          data: configData,
          message: '获取配置成功'
        }
        
      case 'update':
        // 更新完整配置
        if (!data || typeof data !== 'object') {
          return {
            success: false,
            code: 'INVALID_PARAMS',
            errorMessage: '缺少配置数据'
          }
        }
        await updateConfig(data, userId)
        return {
          success: true,
          code: 'OK',
          message: '配置更新成功'
        }
        
      case 'update_mode':
        // 更新单个计算方式配置
        if (!mode || !config) {
          return {
            success: false,
            code: 'INVALID_PARAMS',
            errorMessage: '缺少参数'
          }
        }
        await updateModeConfig(mode, config, userId)
        return {
          success: true,
          code: 'OK',
          message: '模式配置更新成功'
        }
        
      case 'init':
        // 初始化配置
        await initConfigIfNotExist()
        return {
          success: true,
          code: 'OK',
          message: '配置初始化完成'
        }
        
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: `不支持的操作: ${action}`
        }
    }
    
  } catch (err) {
    console.error('[admin_calc_config] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
