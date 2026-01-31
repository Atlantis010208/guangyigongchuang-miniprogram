/**
 * 云函数：get_calc_config
 * 功能：获取照度计算页面配置（小程序端只读）
 * 权限：公开接口，无需权限验证
 * 
 * 返回值：
 * - success: 是否成功
 * - data: 配置数据
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
    ]
  }
}

exports.main = async (event, context) => {
  try {
    // 尝试从数据库获取配置
    let configData = null
    
    try {
      const res = await db.collection(COLLECTION_NAME).doc(DOC_ID).get()
      configData = res.data
      console.log('[get_calc_config] 从数据库获取配置成功')
    } catch (err) {
      // 文档不存在，使用默认配置
      console.log('[get_calc_config] 配置不存在，使用默认配置')
      configData = getDefaultConfig()
    }
    
    // 移除管理字段，只返回前端需要的数据
    if (configData) {
      delete configData.updatedAt
      delete configData.updatedBy
    }
    
    return {
      success: true,
      code: 'OK',
      data: configData || getDefaultConfig(),
      message: '获取配置成功'
    }
    
  } catch (err) {
    console.error('[get_calc_config] Error:', err)
    
    // 出错时返回默认配置，保证小程序端可用
    return {
      success: true,
      code: 'FALLBACK',
      data: getDefaultConfig(),
      message: '使用默认配置'
    }
  }
}
