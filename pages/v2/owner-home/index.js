const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const ownerApi = typeof require === 'function' ? require('../../../services/v2/owner') : { overview: async () => ({ ok: false }) }
const BASELINE_TOP_INSET = 64
const BASELINE_HERO_HEIGHT = 273
const BASELINE_COPY_TOP = 94
const BASELINE_SCENE_TOP = 87
const BASELINE_WIDTH = 375
const BASELINE_VIEWPORT_HEIGHT = 667
const RESERVED_BOTTOM_GAP = 14
const MAX_LAYOUT_EXPANSION = 80
const STRETCH_RATIOS = Object.freeze({
  hero: 0.225,
  nextCard: 0.1,
  casesGap: 0.175,
  caseGridGap: 0.05,
  caseImage: 0.2,
  toolsGap: 0.125,
  toolGridGap: 0.05,
  toolCard: 0.075,
})

const COPY = Object.freeze({
  heroImageLabel: '\u6696\u8272\u6781\u7b80\u4f4f\u5b85\u706f\u5149\u7a7a\u95f4',
  profileAria: '\u8fdb\u5165\u6211\u7684\u9875\u9762',
  heroLine1: '\u4e3a\u4f60\u7684\u5bb6\uff0c',
  heroLine2: '\u5b9a\u5236\u6070\u5230\u597d\u5904\u7684\u5149',
  heroSubtitle: '\u4ece\u751f\u6d3b\u4e60\u60ef\u5230\u7a7a\u95f4\u6c1b\u56f4\uff0c\u83b7\u5f97\u66f4\u9002\u5408\u4f60\u7684\u706f\u5149\u65b9\u6848',
  heroCta: '\u5f00\u59cb\u586b\u5199\u706f\u5149\u9700\u6c42',
  caseLead: '\u5148\u770b\u770b\u771f\u5b9e\u6848\u4f8b',
  nextEyebrow: '\u4ece\u8fd9\u91cc\u5f00\u59cb',
  nextTitle: '\u63cf\u8ff0\u4f60\u7684\u7a7a\u95f4\u4e0e\u751f\u6d3b\u9700\u6c42',
  nextMeta: '\u7ea6 3 \u5206\u949f \u00b7 \u53ef\u968f\u65f6\u4fdd\u5b58',
  casesTitle: '\u7cbe\u9009\u6848\u4f8b',
  viewAll: '\u67e5\u770b\u5168\u90e8',
  caseNanjing: '\u5357\u4eac \u00b7 \u79c1\u5b85\u7167\u660e',
  caseShanghai: '\u4e0a\u6d77 \u00b7 \u6781\u7b80\u4f4f\u5b85',
  caseNanjingAria: '\u67e5\u770b\u5357\u4eac\u79c1\u5b85\u7167\u660e\u6848\u4f8b',
  caseShanghaiAria: '\u67e5\u770b\u4e0a\u6d77\u6781\u7b80\u4f4f\u5b85\u6848\u4f8b',
  toolsTitle: '\u5e38\u7528\u5de5\u5177',
  illuminanceTitle: '\u7167\u5ea6\u8ba1\u7b97',
  illuminanceDescription: '\u5feb\u901f\u4f30\u7b97\u7a7a\u95f4\u6240\u9700\u7167\u5ea6',
  colorTitle: '\u8272\u6e29\u9009\u62e9',
  colorDescription: '\u627e\u5230\u9002\u5408\u7a7a\u95f4\u7684\u5149\u8272',
  tabHome: '\u9996\u9875',
  tabCases: '\u6848\u4f8b',
  tabService: '\u670d\u52a1',
  tabTools: '\u5de5\u5177',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
  toolRouteError: '\u5de5\u5177\u9875\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})
function roundMetric(value) {
  return Math.round(value * 100) / 100
}

function calculateLayout(windowInfo, menuButton) {
  const windowWidth = Number(windowInfo.windowWidth) || BASELINE_WIDTH
  const scale = Math.min(
    430 / BASELINE_WIDTH,
    Math.max(320 / BASELINE_WIDTH, windowWidth / BASELINE_WIDTH)
  )
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  const menuTop = Number(menuButton.top) || statusBarHeight + 6
  const menuHeight = Number(menuButton.height) || 32
  const navigationBarHeight = Math.max(
    44,
    (menuTop - statusBarHeight) * 2 + menuHeight
  )
  const actualTopInset = statusBarHeight + navigationBarHeight
  const topInsetDelta = actualTopInset - BASELINE_TOP_INSET * scale
  const safeAreaBottom = Number(
    windowInfo.safeArea && windowInfo.safeArea.bottom
  )
  const windowHeight = Number(windowInfo.windowHeight) || 0
  const screenHeight = Number(windowInfo.screenHeight) || 0
  const viewportBottom = safeAreaBottom > 0
    ? safeAreaBottom
    : windowHeight || screenHeight || BASELINE_VIEWPORT_HEIGHT * scale
  const baselineBottom = BASELINE_VIEWPORT_HEIGHT * scale + topInsetDelta
  const rawExtra = Math.max(0, viewportBottom - baselineBottom)
  const layoutExtra = roundMetric(
    Math.min(
      MAX_LAYOUT_EXPANSION,
      Math.max(0, rawExtra - RESERVED_BOTTOM_GAP)
    )
  )

  const heroStretch = roundMetric(layoutExtra * STRETCH_RATIOS.hero)
  const nextCardStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.nextCard
  )
  const casesGapStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.casesGap
  )
  const caseGridGapStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.caseGridGap
  )
  const caseImageStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.caseImage
  )
  const toolsGapStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.toolsGap
  )
  const toolGridGapStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.toolGridGap
  )
  const toolCardStretch = roundMetric(
    layoutExtra * STRETCH_RATIOS.toolCard
  )
  const heroHeight = roundMetric(
    BASELINE_HERO_HEIGHT * scale + topInsetDelta + heroStretch
  )

  return {
    statusBarHeight,
    navigationBarHeight,
    layoutScale: roundMetric(scale),
    layoutExtra,
    heroHeight,
    copyTop: roundMetric(
      BASELINE_COPY_TOP * scale
        + topInsetDelta
        + heroStretch * (2 / 9)
    ),
    sceneTop: roundMetric(
      BASELINE_SCENE_TOP * scale + topInsetDelta + heroStretch
    ),
    heroSubtitleGap: roundMetric(heroStretch / 9),
    heroPrimaryGap: roundMetric(heroStretch / 3),
    heroCaseGap: roundMetric(heroStretch * (2 / 9)),
    nextCardStretch,
    nextCopyOffset: roundMetric(nextCardStretch * (3 / 8)),
    nextArrowOffset: roundMetric(nextCardStretch / 2),
    casesGapStretch,
    caseGridGapStretch,
    caseImageStretch,
    toolsGapStretch,
    toolGridGapStretch,
    toolCardStretch,
    contentMinHeight: Math.max(0, roundMetric(viewportBottom - heroHeight)),
  }
}

function openPage(url) {
  wx.navigateTo({
    url,
    fail() {
      wx.showToast({
        title: COPY.routeError,
        icon: 'none',
      })
    },
  })
}

Page({
  data: {
    copy: COPY,
    activePreviewTab: 'home',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    layoutScale: 1,
    layoutExtra: 0,
    heroSubtitleGap: 0,
    heroPrimaryGap: 0,
    heroCaseGap: 0,
    nextCardStretch: 0,
    nextCopyOffset: 0,
    nextArrowOffset: 0,
    casesGapStretch: 0,
    caseGridGapStretch: 0,
    caseImageStretch: 0,
    toolsGapStretch: 0,
    toolGridGapStretch: 0,
    toolCardStretch: 0,
    contentMinHeight: 394,
    heroHeight: BASELINE_HERO_HEIGHT,
    copyTop: BASELINE_COPY_TOP,
    sceneTop: BASELINE_SCENE_TOP,
    portalLoading: true,
    portalError: '',
    userAvatar: '',
    featuredCases: [],
  },

  onLoad(options = {}) {
    const activePreviewTab = ['cases', 'services', 'tools'].includes(options.tab)
      ? options.tab
      : 'home'
    this.updateLayout({ activePreviewTab })
    this.loadOverview()
  },

  onShow() {
    enforceV2Gate('owner')
  },

  async loadOverview() {
    this.setData({ portalLoading: true, portalError: '' })
    const response = await ownerApi.overview()
    if (!response.ok || !response.data) {
      this.setData({ portalLoading: false, portalError: response.message || '\u52a0\u8f7d\u5931\u8d25' })
      return
    }
    const overview = response.data
    const next = overview.nextAction || {}
    const copy = Object.assign({}, this.data.copy, {
      nextTitle: next.title || COPY.nextTitle,
      nextMeta: next.meta || COPY.nextMeta,
    })
    this.setData({
      copy,
      portalLoading: false,
      userAvatar: overview.user && overview.user.avatarUrl || '',
      featuredCases: Array.isArray(overview.featuredCases) ? overview.featuredCases.slice(0, 2) : [],
    })
  },

  onResize() {
    this.updateLayout()
  },

  updateLayout(extraData = {}) {
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

    this.setData({
      ...calculateLayout(windowInfo, menuButton),
      ...extraData,
    })
  },

  goPublish() {
    openPage('/pages/flows/publish/publish')
  },

  goCases() {
    this.switchToCases()
  },

  setPreviewTab(tab) {
    if (!['home', 'cases', 'services', 'tools'].includes(tab)) return
    if (tab === this.data.activePreviewTab) return

    if (wx.hideKeyboard) wx.hideKeyboard()
    this.setData({ activePreviewTab: tab })
  },

  switchToHome() {
    this.setPreviewTab('home')
  },

  switchToCases() {
    this.setPreviewTab('cases')
  },

  switchToServices() {
    this.setPreviewTab('services')
  },

  switchToTools() {
    this.setPreviewTab('tools')
  },

  switchToProfile() {
    this.goProfile()
  },

  goIlluminance() {
    openPage('/pages/search/search')
  },

  goColorTemperature() {
    openPage('/pages/color-temp/color-temp')
  },

  goTools() {
    this.switchToTools()
  },

  goProfile() {
    openPage('/pages/profile/home/home')
  },

  handleAvatarError() {
    this.setData({ userAvatar: '' })
  },

})



