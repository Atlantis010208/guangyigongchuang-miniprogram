/**
 * 用户信息操作云函数
 * 支持操作：get（获取用户信息）、update（更新用户信息）、delete_account（注销账号）
 * 
 * @param {object} event - 请求参数
 * @param {string} event.action - 操作类型：get / update / delete_account
 * @param {object} [event.updateData] - 更新的数据（update 时使用）
 * @returns {object} { success, code, message, data }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 允许更新的字段白名单（防止恶意更新敏感字段）
const ALLOWED_UPDATE_FIELDS = [
  'nickname',
  'avatarUrl',
  'gender',
  'birthday',
  'city',
  'province',
  'country',
  'bio',
  'company',
  'position',
  'wechat',
  'email'
]

// 敏感字段（不允许通过此接口修改）
const PROTECTED_FIELDS = [
  '_id',
  '_openid',
  'openid',
  'unionId',
  'roles',
  'phoneNumber',
  'createdAt',
  'loginExpireAt',
  'lastLoginAt',
  'isAdmin',
  'isDeleted'
]

exports.main = async (event, context) => {
  // 获取用户身份
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.openid

  if (!openid) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: '用户身份验证失败'
    }
  }

  const { action } = event

  try {
    switch (action) {
      case 'get':
        return await getUserInfo(openid)
      case 'update':
        return await updateUserInfo(openid, event)
      case 'delete_account':
        return await deleteAccount(openid)
      case 'check_nickname':
        return await checkNickname(openid, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          message: `不支持的操作类型: ${action}`
        }
    }
  } catch (err) {
    console.error('用户操作失败:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务器错误'
    }
  }
}

/**
 * 获取用户信息
 * @param {string} openid - 用户openid
 * @returns {object} 用户信息
 */
async function getUserInfo(openid) {
  await ensureCollection('users')
  
  const col = db.collection('users')
  
  // 查询用户
  const res = await col.where({ _openid: openid }).limit(1).get()
  
  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'USER_NOT_FOUND',
      message: '用户不存在'
    }
  }
  
  const user = res.data[0]
  
  // 处理头像链接（如果是 cloud:// 则转换为临时链接）
  let avatarTempUrl = user.avatarUrl || ''
  if (avatarTempUrl && avatarTempUrl.startsWith('cloud://')) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [avatarTempUrl] })
      if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
        avatarTempUrl = urlRes.fileList[0].tempFileURL
      }
    } catch (err) {
      console.warn('获取头像临时链接失败:', err)
    }
  }
  
  // 返回用户信息（隐藏敏感字段）
  const userInfo = {
    id: user._id,
    nickname: user.nickname || '',
    avatarUrl: user.avatarUrl || '',         // 原始 fileID
    avatarTempUrl: avatarTempUrl,            // 临时链接（用于显示）
    phoneNumber: user.phoneNumber || '',
    gender: user.gender || 0,
    birthday: user.birthday || '',
    city: user.city || '',
    province: user.province || '',
    country: user.country || '',
    bio: user.bio || '',
    company: user.company || '',
    position: user.position || '',
    wechat: user.wechat || '',
    email: user.email || '',
    roles: user.roles || 1,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
  
  return {
    success: true,
    code: 'OK',
    message: '获取成功',
    data: userInfo
  }
}

/**
 * 更新用户信息
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 操作结果
 */
async function updateUserInfo(openid, event) {
  const { updateData } = event
  
  if (!updateData || typeof updateData !== 'object') {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少更新数据'
    }
  }
  
  const col = db.collection('users')
  
  // 查询用户是否存在
  const res = await col.where({ _openid: openid }).limit(1).get()
  
  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'USER_NOT_FOUND',
      message: '用户不存在'
    }
  }
  
  const user = res.data[0]
  
  // 过滤更新数据，只保留允许更新的字段
  const filteredData = {}
  let hasValidField = false
  
  for (const key of Object.keys(updateData)) {
    // 检查是否是保护字段
    if (PROTECTED_FIELDS.includes(key)) {
      console.warn(`尝试更新保护字段被拒绝: ${key}`)
      continue
    }
    
    // 检查是否在白名单中
    if (ALLOWED_UPDATE_FIELDS.includes(key)) {
      const value = updateData[key]
      
      // 数据验证
      if (key === 'nickname') {
        if (typeof value !== 'string') continue
        const trimmed = value.trim()
        if (trimmed.length === 0 || trimmed.length > 20) {
          return {
            success: false,
            code: 'INVALID_NICKNAME',
            message: '昵称长度应在1-20个字符之间'
          }
        }
        // 检查敏感词（可扩展）
        if (containsSensitiveWords(trimmed)) {
          return {
            success: false,
            code: 'SENSITIVE_CONTENT',
            message: '昵称包含敏感内容'
          }
        }
        filteredData[key] = trimmed
      } else if (key === 'avatarUrl') {
        // 头像URL验证
        if (typeof value !== 'string') continue
        // 只接受 cloud:// 开头的 fileID 或 https:// 开头的链接
        if (value && !value.startsWith('cloud://') && !value.startsWith('https://')) {
          continue
        }
        filteredData[key] = value
      } else if (key === 'gender') {
        // 性别验证：0-未知，1-男，2-女
        if (![0, 1, 2].includes(Number(value))) continue
        filteredData[key] = Number(value)
      } else if (key === 'birthday') {
        // 生日验证
        if (typeof value !== 'string') continue
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return {
            success: false,
            code: 'INVALID_BIRTHDAY',
            message: '生日格式不正确，应为 YYYY-MM-DD'
          }
        }
        filteredData[key] = value
      } else if (key === 'email') {
        // 邮箱验证
        if (typeof value !== 'string') continue
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return {
            success: false,
            code: 'INVALID_EMAIL',
            message: '邮箱格式不正确'
          }
        }
        filteredData[key] = value
      } else if (key === 'bio') {
        // 个人简介长度限制
        if (typeof value !== 'string') continue
        if (value.length > 200) {
          return {
            success: false,
            code: 'BIO_TOO_LONG',
            message: '个人简介不能超过200个字符'
          }
        }
        filteredData[key] = value
      } else {
        // 其他字段，限制字符串长度
        if (typeof value === 'string' && value.length <= 50) {
          filteredData[key] = value
        }
      }
      
      hasValidField = true
    }
  }
  
  if (!hasValidField) {
    return {
      success: false,
      code: 'NO_VALID_FIELD',
      message: '没有有效的更新字段'
    }
  }
  
  // 添加更新时间
  filteredData.updatedAt = Date.now()
  
  // 执行更新
  await col.doc(user._id).update({
    data: filteredData
  })
  
  console.log(`用户信息已更新: ${user._id}, 字段: ${Object.keys(filteredData).join(', ')}`)
  
  // 获取更新后的用户信息
  const updatedRes = await col.doc(user._id).get()
  const updatedUser = updatedRes.data
  
  // 处理头像临时链接
  let avatarTempUrl = updatedUser.avatarUrl || ''
  if (avatarTempUrl && avatarTempUrl.startsWith('cloud://')) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [avatarTempUrl] })
      if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
        avatarTempUrl = urlRes.fileList[0].tempFileURL
      }
    } catch (err) {
      console.warn('获取头像临时链接失败:', err)
    }
  }
  
  return {
    success: true,
    code: 'OK',
    message: '更新成功',
    data: {
      id: updatedUser._id,
      nickname: updatedUser.nickname || '',
      avatarUrl: updatedUser.avatarUrl || '',
      avatarTempUrl: avatarTempUrl,
      phoneNumber: updatedUser.phoneNumber || '',
      gender: updatedUser.gender || 0,
      birthday: updatedUser.birthday || '',
      city: updatedUser.city || '',
      province: updatedUser.province || '',
      country: updatedUser.country || '',
      bio: updatedUser.bio || '',
      updatedAt: updatedUser.updatedAt
    }
  }
}

/**
 * 注销账号
 * @param {string} openid - 用户openid
 * @returns {object} 操作结果
 */
async function deleteAccount(openid) {
  const col = db.collection('users')
  
  // 查询用户是否存在
  const res = await col.where({ _openid: openid }).limit(1).get()
  
  if (!res.data || res.data.length === 0) {
    return {
      success: false,
      code: 'USER_NOT_FOUND',
      message: '用户不存在'
    }
  }
  
  const user = res.data[0]
  
  // 软删除用户（标记为已删除，而不是真正删除）
  await col.doc(user._id).update({
    data: {
      isDeleted: true,
      deletedAt: Date.now(),
      // 清除敏感信息
      nickname: '已注销用户',
      avatarUrl: '',
      phoneNumber: '',
      email: '',
      wechat: '',
      updatedAt: Date.now()
    }
  })
  
  console.log(`用户账号已注销: ${user._id}, openid: ${openid}`)
  
  // 可以在这里添加清理其他关联数据的逻辑
  // 例如：清空购物车、取消未完成订单等
  
  return {
    success: true,
    code: 'OK',
    message: '账号已注销'
  }
}

/**
 * 检查昵称是否可用
 * @param {string} openid - 用户openid
 * @param {object} event - 请求参数
 * @returns {object} 检查结果
 */
async function checkNickname(openid, event) {
  const { nickname } = event
  
  if (!nickname || typeof nickname !== 'string') {
    return {
      success: false,
      code: 'MISSING_PARAM',
      message: '缺少昵称参数'
    }
  }
  
  const trimmed = nickname.trim()
  
  // 长度检查
  if (trimmed.length === 0 || trimmed.length > 20) {
    return {
      success: true,
      code: 'OK',
      data: {
        available: false,
        reason: '昵称长度应在1-20个字符之间'
      }
    }
  }
  
  // 敏感词检查
  if (containsSensitiveWords(trimmed)) {
    return {
      success: true,
      code: 'OK',
      data: {
        available: false,
        reason: '昵称包含敏感内容'
      }
    }
  }
  
  // 可以添加昵称唯一性检查（如果需要）
  // const col = db.collection('users')
  // const existRes = await col.where({ 
  //   nickname: trimmed,
  //   _openid: _.neq(openid)
  // }).count()
  // if (existRes.total > 0) {
  //   return { success: true, code: 'OK', data: { available: false, reason: '昵称已被使用' } }
  // }
  
  return {
    success: true,
    code: 'OK',
    data: {
      available: true
    }
  }
}

/**
 * 检查是否包含敏感词
 * @param {string} text - 待检查文本
 * @returns {boolean} 是否包含敏感词
 */
function containsSensitiveWords(text) {
  // 基础敏感词列表（可根据需要扩展）
  const sensitiveWords = [
    '管理员', 'admin', 'administrator', '系统', 'system',
    '官方', 'official', '客服', 'service'
  ]
  
  const lowerText = text.toLowerCase()
  return sensitiveWords.some(word => lowerText.includes(word.toLowerCase()))
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (err) {
    if (err.errCode === -502005) {
      console.log(`集合 ${collectionName} 不存在，请在云开发控制台创建`)
    }
  }
}
