function safePdfFileName(value) {
  const baseName = String(value || '微信用户+需求收集表.pdf')
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|\r\n\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return `${Array.from(baseName || '微信用户+需求收集表').slice(0, 120).join('')}.pdf`
}

Page({
  data: {
    id: '', requestId: '', spaceType: '', pdfStatus: 'pending', pdfFileID: '',
    pdfFileName: '', pdfError: '', submittedAtText: '', submittedAt: '', statusText: 'PDF 正在生成，请稍候',
    opening: false, generating: false,
  },

  onLoad(options = {}) {
    const id = decodeURIComponent(options.id || '')
    const requestId = decodeURIComponent(options.requestId || '')
    const submittedAt = Number(options.submittedAt || 0)
    this.setData({ id, requestId, spaceType: decodeURIComponent(options.spaceType || ''), pdfStatus: options.pdfStatus || 'pending', submittedAt, submittedAtText: this.formatTime(submittedAt || Date.now()) })
    this.refreshStatus()
  },

  onUnload() { this.stopPolling() },

  formatTime(value) {
    const date = new Date(Number(value) || Date.now())
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  setStatus(status, extra = {}) {
    const labels = { pending: 'PDF 正在生成，请稍候', processing: 'PDF 正在生成，请稍候', ready: 'PDF 已生成，可查看或导出', failed: extra.pdfError || 'PDF 生成失败，请重试' }
    this.setData({ pdfStatus: status || 'pending', statusText: labels[status] || labels.pending, ...extra })
  },

  async refreshStatus() {
    if (!this.data.id) return this.setStatus('failed', { pdfError: '缺少需求单编号' })
    try {
      const call = await wx.cloud.callFunction({ name: 'collection_form_public', data: { action: 'getPdfStatus', id: this.data.id } })
      const result = call && call.result
      const status = result && result.data && result.data.submission
      if (result && result.success && status) {
        this.setStatus(status.pdfStatus || 'pending', { pdfFileID: status.pdfFileID || '', pdfFileName: status.pdfFileName || '', pdfError: status.pdfError || '', submittedAt: status.createdAt || this.data.submittedAt, submittedAtText: this.formatTime(status.createdAt || this.data.submittedAt || Date.now()) })
        if (status.pdfStatus === 'ready') return
        if (status.pdfStatus === 'failed') return
      }
      await this.startGeneration()
      this.startPolling()
    } catch (error) {
      this.setStatus('failed', { pdfError: error.message || 'PDF 状态查询失败' })
    }
  },

  async startGeneration() {
    if (this.data.generating || !this.data.id) return
    this.setData({ generating: true })
    try {
      await wx.cloud.callFunction({ name: 'collection_form_public', data: { action: 'requestPdf', id: this.data.id } })
      wx.cloud.callFunction({ name: 'collection_form_export_pdf', data: { id: this.data.id } }).then((call) => {
        const result = call && call.result
        if (result && result.success && result.data) this.setStatus('ready', { pdfFileID: result.data.pdfFileID || '', pdfFileName: result.data.pdfFileName || '' })
      }).catch(() => null)
    } finally {
      this.setData({ generating: false })
    }
  },

  startPolling() {
    this.stopPolling()
    this._pollCount = 0
    this._pollTimer = setInterval(async () => {
      this._pollCount += 1
      await this.refreshOnly()
      if (this.data.pdfStatus === 'ready' || this.data.pdfStatus === 'failed' || this._pollCount >= 20) this.stopPolling()
    }, 2000)
  },

  async refreshOnly() {
    try {
      const call = await wx.cloud.callFunction({ name: 'collection_form_public', data: { action: 'getPdfStatus', id: this.data.id } })
      const status = call && call.result && call.result.data && call.result.data.submission
      if (status) this.setStatus(status.pdfStatus || 'pending', { pdfFileID: status.pdfFileID || '', pdfFileName: status.pdfFileName || '', pdfError: status.pdfError || '', submittedAt: status.createdAt || this.data.submittedAt, submittedAtText: this.formatTime(status.createdAt || this.data.submittedAt || Date.now()) })
    } catch (_) {}
  },

  stopPolling() { if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null } },

  async onRetry() { this.setStatus('pending'); await this.startGeneration(); this.startPolling() },

  prepareNamedPdf(tempFilePath) {
    if (!tempFilePath || !wx.env || !wx.env.USER_DATA_PATH || !wx.getFileSystemManager) return tempFilePath
    const fileName = safePdfFileName(this.data.pdfFileName)
    const targetPath = `${wx.env.USER_DATA_PATH}/${fileName}`
    if (tempFilePath === targetPath) return targetPath
    const fs = wx.getFileSystemManager()
    try {
      if (typeof fs.copyFileSync === 'function') {
        fs.copyFileSync(tempFilePath, targetPath)
        return targetPath
      }
      if (typeof fs.saveFileSync === 'function') {
        if (typeof fs.unlinkSync === 'function') {
          try { fs.unlinkSync(targetPath) } catch (_) {}
        }
        fs.saveFileSync(tempFilePath, targetPath)
        return targetPath
      }
    } catch (error) {
      console.warn('[collection-form-result] PDF 本地命名失败，使用临时文件继续打开', error)
    }
    return tempFilePath
  },

  async onOpenPdf() {
    if (this.data.pdfStatus !== 'ready' || !this.data.pdfFileID || this.data.opening) return
    this.setData({ opening: true })
    try {
      const file = await wx.cloud.downloadFile({ fileID: this.data.pdfFileID })
      const namedFilePath = this.prepareNamedPdf(file.tempFilePath)
      await new Promise((resolve, reject) => wx.openDocument({ filePath: namedFilePath, fileType: 'pdf', showMenu: true, success: resolve, fail: reject }))
    } catch (error) { wx.showToast({ title: error.message || 'PDF 打开失败', icon: 'none' }) }
    finally { this.setData({ opening: false }) }
  },

  onHistory() {
    wx.setStorageSync('cart_switch_to_collection', true)
    wx.navigateTo({ url: '/pages/profile/orders/orders' })
  },

  onHome() { wx.switchTab({ url: '/pages/products/products' }) },
})
