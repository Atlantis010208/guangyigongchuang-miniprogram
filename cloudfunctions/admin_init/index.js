/**
 * 云函数：admin_init
 * 功能：初始化管理员账号
 * 
 * 注意：此函数仅在系统首次部署时使用，用于创建第一个管理员账号
 * 为安全起见，如果已存在管理员账号，此函数将拒绝执行
 * 
 * 入参：
 *   - username: string 管理员用户名
 *   - password: string 管理员密码
 *   - nickname: string 管理员昵称（可选）
 *   - forceCreate: boolean 强制创建（即使已有管理员，也可以创建新的）
 * 
 * 返回：
 *   - success: boolean
 *   - code: 状态码
 *   - user: 创建的管理员信息
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 生成随机盐值
function generateSalt() {
  return crypto.randomBytes(16).toString('hex')
}

// 密码哈希
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

exports.main = async (event) => {
  try {
    const { username, password, nickname, forceCreate } = event || {}

    // 参数验证
    if (!username || !password) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请提供用户名和密码'
      }
    }

    // 用户名格式验证
    if (username.length < 3 || username.length > 20) {
      return {
        success: false,
        code: 'INVALID_USERNAME',
        errorMessage: '用户名长度应为 3-20 个字符'
      }
    }

    // 密码强度验证
    if (password.length < 6) {
      return {
        success: false,
        code: 'WEAK_PASSWORD',
        errorMessage: '密码长度至少 6 个字符'
      }
    }

    // 确保 users 集合存在
    try {
      await db.collection('users').count()
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try {
          await db.createCollection('users')
          console.log('[admin_init] 已创建 users 集合')
        } catch (createErr) {
          console.warn('[admin_init] 创建 users 集合失败:', createErr)
        }
      }
    }

    // 检查是否已有管理员
    if (!forceCreate) {
      const existingAdmin = await db.collection('users')
        .where({ roles: 0, isDelete: _.neq(1) })
        .limit(1)
        .get()

      if (existingAdmin.data && existingAdmin.data.length > 0) {
        return {
          success: false,
          code: 'ADMIN_EXISTS',
          errorMessage: '已存在管理员账号，如需添加请使用 forceCreate 参数'
        }
      }
    }

    // 检查用户名是否已存在
    const existingUser = await db.collection('users')
      .where({ username: username })
      .limit(1)
      .get()

    if (existingUser.data && existingUser.data.length > 0) {
      return {
        success: false,
        code: 'USERNAME_EXISTS',
        errorMessage: '用户名已被使用'
      }
    }

    // 生成密码哈希
    const salt = generateSalt()
    const passwordHash = hashPassword(password, salt)
    const now = Date.now()

    // 创建管理员账号
    const adminData = {
      username,
      nickname: nickname || username,
      passwordHash,
      salt,
      // 同时保存明文密码用于兼容（不推荐，仅用于开发阶段）
      password: password,
      roles: 0, // 管理员角色
      avatarUrl: '',
      phoneNumber: '',
      email: '',
      isDelete: 0,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    }

    const addRes = await db.collection('users').add({ data: adminData })

    if (!addRes._id) {
      return {
        success: false,
        code: 'CREATE_FAILED',
        errorMessage: '创建管理员账号失败'
      }
    }

    console.log('[admin_init] 管理员账号创建成功:', {
      userId: addRes._id,
      username
    })

    // 返回安全的用户信息（不包含密码）
    return {
      success: true,
      code: 'OK',
      user: {
        _id: addRes._id,
        username,
        nickname: nickname || username,
        roles: 0,
        rolesLabel: '管理员'
      },
      message: '管理员账号创建成功'
    }

  } catch (err) {
    console.error('[admin_init] 错误:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

