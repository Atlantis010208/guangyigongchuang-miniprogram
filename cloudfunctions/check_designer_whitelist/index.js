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
const phoneUtils = require('./common/phone')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 标准化手机号（与 admin_designer_whitelist_import 中的 normalizePhone 保持一致）
 * 如需修改此函数，请同步修改 admin_designer_whitelist_import/index.js 中的同名函数
 */
function normalizePhone(phone) {
  return phoneUtils.normalizePhone(phone)
}

function normalizePhoneLegacy(phone) {
  if (!phone) return ''
  let phoneStr = String(phone).trim().replace(/[\s\-()]/g, '')
  // 移除+86前缀
  if (phoneStr.startsWith('+86')) phoneStr = phoneStr.substring(3)
  if (phoneStr.startsWith('86') && phoneStr.length === 13) phoneStr = phoneStr.substring(2)
  return phoneStr
}

async function getDocument(db, collectionName, id) {
  if (!id) return null
  try {
    const result = await db.collection(collectionName).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function findOrCreateDesigner(db, _, openid, user, whitelist, phoneMatchList) {
  let designer = await getDocument(db, 'designers', whitelist.designerId || user.designerId)
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
  const result = await db.collection('designers').where(_.or(conditions)).limit(1).get()
  designer = result.data && result.data[0]
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

async function revokeDesignerRole(db, user) {
  if (!user || user.roles === 0) return
  const data = {
    designerCertified: false,
    identitySelected: true,
    availableRoles: ['owner'],
    updatedAt: Date.now()
  }
  if (user.roles === 2) data.roles = 1
  await db.collection('users').doc(user._id).update({ data })
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return { success: false, code: 'UNAUTHORIZED', isDesigner: false, message: '未授权访问' }
  }

  try {
    const db = cloud.database()
    const _ = db.command
    const userRes = await db.collection('users').where(_.or([
      { _openid: openid },
      { openid },
      { alternateOpenids: openid }
    ])).limit(1).get()
    const user = userRes.data && userRes.data[0]
    if (!user || user.isDelete === 1) {
      return { success: false, code: 'USER_NOT_FOUND', isDesigner: false, message: '用户不存在，请先登录' }
    }

    // 手机号只能来自微信身份对应的 users 记录，忽略客户端传入的 phone。
    const phoneParts = phoneUtils.getPhoneParts(
      user.phoneNumber || user.phone || '',
      user.purePhoneNumber || '',
      user.countryCode || ''
    )
    const phoneMatchList = phoneUtils.generatePhoneMatchList(
      phoneParts.phoneNumber,
      phoneParts.purePhone,
      phoneParts.countryCode
    )
    if (phoneMatchList.length === 0) {
      return { success: false, code: 'PHONE_REQUIRED', isDesigner: false, message: '请先授权手机号' }
    }

    const whitelistRes = await db.collection('designer_whitelist')
      .where(_.or([
        { status: 'active', phone: _.in(phoneMatchList) },
        { status: 'active', purePhoneNumber: _.in(phoneMatchList) },
        { status: 'active', fullPhoneNumber: _.in(phoneMatchList) },
        { status: 'active', activatedOpenid: openid },
        { status: 'active', userId: user._id }
      ]))
      .limit(1)
      .get()
    const whitelist = whitelistRes.data && whitelistRes.data[0]

    if (!whitelist) {
      if (event.revalidate) await revokeDesignerRole(db, user)
      return {
        success: true,
        code: 'DESIGNER_NOT_CERTIFIED',
        isDesigner: false,
        message: '您的手机号不在设计师白名单中，请联系管理员开通设计师权限'
      }
    }

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
      success: true,
      code: 'OK',
      isDesigner: true,
      designerId: designer._id,
      whitelistId: whitelist._id,
      user: Object.assign({}, user, userUpdate),
      message: '验证通过，您是认证设计师'
    }
  } catch (err) {
    console.error('[check_designer_whitelist] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      isDesigner: false,
      message: err.message || '验证失败，请稍后重试'
    }
  }
}
