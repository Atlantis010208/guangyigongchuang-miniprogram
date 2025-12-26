/**
 * 云函数：admin_login
 * 功能：管理员/设计师登录验证，生成自定义登录 ticket
 * 
 * 支持两种角色登录：
 * 1. 管理员：从 admin_accounts 集合验证
 * 2. 设计师：从 designers 集合验证（hasAccount=true）
 * 
 * 入参：
 *   - username: string 用户名
 *   - password: string 密码
 * 
 * 返回：
 *   - success: boolean
 *   - code: 状态码
 *   - ticket: 自定义登录 ticket（成功时返回）
 *   - user: 用户信息（成功时返回）
 *   - adminToken: Base64 编码的认证 token
 */
const cloud = require('wx-server-sdk')
const bcrypt = require('bcryptjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { username, password } = event || {}

    // 参数验证
    if (!username || !password) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请输入用户名和密码'
      }
    }

    console.log('[admin_login] 登录尝试:', { username })

    let user = null
    let userType = null  // 'admin' 或 'designer'
    let designerId = null

    // ========== 1. 先查询 admin_accounts 集合（管理员）==========
    const adminRes = await db.collection('admin_accounts')
      .where({ username: username })
      .limit(1)
      .get()

    if (adminRes.data && adminRes.data.length > 0) {
      const admin = adminRes.data[0]
      
      // 检查是否被禁用
      if (admin.isDelete === 1) {
        return {
          success: false,
          code: 'USER_DISABLED',
          errorMessage: '账号已被停用'
        }
      }

      // 验证密码（bcrypt）
      const passwordValid = await bcrypt.compare(password, admin.password)
      if (!passwordValid) {
        console.log('[admin_login] 管理员密码验证失败:', { username })
        return {
          success: false,
          code: 'INVALID_CREDENTIALS',
          errorMessage: '用户名或密码错误'
        }
      }

      user = admin
      userType = 'admin'
    }

    // ========== 2. 如果管理员未找到，查询 designers 集合 ==========
    if (!user) {
      const designerRes = await db.collection('designers')
        .where({ 
          username: username,
          hasAccount: true
        })
        .limit(1)
        .get()

      if (designerRes.data && designerRes.data.length > 0) {
        const designer = designerRes.data[0]
        
        // 检查是否被禁用
        if (designer.isDelete === 1) {
          return {
            success: false,
            code: 'USER_DISABLED',
            errorMessage: '账号已被停用'
          }
        }

        // 验证密码
        const passwordValid = await bcrypt.compare(password, designer.password)
        if (!passwordValid) {
          console.log('[admin_login] 设计师密码验证失败:', { username })
          return {
            success: false,
            code: 'INVALID_CREDENTIALS',
            errorMessage: '用户名或密码错误'
          }
        }

        user = designer
        userType = 'designer'
        designerId = designer._id
      }
    }

    // ========== 3. 兼容旧的 users 集合登录（管理员 roles=0）==========
    if (!user) {
      const userRes = await db.collection('users')
        .where(_.or([
          { username: username },
          { phoneNumber: username },
          { email: username }
        ]))
        .limit(1)
        .get()

      if (userRes.data && userRes.data.length > 0) {
        const oldUser = userRes.data[0]
        
        // 检查用户是否被禁用
        if (oldUser.isDelete === 1) {
          return {
            success: false,
            code: 'USER_DISABLED',
            errorMessage: '账号已被禁用'
          }
        }

        // 验证管理员权限（roles: 0 = 管理员）
        if (oldUser.roles !== 0) {
          console.log('[admin_login] 非管理员用户尝试登录:', { username, roles: oldUser.roles })
          return {
            success: false,
            code: 'FORBIDDEN',
            errorMessage: '无后台登录权限'
          }
        }

        // 验证密码（兼容明文和哈希）
        let passwordValid = false
        if (oldUser.passwordHash && oldUser.salt) {
          const crypto = require('crypto')
          const inputHash = crypto.createHash('sha256').update(password + oldUser.salt).digest('hex')
          passwordValid = (inputHash === oldUser.passwordHash)
        } else if (oldUser.password) {
          // 兼容明文密码
          passwordValid = (password === oldUser.password)
        }

        if (!passwordValid) {
          return {
            success: false,
            code: 'INVALID_CREDENTIALS',
            errorMessage: '用户名或密码错误'
          }
        }

        user = oldUser
        userType = 'admin'
      }
    }

    // ========== 4. 未找到用户 ==========
    if (!user) {
      console.log('[admin_login] 用户不存在:', { username })
      return {
        success: false,
        code: 'USER_NOT_FOUND',
        errorMessage: '用户名或密码错误'
      }
    }

    // ========== 5. 登录成功，生成 Token ==========
    const now = Date.now()

    // 更新最后登录时间
    const collection = userType === 'admin' 
      ? (user._openid ? 'users' : 'admin_accounts')  // 兼容 users 集合的管理员
      : 'designers'
    
    try {
      await db.collection(collection).doc(user._id).update({
        data: {
          lastLoginAt: now,
          updatedAt: now
        }
      })
    } catch (e) {
      console.log('[admin_login] 更新登录时间失败（非致命）:', e.message)
    }

    console.log('[admin_login] 登录成功:', { 
      username, 
      userId: user._id, 
      userType,
      designerId 
    })

    // 构建安全的用户信息
    const roles = userType === 'designer' ? 1 : 0
    const rolesLabel = userType === 'designer' ? '设计师' : '管理员'
    
    const safeUser = {
      _id: user._id,
      _openid: user._openid || null,
      username: user.username,
      nickname: user.nickname || user.name || user.username,
      name: user.name || user.nickname || user.username,
      avatarUrl: user.avatarUrl || user.avatar || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      email: user.email || '',
      roles: roles,
      rolesLabel: rolesLabel,
      // 设计师专属字段
      designerId: designerId,
      // 兼容字段
      role: rolesLabel.toLowerCase()
    }

    // 生成 adminToken
    const adminToken = Buffer.from(JSON.stringify({
      userId: user._id,
      openid: user._openid || null,
      roles: roles,
      designerId: designerId,
      userType: userType,
      exp: now + 24 * 60 * 60 * 1000 // 24小时后过期
    })).toString('base64')

    // 尝试生成自定义登录 ticket（可选）
    let ticket = null
    try {
      const ticketResult = await cloud.callFunction({
        name: 'admin_create_ticket',
        data: { customUserId: user._id }
      })
      if (ticketResult && ticketResult.result && ticketResult.result.success) {
        ticket = ticketResult.result.ticket
      }
    } catch (e) {
      console.log('[admin_login] 生成 ticket 失败（非致命）:', e.message)
    }

    return {
      success: true,
      code: 'OK',
      ticket: ticket,
      adminToken: adminToken,
      user: safeUser,
      message: '登录成功'
    }

  } catch (err) {
    console.error('[admin_login] 错误:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
