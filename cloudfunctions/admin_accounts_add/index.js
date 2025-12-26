/**
 * 云函数：admin_accounts_add
 * 功能：添加后台账号（管理员或设计师）
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
  // 排除容易混淆的字符：0, O, o, 1, l, I
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
      console.log('[admin_accounts_add] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      accountType,  // 'admin' 或 'designer'
      username,
      password,     // 自定义密码（可选）
      name,
      designerId    // 设计师类型必填
    } = event
    
    // 参数验证
    if (!accountType || !['admin', 'designer'].includes(accountType)) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请选择账号类型'
      }
    }
    
    if (!username || username.length < 2) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '用户名至少2个字符'
      }
    }
    
    // 验证自定义密码格式（如果提供）
    if (password) {
      if (password.length < 6) {
        return {
          success: false,
          code: 'INVALID_PARAMS',
          errorMessage: '密码不少于6位'
        }
      }
      if (!/^[A-Z]/.test(password)) {
        return {
          success: false,
          code: 'INVALID_PARAMS',
          errorMessage: '密码首字母必须是大写字母'
        }
      }
    }
    
    if (!name) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请输入姓名'
      }
    }
    
    if (accountType === 'designer' && !designerId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请选择设计师'
      }
    }
    
    // 检查用户名唯一性（跨 admin_accounts 和 designers）
    const adminCheck = await db.collection('admin_accounts')
      .where({ username: username })
      .count()
    
    if (adminCheck.total > 0) {
      return {
        success: false,
        code: 'USERNAME_EXISTS',
        errorMessage: '用户名已存在'
      }
    }
    
    const designerCheck = await db.collection('designers')
      .where({ username: username, hasAccount: true })
      .count()
    
    if (designerCheck.total > 0) {
      return {
        success: false,
        code: 'USERNAME_EXISTS',
        errorMessage: '用户名已存在'
      }
    }
    
    // 使用自定义密码或生成随机密码
    const plainPassword = password || generatePassword(8)
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    
    const now = Date.now()
    let accountId = null
    
    if (accountType === 'admin') {
      // 创建管理员账号
      const result = await db.collection('admin_accounts').add({
        data: {
          username: username,
          password: hashedPassword,
          name: name,
          roles: 0,
          isDelete: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: authResult.user._id
        }
      })
      accountId = result._id
      
    } else {
      // 更新设计师账号信息
      // 先检查设计师是否已有账号
      const designerRes = await db.collection('designers').doc(designerId).get()
      
      if (!designerRes.data) {
        return {
          success: false,
          code: 'DESIGNER_NOT_FOUND',
          errorMessage: '设计师不存在'
        }
      }
      
      if (designerRes.data.hasAccount) {
        return {
          success: false,
          code: 'DESIGNER_HAS_ACCOUNT',
          errorMessage: '该设计师已有登录账号'
        }
      }
      
      await db.collection('designers').doc(designerId).update({
        data: {
          username: username,
          password: hashedPassword,
          hasAccount: true,
          updatedAt: now
        }
      })
      accountId = designerId
    }
    
    console.log('[admin_accounts_add] 账号创建成功:', {
      accountType,
      username,
      accountId
    })
    
    return {
      success: true,
      code: 'OK',
      data: {
        accountId: accountId,
        username: username,
        password: plainPassword  // 仅返回一次
      },
      message: '账号创建成功'
    }
    
  } catch (err) {
    console.error('[admin_accounts_add] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

