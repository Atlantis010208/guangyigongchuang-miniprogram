const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const DEFAULT_CASE_ID = 'hangzhou-lake'
const CASE_IDS = Object.freeze([
  'nanjing-private',
  'shanghai-minimal',
  'hangzhou-lake',
  'shenzhen-gallery',
])

const COPY = Object.freeze({
  navTitle: '\u6848\u4f8b\u8be6\u60c5',
  backAria: '\u8fd4\u56de\u6848\u4f8b\u5217\u8868',
  category: '\u4f4f\u5b85  \u00b7  \u5168\u5c4b\u706f\u5149\u8bbe\u8ba1',
  title: '\u9759\u8c27\u4e4b\u5bb6',
  meta: '\u676d\u5dde  \u00b7  180m\u00b2  \u00b7  \u73b0\u4ee3\u7b80\u7ea6',
  designTitle: '\u8bbe\u8ba1\u7406\u5ff5',
  conceptLine1: '\u4ee5\u67d4\u548c\u7684\u95f4\u63a5\u5149\u5efa\u7acb\u7a7a\u95f4\u5c42\u6b21\uff0c\u8ba9\u5149\u7ebf\u987a\u7740\u751f\u6d3b\u52a8\u7ebf\u81ea\u7136\u53d1\u751f\u3002',
  conceptLine2: '\u514b\u5236\u4eae\u5ea6\u4e0e\u7729\u5149\uff0c\u4fdd\u7559\u5bb6\u7684\u5b89\u9759\u4e0e\u6e29\u5ea6\u3002',
  highlightsTitle: '\u7a7a\u95f4\u4eae\u70b9',
  projectInfoTitle: '\u9879\u76ee\u4fe1\u606f',
  closingTitle: '\u8ba9\u5149\uff0c\u66f4\u8d34\u8fd1\u4f60\u7684\u751f\u6d3b',
  closingText: '\u4ece\u7a7a\u95f4\u3001\u4e60\u60ef\u4e0e\u6c1b\u56f4\u51fa\u53d1\uff0c\u4e3a\u4f60\u5b9a\u5236\u4e13\u5c5e\u706f\u5149\u65b9\u6848\u3002',
  favorite: '\u6536\u85cf',
  unfavorite: '\u53d6\u6d88\u6536\u85cf',
  consult: '\u54a8\u8be2\u706f\u5149\u65b9\u6848',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const HERO = '/pages/v2/owner-case-detail/assets/hero.webp'
const LIVING = '/pages/v2/owner-case-detail/assets/highlight-living.webp'
const DINING = '/pages/v2/owner-case-detail/assets/highlight-dining.webp'
const BEDROOM = '/pages/v2/owner-case-detail/assets/highlight-bedroom.webp'
const ENTRY = '/pages/v2/owner-case-detail/assets/highlight-entry.webp'

const GALLERY_URLS = Object.freeze([HERO, LIVING, DINING, BEDROOM, ENTRY, HERO])

const SLIDES = Object.freeze([
  { src: HERO, previewIndex: 0, aria: '\u9759\u8c27\u4e4b\u5bb6\u5ba2\u5385\u5168\u666f' },
  { src: LIVING, previewIndex: 1, aria: '\u5ba2\u5385\u706f\u5149' },
  { src: DINING, previewIndex: 2, aria: '\u9910\u5385\u706f\u5149' },
  { src: BEDROOM, previewIndex: 3, aria: '\u4e3b\u5367\u706f\u5149' },
  { src: ENTRY, previewIndex: 4, aria: '\u7384\u5173\u706f\u5149' },
  { src: HERO, previewIndex: 5, aria: '\u9759\u8c27\u4e4b\u5bb6\u591c\u666f' },
])

const HIGHLIGHTS = Object.freeze([
  { src: LIVING, previewIndex: 1, aria: '\u5ba2\u5385' },
  { src: DINING, previewIndex: 2, aria: '\u9910\u5385' },
  { src: BEDROOM, previewIndex: 3, aria: '\u4e3b\u5367' },
  { src: ENTRY, previewIndex: 4, aria: '\u7384\u5173' },
])

const SUMMARY_ITEMS = Object.freeze([
  { label: '\u9879\u76ee\u7c7b\u578b', value: '\u4f4f\u5b85' },
  { label: '\u8bbe\u8ba1\u5468\u671f', value: '21\u5929' },
  { label: '\u5b8c\u6210\u65f6\u95f4', value: '2026' },
])

const PROJECT_ROWS = Object.freeze([
  { label: '\u9879\u76ee\u5730\u70b9', value: '\u676d\u5dde' },
  { label: '\u9879\u76ee\u9762\u79ef', value: '180m\u00b2' },
  { label: '\u8bbe\u8ba1\u8303\u56f4', value: '\u5168\u5c4b\u706f\u5149\u8bbe\u8ba1' },
  { label: '\u670d\u52a1\u5468\u671f', value: '21\u5929' },
  { label: '\u5b8c\u6210\u65f6\u95f4', value: '2026' },
])

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

Page({
  data: {
    copy: COPY,
    caseId: DEFAULT_CASE_ID,
    slides: SLIDES,
    highlights: HIGHLIGHTS,
    summaryItems: SUMMARY_ITEMS,
    projectRows: PROJECT_ROWS,
    currentSlide: 0,
    galleryIndex: 1,
    galleryTotal: SLIDES.length,
    isBookmarked: false,
    bookmarkIcon: '/pages/v2/owner-cases/assets/icon-bookmark.png',
    statusBarHeight: 20,
    navigationBarHeight: 44,
  },

  onLoad(options = {}) {
    const caseId = CASE_IDS.includes(options.id) ? options.id : DEFAULT_CASE_ID
    this.setData({
      caseId,
      ...getNavigationLayout(),
    })
  },

  onShow() {
    enforceV2Gate('owner')
  },

  onResize() {
    this.setData(getNavigationLayout())
  },

  handleSwiperChange(event) {
    const currentSlide = Number(event.detail.current) || 0
    this.setData({
      currentSlide,
      galleryIndex: currentSlide + 1,
    })
  },

  previewImage(event) {
    const index = Number(event.currentTarget.dataset.index) || 0
    wx.previewImage({
      current: GALLERY_URLS[index] || GALLERY_URLS[0],
      urls: GALLERY_URLS,
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







