/**
 * 云函数：toolkit_whitelist_sync
 * 功能：小红书订单同步工具包白名单（供爬虫调用）
 * 权限：签名验证（非管理员登录）
 * 
 * 入参：
 *   - action: 'add' | 'remove' 操作类型
 *   - data: { phone, xhsOrderNo, xhsOrderTime } 订单数据
 *   - signature: 签名字符串
 *   - timestamp: 时间戳（毫秒）
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - message: 消息
 *   - data: 业务数据
 * 
 * 签名算法：
 *   signature = MD5(action + phone + xhsOrderNo + timestamp + SECRET_KEY)
 */
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 固定的工具包信息
const TOOLKIT_ID = 'TK_DEFAULT_001'
const TOOLKIT_NAME = '灯光设计工具包'

// 签名密钥（应通过环境变量配置，这里使用默认值）
// 重要：部署后请在云开发控制台修改此密钥
const SECRET_KEY = process.env.SYNC_SECRET_KEY || 'xhs_sync_default_secret_2026'

// 签名有效期（5分钟）
const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000

// 支持的国家/地区及其手机号规则
const PHONE_RULES = {
  '86': { pattern: /^1[3-9]\d{9}$/, name: '中国大陆' },
  '852': { pattern: /^[569]\d{7}$/, name: '中国香港' },
  '853': { pattern: /^6\d{7}$/, name: '中国澳门' },
  '886': { pattern: /^9\d{8}$/, name: '中国台湾' },
}

/**
 * 验证签名
 * @param {string} action 操作类型
 * @param {string} phone 手机号
 * @param {string} xhsOrderNo 订单号
 * @param {number} timestamp 时间戳
 * @param {string} signature 签名
 * @returns {{ valid: boolean, error?: string }}
 */
function verifySignature(action, phone, xhsOrderNo, timestamp, signature) {
  // 1. 检查时间戳有效性
  const now = Date.now()
  if (Math.abs(now - timestamp) > SIGNATURE_EXPIRY_MS) {
    return { valid: false, error: '签名已过期' }
  }
  
  // 2. 计算预期签名
  const signStr = `${action}${phone}${xhsOrderNo}${timestamp}${SECRET_KEY}`
  const expectedSignature = crypto.createHash('md5').update(signStr).digest('hex')
  
  // 3. 比较签名
  if (signature !== expectedSignature) {
    console.log('[toolkit_whitelist_sync] 签名验证失败:', {
      signStr: signStr.replace(SECRET_KEY, '***'),
      expected: expectedSignature,
      received: signature
    })
    return { valid: false, error: '签名验证失败' }
  }
  
  return { valid: true }
}

/**
 * 解析手机号，提取国家码和纯手机号
 * @param {string} phone 原始手机号
 * @returns {{ countryCode: string, purePhone: string, fullPhone: string }}
 */
function parsePhoneNumber(phone) {
  if (!phone) return { countryCode: '', purePhone: '', fullPhone: '' }
  
  let phoneStr = String(phone).trim().replace(/[\s\-()]/g, '')
  
  if (phoneStr.startsWith('+')) {
    phoneStr = phoneStr.substring(1)
  }
  
  const countryCodes = Object.keys(PHONE_RULES).sort((a, b) => b.length - a.length)
  
  for (const code of countryCodes) {
    if (phoneStr.startsWith(code)) {
      const purePhone = phoneStr.substring(code.length)
      return {
        countryCode: code,
        purePhone: purePhone,
        fullPhone: `+${code}${purePhone}`
      }
    }
  }
  
  // 默认中国大陆
  if (/^1[3-9]\d{9}$/.test(phoneStr)) {
    return {
      countryCode: '86',
      purePhone: phoneStr,
      fullPhone: `+86${phoneStr}`
    }
  }
  
  return {
    countryCode: '',
    purePhone: phoneStr,
    fullPhone: phoneStr
  }
}

/**
 * 标准化手机号
 * @param {string} phone 手机号
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return ''
  const parsed = parsePhoneNumber(phone)
  
  // 中国大陆返回11位纯号码（兼容现有数据）
  if (parsed.countryCode === '86') {
    return parsed.purePhone
  }
  
  // 境外手机号返回带国家码格式
  if (parsed.countryCode) {
    return `${parsed.countryCode}${parsed.purePhone}`
  }
  
  return String(phone).trim().replace(/\s+/g, '')
}

/**
 * 校验手机号格式
 * @param {string} phone 手机号
 * @returns {boolean}
 */
function validatePhone(phone) {
  const parsed = parsePhoneNumber(phone)
  if (!parsed.countryCode || !parsed.purePhone) {
    return false
  }
  
  const rule = PHONE_RULES[parsed.countryCode]
  if (!rule) {
    // 允许未知地区的手机号（长度校验）
    return parsed.purePhone.length >= 7 && parsed.purePhone.length <= 15
  }
  
  return rule.pattern.test(parsed.purePhone)
}

/**
 * 添加白名单记录
 */
async function addWhitelist(db, _, data) {
  const { phone, xhsOrderNo, xhsOrderTime } = data
  
  // 1. 校验手机号
  if (!validatePhone(phone)) {
    return {
      success: false,
      code: 'INVALID_PHONE',
      message: '手机号格式无效'
    }
  }
  
  const normalizedPhone = normalizePhone(phone)
  const parsed = parsePhoneNumber(phone)
  
  // 2. 检查是否已存在
  const existRes = await db.collection('toolkit_whitelist')
    .where({
      phone: normalizedPhone,
      toolkitId: TOOLKIT_ID
    })
    .get()
  
  if (existRes.data && existRes.data.length > 0) {
    const existing = existRes.data[0]
    
    // 如果订单号相同，说明是重复请求
    if (existing.xhsOrderNo === xhsOrderNo) {
      return {
        success: true,
        code: 'ALREADY_EXISTS',
        message: '该订单已同步过',
        data: { whitelistId: existing._id }
      }
    }
    
    // 如果订单号不同，更新订单信息
    await db.collection('toolkit_whitelist').doc(existing._id).update({
      data: {
        xhsOrderNo,
        xhsOrderTime: xhsOrderTime ? new Date(xhsOrderTime).getTime() : null,
        syncedAt: Date.now(),
        syncSource: 'xhs_crawler',
        updatedAt: Date.now()
      }
    })
    
    console.log('[toolkit_whitelist_sync] 更新已存在白名单:', {
      whitelistId: existing._id,
      phone: normalizedPhone,
      xhsOrderNo
    })
    
    return {
      success: true,
      code: 'UPDATED',
      message: '白名单记录已更新',
      data: { whitelistId: existing._id }
    }
  }
  
  // 3. 创建新记录
  const now = Date.now()
  const doc = {
    phone: normalizedPhone,
    purePhoneNumber: parsed.purePhone,
    countryCode: parsed.countryCode,
    fullPhoneNumber: parsed.fullPhone,
    region: PHONE_RULES[parsed.countryCode]?.name || '未知地区',
    toolkitId: TOOLKIT_ID,
    toolkitName: TOOLKIT_NAME,
    status: 'pending',
    source: '小红书订单',
    xhsOrderNo,
    xhsOrderTime: xhsOrderTime ? new Date(xhsOrderTime).getTime() : null,
    syncedAt: now,
    syncSource: 'xhs_crawler',
    activatedAt: null,
    activatedUserId: null,
    orderId: null,
    orderNo: null,
    createdAt: now,
    createdBy: 'xhs_crawler',
    updatedAt: now
  }
  
  const addRes = await db.collection('toolkit_whitelist').add({ data: doc })
  
  console.log('[toolkit_whitelist_sync] 添加白名单成功:', {
    whitelistId: addRes._id,
    phone: normalizedPhone,
    xhsOrderNo
  })
  
  return {
    success: true,
    code: 'CREATED',
    message: '白名单添加成功',
    data: { whitelistId: addRes._id }
  }
}

/**
 * 移除白名单记录
 */
async function removeWhitelist(db, _, data) {
  const { phone, xhsOrderNo } = data
  
  // 优先根据订单号查找
  let query = {}
  if (xhsOrderNo) {
    query = { xhsOrderNo, toolkitId: TOOLKIT_ID }
  } else if (phone) {
    const normalizedPhone = normalizePhone(phone)
    query = { phone: normalizedPhone, toolkitId: TOOLKIT_ID }
  } else {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      message: '请提供订单号或手机号'
    }
  }
  
  // 查找记录
  const findRes = await db.collection('toolkit_whitelist').where(query).get()
  
  if (!findRes.data || findRes.data.length === 0) {
    console.log('[toolkit_whitelist_sync] 未找到白名单记录:', query)
    return {
      success: true,
      code: 'NOT_FOUND',
      message: '未找到对应的白名单记录',
      data: { deleted: 0 }
    }
  }
  
  // 删除记录
  let deletedCount = 0
  for (const doc of findRes.data) {
    try {
      await db.collection('toolkit_whitelist').doc(doc._id).remove()
      deletedCount++
      console.log('[toolkit_whitelist_sync] 删除白名单成功:', {
        whitelistId: doc._id,
        phone: doc.phone,
        xhsOrderNo: doc.xhsOrderNo
      })
    } catch (err) {
      console.error('[toolkit_whitelist_sync] 删除白名单失败:', doc._id, err.message)
    }
  }
  
  return {
    success: true,
    code: 'DELETED',
    message: `成功删除 ${deletedCount} 条白名单记录`,
    data: { deleted: deletedCount }
  }
}

/**
 * 云函数入口
 */
exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  // 处理 HTTP 调用：请求体可能在 event.body 中（JSON 字符串）
  let params = event
  if (event.body) {
    try {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      console.log('[toolkit_whitelist_sync] HTTP 调用，解析 body')
    } catch (e) {
      console.error('[toolkit_whitelist_sync] 解析 body 失败:', e.message)
    }
  }
  
  console.log('[toolkit_whitelist_sync] 收到请求:', {
    action: params.action,
    phone: params.data?.phone ? '***' + params.data.phone.slice(-4) : null,
    xhsOrderNo: params.data?.xhsOrderNo,
    timestamp: params.timestamp,
    isHttpCall: !!event.body
  })
  
  try {
    const { action, data, signature, timestamp } = params
    
    // 1. 参数校验
    if (!action || !['add', 'remove'].includes(action)) {
      return {
        success: false,
        code: 'INVALID_ACTION',
        message: '无效的操作类型，必须是 add 或 remove'
      }
    }
    
    if (!data || !data.xhsOrderNo) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        message: '缺少必要参数 xhsOrderNo'
      }
    }
    
    if (action === 'add' && !data.phone) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        message: '添加操作需要提供 phone'
      }
    }
    
    // 2. 签名验证
    const verifyResult = verifySignature(
      action,
      data.phone || '',
      data.xhsOrderNo,
      timestamp,
      signature
    )
    
    if (!verifyResult.valid) {
      return {
        success: false,
        code: 'SIGNATURE_INVALID',
        message: verifyResult.error
      }
    }
    
    // 3. 执行操作
    if (action === 'add') {
      return await addWhitelist(db, _, data)
    } else {
      return await removeWhitelist(db, _, data)
    }
    
  } catch (err) {
    console.error('[toolkit_whitelist_sync] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务器错误'
    }
  }
}
