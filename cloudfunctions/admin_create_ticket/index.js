/**
 * 云函数：admin_create_ticket
 * 功能：为后台管理员签发 CloudBase 自定义登录 ticket
 *
 * 注意：tcb_custom_login.json 必须是 CloudBase 控制台当前有效的自定义登录私钥。
 * 每次重新生成私钥后，旧私钥会在约 2 小时后失效，需要重新部署本函数。
 */
const cloudbase = require('@cloudbase/node-sdk')
const path = require('path')

const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'cloud1-5gb9c5u2c58ad6d7'

let credentials = null
try {
  credentials = require(path.join(__dirname, 'tcb_custom_login.json'))
} catch (error) {
  console.error('[admin_create_ticket] 无法加载自定义登录私钥:', error.message)
}

function normalizeTicketError(error) {
  const message = error && error.message ? error.message : String(error || '')

  if (/私钥|private.?key|key/i.test(message)) {
    return {
      code: 'CUSTOM_LOGIN_KEY_INVALID',
      errorMessage: '自定义登录私钥无效或已过期，请重新生成私钥并部署 admin_create_ticket 云函数'
    }
  }

  return {
    code: 'TICKET_ERROR',
    errorMessage: message || '创建自定义登录凭证失败'
  }
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

    if (!credentials) {
      return {
        success: false,
        code: 'CUSTOM_LOGIN_KEY_MISSING',
        errorMessage: '自定义登录私钥文件不存在，请部署 tcb_custom_login.json'
      }
    }

    const app = cloudbase.init({
      env: ENV_ID,
      credentials
    })

    const ticket = app.auth().createTicket(customUserId, {
      refresh: 3600 * 1000,
      expire: 24 * 3600 * 1000
    })

    console.log('[admin_create_ticket] Ticket 创建成功:', {
      customUserId,
      privateKeyId: credentials.private_key_id,
      ticketLength: ticket.length
    })

    return {
      success: true,
      code: 'OK',
      ticket
    }
  } catch (error) {
    const normalized = normalizeTicketError(error)
    console.error('[admin_create_ticket] 创建 Ticket 失败:', {
      code: normalized.code,
      message: error && error.message
    })

    return {
      success: false,
      ...normalized
    }
  }
}
