const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const designerApi = typeof require === 'function' ? require('../../../services/v2/designer') : { overview: async () => ({ ok: false }) }

/**
 * 判断远程封面是否值得尝试加载。
 * 云存储公开域未带 sign 时会 403，当真值会挡住本地占位图。
 */
function usableImageUrl(url) {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.indexOf('/pages/') === 0 || trimmed.indexOf('./') === 0) return trimmed
  if (trimmed.indexOf('cloud://') === 0) return ''
  if (/tcb\.qcloud\.la/i.test(trimmed) && trimmed.indexOf('sign=') === -1) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return ''
}
const COPY = Object.freeze({
  workbenchTitle: '\u5de5\u4f5c\u53f0',
  pendingSummary: '\u4eca\u5929\u6709 3 \u9879\u5f85\u5904\u7406',
  nextEyebrow: '\u4e0b\u4e00\u6b65',
  nextTitle: '\u4f4f\u5b85\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
  nextTag: '\u65b9\u6848\u8bbe\u8ba1',
  nextTask: '\u63d0\u4ea4\u521d\u7248\u706f\u5149\u65b9\u6848',
  nextDeadline: '\u4eca\u5929 18:00 \u622a\u6b62',
  progressLabel: '\u9879\u76ee\u8fdb\u5ea6',
  continueLabel: '\u7ee7\u7eed\u5904\u7406',
  viewProjectLabel: '\u67e5\u770b\u9879\u76ee',
  todayTodoTitle: '\u4eca\u65e5\u5f85\u529e',
  allTodos: '\u5168\u90e8 3',
  projectsTitle: '\u8fdb\u884c\u4e2d\u7684\u9879\u76ee',
  viewAll: '\u67e5\u770b\u5168\u90e8',
  toolsTitle: '\u5feb\u6377\u5de5\u5177',
  checklistUnavailable: '\u6e05\u5355\u529f\u80fd\u91cd\u6784\u4e2d',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const STATS = Object.freeze([
  { label: '\u8fdb\u884c\u4e2d', value: '2' },
  { label: '\u4eca\u65e5\u5f85\u529e', value: '3' },
  { label: '\u5f85\u7ed3\u7b97', value: '1' },
])

const TODOS = Object.freeze([
  {
    id: 'requirement',
    title: '\u786e\u8ba4 Qiny \u4f4f\u5b85\u5ba2\u6237\u9700\u6c42',
    subtitle: '\u5ba2\u6237\u6c9f\u901a',
    time: '10:30',
    tone: 'dark',
  },
  {
    id: 'submission',
    title: '\u63d0\u4ea4 Atlantis \u5546\u94fa\u7167\u5ea6\u8ba1\u7b97',
    subtitle: '\u65b9\u6848\u63d0\u4ea4',
    time: '18:00',
    tone: 'blue',
  },
])

const PROJECTS = Object.freeze([
  {
    id: 'residential',
    title: '\u4f4f\u5b85\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
    tag: '\u65b9\u6848\u8bbe\u8ba1',
    progress: 65,
    image: '/pages/v2/designer-workbench/assets/project-residential-card.webp',
  },
  {
    id: 'commercial',
    title: '\u5546\u94fa \u00b7 \u706f\u5149\u65bd\u5de5\u56fe',
    tag: '\u5f85\u4fee\u6539',
    progress: 40,
    image: '/pages/v2/designer-workbench/assets/project-commercial.webp',
  },
])

const QUICK_TOOLS = Object.freeze([
  {
    id: 'illuminance',
    label: '\u7167\u5ea6\u8ba1\u7b97',
    icon: '/pages/v2/designer-workbench/assets/icon-quick-illuminance-v2.png',
  },
  {
    id: 'temperature',
    label: '\u8272\u6e29\u8f6c\u6362',
    icon: '/pages/v2/designer-workbench/assets/icon-quick-temperature-v2.png',
  },
  {
    id: 'checklist',
    label: '\u6e05\u5355\u751f\u6210',
    icon: '/pages/v2/designer-workbench/assets/icon-quick-checklist-v2.png',
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

const BASE_LAYOUT_RPX = Object.freeze({
  content: 1058,
  summary: 88,
  nextAction: 356,
  nextProgressTop: 204,
  todo: 176,
  project: 142,
  quickTools: 94,
  tabbar: 108,
})
const MAX_INTERNAL_EXTRA = 100
const TRAILING_GAP = 12
const MIN_TODO_LIST_HEIGHT = 88

function roundHalf(value) {
  return Math.round(value * 2) / 2
}

function distributeInternalExtra(extra) {
  const summary = roundHalf(extra * 0.12)
  const nextAction = roundHalf(extra * 0.32)
  const todo = roundHalf(extra * 0.2)
  const project = roundHalf(extra * 0.2)
  const quickTools = roundHalf(
    Math.max(0, extra - summary - nextAction - todo - project)
  )
  return { summary, nextAction, todo, project, quickTools }
}
function calculateLayout(windowInfo, menuButton) {
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  const menuTop = Number(menuButton.top) || statusBarHeight + 6
  const menuHeight = Number(menuButton.height) || 32
  const navigationBarHeight = Math.max(
    44,
    (menuTop - statusBarHeight) * 2 + menuHeight
  )
  const headerHeight = Math.max(80, navigationBarHeight + 36)
  const windowWidth = Number(windowInfo.windowWidth) || 375
  const windowHeight = Number(windowInfo.windowHeight) || 667
  const rpx = windowWidth / 750
  const safeAreaBottom = Number(
    windowInfo.safeArea && windowInfo.safeArea.bottom
  )
  const bottomInset = safeAreaBottom > 0
    ? Math.max(0, windowHeight - safeAreaBottom)
    : 0
  const baseContentBottom =
    statusBarHeight
    + headerHeight
    + (BASE_LAYOUT_RPX.content - BASE_LAYOUT_RPX.todo) * rpx
    + Math.max(MIN_TODO_LIST_HEIGHT, BASE_LAYOUT_RPX.todo * rpx)
  const tabbarTop =
    windowHeight - bottomInset - BASE_LAYOUT_RPX.tabbar * rpx
  const internalExtra = roundHalf(
    Math.max(
      0,
      Math.min(
        MAX_INTERNAL_EXTRA,
        tabbarTop - baseContentBottom - TRAILING_GAP
      )
    )
  )
  const stretch = distributeInternalExtra(internalExtra)

  return {
    statusBarHeight,
    navigationBarHeight,
    headerHeight,
    internalExtra,
    summaryHeight: roundHalf(BASE_LAYOUT_RPX.summary * rpx + stretch.summary),
    nextActionHeight: roundHalf(
      BASE_LAYOUT_RPX.nextAction * rpx + stretch.nextAction
    ),
    nextProgressTop: roundHalf(
      BASE_LAYOUT_RPX.nextProgressTop * rpx + stretch.nextAction * 0.45
    ),
    todoListHeight: Math.max(
      MIN_TODO_LIST_HEIGHT,
      roundHalf(BASE_LAYOUT_RPX.todo * rpx + stretch.todo)
    ),
    projectCardHeight: roundHalf(
      BASE_LAYOUT_RPX.project * rpx + stretch.project
    ),
    quickToolListHeight: roundHalf(
      BASE_LAYOUT_RPX.quickTools * rpx + stretch.quickTools
    ),
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
  wx.navigateTo({
    url,
    fail: showRouteError,
  })
}

function switchTo(url) {
  wx.switchTab({
    url,
    fail: showRouteError,
  })
}

function redirectTo(url) {
  wx.redirectTo({
    url,
    fail: showRouteError,
  })
}

Page({
  data: {
    copy: COPY,
    stats: STATS.map(item => Object.assign({}, item, { value: '0' })),
    todos: [],
    projects: [],
    quickTools: QUICK_TOOLS,
    tabs: TABS,
    activeTab: 'workbench',
    nextProgress: 0,
    portalLoading: true,
    portalError: '',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 80,
    internalExtra: 0,
    summaryHeight: 44,
    nextActionHeight: 178,
    nextProgressTop: 102,
    todoListHeight: MIN_TODO_LIST_HEIGHT,
    projectCardHeight: 71,
    quickToolListHeight: 47,
  },

  onLoad() {
    this.setData(getLayout())
    this.loadOverview()
  },

  onShow() {
    enforceV2Gate('designer')
  },

  async loadOverview() {
    this.setData({ portalLoading: true, portalError: '' })
    const response = await designerApi.overview()
    if (!response.ok || !response.data) {
      this.setData({ portalLoading: false, portalError: response.message || '\u52a0\u8f7d\u5931\u8d25' })
      return
    }
    const data = response.data
    const next = data.nextTask || {}
    const firstProject = Array.isArray(data.projects) && data.projects[0] || {}
    const todoCount = Number(data.stats && data.stats.todos) || 0
    const copy = Object.assign({}, this.data.copy, {
      pendingSummary: '\u4eca\u5929\u6709 ' + todoCount + ' \u9879\u5f85\u5904\u7406',
      nextTitle: firstProject.title || '\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
      nextTask: next.title || firstProject.nextAction || '\u7ee7\u7eed\u5904\u7406\u9879\u76ee',
      nextDeadline: next.deadline || '',
      allTodos: '\u5168\u90e8 ' + (Array.isArray(data.todos) ? data.todos.length : 0),
    })
    this.setData({
      copy,
      portalLoading: false,
      stats: [
        { label: '\u8fdb\u884c\u4e2d', value: String(Number(data.stats && data.stats.ongoing) || 0) },
        { label: '\u4eca\u65e5\u5f85\u529e', value: String(todoCount) },
        { label: '\u5f85\u7ed3\u7b97', value: String(Number(data.stats && data.stats.pendingSettlement) || 0) },
      ],
      todos: (data.todos || []).map((item, index) => ({ id: item.id, title: item.title, subtitle: item.projectTitle || '', time: item.deadline || '', tone: index ? 'blue' : 'dark' })),
      projects: (data.projects || []).map((item, index) => ({
        id: item.id,
        title: item.title,
        tag: item.statusText || item.nextAction,
        progress: item.progress || 0,
        // 未签名的云存储直链会 403；仅接受可用的临时链/本地图，否则回退本地封面
        image: usableImageUrl(item.imageUrl) || PROJECTS[index % PROJECTS.length].image,
      })),
      nextProgress: Number(firstProject.progress) || 0,
    })
  },

  /**
   * 远程封面加载失败时回退到本地占位图，避免卡片出现空白块
   */
  handleProjectImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    const projects = this.data.projects.slice()
    const fallback = PROJECTS[index % PROJECTS.length].image
    if (!projects[index] || projects[index].image === fallback) return
    projects[index] = Object.assign({}, projects[index], { image: fallback })
    this.setData({ projects })
  },

  onResize() {
    this.setData(getLayout())
  },

  goProfile() {
    redirectTo('/pages/v2/designer-profile/index')
  },

  continueTask() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  viewProject() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  openTodo() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  openAllProjects() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  openQuickTool(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'illuminance') {
      navigateTo('/pages/search/search')
      return
    }
    if (id === 'temperature') {
      navigateTo('/pages/color-temp/color-temp')
      return
    }
    wx.showToast({
      title: COPY.checklistUnavailable,
      icon: 'none',
    })
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'workbench') return
    if (id === 'learning') {
      redirectTo('/pages/v2/designer-learning/index')
      return
    }
    if (id === 'tools') {
      redirectTo('/pages/v2/designer-tools/index')
      return
    }
    if (id === 'projects') {
      switchTo('/pages/designer-projects/designer-projects')
      return
    }
    if (id === 'profile') {
      redirectTo('/pages/v2/designer-profile/index')
    }
  },
})


