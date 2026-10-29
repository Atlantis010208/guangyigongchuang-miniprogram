/**
 * 云函数：virtual_categories
 * 功能：小程序端获取虚拟商品分类列表（专业商城分类栏数据源）
 * 权限：公开（无需鉴权）
 *
 * 返回：{ success: true, data: { categories: string[] }, source? }
 *   查询失败或集合为空时降级为默认分类，保证商城分类栏始终可用。
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 降级默认分类（集合为空或查询失败时使用），与后台 admin_virtual_categories 保持一致
const DEFAULT_CATEGORIES = ['设计服务', '资料工具', 'CAD图纸', '3D模型', '材质贴图', '计算工具', '其他资源']

// 分类栏可展示的最大数量
const MAX_CATEGORIES = 100

/**
 * 清洗分类文档：去掉空名称、首尾空格与重名，保持后台配置的排序。
 * @param {Array<object>} docs virtual_categories 集合文档
 * @returns {Array<string>} 可直接渲染的分类名列表
 */
function normalizeCategoryNames(docs) {
  const names = []
  const seen = new Set()

  docs.forEach((doc) => {
    const name = doc && typeof doc.name === 'string' ? doc.name.trim() : ''
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  })

  return names
}

exports.main = async () => {
  try {
    const res = await db.collection('virtual_categories')
      .where({ isDelete: _.neq(1) })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'asc')
      .limit(MAX_CATEGORIES)
      .get()

    const categories = normalizeCategoryNames(res.data || [])

    if (categories.length === 0) {
      return {
        success: true,
        data: { categories: DEFAULT_CATEGORIES },
        total: DEFAULT_CATEGORIES.length,
        source: 'default'
      }
    }

    return {
      success: true,
      data: { categories },
      total: categories.length,
      source: 'database'
    }
  } catch (error) {
    console.error('[virtual_categories] 查询失败:', error)
    return {
      success: true,
      data: { categories: DEFAULT_CATEGORIES },
      total: DEFAULT_CATEGORIES.length,
      source: 'fallback',
      error: error.message
    }
  }
}
