/**
 * 云函数：admin_list_orders
 * 功能：管理员查询所有订单
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_list_orders] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
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
