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

async function getDocument(db, collectionName, id) {
  if (!id) return null
  try {
    const result = await db.collection(collectionName).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function revokeLinkedUser(db, _, whitelist) {
  const conditions = []
  if (whitelist.userId) conditions.push({ _id: whitelist.userId })
  if (whitelist.activatedOpenid) {
    conditions.push({ _openid: whitelist.activatedOpenid })
    conditions.push({ openid: whitelist.activatedOpenid })
    conditions.push({ alternateOpenids: whitelist.activatedOpenid })
  }
  if (conditions.length === 0) return false

  const userResult = await db.collection('users').where(_.or(conditions)).limit(1).get()
  const user = userResult.data && userResult.data[0]
  if (!user || user.roles === 0) return false

  const activeConditions = [{ status: 'active', userId: user._id }]
  if (whitelist.activatedOpenid) {
    activeConditions.push({ status: 'active', activatedOpenid: whitelist.activatedOpenid })
  }
  const remaining = await db.collection('designer_whitelist')
    .where(_.or(activeConditions))
    .limit(1)
    .get()
  if (remaining.data && remaining.data.length > 0) return false

  const data = {
    designerCertified: false,
    identitySelected: true,
    availableRoles: ['owner'],
    designerId: _.remove(),
    designerWhitelistId: _.remove(),
    updatedAt: Date.now()
  }
  if (user.roles === 2) data.roles = 1
  await db.collection('users').doc(user._id).update({ data })
  return true
}

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
    const targets = []
    if (whitelistId) {
      const record = await getDocument(db, 'designer_whitelist', whitelistId)
      if (record) targets.push(record)
    } else if (whitelistIds && Array.isArray(whitelistIds) && whitelistIds.length > 0) {
      for (const id of [...new Set(whitelistIds)]) {
        const record = await getDocument(db, 'designer_whitelist', id)
        if (record) targets.push(record)
      }
    } else if (phone) {
      const result = await db.collection('designer_whitelist').where({ phone }).limit(100).get()
      targets.push(...(result.data || []))
    } else {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '请指定要删除的记录'
      }
    }

    let deletedCount = 0
    let revokedUserCount = 0
    for (const target of targets) {
      try {
        await db.collection('designer_whitelist').doc(target._id).remove()
        deletedCount++
        if (await revokeLinkedUser(db, _, target)) revokedUserCount++
      } catch (error) {
        console.error('[admin_designer_whitelist_remove] 删除或撤权失败:', target._id, error.message)
      }
    }
    
    return {
      success: true,
      code: 'OK',
      data: { deletedCount, revokedUserCount },
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
