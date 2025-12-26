/**
 * 云函数：admin_accounts_reset_password
 * 功能：重置账号密码
 * 权限：仅管理员（roles=0）
 */
const cloud = require('wx-server-sdk')
const bcrypt = require('bcryptjs')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 生成随机密码（8位，包含大小写字母和数字）
 */
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

exports.main = async (event) => {
  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_accounts_reset_password] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      accountId,
      accountType,  // 'admin' 或 'designer'
      newPassword   // 可选：手动指定的新密码
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
    
    // 生成或使用指定的密码
    const plainPassword = newPassword || generatePassword(8)
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    
    const now = Date.now()
    const collection = accountType === 'admin' ? 'admin_accounts' : 'designers'
    
    // 更新密码
    await db.collection(collection).doc(accountId).update({
      data: {
        password: hashedPassword,
        updatedAt: now
      }
    })
    
    console.log('[admin_accounts_reset_password] 密码重置成功:', {
      accountId,
      accountType
    })
    
    return {
      success: true,
      code: 'OK',
      data: {
        newPassword: plainPassword  // 仅返回一次
      },
      message: '密码重置成功'
    }
    
  } catch (err) {
    console.error('[admin_accounts_reset_password] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

