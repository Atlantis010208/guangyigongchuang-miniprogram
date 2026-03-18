/**
 * 云函数：admin_designer_whitelist_remove
 * 功能：移除设计师白名单记录（支持单个、批量、按手机号删除）
 * 权限：仅管理员
 * 
 * 入参（三选一）：
 *   - whitelistId: 单个白名单 _id
 *   - whitelistIds: 白名单 _id 数组（批量删除）
 *   - phone: 手机号（按手机号删除）
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - data: { deletedCount }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  try {
    // 1. 验证管理员权限
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { whitelistId, whitelistIds, phone } = event
    let deletedCount = 0
    
    if (whitelistId) {
      // 单个删除
      try {
        await db.collection('designer_whitelist').doc(whitelistId).remove()
        deletedCount = 1
      } catch (e) {
        console.error('[admin_designer_whitelist_remove] 删除失败:', e)
      }
    } else if (whitelistIds && Array.isArray(whitelistIds) && whitelistIds.length > 0) {
      // 批量删除
      for (const id of whitelistIds) {
        try {
          await db.collection('designer_whitelist').doc(id).remove()
          deletedCount++
        } catch (e) {
          console.error('[admin_designer_whitelist_remove] 批量删除单条失败:', id, e.message)
        }
      }
    } else if (phone) {
      // 按手机号删除
      const res = await db.collection('designer_whitelist')
        .where({ phone })
        .remove()
      deletedCount = res.stats ? res.stats.removed : 0
    } else {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '请指定要删除的记录'
      }
    }
    
    return {
      success: true,
      code: 'OK',
      data: { deletedCount },
      message: `成功删除 ${deletedCount} 条记录`
    }
    
  } catch (err) {
    console.error('[admin_designer_whitelist_remove] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
