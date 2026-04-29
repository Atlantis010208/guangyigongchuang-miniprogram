// utils/attachments.js
// 业主上传资料的双端展示——公共工具模块
// 业主端 progress 与设计师端 project-detail 共用，确保两端行为一致
//
// 导出三个核心 API：
//   - normalizeAttachments(doc): 归一化 images / files / params.* 四种来源
//   - hydrateImageTempUrls(images): 把 cloud:// fileID 批量换成 https 临时链接
//   - openAttachment(file): 按扩展名走 previewImage / openDocument / saveFile

const PREVIEWABLE_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']
const SAVE_ONLY_EXTS = ['dwg', 'dxf']
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const SIZE_THRESHOLD_MB = 50

// ---------- 归一化 ----------

/**
 * 归一化业主上传的图片与文件
 * @param {object} doc - 数据库 requests 文档（或 designer_projects 返回的 project）
 * @returns {object} { attachmentImages, attachmentFiles, attachmentImagesCount, attachmentFilesCount, hasAttachments }
 */
function normalizeAttachments(doc) {
  if (!doc) return emptyAttachments()
  const params = (doc.params && typeof doc.params === 'object') ? doc.params : {}

  const rawImages = mergeUniqueByFileID([
    asArray(doc.images),
    asArray(params.images)
  ], extractImageFileID)

  const rawFiles = mergeUniqueByFileID([
    asArray(doc.files),
    asArray(params.files)
  ], extractFileFileID)

  const attachmentImages = rawImages.map(toImageItem).filter(it => !!it.fileID)
  const attachmentFiles = rawFiles.map(toFileItem).filter(it => !!it.fileID)

  return {
    attachmentImages,
    attachmentFiles,
    attachmentImagesCount: attachmentImages.length,
    attachmentFilesCount: attachmentFiles.length,
    hasAttachments: (attachmentImages.length + attachmentFiles.length) > 0
  }
}

function emptyAttachments() {
  return {
    attachmentImages: [],
    attachmentFiles: [],
    attachmentImagesCount: 0,
    attachmentFilesCount: 0,
    hasAttachments: false
  }
}

function asArray(v) {
  if (!v) return []
  return Array.isArray(v) ? v : []
}

function mergeUniqueByFileID(groups, getFileID) {
  const seen = new Set()
  const out = []
  groups.forEach(group => {
    group.forEach(item => {
      const id = getFileID(item)
      if (!id) return
      if (seen.has(id)) return
      seen.add(id)
      out.push(item)
    })
  })
  return out
}

function extractImageFileID(raw) {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') return raw.fileID || raw.url || ''
  return ''
}

function extractFileFileID(raw) {
  if (raw && typeof raw === 'object') return raw.fileID || ''
  return ''
}

function toImageItem(raw) {
  const fileID = extractImageFileID(raw)
  return { fileID, tempUrl: '' }
}

function toFileItem(raw) {
  const fileID = (raw && raw.fileID) || ''
  const name = (raw && raw.name) || inferNameFromCloudPath(raw && raw.cloudPath, fileID)
  const ext = ((raw && raw.ext) || pickExt(name) || '').toLowerCase()
  const sizeBytes = Number((raw && raw.size) || 0) || 0
  const sizeText = (raw && raw.sizeText) || formatBytes(sizeBytes)
  const icon = pickIcon(ext)
  return { fileID, name, ext, sizeText, sizeBytes, icon }
}

function pickIcon(ext) {
  if (ext === 'pdf') return '📄'
  if (ext === 'doc' || ext === 'docx') return '📝'
  if (ext === 'xls' || ext === 'xlsx') return '📊'
  if (ext === 'ppt' || ext === 'pptx') return '📊'
  if (ext === 'dwg' || ext === 'dxf') return '📐'
  if (IMAGE_EXTS.indexOf(ext) !== -1) return '🖼️'
  return '📎'
}

function pickExt(name) {
  if (!name) return ''
  const dot = String(name).lastIndexOf('.')
  if (dot < 0) return ''
  return String(name).slice(dot + 1).toLowerCase()
}

function formatBytes(b) {
  const num = Number(b)
  if (!num || isNaN(num) || num <= 0) return '-'
  if (num >= 1024 * 1024) return (num / 1024 / 1024).toFixed(2) + 'MB'
  return Math.max(1, Math.round(num / 1024)) + 'KB'
}

function inferNameFromCloudPath(cloudPath, fileID) {
  const src = cloudPath || fileID || ''
  if (!src) return '未命名文件'
  const last = String(src).split('/').pop() || ''
  if (!last) return '未命名文件'
  // cloudPath 通常是 publish/files/1234567890_abc_户型图.pdf
  // 去除常见的 时间戳_随机串_ 前缀
  const stripped = last.replace(/^\d{10,}_[a-z0-9]+_/i, '')
  return stripped || last
}

// ---------- 临时链接 hydrate ----------

/**
 * 把图片列表中的 cloud:// fileID 批量换成 https 临时链接
 * 失败时返回原数组（让调用方走"加载中"占位降级）
 * @param {Array<{fileID, tempUrl}>} images
 * @returns {Promise<Array<{fileID, tempUrl}>>}
 */
async function hydrateImageTempUrls(images) {
  if (!images || !images.length) return images || []
  const fileList = images
    .map(it => it && it.fileID)
    .filter(id => id && String(id).indexOf('cloud://') === 0)
  if (!fileList.length) {
    // 没有 cloud:// 形式的，可能是已经是 https 直链，直接返回
    return images.map(it => ({ ...it, tempUrl: it.tempUrl || it.fileID || '' }))
  }
  try {
    const res = await wx.cloud.getTempFileURL({ fileList })
    const map = {}
    ;((res && res.fileList) || []).forEach(f => {
      if (f && f.fileID && f.tempFileURL && f.status === 0) {
        map[f.fileID] = f.tempFileURL
      }
    })
    return images.map(it => ({
      ...it,
      tempUrl: map[it.fileID] || it.tempUrl || ''
    }))
  } catch (err) {
    console.warn('[attachments] hydrateImageTempUrls failed:', err)
    return images
  }
}

// ---------- 打开附件 ----------

/**
 * 按扩展名分发：图片预览 / 文档预览 / 保存到本地
 * @param {object} file - { fileID, name, ext, sizeBytes }
 */
async function openAttachment(file) {
  if (!file || !file.fileID) {
    wx.showToast({ title: '文件信息缺失', icon: 'none' })
    return
  }
  const ext = String(file.ext || '').toLowerCase()

  // 图片格式：走 previewImage
  if (IMAGE_EXTS.indexOf(ext) !== -1) {
    return previewAsImage(file)
  }

  // 大文件二次确认
  if (file.sizeBytes && file.sizeBytes > SIZE_THRESHOLD_MB * 1024 * 1024) {
    const ok = await confirmLargeFile(file)
    if (!ok) return
  }

  wx.showLoading({ title: '下载中...', mask: true })
  try {
    const dl = await downloadFileAsync(file.fileID)
    wx.hideLoading()
    const tempFilePath = (dl && dl.tempFilePath) || ''
    if (!tempFilePath) {
      wx.showToast({ title: '下载失败，请稍后重试', icon: 'none' })
      return
    }

    if (PREVIEWABLE_EXTS.indexOf(ext) !== -1) {
      // 系统级文档预览
      try {
        await openDocumentAsync(tempFilePath)
      } catch (err) {
        console.error('[attachments] openDocument failed:', err)
        wx.showToast({ title: '文档预览失败', icon: 'none' })
      }
      return
    }

    // dwg/dxf 与未知扩展：保存到本地
    try {
      await saveFileAsync(tempFilePath)
      wx.showModal({
        title: '已保存',
        content: `${file.name || '文件'} 已保存到手机本地，建议在电脑端打开。`,
        showCancel: false,
        confirmText: '知道了'
      })
    } catch (err) {
      console.error('[attachments] saveFile failed:', err)
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
    }
  } catch (err) {
    wx.hideLoading()
    console.error('[attachments] downloadFile failed:', err)
    wx.showToast({ title: '下载失败，请稍后重试', icon: 'none' })
  }
}

function previewAsImage(file) {
  // 图片走 previewImage 需要 https 临时链接
  wx.cloud.getTempFileURL({ fileList: [file.fileID] })
    .then(res => {
      const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
      if (!url) {
        wx.showToast({ title: '图片加载失败', icon: 'none' })
        return
      }
      wx.previewImage({ current: url, urls: [url] })
    })
    .catch(err => {
      console.error('[attachments] preview image failed:', err)
      wx.showToast({ title: '图片加载失败', icon: 'none' })
    })
}

function confirmLargeFile(file) {
  return new Promise(resolve => {
    const mb = (Number(file.sizeBytes) / 1024 / 1024).toFixed(1)
    wx.showModal({
      title: '文件较大',
      content: `${file.name || '该文件'} 约 ${mb}MB，是否继续下载？`,
      confirmText: '继续下载',
      cancelText: '取消',
      success: r => resolve(!!(r && r.confirm)),
      fail: () => resolve(false)
    })
  })
}

function downloadFileAsync(fileID) {
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID,
      success: resolve,
      fail: reject
    })
  })
}

function openDocumentAsync(filePath) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      showMenu: true,
      success: resolve,
      fail: reject
    })
  })
}

function saveFileAsync(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveFile({
      tempFilePath,
      success: resolve,
      fail: reject
    })
  })
}

// ---------- 导出 ----------

module.exports = {
  normalizeAttachments,
  hydrateImageTempUrls,
  openAttachment,
  // 导出辅助函数，便于单元测试或特殊场景复用
  formatBytes,
  pickExt,
  pickIcon
}
