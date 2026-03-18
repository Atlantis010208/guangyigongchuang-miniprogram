/**
 * 云函数：admin_designer_whitelist_import
 * 功能：批量导入设计师白名单数据（支持文件导入和手动输入）
 * 权限：仅管理员
 * 
 * 入参：
 *   - fileData: Base64 编码的文件内容（文件导入模式）
 *   - fileName: 文件名（文件导入模式）
 *   - phones: 手机号数组（手动输入模式，格式 [{ phone, name, remark }]）
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

/**
 * 校验手机号格式（中国大陆）
 */
function isValidPhone(phone) {
  if (!phone) return false
  const phoneStr = String(phone).trim().replace(/[\s\-()]/g, '')
  return /^1[3-9]\d{9}$/.test(phoneStr)
}

/**
 * 标准化手机号
 */
function normalizePhone(phone) {
  if (!phone) return ''
  let phoneStr = String(phone).trim().replace(/[\s\-()]/g, '')
  // 移除+86前缀
  if (phoneStr.startsWith('+86')) phoneStr = phoneStr.substring(3)
  if (phoneStr.startsWith('86') && phoneStr.length === 13) phoneStr = phoneStr.substring(2)
  return phoneStr
}

/**
 * 解析文件内容，提取手机号和姓名列表
 */
function parseFile(fileData, fileName) {
  const buffer = Buffer.from(fileData, 'base64')
  const ext = fileName.toLowerCase().split('.').pop()
  
  let records = []
  
  if (ext === 'csv') {
    const content = buffer.toString('utf-8')
    const lines = content.split(/\r?\n/)
    
    let phoneCol = 0
    let nameCol = -1
    let remarkCol = -1
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const cells = line.split(/[,;\t]/)
      
      // 第一行检查是否是标题行
      if (i === 0 && cells.some(c => /手机|phone|电话|mobile/i.test(c))) {
        cells.forEach((c, idx) => {
          const header = c.trim().toLowerCase()
          if (/手机|phone|电话|mobile/.test(header)) phoneCol = idx
          if (/姓名|name|名字/.test(header)) nameCol = idx
          if (/备注|remark|说明/.test(header)) remarkCol = idx
        })
        continue
      }
      
      if (cells[phoneCol]) {
        records.push({
          phone: normalizePhone(cells[phoneCol]),
          name: nameCol >= 0 ? (cells[nameCol] || '').trim() : '',
          remark: remarkCol >= 0 ? (cells[remarkCol] || '').trim() : ''
        })
      }
    }
  } else {
    // Excel 文件解析
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    let phoneCol = 0
    let nameCol = -1
    let remarkCol = -1
    
    if (jsonData.length > 0) {
      const headerRow = jsonData[0]
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '').toLowerCase()
        if (/手机|phone|电话|mobile/.test(header)) phoneCol = i
        if (/姓名|name|名字/.test(header)) nameCol = i
        if (/备注|remark|说明/.test(header)) remarkCol = i
      }
    }
    
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (row && row[phoneCol]) {
        records.push({
          phone: normalizePhone(row[phoneCol]),
          name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
          remark: remarkCol >= 0 ? String(row[remarkCol] || '').trim() : ''
        })
      }
    }
  }
  
  return records
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
    
    const { fileData, fileName, phones, source } = event
    
    // 2. 解析输入数据
    let records = []
    
    if (fileData && fileName) {
      // 文件导入模式
      const ext = fileName.toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        return {
          success: false,
          code: 'INVALID_FORMAT',
          errorMessage: '仅支持 xlsx、xls、csv 格式文件'
        }
      }
      
      try {
        records = parseFile(fileData, fileName)
      } catch (parseErr) {
        console.error('[admin_designer_whitelist_import] 文件解析失败:', parseErr)
        return {
          success: false,
          code: 'PARSE_ERROR',
          errorMessage: '文件解析失败，请检查文件格式'
        }
      }
    } else if (phones && Array.isArray(phones)) {
      // 手动输入模式
      records = phones.map(p => ({
        phone: normalizePhone(typeof p === 'string' ? p : p.phone),
        name: (typeof p === 'string' ? '' : p.name) || '',
        remark: (typeof p === 'string' ? '' : p.remark) || ''
      }))
    } else {
      return {
        success: false,
        code: 'MISSING_PARAMS',
        errorMessage: '缺少导入数据'
      }
    }
    
    if (records.length === 0) {
      return {
        success: false,
        code: 'EMPTY_DATA',
        errorMessage: '未找到有效的手机号数据'
      }
    }
    
    console.log('[admin_designer_whitelist_import] 解析到记录数:', records.length)
    
    // 3. 校验手机号格式
    const validRecords = []
    const invalidPhones = []
    
    for (const record of records) {
      if (isValidPhone(record.phone)) {
        validRecords.push(record)
      } else if (record.phone) {
        invalidPhones.push(record.phone)
      }
    }
    
    // 4. 查询已存在的手机号（去重）
    const existingPhones = new Set()
    const batchSize = 100
    const phoneList = validRecords.map(r => r.phone)
    
    for (let i = 0; i < phoneList.length; i += batchSize) {
      const batch = phoneList.slice(i, i + batchSize)
      const existRes = await db.collection('designer_whitelist')
        .where({ phone: _.in(batch) })
        .field({ phone: true })
        .get()
      
      for (const doc of existRes.data) {
        existingPhones.add(doc.phone)
      }
    }
    
    // 5. 过滤出需要新增的记录
    const newRecords = validRecords.filter(r => !existingPhones.has(r.phone))
    const duplicateRecords = validRecords.filter(r => existingPhones.has(r.phone))
    
    console.log('[admin_designer_whitelist_import] 需要新增:', newRecords.length, '重复跳过:', duplicateRecords.length)
    
    // 6. 批量插入新记录
    const now = Date.now()
    const adminId = authResult.user._id || authResult.user.userId || 'admin'
    let successCount = 0
    
    for (let i = 0; i < newRecords.length; i += batchSize) {
      const batch = newRecords.slice(i, i + batchSize)
      
      for (const record of batch) {
        try {
          await db.collection('designer_whitelist').add({
            data: {
              phone: record.phone,
              name: record.name,
              remark: record.remark || source || '手动导入',
              status: 'active',
              createdAt: now,
              updatedAt: now,
              createdBy: adminId
            }
          })
          successCount++
        } catch (insertErr) {
          if (insertErr.errCode === -502001 || (insertErr.message && insertErr.message.includes('duplicate'))) {
            console.log('[admin_designer_whitelist_import] 重复记录跳过:', record.phone)
          } else {
            console.error('[admin_designer_whitelist_import] 插入失败:', insertErr)
          }
        }
      }
    }
    
    console.log('[admin_designer_whitelist_import] 导入完成，成功:', successCount)
    
    // 7. 返回结果
    return {
      success: true,
      code: 'OK',
      data: {
        total: records.length,
        successCount,
        duplicateCount: duplicateRecords.length,
        invalidCount: invalidPhones.length,
        details: {
          duplicates: duplicateRecords.slice(0, 10).map(r => r.phone),
          invalids: invalidPhones.slice(0, 10)
        }
      },
      message: `导入完成：成功 ${successCount} 条，重复跳过 ${duplicateRecords.length} 条，格式无效 ${invalidPhones.length} 条`
    }
    
  } catch (err) {
    console.error('[admin_designer_whitelist_import] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
