/**
 * 云函数：check_designer_whitelist
 * 功能：验证手机号是否在设计师白名单中
 * 调用方：小程序端（设计师登录流程）
 * 
 * 入参：
 *   - phone: 手机号
 * 
 * 出参：
 *   - success: boolean
 *   - isDesigner: boolean（是否在白名单中）
 *   - message: 提示信息
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, code: 'UNAUTHORIZED', message: '未授权访问' }
  }

  const { phone } = event

  if (!phone) {
    return { success: false, isDesigner: false, message: '缺少手机号参数' }
  }

  try {
    const db = cloud.database()

    // 标准化手机号：去除前缀
    let normalizedPhone = String(phone).trim().replace(/[\s\-()]/g, '')
    if (normalizedPhone.startsWith('+86')) normalizedPhone = normalizedPhone.substring(3)
    if (normalizedPhone.startsWith('86') && normalizedPhone.length === 13) normalizedPhone = normalizedPhone.substring(2)

    // 查询设计师白名单
    const res = await db.collection('designer_whitelist')
      .where({
        phone: normalizedPhone,
        status: 'active'
      })
      .limit(1)
      .get()

    if (res.data && res.data.length > 0) {
      // 在白名单中，同时更新用户角色为设计师
      const userRes = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        // 管理员(roles=0)不覆盖角色
        if (user.roles !== 0) {
          await db.collection('users').doc(user._id).update({
            data: {
              roles: 2,
              identitySelected: true,
              updatedAt: Date.now()
            }
          })
        } else {
          // 管理员只标记 identitySelected
          await db.collection('users').doc(user._id).update({
            data: {
              identitySelected: true,
              updatedAt: Date.now()
            }
          })
        }
      }

      return {
        success: true,
        isDesigner: true,
        message: '验证通过，您是认证设计师'
      }
    } else {
      return {
        success: true,
        isDesigner: false,
        message: '您的手机号不在设计师白名单中，请联系管理员开通设计师权限'
      }
    }

  } catch (err) {
    console.error('[check_designer_whitelist] Error:', err)
    return {
      success: false,
      isDesigner: false,
      message: err.message || '验证失败，请稍后重试'
    }
  }
}
