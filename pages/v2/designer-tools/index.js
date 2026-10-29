const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const COPY = Object.freeze({
  title: '\u5de5\u5177',
  subtitle: '\u4e13\u4e1a\u5de5\u5177\u4e0e\u8bbe\u8ba1\u7075\u611f',
  commonTitle: '\u5e38\u7528\u5de5\u5177',
  commonCount: '2\u9879',
  inspirationTitle: '\u7075\u611f\u4e0e\u6d4b\u8bd5',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const COMMON_TOOLS = Object.freeze([
  {
    id: 'illuminance',
    title: '\u7167\u5ea6\u8ba1\u7b97\u5668',
    subtitle: '\u8ba1\u7b97\u7a7a\u95f4\u7167\u5ea6\u4e0e\u706f\u5177\u6570\u91cf',
    image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/ui-v2-assets/pages/v2/designer-tools/assets/illuminance.webp',
    route: '/pages/search/search',
  },
  {
    id: 'temperature',
    title: '\u8272\u6e29\u9009\u62e9\u5668',
    subtitle: '\u5bf9\u6bd4\u4e0d\u540c\u8272\u6e29\u7684\u7a7a\u95f4\u6548\u679c',
    image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/ui-v2-assets/pages/v2/designer-tools/assets/temperature.webp',
    route: '/pages/color-temp/color-temp',
  },
])

const FEATURE_TOOLS = Object.freeze([
  {
    id: 'inspiration',
    title: '\u8bbe\u8ba1\u7075\u611f\u5e93',
    subtitle: '\u63a2\u7d22\u9ad8\u7aef\u7167\u660e\u8bbe\u8ba1\u7075\u611f',
    action: '\u6d4f\u89c8\u7075\u611f',
    image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/ui-v2-assets/pages/v2/designer-tools/assets/inspiration.webp',
    route: '/pages/gallery/gallery',
  },
  {
    id: 'quiz',
    title: '\u706f\u5149\u6d4b\u8bd5',
    subtitle: '\u6d4b\u4e00\u6d4b\u4f60\u7684\u706f\u5149\u8bbe\u8ba1\u8ba4\u77e5\u9636\u6bb5',
    action: '\u5f00\u59cb\u6d4b\u8bd5',
    badge: '\u7ea65\u5206\u949f',
    image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/ui-v2-assets/pages/v2/designer-tools/assets/quiz.webp',
    route: '/pages/quiz/lighting-intro/lighting-intro',
  },
])

const TABS = Object.freeze([
  {
    id: 'learning',
    label: '\u5b66\u4e60',
    icon: '/pages/v2/shared/assets/tabbar/tab-learning-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-learning-active.png',
  },
  {
    id: 'tools',
    label: '\u5de5\u5177',
    icon: '/pages/v2/shared/assets/tabbar/tab-designer-tools-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-designer-tools-active.png',
  },
  {
    id: 'projects',
    label: '\u9879\u76ee',
    icon: '/pages/v2/shared/assets/tabbar/tab-projects-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-projects-active.png',
  },
  {
    id: 'profile',
    label: '\u6211\u7684',
    icon: '/pages/v2/shared/assets/tabbar/tab-profile-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-profile-active.png',
  },
])

function calculateLayout(windowInfo, menuButton) {
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
    headerHeight: Math.max(74, navigationBarHeight + 30),
  }
}

function getLayout() {
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

  return calculateLayout(windowInfo, menuButton)
}

function showRouteError() {
  wx.showToast({
    title: COPY.routeError,
    icon: 'none',
  })
}

function navigateTo(url) {
  wx.navigateTo({ url, fail: showRouteError })
}

function redirectTo(url) {
  wx.redirectTo({ url, fail: showRouteError })
}

Page({
  data: {
    copy: COPY,
    commonTools: COMMON_TOOLS,
    featureTools: FEATURE_TOOLS,
    tabs: TABS,
    activeTab: 'tools',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 74,
  },

  onLoad() {
    this.setData(getLayout())
  },

  onShow() {
    enforceV2Gate('designer')
  },

  onResize() {
    this.setData(getLayout())
  },

  openTool(event) {
    const route = event.currentTarget.dataset.route
    if (route) navigateTo(route)
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'tools') return
    if (id === 'learning') {
      redirectTo('/pages/v2/designer-learning/index')
      return
    }
    if (id === 'projects') {
      redirectTo('/pages/v2/designer-projects/index')
      return
    }
    if (id === 'profile') {
      redirectTo('/pages/v2/designer-profile/index')
    }
  },
})
