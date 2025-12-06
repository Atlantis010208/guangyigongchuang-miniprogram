/**
 * 云函数 getPhoneNumber
 * 功能：获取用户手机号并保存到数据库
 * 
 * 入参：
 *   - code: 手机号授权 code（必填）
 *   - saveToDb: boolean 是否保存到数据库（默认 true）
 * 
 * 返回：
 *   - success: boolean
 *   - code: 状态码
 *   - phoneInfo: 手机号信息（包含 phoneNumber, purePhoneNumber, countryCode）
 *   - user: 更新后的用户文档（如果 saveToDb 为 true）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const { code, saveToDb = true } = event || {}
    
    if (!code) {
      return { 
        success: false, 
        code: 'MISSING_CODE', 
        errorMessage: '缺少授权码，请重新授权' 
      }
    }

    // 调用微信开放接口获取手机号
    let phoneInfo = null
    try {
      const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
      phoneInfo = res && res.phoneInfo ? res.phoneInfo : null
    } catch (apiErr) {
      console.error('调用 getPhoneNumber 接口失败:', apiErr)
      return { 
        success: false, 
        code: 'API_ERROR', 
        errorMessage: '获取手机号失败，请重试' 
      }
    }

    if (!phoneInfo || !phoneInfo.phoneNumber) {
      return { 
        success: false, 
        code: 'PHONE_NOT_FOUND', 
        errorMessage: '未能获取到手机号' 
      }
    }

    // 如果需要保存到数据库
    let user = null
    if (saveToDb) {
      const ctx = cloud.getWXContext()
      const openid = ctx.OPENID || ctx.openid || ''
      // 也可以从前端传入 userId 作为备用
      const userIdFromEvent = event && event.userId ? event.userId : ''

      console.log('getPhoneNumber 开始保存，openid:', openid, 'userId:', userIdFromEvent)

      if (openid || userIdFromEvent) {
        const db = cloud.database()
        const col = db.collection('users')
        const now = Date.now()

        const updateData = {
          phoneNumber: phoneInfo.phoneNumber,
          purePhoneNumber: phoneInfo.purePhoneNumber || '',
          countryCode: phoneInfo.countryCode || '',
          updatedAt: now
        }

        try {
          let existingUser = null

          // 方法1：通过 _openid 查询
          if (openid) {
            const queryRes = await col.where({ _openid: openid }).limit(1).get()
            console.log('通过 _openid 查询结果:', queryRes && queryRes.data ? queryRes.data.length : 0, '条')
            if (queryRes && queryRes.data && queryRes.data.length) {
              existingUser = queryRes.data[0]
            }
          }

          // 方法2：如果 _openid 查询失败，尝试用 userId
          if (!existingUser && userIdFromEvent) {
            try {
              const docRes = await col.doc(userIdFromEvent).get()
              console.log('通过 userId 查询结果:', docRes && docRes.data ? '找到' : '未找到')
              if (docRes && docRes.data) {
                existingUser = { ...docRes.data, _id: userIdFromEvent }
              }
            } catch (docErr) {
              console.warn('通过 userId 查询失败:', docErr.message)
            }
          }

          // 方法3：如果都找不到，尝试创建一条新记录
          if (!existingUser && openid) {
            console.log('用户记录不存在，尝试创建新记录')
            const addRes = await col.add({
              data: {
                _openid: openid,
                nickname: '',
                avatarUrl: '',
                phoneNumber: phoneInfo.phoneNumber,
                purePhoneNumber: phoneInfo.purePhoneNumber || '',
                countryCode: phoneInfo.countryCode || '',
                roles: 1,
                createdAt: now,
                updatedAt: now
              }
            })
            if (addRes && addRes._id) {
              existingUser = { _id: addRes._id, _openid: openid, phoneNumber: phoneInfo.phoneNumber }
              console.log('新用户记录已创建:', addRes._id)
            }
          }

          if (existingUser && existingUser._id) {
            // 更新手机号
            await col.doc(existingUser._id).update({ data: updateData })

            // 获取更新后的用户文档
            const refreshed = await col.doc(existingUser._id).get()
            user = refreshed && refreshed.data ? refreshed.data : existingUser
            if (!user._id) {
              user._id = existingUser._id
            }
            
            console.log('手机号已保存到用户记录:', { 
              userId: existingUser._id, 
              phone: phoneInfo.phoneNumber.substring(0, 3) + '****' + phoneInfo.phoneNumber.substring(7) 
            })
          } else {
            console.warn('无法保存手机号：未能找到或创建用户记录')
          }
        } catch (dbErr) {
          console.error('保存手机号到数据库失败:', dbErr)
        }
      }
    }

    return { 
      success: true, 
      code: 'OK', 
      phoneInfo,
      user
    }
  } catch (err) {
    console.error('getPhoneNumber 云函数执行失败:', err)
    return { 
      success: false, 
      code: 'PHONE_FAILED', 
      errorMessage: err && err.message ? err.message : '获取手机号失败' 
    }
  }
}
