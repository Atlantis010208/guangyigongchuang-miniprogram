/**
 * 云函数：admin_accounts_update
 * 功能：更新后台账号（姓名、状态）
 * 权限：仅管理员（roles=0）
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_accounts_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      accountId,
      accountType,  // 'admin' 或 'designer'
      data = {}
    } = event
    
    // 参数验证
    if (!accountId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少账号ID'
      }
    }
    
    if (!accountType || !['admin', 'designer'].includes(accountType)) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '账号类型错误'
      }
    }
    
    const { name, isDelete } = data
    const now = Date.now()
    const updateData = { updatedAt: now }
    
    // 更新姓名
    if (name !== undefined) {
      updateData.name = name
    }
    
    // 更新状态（启用/停用）
    if (isDelete !== undefined) {
      // 禁止停用当前登录的账号
      if (isDelete === 1 && accountId === authResult.user._id) {
        return {
          success: false,
          code: 'CANNOT_DISABLE_SELF',
          errorMessage: '不能停用当前登录的账号'
        }
      }
      
      // 如果是管理员，检查是否是唯一的管理员
      if (accountType === 'admin' && isDelete === 1) {
        const adminCount = await db.collection('admin_accounts')
          .where({ isDelete: _.neq(1) })
          .count()
        
        if (adminCount.total <= 1) {
          return {
            success: false,
            code: 'LAST_ADMIN',
            errorMessage: '至少保留一个管理员账号'
          }
        }
      }
      
      updateData.isDelete = isDelete
    }
    
    // 执行更新
    const collection = accountType === 'admin' ? 'admin_accounts' : 'designers'
    
    await db.collection(collection).doc(accountId).update({
      data: updateData
    })
    
    console.log('[admin_accounts_update] 账号更新成功:', {
      accountId,
      accountType,
      updateData
    })
    
    return {
      success: true,
      code: 'OK',
      message: isDelete === 1 ? '账号已停用' : (isDelete === 0 ? '账号已启用' : '更新成功')
    }
    
  } catch (err) {
    console.error('[admin_accounts_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

