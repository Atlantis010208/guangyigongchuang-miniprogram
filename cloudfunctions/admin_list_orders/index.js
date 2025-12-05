const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''

    // TODO: 在这里添加管理员权限验证
    // 例如：检查 openid 是否在管理员白名单中
    const adminWhitelist = ['o8ItW5Hccz2uiBkbXSODWHFjc0wk']
    if (!adminWhitelist.includes(openid)) {
      return { success: false, code: 'FORBIDDEN', errorMessage: 'No permission' }
    }

    const db = cloud.database()
    const { collection, filters = {}, limit = 100, offset = 0 } = event

    if (!collection || !['orders', 'requests'].includes(collection)) {
      return { success: false, code: 'INVALID_COLLECTION', errorMessage: 'Invalid collection' }
    }

    const col = db.collection(collection)
    let query = col.where({ isDelete: 0 })

    // 支持按状态、类型等过滤
    if (filters.status) query = query.where({ status: filters.status })
    if (filters.category) query = query.where({ category: filters.category })
    if (filters.type) query = query.where({ type: filters.type })

    const result = await query
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get()

    return {
      success: true,
      code: 'OK',
      data: result.data || [],
      total: result.data.length
    }
  } catch (err) {
    return {
      success: false,
      code: 'ADMIN_LIST_FAILED',
      errorMessage: err && err.message ? err.message : 'unknown error'
    }
  }
}
