const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const ownerApi = typeof require === 'function' ? require('../../../services/v2/owner') : { caseDetail: async () => ({ ok: false }) }

// 空间亮点固定取封面之后的 4 张图，凑不满就少排几张
const HIGHLIGHT_START = 1
const HIGHLIGHT_END = 5

const COPY = Object.freeze({
  navTitle: '\u6848\u4f8b\u8be6\u60c5',
  backAria: '\u8fd4\u56de\u6848\u4f8b\u5217\u8868',
  fallbackTitle: '\u706f\u5149\u8bbe\u8ba1\u6848\u4f8b',
  designTitle: '\u8bbe\u8ba1\u7406\u5ff5',
  highlightsTitle: '\u7a7a\u95f4\u4eae\u70b9',
  loadingText: '\u6b63\u5728\u52a0\u8f7d\u6848\u4f8b\u2026',
  emptyTitle: '\u6848\u4f8b\u6682\u4e0d\u53ef\u7528',
  emptyHint: '\u6848\u4f8b\u53ef\u80fd\u5df2\u4e0b\u67b6\uff0c\u770b\u770b\u5176\u4ed6\u4f5c\u54c1',
  retry: '\u91cd\u65b0\u52a0\u8f7d',
  closingTitle: '\u8ba9\u5149\uff0c\u66f4\u8d34\u8fd1\u4f60\u7684\u751f\u6d3b',
  closingText: '\u4ece\u7a7a\u95f4\u3001\u4e60\u60ef\u4e0e\u6c1b\u56f4\u51fa\u53d1\uff0c\u4e3a\u4f60\u5b9a\u5236\u4e13\u5c5e\u706f\u5149\u65b9\u6848\u3002',
  favorite: '\u6536\u85cf',
  unfavorite: '\u53d6\u6d88\u6536\u85cf',
  consult: '\u54a8\u8be2\u706f\u5149\u65b9\u6848',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const SEPARATOR = '  \u00b7  '

function calculateNavigationLayout(windowInfo, menuButton) {
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  const menuTop = Number(menuButton.top) || statusBarHeight + 6
  const menuHeight = Number(menuButton.height) || 32
  const navigationBarHeight = Math.max(
    44,
    (menuTop - statusBarHeight) * 2 + menuHeight
  )

  return {
    statusBarHeight,
    navigationBarHeight,
  }
}

function getNavigationLayout() {
  let windowInfo = {}
  let menuButton = {}

  try {
    windowInfo = wx.getWindowInfo
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
  } catch (error) {
    windowInfo = {}
  }

  try {
    menuButton = wx.getMenuButtonBoundingClientRect()
  } catch (error) {
    menuButton = {}
  }

  return calculateNavigationLayout(windowInfo, menuButton)
}

function showRouteError() {
  wx.showToast({
    title: COPY.routeError,
    icon: 'none',
  })
}

/**
 * 把非空短文本用中点连接，用于「设计 · 灯具」「杭州 · 180m² · 现代简约」这类信息行
 * @param {Array<string>} parts
 * @returns {string} 全部为空时返回空串，页面据此隐藏整行
 */
function joinParts(parts) {
  return parts
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim())
    .join(SEPARATOR)
}

Page({
  data: {
    copy: COPY,
    caseId: '',
    loading: true,
    loadFailed: false,
    detail: null,
    slides: [],
    highlights: [],
    galleryUrls: [],
    currentSlide: 0,
    galleryIndex: 0,
    galleryTotal: 0,
    isBookmarked: false,
    bookmarkIcon: '/pages/v2/owner-cases/assets/icon-bookmark.png',
    statusBarHeight: 20,
    navigationBarHeight: 44,
  },

  onLoad(options = {}) {
    // 列表页传入的是数据库 _id，微信框架已对 query 解码，这里不再二次 decode
    const caseId = String(options.id || '').trim()
    this.setData({
      caseId,
      ...getNavigationLayout(),
    })
    this.loadDetail()
  },

  onShow() {
    enforceV2Gate('owner')
  },

  onResize() {
    this.setData(getNavigationLayout())
  },

  /**
   * 拉取案例详情；id 缺失、案例下架或网络失败都统一落到失败态
   */
  async loadDetail() {
    const caseId = this.data.caseId
    if (!caseId) {
      this.setData({ loading: false, loadFailed: true })
      return
    }

    this.setData({ loading: true, loadFailed: false })
    const response = await ownerApi.caseDetail(caseId)
    const item = response && response.ok && response.data && response.data.item

    if (!item) {
      this.setData({ loading: false, loadFailed: true })
      return
    }

    this.applyDetail(item)
  },

  /**
   * 把云函数返回的案例映射成页面渲染结构
   * @param {object} item lighting_cases_list detail 返回的单条案例
   */
  applyDetail(item) {
    const imageUrls = (Array.isArray(item.imageUrls) ? item.imageUrls : [])
      .filter(src => typeof src === 'string' && src)
    const services = Array.isArray(item.services) ? item.services : []
    const slides = imageUrls.map((src, index) => ({ src, index }))

    this.setData({
      loading: false,
      loadFailed: false,
      detail: {
        title: (item.title || '').trim() || COPY.fallbackTitle,
        category: joinParts(services),
        meta: joinParts([item.city, item.area, item.style]),
        desc: (item.desc || '').trim(),
        officialAccountUrl: (item.officialAccountUrl || '').trim(),
      },
      slides,
      highlights: slides.slice(HIGHLIGHT_START, HIGHLIGHT_END),
      galleryUrls: imageUrls,
      currentSlide: 0,
      galleryIndex: imageUrls.length ? 1 : 0,
      galleryTotal: imageUrls.length,
    })
  },

  handleSwiperChange(event) {
    const currentSlide = Number(event.detail.current) || 0
    this.setData({
      currentSlide,
      galleryIndex: currentSlide + 1,
    })
  },

  previewImage(event) {
    const urls = this.data.galleryUrls
    if (!urls || !urls.length) return

    const index = Number(event.currentTarget.dataset.index) || 0
    wx.previewImage({
      current: urls[index] || urls[0],
      urls,
    })
  },

  toggleBookmark() {
    const isBookmarked = !this.data.isBookmarked
    this.setData({
      isBookmarked,
      bookmarkIcon: isBookmarked
        ? '/pages/v2/owner-cases/assets/icon-bookmark-active.png'
        : '/pages/v2/owner-cases/assets/icon-bookmark.png',
    })
  },

  goConsultation() {
    wx.navigateTo({
      url: '/pages/support/contact/contact',
      fail: showRouteError,
    })
  },

  goBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const fallback = () => {
      wx.redirectTo({
        url: '/pages/v2/owner-home/index?tab=cases',
        fail: showRouteError,
      })
    }

    if (pages.length > 1) {
      wx.navigateBack({ delta: 1, fail: fallback })
      return
    }

    fallback()
  },
})
