const fs = require('fs')
const path = require('path')
const cloud = require('wx-server-sdk')
const PDFDocument = require('pdfkit')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })
const SUBMISSION_COLLECTION = 'collection_form_submissions'
// 提升渲染版本，确保历史 PDF 会按新的统一命名规则重新生成。
const PDF_RENDER_VERSION = 6
const SPACE_TYPE_TITLES = {
  residential: '住宅空间需求收集',
  wellness: '疗愈服务空间需求收集',
  office: '辅助办公空间需求收集',
  fitness: '运动健身空间需求收集',
}
const FONT_CANDIDATES = [
  path.join(__dirname, 'fonts', 'AlibabaPuHuiTi_2_55_Regular.ttf'),
  process.env.COLLECTION_FORM_FONT_PATH,
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
].filter(Boolean)

function identity() {
  const ctx = cloud.getWXContext() || {}
  const openid = ctx.OPENID || ctx.openid || ''
  if (!openid) throw new Error('无法识别当前微信用户')
  return openid
}

function safeName(value, fallback = '需求收集表', maxLength = 80) {
  const text = String(value || fallback)
    .replace(/[\\/:*?"<>|\r\n\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return Array.from(text || fallback).slice(0, maxLength).join('')
}

function userNameOf(user) {
  return user && String(user.nickname || user.nickName || user.name || '').trim()
}

async function resolveUserName(submission) {
  const snapshotName = String(submission.userNickname || '').trim()
  if (snapshotName) return snapshotName

  if (submission.userId) {
    const byId = await db.collection('users').doc(submission.userId).get().catch(() => ({ data: null }))
    const byIdName = userNameOf(byId.data)
    if (byIdName) return byIdName
  }

  const byOpenid = await db.collection('users').where({ _openid: submission.openid }).limit(1).get().catch(() => ({ data: [] }))
  return userNameOf(byOpenid.data && byOpenid.data[0]) || '微信用户'
}

function buildPdfFileName(submission, userName) {
  const safeUserName = safeName(userName || submission.userNickname, '微信用户', 40)
  const safeTitle = safeName(templateTitle(submission), '需求收集表', 80)
  return `${safeUserName}+${safeTitle}.pdf`
}

function safeStorageSegment(value, fallback = 'file', maxLength = 80) {
  const text = String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return (text || fallback).slice(0, maxLength)
}

function buildPdfCloudPath(submission, fileName) {
  const id = String(submission._id || submission.id || '')
  const requestId = String(submission.requestId || id || Date.now())
  const hash = crypto.createHash('sha1').update(`${id}|${requestId}|${fileName}`).digest('hex').slice(0, 12)
  return [
    'collection-form-pdf',
    safeStorageSegment(submission.spaceType || 'unknown'),
    safeStorageSegment(requestId),
    `v${PDF_RENDER_VERSION}-${hash}.pdf`,
  ].join('/')
}

function asText(value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('、')
  if (typeof value === 'object') return Object.keys(value).map((key) => `${key}: ${asText(value[key])}`).join('；')
  return String(value)
}

function selectedValues(answer) {
  const value = answer && typeof answer === 'object' && !Array.isArray(answer) && Object.prototype.hasOwnProperty.call(answer, 'selected')
    ? answer.selected : answer
  return Array.isArray(value) ? value : (value ? [value] : [])
}

function answerText(question, answer) {
  if (answer === undefined || answer === null || answer === '') return '未填写'
  if (question.type === 'single' || question.type === 'multiple' || question.type === 'ranking') {
    const labels = new Map((question.options || []).map((option) => [option.id, option.label]))
    const values = selectedValues(answer).map((id) => labels.get(id) || id)
    const other = answer && typeof answer === 'object' && answer.otherText ? `（其他：${answer.otherText}）` : ''
    return `${values.join('、')}${other}` || '未填写'
  }
  if (question.type === 'location' && typeof answer === 'object') {
    return [answer.name, answer.address].filter(Boolean).join('，') || '未填写'
  }
  if (question.type === 'table' && Array.isArray(answer)) {
    const columns = (question.table && question.table.columns) || []
    return answer.map((row, index) => {
      const fields = columns.map((column) => `${column.label}: ${asText(row && row[column.id])}`).join('；')
      return `${index + 1}. ${fields}`
    }).join('\n') || '未填写'
  }
  if (question.type === 'upload' && Array.isArray(answer)) {
    return answer.map((file) => file && (file.name || file.fileID)).filter(Boolean).join('、') || '未上传'
  }
  return asText(answer) || '未填写'
}

function findFont() {
  return FONT_CANDIDATES.find((candidate) => {
    try { return fs.existsSync(candidate) } catch (_) { return false }
  }) || null
}

function collectUploadFiles(template, answers) {
  const result = []
  ;(template.modules || []).forEach((module) => (module.questions || []).forEach((question) => {
    if (question.type !== 'upload' || !Array.isArray(answers[question.id])) return
    answers[question.id].forEach((file) => {
      if (file && typeof file.fileID === 'string' && file.fileID.startsWith('cloud://')) {
        result.push({ question, file })
      }
    })
  }))
  return result
}

async function renderPdf(submission) {
  const template = submission.template || { title: '需求收集表', modules: [] }
  const answers = submission.answers || {}
  const fontPath = findFont()
  // 为页脚预留独立安全区，避免正文最后一行与页脚重叠。
  const doc = new PDFDocument({ size: 'A4', margin: 48, marginBottom: 90, bufferPages: true, autoFirstPage: true })
  if (fontPath) doc.font(fontPath)
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))

  doc.fillColor('#111827').fontSize(22).text(template.title || '需求收集表', { align: 'center' })
  doc.moveDown(0.5).fillColor('#6B7280').fontSize(9)
    .text(`需求单号：${submission.requestId || submission._id}`, { align: 'center' })
    .text(`提交时间：${new Date(submission.createdAt || Date.now()).toLocaleString('zh-CN', { hour12: false })}`, { align: 'center' })
  doc.moveDown(1).strokeColor('#E5E7EB').moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown(1)

  ;(template.modules || []).forEach((module) => {
    doc.fillColor('#111827').fontSize(15).text(`${module.code || ''}  ${module.title || '需求模块'}`)
    if (module.description) doc.fillColor('#6B7280').fontSize(9).text(module.description)
    doc.moveDown(0.35)
    ;(module.questions || []).forEach((question) => {
      const answer = answers[question.id]
      if (answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0)) return
      doc.fillColor('#374151').fontSize(10).text(`${question.code || ''}  ${question.title || ''}`, { continued: false })
      doc.fillColor('#111827').fontSize(10).text(answerText(question, answer), { indent: 12, width: 475 })
      doc.moveDown(0.45)
    })
    doc.moveDown(0.4)
  })

  const uploadFiles = collectUploadFiles(template, answers)
  for (const entry of uploadFiles) {
    try {
      const downloaded = await cloud.downloadFile({ fileID: entry.file.fileID })
      if (!downloaded || !downloaded.fileContent) continue
      doc.fillColor('#374151').fontSize(9).text(`附件：${entry.file.name || '图片'}`)
      doc.image(downloaded.fileContent, { fit: [470, 260], align: 'center' }).moveDown(0.5)
    } catch (error) {
      console.warn('[collection_form_export_pdf] attachment skipped', entry.file.fileID, error.message)
    }
  }

  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i)
    // 页脚位于独立底部区域。PDFKit 在 marginBottom=90 时会把绝对定位的页脚
    // 误判为溢出并自动追加新页，导致每个正文页后多出一张空白页。绘制页脚时
    // 临时放开底部边界，绘制完成后恢复，避免触发 addPage。
    const previousBottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    const footerY = doc.page.height - 38
    doc.fillColor('#9CA3AF').fontSize(8).text(`光乙共创平台  ·  ${i + 1} / ${pages.count}`, 48, footerY, {
      align: 'center', width: 499, lineBreak: false,
    })
    doc.page.margins.bottom = previousBottomMargin
  }
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

async function update(id, data) {
  await db.collection(SUBMISSION_COLLECTION).doc(id).update({ data })
}

exports.main = async (event = {}) => {
  const openid = identity()
  const id = String(event.id || '')
  if (!/^cfs_[a-f0-9]{32}$/.test(id)) return { success: false, code: 'INVALID_ID', errorMessage: '提交记录 ID 无效' }
  const result = await db.collection(SUBMISSION_COLLECTION).doc(id).get().catch(() => ({ data: null }))
  const submission = result.data
  if (!submission || submission.openid !== openid) return { success: false, code: 'NOT_FOUND', errorMessage: '提交记录不存在' }
  const userName = await resolveUserName(submission)
  const fileName = buildPdfFileName(submission, userName)
  if (submission.pdfStatus === 'ready' && submission.pdfVersion === PDF_RENDER_VERSION && submission.pdfFileID && submission.pdfFileName === fileName) {
    return { success: true, code: 'OK', data: { pdfStatus: 'ready', pdfFileID: submission.pdfFileID, pdfFileName: submission.pdfFileName } }
  }
  try {
    await update(id, { pdfStatus: 'processing', pdfError: '', updatedAt: Date.now() })
    const pdfBuffer = await renderPdf(submission)
    const cloudPath = buildPdfCloudPath(submission, fileName)
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: pdfBuffer })
    await update(id, {
      pdfStatus: 'ready', pdfFileID: uploaded.fileID, pdfFileName: fileName,
      pdfGeneratedAt: Date.now(), pdfError: '', pdfVersion: PDF_RENDER_VERSION, updatedAt: Date.now(),
    })
    return { success: true, code: 'OK', data: { pdfStatus: 'ready', pdfFileID: uploaded.fileID, pdfFileName: fileName, size: pdfBuffer.length } }
  } catch (error) {
    await update(id, { pdfStatus: 'failed', pdfError: String(error.message || error).slice(0, 300), updatedAt: Date.now() }).catch(() => null)
    console.error('[collection_form_export_pdf]', error)
    return { success: false, code: 'PDF_GENERATION_FAILED', errorMessage: 'PDF 生成失败，请稍后重试' }
  }
}

function templateTitle(submission) {
  return submission.template && submission.template.title || SPACE_TYPE_TITLES[submission.spaceType] || '需求收集表'
}

exports.__private__ = {
  PDF_RENDER_VERSION,
  findFont,
  renderPdf,
  answerText,
  safeName,
  resolveUserName,
  buildPdfFileName,
  buildPdfCloudPath,
  templateTitle,
}
