'use strict'

const ownerApi = typeof require === 'function'
  ? require('../../../services/v2/owner')
  : {
      casePresentation: async () => ({ ok: false, code: 'CLOUD_ENV_BLOCKED' }),
      casePresentationPreview: async () => ({ ok: false, code: 'CLOUD_ENV_BLOCKED' }),
    }

let presentationConfig = { fontSources: {}, controlAutoHideMs: 2600 }
if (typeof require === 'function') {
  try {
    presentationConfig = require('../../../config/case-presentation')
  } catch (_) {}
}

const COPY = Object.freeze({
  loading: '\u6b63\u5728\u5c55\u5f00\u7a7a\u95f4\u53d9\u4e8b\u2026',
  unavailable: '\u8fd9\u4efd\u6c89\u6d78\u6f14\u793a\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
  expired: '\u9884\u89c8\u5df2\u5931\u6548',
  expiredHint: '\u8349\u7a3f\u5df2\u53d8\u66f4\u6216\u9884\u89c8\u65f6\u95f4\u5df2\u7ed3\u675f',
  retry: '\u91cd\u8bd5',
  backToCases: '\u8fd4\u56de\u6848\u4f8b',
  consult: '\u54a8\u8be2\u706f\u5149\u65b9\u6848',
  preview: '\u8349\u7a3f\u9884\u89c8',
  imageFailed: '\u56fe\u7247\u52a0\u8f7d\u5931\u8d25',
  imageRetry: '\u91cd\u65b0\u52a0\u8f7d',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

function decodeScene(value) {
  const raw = String(value || '').replace(/\+/g, '%20').trim()
  if (!raw) return ''
  try { return decodeURIComponent(raw) } catch (_) { return raw }
}

function getDeviceLayout() {
  let info = {}
  try {
    info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  } catch (_) {}

  let device = info
  try {
    if (wx.getDeviceInfo) device = { ...info, ...wx.getDeviceInfo() }
  } catch (_) {}

  const benchmarkLevel = Number(device.benchmarkLevel)
  return {
    statusBarHeight: Number(info.statusBarHeight) || 20,
    reducedMotion: Number.isFinite(benchmarkLevel) && benchmarkLevel > 0 && benchmarkLevel <= 10,
  }
}

function normalizeFocal(slide, fileId) {
  const focal = slide && slide.imageFocals && slide.imageFocals[fileId]
  const x = Math.min(1, Math.max(0, Number(focal && focal.x) || 0.5))
  const y = Math.min(1, Math.max(0, Number(focal && focal.y) || 0.5))
  return { x, y, position: `${Math.round(x * 100)}% ${Math.round(y * 100)}%` }
}

function prepareSlides(rawSlides, current, previousSlides = []) {
  const failures = new Set()
  previousSlides.forEach(slide => {
    ;(slide.images || []).forEach(image => {
      if (image.failed) failures.add(`${slide.id}:${image.index}`)
    })
  })

  return (Array.isArray(rawSlides) ? rawSlides : []).map((slide, slideIndex) => {
    const fileIds = Array.isArray(slide.imageFileIds) ? slide.imageFileIds : []
    const urls = Array.isArray(slide.imageUrls) ? slide.imageUrls : []
    const nearby = Math.abs(slideIndex - current) <= 1
    return {
      ...slide,
      displayNo: slide.sectionNo || String(slideIndex + 1).padStart(2, '0'),
      images: fileIds.map((fileId, imageIndex) => {
        const url = String(urls[imageIndex] || '')
        const failed = failures.has(`${slide.id}:${imageIndex}`)
        return {
          index: imageIndex,
          fileId,
          url,
          src: nearby && !failed ? url : '',
          failed,
          ...normalizeFocal(slide, fileId),
        }
      }),
    }
  })
}

function showRouteError() {
  wx.showToast({ title: COPY.routeError, icon: 'none' })
}

Page({
  data: {
    copy: COPY,
    caseId: '',
    previewToken: '',
    from: '',
    isPreview: false,
    loading: true,
    loadFailed: false,
    expired: false,
    errorMessage: '',
    deckCase: null,
    rawSlides: [],
    slides: [],
    current: 0,
    total: 0,
    controlsVisible: false,
    statusBarHeight: 20,
    reducedMotion: false,
  },

  onLoad(options = {}) {
    const previewToken = decodeScene(options.scene)
    const caseId = String(options.id || '').trim()
    const isPreview = Boolean(previewToken)
    this.setData({
      caseId,
      previewToken,
      from: String(options.from || '').trim(),
      isPreview,
      ...getDeviceLayout(),
    })

    if (isPreview) {
      if (wx.hideShareMenu) wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    } else if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] })
    }

    this.loadFonts()
    this.loadPresentation()
  },

  onUnload() {
    this.clearControlTimer()
    if (this.retryTimer) clearTimeout(this.retryTimer)
  },

  loadFonts() {
    if (!wx.loadFontFace) return
    const sources = presentationConfig.fontSources || {}
    const load = (family, url) => {
      if (!url) return
      wx.loadFontFace({
        family,
        global: true,
        source: `url("${url}")`,
        fail: () => {},
      })
    }
    load('Noto Serif SC', sources.serif)
    load('Noto Sans SC', sources.sans)
  },

  async loadPresentation() {
    const { isPreview, previewToken, caseId } = this.data
    if ((!isPreview && !caseId) || (isPreview && !previewToken)) {
      this.setData({ loading: false, loadFailed: true, errorMessage: COPY.unavailable })
      return
    }

    this.setData({ loading: true, loadFailed: false, expired: false, errorMessage: '' })
    const response = isPreview
      ? await ownerApi.casePresentationPreview(previewToken)
      : await ownerApi.casePresentation(caseId)
    const payload = response && response.ok && response.data
    const rawSlides = payload && Array.isArray(payload.slides) ? payload.slides : []

    if (!payload || !rawSlides.length) {
      const expired = response && response.code === 'PREVIEW_EXPIRED'
      this.setData({
        loading: false,
        loadFailed: true,
        expired,
        errorMessage: expired ? COPY.expiredHint : (response && response.message) || COPY.unavailable,
      })
      return
    }

    const loadedCaseId = String(payload.case && payload.case.id || caseId)
    this.setData({
      loading: false,
      loadFailed: false,
      deckCase: payload.case || null,
      caseId: loadedCaseId,
      rawSlides,
      slides: prepareSlides(rawSlides, 0),
      current: 0,
      total: rawSlides.length,
    })
  },

  handleSlideChange(event) {
    const current = Math.max(0, Number(event.detail && event.detail.current) || 0)
    this.setData({
      current,
      slides: prepareSlides(this.data.rawSlides, current, this.data.slides),
    })
    if (this.data.controlsVisible) this.scheduleControlHide()
  },

  toggleControls() {
    const controlsVisible = !this.data.controlsVisible
    this.setData({ controlsVisible })
    if (controlsVisible) this.scheduleControlHide()
    else this.clearControlTimer()
  },

  clearControlTimer() {
    if (this.controlTimer) {
      clearTimeout(this.controlTimer)
      this.controlTimer = null
    }
  },

  scheduleControlHide() {
    this.clearControlTimer()
    this.controlTimer = setTimeout(() => {
      this.setData({ controlsVisible: false })
    }, Number(presentationConfig.controlAutoHideMs) || 2600)
  },

  handleImageError(event) {
    const slideIndex = Number(event.currentTarget.dataset.slide)
    const imageIndex = Number(event.currentTarget.dataset.image)
    const slides = this.data.slides.slice()
    const image = slides[slideIndex] && slides[slideIndex].images[imageIndex]
    if (!image) return
    image.failed = true
    image.src = ''
    this.setData({ slides })
  },

  retryImage(event) {
    const slideIndex = Number(event.currentTarget.dataset.slide)
    const imageIndex = Number(event.currentTarget.dataset.image)
    const slides = this.data.slides.slice()
    const image = slides[slideIndex] && slides[slideIndex].images[imageIndex]
    if (!image) return
    image.failed = false
    image.src = ''
    this.setData({ slides })
    this.retryTimer = setTimeout(() => {
      const nextSlides = this.data.slides.slice()
      const nextImage = nextSlides[slideIndex] && nextSlides[slideIndex].images[imageIndex]
      if (!nextImage) return
      nextImage.src = nextImage.url
      this.setData({ slides: nextSlides })
    }, 30)
  },

  goConsultation() {
    wx.navigateTo({ url: '/pages/support/contact/contact', fail: showRouteError })
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (this.data.from === 'detail' && pages.length > 1) {
      wx.navigateBack({ delta: 1, fail: () => this.redirectToDetail() })
      return
    }
    this.redirectToDetail()
  },

  redirectToDetail() {
    const caseId = String(this.data.caseId || '').trim()
    if (caseId) {
      wx.redirectTo({
        url: `/pages/v2/owner-case-detail/index?id=${encodeURIComponent(caseId)}`,
        fail: () => this.goCaseList(),
      })
      return
    }
    this.goCaseList()
  },

  goCaseList() {
    wx.redirectTo({ url: '/pages/v2/owner-home/index?tab=cases', fail: showRouteError })
  },

  onShareAppMessage() {
    const deckCase = this.data.deckCase || {}
    const cover = this.data.rawSlides[0] || {}
    const imageUrl = Array.isArray(cover.imageUrls) ? cover.imageUrls[0] : ''
    return {
      title: deckCase.title || '\u706f\u5149\u8bbe\u8ba1\u6848\u4f8b',
      path: `/pages/v2/owner-case-presentation/index?id=${encodeURIComponent(this.data.caseId || '')}`,
      imageUrl: imageUrl || undefined,
    }
  },
})

if (typeof module !== 'undefined') {
  module.exports = { decodeScene, getDeviceLayout, normalizeFocal, prepareSlides }
}
