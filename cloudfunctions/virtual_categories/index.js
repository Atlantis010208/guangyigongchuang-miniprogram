/**
 * 云函数：virtual_categories
 * 功能：小程序端获取虚拟商品分类列表
 * 权限：公开（无需鉴权）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 降级默认分类（集合为空或查询失败时使用）
const DEFAULT_CATEGORIES = ['设计服务', '资料工具', 'CAD图纸', '3D模型', '材质贴图', '计算工具', '其他资源']

exports.main = async (event, context) => {
  try {
    const res = await db.collection('virtual_categories')
      .where({ isDelete: _.neq(1) })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get()

    const categories = res.data || []

    if (categories.length === 0) {
      return {
        success: true,
        data: { categories: DEFAULT_CATEGORIES },
        source: 'default'
      }
    }

    return {
      success: true,
      data: { categories: categories.map(c => c.name) },
      total: categories.length
    }
  } catch (error) {
    console.error('[virtual_categories] 查询失败:', error)
    return {
      success: true,
      data: { categories: DEFAULT_CATEGORIES },
      source: 'fallback',
      error: error.message
    }
  }
}
