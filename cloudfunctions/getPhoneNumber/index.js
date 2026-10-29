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
const phoneUtils = require('./common/phone')

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
  return phoneUtils.generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode)
}

function generatePhoneMatchListLegacy(phoneNumber, purePhoneNumber, countryCode) {
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

async function findUserByIdentity(db, _, openid) {
  const result = await db.collection('users')
    .where(_.or([
      { _openid: openid },
      { openid },
      { alternateOpenids: openid }
    ]))
    .limit(1)
    .get()
  return result.data && result.data[0] || null
}

async function getDocument(collectionName, id) {
  if (!id) return null
  try {
    const result = await cloud.database().collection(collectionName).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function findOrCreateDesigner(db, _, openid, user, whitelist, phoneMatchList) {
  let designer = await getDocument('designers', whitelist.designerId || user.designerId)
  if (designer && designer.isDelete !== 1) return designer

  const conditions = [
    { _openid: openid, isDelete: _.neq(1) },
    { openid, isDelete: _.neq(1) },
    { userId: user._id, isDelete: _.neq(1) }
  ]
  if (phoneMatchList.length > 0) {
    conditions.push({ phone: _.in(phoneMatchList), isDelete: _.neq(1) })
    conditions.push({ phoneNumber: _.in(phoneMatchList), isDelete: _.neq(1) })
  }
  const existing = await db.collection('designers').where(_.or(conditions)).limit(1).get()
  designer = existing.data && existing.data[0]
  if (designer) return designer

  const timestamp = Date.now()
  const data = {
    _openid: openid,
    openid,
    userId: user._id,
    whitelistId: whitelist._id,
    name: whitelist.name || user.nickname || user.name || '设计师',
    title: '专业灯光设计',
    avatar: user.avatarUrl || user.avatar || '',
    bio: '',
    intro: '',
    experience: 0,
    styles: '',
    specialties: [],
    spaceType: [],
    phone: user.phoneNumber || user.purePhoneNumber || whitelist.phone || '',
    wechat: '',
    rating: 5,
    projects: 0,
    portfolioCount: 0,
    isDelete: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const added = await db.collection('designers').add({ data })
  return Object.assign({ _id: added._id }, data)
}

async function activateDesignerWhitelist(phoneNumber, purePhoneNumber, countryCode, openid, user) {
  const db = cloud.database()
  const _ = db.command
  const phoneMatchList = generatePhoneMatchList(phoneNumber, purePhoneNumber, countryCode)
  if (!openid || !user || !user._id || phoneMatchList.length === 0) {
    return { certified: false, activated: false }
  }

  const result = await db.collection('designer_whitelist')
    .where(_.or([
      { status: 'active', phone: _.in(phoneMatchList) },
      { status: 'active', purePhoneNumber: _.in(phoneMatchList) },
      { status: 'active', fullPhoneNumber: _.in(phoneMatchList) },
      { status: 'active', activatedOpenid: openid },
      { status: 'active', userId: user._id }
    ]))
    .limit(1)
    .get()
  const whitelist = result.data && result.data[0]
  if (!whitelist) return { certified: false, activated: false }

  const designer = await findOrCreateDesigner(db, _, openid, user, whitelist, phoneMatchList)
  const timestamp = Date.now()
  const userUpdate = {
    designerId: designer._id,
    designerWhitelistId: whitelist._id,
    designerCertified: true,
    identitySelected: true,
    availableRoles: ['owner', 'designer'],
    updatedAt: timestamp
  }
  if (user.roles !== 0) userUpdate.roles = 2

  await Promise.all([
    db.collection('users').doc(user._id).update({ data: userUpdate }),
    db.collection('designer_whitelist').doc(whitelist._id).update({
      data: {
        userId: user._id,
        designerId: designer._id,
        activatedOpenid: openid,
        activatedAt: whitelist.activatedAt || timestamp,
        updatedAt: timestamp
      }
    }),
    db.collection('designers').doc(designer._id).update({
      data: {
        _openid: openid,
        openid,
        userId: user._id,
        whitelistId: whitelist._id,
        updatedAt: timestamp
      }
    })
  ])

  return {
    certified: true,
    activated: true,
    whitelistId: whitelist._id,
    designerId: designer._id
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
    let designerWhitelistResult = null
    
    if (saveToDb) {
      const ctx = cloud.getWXContext()
      const openid = ctx.OPENID || ctx.openid || ''

      if (!openid) {
        return { success: false, code: 'UNAUTHORIZED', errorMessage: '无法获取可信用户身份' }
      }

      console.log('getPhoneNumber 开始保存，openid:', openid)

      if (openid) {
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
          const phoneParts = phoneUtils.getPhoneParts(phoneInfo.phoneNumber, phoneInfo.purePhoneNumber, phoneInfo.countryCode)
          const purePhone = phoneParts.purePhone || ''

          existingUser = await findUserByIdentity(db, _, openid)

          // 检查该手机号是否已被其他有效用户使用。
          const phoneCheckRes = await col.where({
            purePhoneNumber: purePhone,
            isDelete: _.neq(1)
          }).limit(10).get()

          const otherUser = phoneCheckRes && phoneCheckRes.data
            ? phoneCheckRes.data.find(item => !existingUser || item._id !== existingUser._id)
            : null
          if (otherUser) {
            console.log('[手机号去重] 手机号已被其他用户使用:', {
              phone: purePhone.substring(0, 3) + '****' + purePhone.substring(7),
              otherUserId: otherUser._id,
              currentOpenid: openid
            })
            
            return {
              success: false,
              code: 'PHONE_ALREADY_USED',
              errorMessage: '该手机号已被其他账号绑定，如有疑问请联系客服',
              phoneInfo
            }
          }
          console.log('[手机号去重] 检查通过，手机号可用')
          // ==========================================

          // 当前微信身份没有账号时才创建；业主端已有账号会直接复用。
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
            const phoneParts = phoneUtils.getPhoneParts(phoneInfo.phoneNumber, phoneInfo.purePhoneNumber, phoneInfo.countryCode)
            const fullPhone = phoneParts.phoneNumber || ''
            const purePhone = phoneParts.purePhone || ''
            const countryCode = phoneParts.countryCode || '86'
            
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

            designerWhitelistResult = await activateDesignerWhitelist(
              fullPhone,
              purePhone,
              countryCode,
              openid,
              user
            )
            if (designerWhitelistResult.certified) {
              const latestUser = await col.doc(existingUser._id).get()
              user = latestUser && latestUser.data ? latestUser.data : user
            }
            // ========================================
            
          } else {
            console.warn('无法保存手机号：未能找到或创建用户记录')
          }
        } catch (dbErr) {
          console.error('保存手机号到数据库失败:', dbErr)
          return {
            success: false,
            code: 'PHONE_SAVE_FAILED',
            errorMessage: '手机号保存失败，请重试'
          }
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
      toolkitWhitelistInfo: toolkitWhitelistResult,
      designerCertified: designerWhitelistResult ? designerWhitelistResult.certified : false,
      designerCertification: designerWhitelistResult
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
