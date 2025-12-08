/**
 * 用户设置操作云函数
 * 支持操作：get（获取设置）、update（更新设置）、reset（重置为默认）
 * 
 * 入参 event:
 *   - action: string, 操作类型
 *   - settings: object, 设置内容（update 时使用）
 * 
 * 返回值:
 *   - success: boolean
 *   - code: string
 *   - message: string
 *   - data: any
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 默认设置配置
const DEFAULT_SETTINGS = {
  // 通知设置
  orderNotification: true,       // 订单状态通知
  promotionNotification: false,  // 优惠活动通知
  deviceNotification: true,      // 设备状态通知
  
  // 隐私设置
  allowDataCollection: true,     // 允许数据收集
  allowPersonalization: true,    // 允许个性化推荐
  
  // 显示设置
  theme: 'system',               // 主题：system/light/dark
  fontSize: 'medium',            // 字体大小：small/medium/large
  
  // 其他设置
  language: 'zh_CN',             // 语言
  autoPlayVideo: true            // 自动播放视频
}

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID

  // 验证用户身份
  if (!OPENID) {
    return {
      success: false,
      code: 'MISSING_OPENID',
      errorMessage: '缺少用户身份信息',
      timestamp: Date.now()
    }
  }

  try {
    const { action } = event

    // 验证操作类型
    if (!action) {
      return {
        success: false,
        code: 'MISSING_ACTION',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    // 根据操作类型分发处理
    switch (action) {
      case 'get':
        return await getSettings(OPENID)
      case 'update':
        return await updateSettings(OPENID, event)
      case 'reset':
        return await resetSettings(OPENID)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('用户设置操作异常:', error)
    return {
      success: false,
      code: 'SETTINGS_ERROR',
      errorMessage: error.message || '设置操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 获取用户设置
 * @param {string} userId - 用户 openid
 */
async function getSettings(userId) {
  try {
    // 确保集合存在
    await ensureCollection('user_settings')

    // 查询用户设置
    const res = await db.collection('user_settings')
      .where({ userId })
      .limit(1)
      .get()

    if (res.data && res.data.length > 0) {
      const userSettings = res.data[0]
      // 合并默认设置，确保新增的设置项有默认值
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...userSettings.settings
      }
      
      return {
        success: true,
        code: 'OK',
        message: '获取设置成功',
        data: {
          settings: mergedSettings,
          updatedAt: userSettings.updatedAt
        },
        timestamp: Date.now()
      }
    }

    // 用户没有设置记录，返回默认设置
    return {
      success: true,
      code: 'OK',
      message: '返回默认设置',
      data: {
        settings: DEFAULT_SETTINGS,
        isDefault: true
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('获取用户设置失败:', error)
    throw error
  }
}

/**
 * 更新用户设置
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数（包含 settings 对象）
 */
async function updateSettings(userId, event) {
  try {
    const { settings } = event

    // 验证设置内容
    if (!settings || typeof settings !== 'object') {
      return {
        success: false,
        code: 'INVALID_SETTINGS',
        errorMessage: '设置内容无效',
        timestamp: Date.now()
      }
    }

    // 过滤和验证设置字段（只允许更新已知的设置项）
    const validSettings = {}
    const allowedKeys = Object.keys(DEFAULT_SETTINGS)
    
    for (const key of allowedKeys) {
      if (settings.hasOwnProperty(key)) {
        validSettings[key] = settings[key]
      }
    }

    // 确保集合存在
    await ensureCollection('user_settings')

    const now = Date.now()

    // 查询是否已有设置记录
    const existRes = await db.collection('user_settings')
      .where({ userId })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      // 更新现有记录
      const existingSettings = existRes.data[0].settings || {}
      const mergedSettings = {
        ...existingSettings,
        ...validSettings
      }

      await db.collection('user_settings')
        .doc(existRes.data[0]._id)
        .update({
          data: {
            settings: mergedSettings,
            updatedAt: now
          }
        })

      console.log('更新用户设置成功:', { userId, updatedKeys: Object.keys(validSettings) })

      return {
        success: true,
        code: 'OK',
        message: '设置已保存',
        data: {
          settings: mergedSettings,
          updatedAt: now
        },
        timestamp: Date.now()
      }

    } else {
      // 创建新记录
      const newSettings = {
        ...DEFAULT_SETTINGS,
        ...validSettings
      }

      const addRes = await db.collection('user_settings').add({
        data: {
          userId,
          settings: newSettings,
          createdAt: now,
          updatedAt: now
        }
      })

      console.log('创建用户设置成功:', { userId, settingsId: addRes._id })

      return {
        success: true,
        code: 'OK',
        message: '设置已保存',
        data: {
          settings: newSettings,
          settingsId: addRes._id,
          updatedAt: now
        },
        timestamp: Date.now()
      }
    }

  } catch (error) {
    console.error('更新用户设置失败:', error)
    throw error
  }
}

/**
 * 重置用户设置为默认值
 * @param {string} userId - 用户 openid
 */
async function resetSettings(userId) {
  try {
    // 确保集合存在
    await ensureCollection('user_settings')

    const now = Date.now()

    // 查询是否已有设置记录
    const existRes = await db.collection('user_settings')
      .where({ userId })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      // 重置为默认设置
      await db.collection('user_settings')
        .doc(existRes.data[0]._id)
        .update({
          data: {
            settings: DEFAULT_SETTINGS,
            updatedAt: now
          }
        })

      console.log('重置用户设置成功:', { userId })
    }

    return {
      success: true,
      code: 'OK',
      message: '设置已重置',
      data: {
        settings: DEFAULT_SETTINGS,
        updatedAt: now
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('重置用户设置失败:', error)
    throw error
  }
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try {
        await db.createCollection(collectionName)
        console.log('创建集合成功:', collectionName)
      } catch (createErr) {
        // 可能已被其他请求创建，忽略错误
        console.log('创建集合忽略:', createErr.message)
      }
    }
  }
}
