const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })
const db = cloud.database()
const COLLECTION = 'color_temp_config'
const DOC_ID = 'global_config'

// 有效的配置段名称
const VALID_SECTIONS = [
  'spaceTypes', 'ageGroups', 'usages', 
  'fixtures', 'secondaryFixtureOptions',
  'aiPrompt', 'pageConfig'
]

/**
 * 验证管理员身份
 */
function verifyAdmin(event) {
  const token = event._adminToken
  if (!token) {
    return { valid: false, error: '未登录' }
  }
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
    if (decoded.roles !== 0) {
      return { valid: false, error: '权限不足，仅管理员可操作' }
    }
    if (Date.now() >= decoded.exp) {
      return { valid: false, error: 'Token 已过期' }
    }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: 'Token 无效' }
  }
}

exports.main = async (event) => {
  // 验证管理员身份
  const authResult = verifyAdmin(event)
  if (!authResult.valid) {
    return { success: false, code: 'AUTH_FAILED', errorMessage: authResult.error }
  }

  const { action } = event

  try {
    switch (action) {
      case 'get':
        return await handleGet()
      case 'update':
        return await handleUpdate(event.data)
      case 'update_section':
        return await handleUpdateSection(event.section, event.data)
      case 'init':
        return await handleInit()
      default:
        return { success: false, code: 'INVALID_ACTION', errorMessage: `未知操作: ${action}` }
    }
  } catch (err) {
    console.error('admin_color_temp_config 错误:', err)
    return { success: false, code: 'SERVER_ERROR', errorMessage: err.message || '服务异常' }
  }
}

/**
 * 获取完整配置
 */
async function handleGet() {
  try {
    const { data } = await db.collection(COLLECTION).doc(DOC_ID).get()
    return { success: true, code: 'SUCCESS', data }
  } catch (err) {
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      return { success: true, code: 'NOT_FOUND', data: null, errorMessage: '配置尚未初始化' }
    }
    throw err
  }
}

/**
 * 更新完整配置（覆盖）
 */
async function handleUpdate(data) {
  if (!data || typeof data !== 'object') {
    return { success: false, code: 'INVALID_DATA', errorMessage: '数据不能为空' }
  }

  // 移除不可修改字段
  delete data._id

  data.updatedAt = new Date().toISOString()

  try {
    await db.collection(COLLECTION).doc(DOC_ID).update({ data })
    return { success: true, code: 'SUCCESS', message: '配置更新成功' }
  } catch (err) {
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      // 文档不存在，创建
      data._id = DOC_ID
      await db.collection(COLLECTION).add({ data })
      return { success: true, code: 'SUCCESS', message: '配置创建成功' }
    }
    throw err
  }
}

/**
 * 按段更新（只更新指定字段）
 */
async function handleUpdateSection(section, data) {
  if (!section || !VALID_SECTIONS.includes(section)) {
    return { 
      success: false, 
      code: 'INVALID_SECTION', 
      errorMessage: `无效的配置段: ${section}，允许: ${VALID_SECTIONS.join(', ')}` 
    }
  }

  if (data === undefined || data === null) {
    return { success: false, code: 'INVALID_DATA', errorMessage: '数据不能为空' }
  }

  const updateData = {
    [section]: data,
    updatedAt: new Date().toISOString()
  }

  try {
    await db.collection(COLLECTION).doc(DOC_ID).update({ data: updateData })
    return { success: true, code: 'SUCCESS', message: `${section} 更新成功` }
  } catch (err) {
    if (err.errCode === -1 || err.message?.includes('not exist')) {
      const newDoc = { _id: DOC_ID, ...updateData }
      await db.collection(COLLECTION).add({ data: newDoc })
      return { success: true, code: 'SUCCESS', message: `${section} 创建成功` }
    }
    throw err
  }
}

/**
 * 初始化配置（从默认数据创建）
 */
async function handleInit() {
  // 检查是否已存在
  try {
    await db.collection(COLLECTION).doc(DOC_ID).get()
    return { success: false, code: 'ALREADY_EXISTS', errorMessage: '配置已存在，无需重复初始化' }
  } catch (err) {
    // 不存在，继续初始化
  }

  const defaultData = {
    _id: DOC_ID,
    spaceTypes: [
      { id: 'living', name: '客厅', baseTemp: 3500, lux: 200, group: '起居' },
      { id: 'dining', name: '餐厅', baseTemp: 3500, lux: 150, group: '起居' },
      { id: 'master_bedroom', name: '主卧', baseTemp: 3500, lux: 100, group: '起居' },
      { id: 'second_bedroom', name: '次卧', baseTemp: 3500, lux: 100, group: '起居' },
      { id: 'kids_room', name: '儿童房', baseTemp: 4000, lux: 150, group: '起居' },
      { id: 'elder_room', name: '老人房', baseTemp: 3000, lux: 150, group: '起居' },
      { id: 'kitchen', name: '厨房', baseTemp: 4000, lux: 150, group: '功能' },
      { id: 'bathroom', name: '卫生间', baseTemp: 4000, lux: 100, group: '功能' },
      { id: 'cloakroom', name: '衣帽间', baseTemp: 4000, lux: 150, group: '功能' },
      { id: 'study', name: '书房/办公', baseTemp: 4000, lux: 300, group: '功能' },
      { id: 'balcony', name: '阳台', baseTemp: 3500, lux: 75, group: '功能' },
      { id: 'hotel_lobby', name: '酒店大堂', baseTemp: 3500, lux: 200, group: '商业' },
      { id: 'hotel_room', name: '酒店客房', baseTemp: 3500, lux: 100, group: '商业' },
      { id: 'cafe', name: '咖啡厅/茶室', baseTemp: 3000, lux: 150, group: '商业' },
      { id: 'restaurant', name: '餐饮空间', baseTemp: 3500, lux: 200, group: '商业' },
      { id: 'retail', name: '零售店铺', baseTemp: 4000, lux: 300, group: '商业' },
      { id: 'gallery', name: '展厅/画廊', baseTemp: 4000, lux: 300, group: '商业' },
      { id: 'office', name: '办公室', baseTemp: 4000, lux: 300, group: '商业' }
    ],
    ageGroups: [
      { id: 'child', name: '儿童（0-12岁）', offset: 200 },
      { id: 'youth', name: '青年（13-35岁）', offset: 0 },
      { id: 'middle', name: '中年（36-55岁）', offset: -150 },
      { id: 'elder', name: '老年（56岁以上）', offset: -300 },
      { id: 'mixed', name: '混合人群', offset: -50 }
    ],
    usages: [
      { id: 'sleep', name: '休息睡觉', offset: -300 },
      { id: 'eat', name: '吃饭聊天', offset: -200 },
      { id: 'relax', name: '看电视休闲', offset: -100 },
      { id: 'daily', name: '日常起居', offset: 0 },
      { id: 'work', name: '读书办公', offset: 300 },
      { id: 'cook', name: '做饭家务', offset: 400 }
    ],
    fixtures: [
      { id: 'basic', name: '吸顶灯 / 筒灯 / 面板灯', layer: 'basic' },
      { id: 'ambient', name: '灯带 / 壁灯 / 落地灯', layer: 'ambient' },
      { id: 'accent', name: '射灯 / 轨道灯', layer: 'accent' },
      { id: 'task', name: '台灯 / 镜前灯 / 橱柜灯', layer: 'task' }
    ],
    secondaryFixtureOptions: [
      { id: 'none', name: '没有其他灯了', layer: 'none' },
      { id: 'basic', name: '吸顶灯 / 筒灯 / 面板灯', layer: 'basic' },
      { id: 'ambient', name: '灯带 / 壁灯 / 落地灯', layer: 'ambient' },
      { id: 'accent', name: '射灯 / 轨道灯', layer: 'accent' },
      { id: 'task', name: '台灯 / 镜前灯 / 橱柜灯', layer: 'task' }
    ],
    aiPrompt: '',
    pageConfig: {
      title: '色温调节器',
      subtitle: '专业分层色温建议',
      desc: '基于空间、人群和氛围智能推荐照明方案',
      bgImage: ''
    },
    updatedAt: new Date().toISOString()
  }

  await db.collection(COLLECTION).add({ data: defaultData })
  return { success: true, code: 'SUCCESS', message: '配置初始化成功' }
}
