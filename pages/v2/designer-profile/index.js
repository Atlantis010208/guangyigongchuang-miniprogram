const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const designerApi = typeof require === 'function' ? require('../../../services/v2/designer') : { profile: async () => ({ ok: false }), portfolios: async () => ({ ok: false }) }
const COPY = Object.freeze({
  title: '\u6211\u7684',
  subtitle: '\u7ba1\u7406\u4f60\u7684\u4e13\u4e1a\u6863\u6848',
  role: '\u8bbe\u8ba1\u5e08',
  profession: '\u4e13\u4e1a\u706f\u5149\u8bbe\u8ba1',
  mode: '\u8bbe\u8ba1\u5e08\u6a21\u5f0f',
  intro: '\u4e13\u6ce8\u4f4f\u5b85\u4e0e\u5546\u4e1a\u7a7a\u95f4\u706f\u5149\u8bbe\u8ba1',
  editProfile: '\u7f16\u8f91\u8d44\u6599',
  personalProfile: '\u4e2a\u4eba\u8d44\u6599',
  personalProfileHint: '\u67e5\u770b\u5e76\u5b8c\u5584',
  personalHomepage: '\u4e2a\u4eba\u4e3b\u9875',
  personalHomepageHint: '\u9884\u89c8\u5c55\u793a\u6548\u679c',
  works: '\u6211\u7684\u4f5c\u54c1',
  manageWorks: '\u7ba1\u7406\u4f5c\u54c1',
  accountSettings: '\u8d26\u6237\u4e0e\u8bbe\u7f6e',
  messageSettings: '\u6d88\u606f\u8bbe\u7f6e',
  messageSettingsHint: '\u9879\u76ee\u901a\u77e5\u4e0e\u7cfb\u7edf\u6d88\u606f',
  completeness: '\u5b8c\u5584\u4e13\u4e1a\u6863\u6848\uff0c\u6709\u52a9\u4e8e\u63d0\u5347\u9879\u76ee\u5339\u914d\u5ea6\u3002',
  homepageUnavailable: '\u4e2a\u4eba\u4e3b\u9875\u9884\u89c8\u6b63\u5728\u91cd\u6784\u4e2d',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const WORKS = Object.freeze([
  {
    id: 'residential',
    label: '\u4f4f\u5b85',
    image: '/pages/v2/designer-workbench/assets/project-residential-card.webp',
  },
  {
    id: 'commercial',
    label: '\u5546\u4e1a',
    image: '/pages/v2/designer-workbench/assets/project-commercial.webp',
  },
  {
    id: 'bedroom',
    label: '\u5367\u5ba4',
    image: './assets/portfolio-bedroom.png',
  },
])

const SETTINGS = Object.freeze([
  {
    id: 'profile',
    title: COPY.personalProfile,
    subtitle: '\u5934\u50cf\u3001\u7b80\u4ecb\u4e0e\u4e13\u4e1a\u65b9\u5411',
    icon: 'profile',
  },
  {
    id: 'notifications',
    title: COPY.messageSettings,
    subtitle: COPY.messageSettingsHint,
    icon: 'bell',
  },
])

const TABS = Object.freeze([
  {
    id: 'workbench',
    label: '\u5de5\u4f5c\u53f0',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-workbench-v2.png',
  },
  {
    id: 'learning',
    label: '\u5b66\u4e60',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-learning-v2.png',
  },
  {
    id: 'tools',
    label: '\u5de5\u5177',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-tools-v2.png',
  },
  {
    id: 'projects',
    label: '\u9879\u76ee',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-projects-v2.png',
  },
  {
    id: 'profile',
    label: '\u6211\u7684',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-profile-v2.png',
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
    headerHeight: Math.max(94, navigationBarHeight + 50),
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

function switchTo(url) {
  wx.switchTab({ url, fail: showRouteError })
}

function redirectTo(url) {
  wx.redirectTo({ url, fail: showRouteError })
}

Page({
  data: {
    copy: COPY,
    works: [],
    settings: SETTINGS,
    tabs: TABS,
    activeTab: 'profile',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 94,
    profileLoading: true,
    profileError: '',
    avatarUrl: '',
  },

  onLoad() {
    this.setData(getLayout())
    this.loadProfile()
  },

  onShow() {
    enforceV2Gate('designer')
  },

  async loadProfile() {
    const [profileResponse, worksResponse] = await Promise.all([designerApi.profile(), designerApi.portfolios()])
    const profile = profileResponse.ok && profileResponse.data || {}
    const rawWorks = worksResponse.ok ? (Array.isArray(worksResponse.data) ? worksResponse.data : worksResponse.data && (worksResponse.data.list || worksResponse.data.items) || []) : []
    this.setData({
      profileLoading: false,
      profileError: profileResponse.ok ? '' : profileResponse.message,
      avatarUrl: profile.avatarUrl || profile.avatar || '',
      copy: Object.assign({}, this.data.copy, {
        role: profile.name || profile.nickname || COPY.role,
        profession: profile.profession || profile.specialty || COPY.profession,
        intro: profile.intro || profile.bio || COPY.intro,
      }),
      works: rawWorks.slice(0, 3).map((item, index) => ({ id: item._id || item.id, label: item.title || item.category || `?? ${index + 1}`, image: item.coverUrl || item.imageUrl || (item.images && item.images[0]) || '' }))
    })
  },

  onResize() {
    this.setData(getLayout())
  },

  editProfile() {
    navigateTo('/pages/designer-profile-edit/designer-profile-edit')
  },

  openPersonalProfile() {
    navigateTo('/pages/designer-profile-edit/designer-profile-edit')
  },

  previewHomepage() {
    wx.showToast({
      title: COPY.homepageUnavailable,
      icon: 'none',
    })
  },

  manageWorks() {
    navigateTo('/pages/designer-portfolios/designer-portfolios')
  },

  openWork() {
    navigateTo('/pages/designer-portfolios/designer-portfolios')
  },

  openSetting(event) {
    const id = event.currentTarget.dataset.id
    navigateTo(
      id === 'notifications'
        ? '/pages/designer-notifications/designer-notifications'
        : '/pages/designer-profile-edit/designer-profile-edit'
    )
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'profile') return
    if (id === 'workbench') {
      redirectTo('/pages/v2/designer-workbench/index')
      return
    }
    if (id === 'projects') {
      redirectTo('/pages/v2/designer-projects/index')
      return
    }
    if (id === 'learning') {
      redirectTo('/pages/v2/designer-learning/index')
      return
    }
    if (id === 'tools') {
      redirectTo('/pages/v2/designer-tools/index')
    }
  },
})


