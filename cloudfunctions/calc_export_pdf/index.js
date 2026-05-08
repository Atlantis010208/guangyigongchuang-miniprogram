/**
 * 云函数：calc_export_pdf
 * 用途：把前端 Canvas 渲染的报告 PNG 包装成正式 PDF 文件
 * 入参：
 *   - imageFileID: string  前端先把 PNG 上传到云存储拿到的 fileID
 *   - fileName:    string  期望的输出文件名（无后缀；可选）
 * 出参：
 *   - success: boolean
 *   - data: { pdfFileID, size, fileName } | null
 *   - errorMessage: string
 *
 * 实现要点：
 * 1. 用 cloud.downloadFile 把 PNG 下载到 buffer
 * 2. 用 pdfkit 新建一个 PDF，页面尺寸 = 图片像素尺寸（按 PDF point=1:1 处理，保证打印时与原图比例一致）
 * 3. doc.image() 嵌入 PNG（pdfkit 内部会自动解析 PNG 头拿到宽高）
 * 4. 把生成的 buffer 上传到云存储 calc-reports/pdf/ 目录
 * 5. 删除原始 PNG（避免长期占用云存储）
 *
 * 注意：本云函数不嵌入中文字体——所有文字、图表都已经在前端 Canvas 中以位图形式绘制完毕，
 *      PDF 仅作为「容器」承载这张图片，因此不会出现中文乱码。
 */

const cloud = require('wx-server-sdk')
const PDFDocument = require('pdfkit')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { imageFileID, fileName } = event || {}

  if (!imageFileID) {
    return {
      success: false,
      errorMessage: 'imageFileID 是必填参数'
    }
  }

  console.log('[calc_export_pdf] start, imageFileID=', imageFileID)

  try {
    // 1. 下载 PNG 到 buffer
    const downloadRes = await cloud.downloadFile({ fileID: imageFileID })
    const imgBuffer = downloadRes.fileContent
    console.log('[calc_export_pdf] 图片已下载，大小:', imgBuffer.length, 'bytes')

    // 2. 创建 PDF
    // 先用 autoFirstPage:false 避免默认 A4 空白页，让我们能根据图片尺寸自定义页面大小
    const doc = new PDFDocument({ autoFirstPage: false })

    // pdfkit 的 openImage 会解析 PNG/JPEG 头部拿到 width / height（无需引入 sharp / image-size）
    let img
    try {
      img = doc.openImage(imgBuffer)
    } catch (parseErr) {
      console.error('[calc_export_pdf] openImage 失败:', parseErr)
      return {
        success: false,
        errorMessage: '无法解析图片：' + (parseErr.message || String(parseErr))
      }
    }

    const pdfW = img.width
    const pdfH = img.height
    console.log('[calc_export_pdf] PDF 页面尺寸:', pdfW, 'x', pdfH)

    doc.addPage({ size: [pdfW, pdfH], margin: 0 })
    doc.image(img, 0, 0, { width: pdfW, height: pdfH })

    // 3. 收集 PDF 数据（pdfkit 是流式 API）
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))

    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (err) => reject(err))
      doc.end()
    })

    console.log('[calc_export_pdf] PDF 已生成，大小:', pdfBuffer.length, 'bytes')

    // 4. 上传 PDF 到云存储
    const safeName = (fileName || 'calc-report').replace(/[^\w\u4e00-\u9fa5\-_.]/g, '_')
    const cloudPath = `calc-reports/pdf/${Date.now()}_${safeName}.pdf`
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: pdfBuffer
    })
    console.log('[calc_export_pdf] PDF 已上传:', uploadRes.fileID)

    // 5. 删除原始 PNG（容错：失败不影响主流程）
    try {
      await cloud.deleteFile({ fileList: [imageFileID] })
      console.log('[calc_export_pdf] 已清理原 PNG')
    } catch (delErr) {
      console.warn('[calc_export_pdf] 清理原 PNG 失败（忽略）:', delErr)
    }

    return {
      success: true,
      data: {
        pdfFileID: uploadRes.fileID,
        size: pdfBuffer.length,
        fileName: safeName + '.pdf'
      }
    }
  } catch (err) {
    console.error('[calc_export_pdf] 生成 PDF 失败:', err)
    return {
      success: false,
      errorMessage: (err && err.message) || String(err)
    }
  }
}
