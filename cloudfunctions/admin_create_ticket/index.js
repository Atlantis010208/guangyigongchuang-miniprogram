/**
 * 云函数：admin_create_ticket
 * 功能：为管理员创建自定义登录 ticket
 * 
 * 注意：此函数需要使用 @cloudbase/node-sdk 来生成 ticket
 * 需要在云函数目录中放置 tcb_custom_login.json 凭证文件
 * 
 * 入参：
 *   - customUserId: string 用户自定义 ID（用户的 _id）
 * 
 * 返回：
 *   - success: boolean
 *   - ticket: 自定义登录 ticket
 */
const cloudbase = require('@cloudbase/node-sdk')
const path = require('path')

// 使用环境变量或固定环境 ID
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'

// 加载自定义登录凭证
let credentials = null
try {
  credentials = require(path.join(__dirname, 'tcb_custom_login.json'))
} catch (e) {
  console.error('[admin_create_ticket] 无法加载凭证文件:', e.message)
}

exports.main = async (event) => {
  try {
    const { customUserId } = event || {}

    if (!customUserId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少用户 ID'
      }
    }

    // 检查凭证是否加载成功
    if (!credentials) {
      console.error('[admin_create_ticket] 凭证文件未加载')
      return {
        success: false,
        code: 'CREDENTIALS_ERROR',
        errorMessage: '服务配置错误，请联系管理员'
      }
    }

    // 初始化 CloudBase Node SDK，添加自定义登录凭证
    const app = cloudbase.init({
      env: ENV_ID,
      credentials: credentials
    })

    // 创建自定义登录 ticket
    // refresh 参数表示 token 刷新间隔（毫秒），设置为 1 小时
    // expire 参数表示 ticket 有效期（毫秒），设置为 24 小时
    const ticket = app.auth().createTicket(customUserId, {
      refresh: 3600 * 1000,      // 1小时刷新
      expire: 24 * 3600 * 1000   // 24小时过期
    })

    console.log('[admin_create_ticket] Ticket 创建成功:', { customUserId })

    return {
      success: true,
      code: 'OK',
      ticket
    }

  } catch (err) {
    console.error('[admin_create_ticket] 错误:', err)
    return {
      success: false,
      code: 'TICKET_ERROR',
      errorMessage: err.message || '创建 ticket 失败'
    }
  }
}
