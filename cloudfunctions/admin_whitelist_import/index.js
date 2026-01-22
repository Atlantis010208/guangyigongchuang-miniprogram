/**
 * 云函数：admin_whitelist_import
 * 功能：批量导入课程白名单数据
 * 权限：仅管理员
 * 
 * 入参：
 *   - fileData: Base64 编码的文件内容
 *   - fileName: 文件名（用于判断格式）
 *   - source: 批次备注（可选）
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - data: { total, successCount, duplicateCount, invalidCount, details }
 */
const cloud = require('wx-server-sdk')
const XLSX = require('xlsx')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 固定的课程信息
const COURSE_ID = 'CO_DEFAULT_001'
const COURSE_NAME = '十年经验二哥 灯光设计课'

/**
 * 校验手机号格式
 * @param {string} phone 手机号
 * @returns {boolean} 是否有效
 */
function isValidPhone(phone) {
  if (!phone) return false
  // 转换为字符串并去除空格
  const phoneStr = String(phone).trim()
  // 中国大陆手机号：11位数字，1开头
  return /^1[3-9]\d{9}$/.test(phoneStr)
}

/**
 * 标准化手机号
 * @param {string|number} phone 手机号
 * @returns {string} 标准化后的手机号
 */
function normalizePhone(phone) {
  if (!phone) return ''
  return String(phone).trim().replace(/\s+/g, '')
}

/**
 * 解析文件内容，提取手机号列表
 * @param {string} fileData Base64 编码的文件内容
 * @param {string} fileName 文件名
 * @returns {string[]} 手机号列表
 */
function parseFile(fileData, fileName) {
  const buffer = Buffer.from(fileData, 'base64')
  const ext = fileName.toLowerCase().split('.').pop()
  
  let phones = []
  
  if (ext === 'csv') {
    // CSV 文件解析
    const content = buffer.toString('utf-8')
    const lines = content.split(/\r?\n/)
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      // 分割行（支持逗号、分号、制表符）
      const cells = line.split(/[,;\t]/)
      
      // 第一行检查是否是标题行
      if (i === 0 && cells.some(c => /手机|phone|电话|mobile/i.test(c))) {
        continue // 跳过标题行
      }
      
      // 取第一列作为手机号
      if (cells[0]) {
        phones.push(normalizePhone(cells[0]))
      }
    }
  } else {
    // Excel 文件解析（xlsx/xls）
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    
    // 转换为 JSON 数组
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // 查找手机号列（标题行中包含"手机"或第一列）
    let phoneColIndex = 0
    if (jsonData.length > 0) {
      const headerRow = jsonData[0]
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '').toLowerCase()
        if (/手机|phone|电话|mobile/.test(header)) {
          phoneColIndex = i
          break
        }
      }
    }
    
    // 提取手机号（跳过标题行）
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (row && row[phoneColIndex]) {
        phones.push(normalizePhone(row[phoneColIndex]))
      }
    }
  }
  
  return phones
}

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  try {
    // 1. 验证管理员权限
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { fileData, fileName, source } = event
    
    // 2. 参数校验
    if (!fileData || !fileName) {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少文件数据或文件名'
      }
    }
    
    // 检查文件格式
    const ext = fileName.toLowerCase().split('.').pop()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return {
        success: false,
        code: 'INVALID_FORMAT',
        errorMessage: '仅支持 xlsx、xls、csv 格式文件'
      }
    }
    
    // 3. 解析文件
    let phones = []
    try {
      phones = parseFile(fileData, fileName)
    } catch (parseErr) {
      console.error('[admin_whitelist_import] 文件解析失败:', parseErr)
      return {
        success: false,
        code: 'PARSE_ERROR',
        errorMessage: '文件解析失败，请检查文件格式'
      }
    }
    
    if (phones.length === 0) {
      return {
        success: false,
        code: 'EMPTY_FILE',
        errorMessage: '文件中未找到有效的手机号'
      }
    }
    
    console.log('[admin_whitelist_import] 解析到手机号数量:', phones.length)
    
    // 4. 校验手机号格式
    const validPhones = []
    const invalidPhones = []
    
    for (const phone of phones) {
      if (isValidPhone(phone)) {
        validPhones.push(phone)
      } else if (phone) {
        invalidPhones.push(phone)
      }
    }
    
    console.log('[admin_whitelist_import] 有效手机号:', validPhones.length, '无效手机号:', invalidPhones.length)
    
    // 5. 查询已存在的手机号（去重）
    const existingPhones = new Set()
    
    // 分批查询（每次最多 100 个）
    const batchSize = 100
    for (let i = 0; i < validPhones.length; i += batchSize) {
      const batch = validPhones.slice(i, i + batchSize)
      const existRes = await db.collection('course_whitelist')
        .where({
          phone: _.in(batch),
          courseId: COURSE_ID
        })
        .field({ phone: true })
        .get()
      
      for (const doc of existRes.data) {
        existingPhones.add(doc.phone)
      }
    }
    
    console.log('[admin_whitelist_import] 已存在记录数:', existingPhones.size)
    
    // 6. 过滤出需要新增的手机号
    const newPhones = validPhones.filter(p => !existingPhones.has(p))
    const duplicatePhones = validPhones.filter(p => existingPhones.has(p))
    
    console.log('[admin_whitelist_import] 需要新增:', newPhones.length, '重复跳过:', duplicatePhones.length)
    
    // 7. 批量插入新记录
    const now = Date.now()
    const adminId = authResult.user._id || authResult.user.userId || 'admin'
    let successCount = 0
    
    // 分批插入（每次最多 100 条）
    for (let i = 0; i < newPhones.length; i += batchSize) {
      const batch = newPhones.slice(i, i + batchSize)
      const docs = batch.map(phone => ({
        phone,
        courseId: COURSE_ID,
        courseName: COURSE_NAME,
        status: 'pending',
        source: source || '手动导入',
        activatedAt: null,
        activatedUserId: null,
        orderId: null,
        orderNo: null,
        createdAt: now,
        createdBy: adminId,
        updatedAt: now
      }))
      
      try {
        // 逐条插入（处理可能的唯一索引冲突）
        for (const doc of docs) {
          try {
            await db.collection('course_whitelist').add({ data: doc })
            successCount++
          } catch (insertErr) {
            // 唯一索引冲突，跳过
            if (insertErr.errCode === -502001 || (insertErr.message && insertErr.message.includes('duplicate'))) {
              console.log('[admin_whitelist_import] 重复记录跳过:', doc.phone)
              duplicatePhones.push(doc.phone)
            } else {
              throw insertErr
            }
          }
        }
      } catch (batchErr) {
        console.error('[admin_whitelist_import] 批量插入失败:', batchErr)
      }
    }
    
    console.log('[admin_whitelist_import] 导入完成，成功:', successCount)
    
    // 8. 返回结果
    return {
      success: true,
      code: 'OK',
      data: {
        total: phones.length,
        successCount,
        duplicateCount: duplicatePhones.length,
        invalidCount: invalidPhones.length,
        details: {
          duplicates: duplicatePhones.slice(0, 10), // 只返回前10个
          invalids: invalidPhones.slice(0, 10)
        }
      },
      message: `导入完成：成功 ${successCount} 条，重复跳过 ${duplicatePhones.length} 条，格式无效 ${invalidPhones.length} 条`
    }
    
  } catch (err) {
    console.error('[admin_whitelist_import] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

