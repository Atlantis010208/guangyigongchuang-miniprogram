/**
 * 云函数 getPhoneNumber
 * 功能：获取用户手机号并保存到数据库
 *       新增：自动检查白名单并激活课程授权和工具包授权
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
 *   - whitelistActivated: boolean 是否激活了课程白名单授权
 *   - toolkitWhitelistActivated: boolean 是否激活了工具包白名单授权
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 生成订单号
 * 格式：时间戳_随机字母（与商城订单格式保持一致）
 * 例如：1766027958353_qeuoze
 */
function generateOrderNo() {
  const timestamp = Date.now()
  // 生成 6 位随机字母数字
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${timestamp}_${random}`
}

/**
 * 生成手机号匹配列表
 * 支持多种格式：纯号码、带国家码（不带+）、带国家码（带+）
 * @param {string} phoneNumber 微信返回的完整手机号（如 +8613800138000）
 * @param {string} purePhoneNumber 微信返回的纯手机号（如 13800138000）
 * @param {string} countryCode 微信返回的国家码（如 86）
 * @returns {string[]} 可能的匹配格式列表
 */
function generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode) {
  const matchList = []
  
  // 纯手机号（不带国家码）
  if (purePhoneNumber) {
    matchList.push(purePhoneNumber)
  }
  
  // 带国家码（不带+号）- 境外手机号白名单存储格式
  if (countryCode && purePhoneNumber) {
    matchList.push(`${countryCode}${purePhoneNumber}`)
  }
  
  // 完整格式（带+号）
  if (phoneNumber && phoneNumber.startsWith('+')) {
    matchList.push(phoneNumber)
    // 也尝试不带+号的版本
    matchList.push(phoneNumber.substring(1))
  }
  
  // 去重
  return [...new Set(matchList)]
}

/**
 * 检查并激活白名单授权
 * 静默执行，不影响主流程
 * 支持境外手机号匹配
 * 
 * @param {string} phoneNumber 用户手机号
 * @param {string} purePhoneNumber 纯手机号（不带国家码）
 * @param {string} countryCode 国家码（如 86、852）
 * @param {string} openid 用户 openid
 * @param {string} userId 用户 _id
 * @returns {object} { activated, whitelistId, orderId }
 */
async function checkAndActivateWhitelist(phoneNumber, purePhoneNumber, countryCode, openid, userId) {
  const db = cloud.database()
  const _ = db.command
  
  // 生成所有可能的匹配格式
  const phoneMatchList = generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode)
  
  console.log('[白名单检查] 开始检查手机号，匹配列表:', phoneMatchList.map(p => p.substring(0, 3) + '****'))
  
  try {
    // 1. 查询白名单中是否有该手机号的待激活记录（支持多种格式匹配）
    const whitelistRes = await db.collection('course_whitelist')
      .where({
        phone: _.in(phoneMatchList),
        status: 'pending'
      })
      .limit(10) // 一个手机号可能对应多个课程
      .get()
    
    if (!whitelistRes.data || whitelistRes.data.length === 0) {
      console.log('[白名单检查] 未找到待激活的白名单记录')
      return { activated: false }
    }
    
    console.log('[白名单检查] 找到待激活记录:', whitelistRes.data.length, '条')
    
    const now = Date.now()
    let activatedCount = 0
    
    // 2. 为每条白名单记录创建订单并更新状态
    for (const whitelist of whitelistRes.data) {
      try {
        // 2.1 检查是否已经有该课程的订单（幂等性保证）
        const existingOrderRes = await db.collection('orders')
          .where({
            userId: openid,
            category: 'course',
            status: _.in(['paid', 'completed']),
            isDelete: _.neq(1),
            'params.items': _.elemMatch({
              id: whitelist.courseId
            })
          })
          .limit(1)
          .get()
        
        if (existingOrderRes.data && existingOrderRes.data.length > 0) {
          console.log('[白名单激活] 用户已有该课程订单，跳过:', whitelist.courseId)
          
          // 更新白名单状态为已激活（关联到已有订单）
          await db.collection('course_whitelist').doc(whitelist._id).update({
            data: {
              status: 'activated',
              activatedAt: now,
              activatedUserId: openid,
              orderId: existingOrderRes.data[0]._id,
              orderNo: existingOrderRes.data[0].orderNo,
              updatedAt: now
            }
          })
          activatedCount++
          continue
        }
        
        // 2.2 创建课程订单
        const orderNo = generateOrderNo()
        const orderDoc = {
          orderNo,
          userId: openid,
          _openid: openid,
          category: 'course',
          status: 'completed', // 直接完成，无需支付
          totalPrice: 0,
          paidPrice: 0,
          params: {
            items: [{
              id: whitelist.courseId,
              courseId: whitelist.courseId,
              name: whitelist.courseName || '灯光设计课',
              category: 'course',
              type: 'course',
              price: 0,
              quantity: 1
            }]
          },
          // 白名单订单标记
          source: 'whitelist',
          whitelistId: whitelist._id,
          whitelistPhone: phoneNumber,
          // 时间戳
          paidAt: now,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
          isDelete: 0
        }
        
        const orderAddRes = await db.collection('orders').add({ data: orderDoc })
        const orderId = orderAddRes._id
        
        console.log('[白名单激活] 订单已创建:', orderNo, '课程:', whitelist.courseId)
        
        // 2.3 更新白名单状态
        await db.collection('course_whitelist').doc(whitelist._id).update({
          data: {
            status: 'activated',
            activatedAt: now,
            activatedUserId: openid,
            orderId,
            orderNo,
            updatedAt: now
          }
        })
        
        console.log('[白名单激活] 白名单记录已更新为激活状态')
        activatedCount++
        
      } catch (itemErr) {
        console.error('[白名单激活] 处理单条记录失败:', whitelist._id, itemErr.message)
        // 继续处理下一条，不中断整个流程
      }
    }
    
    return {
      activated: activatedCount > 0,
      activatedCount,
      totalFound: whitelistRes.data.length
    }
    
  } catch (err) {
    console.error('[白名单检查] 执行失败:', err.message)
    // 白名单检查失败不影响主流程
    return { activated: false, error: err.message }
  }
}

/**
 * 检查并激活工具包白名单授权
 * 静默执行，不影响主流程
 * 支持境外手机号匹配
 * 
 * @param {string} phoneNumber 用户手机号
 * @param {string} purePhoneNumber 纯手机号（不带国家码）
 * @param {string} countryCode 国家码（如 86、852）
 * @param {string} openid 用户 openid
 * @param {string} userId 用户 _id
 * @returns {object} { activated, whitelistId, orderId }
 */
async function checkAndActivateToolkitWhitelist(phoneNumber, purePhoneNumber, countryCode, openid, userId) {
  const db = cloud.database()
  const _ = db.command
  
  // 生成所有可能的匹配格式
  const phoneMatchList = generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode)
  
  console.log('[工具包白名单检查] 开始检查手机号，匹配列表:', phoneMatchList.map(p => p.substring(0, 3) + '****'))
  
  try {
    // 1. 查询白名单中是否有该手机号的待激活记录（支持多种格式匹配）
    const whitelistRes = await db.collection('toolkit_whitelist')
      .where({
        phone: _.in(phoneMatchList),
        status: 'pending'
      })
      .limit(10) // 一个手机号可能对应多个工具包
      .get()
    
    if (!whitelistRes.data || whitelistRes.data.length === 0) {
      console.log('[工具包白名单检查] 未找到待激活的白名单记录')
      return { activated: false }
    }
    
    console.log('[工具包白名单检查] 找到待激活记录:', whitelistRes.data.length, '条')
    
    const now = Date.now()
    let activatedCount = 0
    
    // 2. 为每条白名单记录创建订单并更新状态
    for (const whitelist of whitelistRes.data) {
      try {
        // 2.1 检查是否已经有该工具包的订单（幂等性保证）
        const existingOrderRes = await db.collection('orders')
          .where({
            userId: openid,
            category: 'toolkit',
            status: _.in(['paid', 'completed']),
            isDelete: _.neq(1),
            'params.items': _.elemMatch({
              id: whitelist.toolkitId
            })
          })
          .limit(1)
          .get()
        
        if (existingOrderRes.data && existingOrderRes.data.length > 0) {
          console.log('[工具包白名单激活] 用户已有该工具包订单，跳过:', whitelist.toolkitId)
          
          // 更新白名单状态为已激活（关联到已有订单）
          await db.collection('toolkit_whitelist').doc(whitelist._id).update({
            data: {
              status: 'activated',
              activatedAt: now,
              activatedUserId: openid,
              orderId: existingOrderRes.data[0]._id,
              orderNo: existingOrderRes.data[0].orderNo,
              updatedAt: now
            }
          })
          activatedCount++
          continue
        }
        
        // 2.2 创建工具包订单
        const orderNo = generateOrderNo()
        const orderDoc = {
          orderNo,
          userId: openid,
          _openid: openid,
          category: 'toolkit',
          status: 'completed', // 直接完成，无需支付
          totalPrice: 0,
          paidPrice: 0,
          params: {
            items: [{
              id: whitelist.toolkitId,
              toolkitId: whitelist.toolkitId,
              name: whitelist.toolkitName || '灯光设计工具包',
              category: 'toolkit',
              type: 'toolkit',
              price: 0,
              quantity: 1
            }]
          },
          // 白名单订单标记
          source: 'whitelist',
          whitelistType: 'toolkit', // 区分课程白名单和工具包白名单
          whitelistId: whitelist._id,
          whitelistPhone: phoneNumber,
          // 时间戳
          paidAt: now,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
          isDelete: 0
        }
        
        const orderAddRes = await db.collection('orders').add({ data: orderDoc })
        const orderId = orderAddRes._id
        
        console.log('[工具包白名单激活] 订单已创建:', orderNo, '工具包:', whitelist.toolkitId)
        
        // 2.3 更新白名单状态
        await db.collection('toolkit_whitelist').doc(whitelist._id).update({
          data: {
            status: 'activated',
            activatedAt: now,
            activatedUserId: openid,
            orderId,
            orderNo,
            updatedAt: now
          }
        })
        
        console.log('[工具包白名单激活] 白名单记录已更新为激活状态')
        activatedCount++
        
      } catch (itemErr) {
        console.error('[工具包白名单激活] 处理单条记录失败:', whitelist._id, itemErr.message)
        // 继续处理下一条，不中断整个流程
      }
    }
    
    return {
      activated: activatedCount > 0,
      activatedCount,
      totalFound: whitelistRes.data.length
    }
    
  } catch (err) {
    console.error('[工具包白名单检查] 执行失败:', err.message)
    // 白名单检查失败不影响主流程
    return { activated: false, error: err.message }
  }
}

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
    let whitelistResult = null
    let toolkitWhitelistResult = null
    
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
          const _ = db.command
          const purePhone = phoneInfo.purePhoneNumber || phoneInfo.phoneNumber.replace(/^\+86/, '')

          // ========== 新增：手机号去重检查 ==========
          // 检查该手机号是否已被其他用户使用（排除已删除的用户）
          const phoneCheckRes = await col.where({
            purePhoneNumber: purePhone,
            _openid: _.neq(openid),  // 排除当前用户
            isDelete: _.neq(1)       // 排除已删除的用户
          }).limit(1).get()

          if (phoneCheckRes && phoneCheckRes.data && phoneCheckRes.data.length > 0) {
            const otherUser = phoneCheckRes.data[0]
            console.log('[手机号去重] 手机号已被其他用户使用:', {
              phone: purePhone.substring(0, 3) + '****' + purePhone.substring(7),
              otherUserId: otherUser._id,
              currentOpenid: openid
            })
            
            return {
              success: false,
              code: 'PHONE_ALREADY_USED',
              errorMessage: '该手机号已被其他账号绑定，如有疑问请联系客服',
              phoneInfo,
              existingUserId: otherUser._id
            }
          }
          console.log('[手机号去重] 检查通过，手机号可用')
          // ==========================================

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
          // 注意：手机号去重检查已在上方完成
          if (!existingUser && openid) {
            console.log('用户记录不存在，尝试创建新记录')
            const addRes = await col.add({
              data: {
                _openid: openid,
                nickname: '',
                avatarUrl: '',
                phoneNumber: phoneInfo.phoneNumber,
                purePhoneNumber: purePhone,
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
            
            // ========== 新增：白名单激活检查 ==========
            // 保存手机号成功后，检查并激活白名单授权
            // 支持境外手机号：使用完整手机号、纯手机号和国家码进行多格式匹配
            const fullPhone = phoneInfo.phoneNumber || ''
            const purePhone = phoneInfo.purePhoneNumber || phoneInfo.phoneNumber.replace(/^\+86/, '')
            const countryCode = phoneInfo.countryCode || '86'
            
            console.log('[getPhoneNumber] 白名单匹配参数:', {
              fullPhone: fullPhone.substring(0, 5) + '****',
              purePhone: purePhone.substring(0, 3) + '****',
              countryCode
            })
            
            // 1. 课程白名单激活（支持多格式匹配）
            whitelistResult = await checkAndActivateWhitelist(
              fullPhone,
              purePhone,
              countryCode,
              openid, 
              existingUser._id
            )
            
            if (whitelistResult.activated) {
              console.log('[getPhoneNumber] 课程白名单激活成功:', whitelistResult)
            }
            
            // 2. 工具包白名单激活（支持多格式匹配）
            toolkitWhitelistResult = await checkAndActivateToolkitWhitelist(
              fullPhone,
              purePhone,
              countryCode,
              openid, 
              existingUser._id
            )
            
            if (toolkitWhitelistResult.activated) {
              console.log('[getPhoneNumber] 工具包白名单激活成功:', toolkitWhitelistResult)
            }
            // ========================================
            
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
      user,
      // 新增：白名单激活结果
      whitelistActivated: whitelistResult ? whitelistResult.activated : false,
      whitelistInfo: whitelistResult,
      // 新增：工具包白名单激活结果
      toolkitWhitelistActivated: toolkitWhitelistResult ? toolkitWhitelistResult.activated : false,
      toolkitWhitelistInfo: toolkitWhitelistResult
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
