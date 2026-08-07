const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const designerApi = typeof require === 'function' ? require('../../../services/v2/designer') : { projects: async () => ({ ok: false }), demands: async () => ({ ok: false }) }

/**
 * 未签名的云存储直链会 403，不能当作有效封面。
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
  title: '\u9879\u76ee',
  subtitle: '\u7ba1\u7406\u8fdb\u5ea6\u3001\u4ea4\u4ed8\u4e0e\u7ed3\u7b97',
  marketplaceSubtitle: '\u7ba1\u7406\u9879\u76ee\u4e0e\u53d1\u73b0\u65b0\u673a\u4f1a',
  opportunitySection: '\u53ef\u63a5\u9879\u76ee',
  eligibleLabel: '\u53ef\u7533\u8bf7',
  ownerLabel: '\u4e1a\u4e3b',
  emptyOpportunities: '\u6682\u65e0\u7b26\u5408\u8be5\u7c7b\u578b\u7684\u53ef\u63a5\u9879\u76ee',
  budgetLabel: '\u9884\u7b97',
  areaLabel: '\u9762\u79ef',
  spaceLabel: '\u7a7a\u95f4',
  needLabel: '\u9700\u6c42',
  opportunityDetail: '\u67e5\u770b\u8be6\u60c5',
  applyLabel: '\u7533\u8bf7\u63a5\u5355',
  appliedLabel: '\u5df2\u7533\u8bf7',
  applicationNote: '\u7533\u8bf7\u540e\u7531\u5e73\u53f0\u5ba1\u6838\u5e76\u786e\u8ba4\u9879\u76ee\u5339\u914d\u3002',
  applicationFeedback: '\u7533\u8bf7\u5df2\u8bb0\u5f55\uff0c\u9884\u89c8\u9875\u4e0d\u63d0\u4ea4\u771f\u5b9e\u8ba2\u5355',
  clientLabel: '\u5ba2\u6237',
  separator: ' \u00b7 ',
  sectionTitle: '\u8fdb\u884c\u4e2d\u7684\u9879\u76ee',
  allProjects: '\u5168\u90e8 2',
  nextStep: '\u4e0b\u4e00\u6b65',
  progress: '\u9879\u76ee\u8fdb\u5ea6',
  completedSearchPlaceholder: '\u641c\u7d22\u5df2\u5b8c\u6210\u9879\u76ee',
  completedSection: '\u5df2\u5b8c\u6210\u9879\u76ee',
  sortByTime: '\u6309\u5b8c\u6210\u65f6\u95f4',
  completedLabel: '\u5df2\u5b8c\u6210',
  completedTimeLabel: '\u5b8c\u6210\u65f6\u95f4',
  settlementStatusLabel: '\u7ed3\u7b97\u72b6\u6001',
  settledLabel: '\u5df2\u7ed3\u7b97',
  deliveryStatusLabel: '\u4ea4\u4ed8\u72b6\u6001',
  viewCompletedProject: '\u67e5\u770b\u9879\u76ee',
  viewDeliveryFiles: '\u67e5\u770b\u4ea4\u4ed8\u6587\u4ef6',
  completedNote: '\u5df2\u5b8c\u6210\u9879\u76ee\u5c06\u4fdd\u7559\u4ea4\u4ed8\u4e0e\u7ed3\u7b97\u8bb0\u5f55\u3002',
  emptyCompleted: '\u672a\u627e\u5230\u76f8\u5173\u5df2\u5b8c\u6210\u9879\u76ee',
  deliveryFilesUnavailable: '\u4ea4\u4ed8\u6587\u4ef6\u9884\u89c8\u6682\u672a\u63a5\u5165',
  historyUnavailable: '\u5386\u53f2\u8bb0\u5f55\u9884\u89c8\u6682\u672a\u63a5\u5165',
  deliveryUnavailable: '\u4ea4\u4ed8\u7ba1\u7406\u529f\u80fd\u91cd\u6784\u4e2d',
  settlementUnavailable: '\u6536\u76ca\u7ed3\u7b97\u529f\u80fd\u91cd\u6784\u4e2d',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const CATEGORIES = Object.freeze([
  { id: 'mine', label: '\u6211\u7684\u9879\u76ee' },
  { id: 'marketplace', label: '\u63a5\u5355\u5927\u5385' },
  { id: 'completed', label: '\u5df2\u5b8c' },
])

const OPPORTUNITY_FILTERS = Object.freeze([
  { id: 'all', label: '\u5168\u90e8' },
  { id: 'residential', label: '\u4f4f\u5b85' },
  { id: 'commercial', label: '\u5546\u4e1a' },
  { id: 'office', label: '\u529e\u516c' },
  { id: 'outdoor', label: '\u6237\u5916' },
])

const OPPORTUNITIES = Object.freeze([
  {
    id: 'opportunity-residential',
    category: 'residential',
    title: '\u4f4f\u5b85\u706f\u5149\u8bbe\u8ba1\u9700\u6c42',
    owner: 'Qiny',
    summary: '\u6574\u5957\u706f\u5149\u8bbe\u8ba1',
    budget: '\u00a550/m\u00b2\u53ca\u4ee5\u4e0a',
    area: '90m\u00b2',
    space: '\u4f4f\u5b85',
    need: '\u5168\u5c4b\u706f\u5149\u65b9\u6848\u4e0e\u706f\u5177\u6e05\u5355',
    image: '/pages/v2/designer-workbench/assets/project-residential-card.webp',
    featured: true,
    applied: false,
  },
  {
    id: 'opportunity-commercial',
    category: 'commercial',
    title: '\u5546\u94fa \u00b7 \u706f\u5149\u65bd\u5de5\u56fe\u6df1\u5316',
    owner: 'Atlantis',
    summary: '\u53ea\u6df1\u5316\u706f\u5149\u65bd\u5de5\u56fe',
    budget: '\u00a516/m\u00b2',
    area: '30m\u00b2',
    space: '\u5546\u4e1a',
    need: '\u65bd\u5de5\u56fe\u6df1\u5316\u4e0e\u706f\u5177\u70b9\u4f4d\u786e\u8ba4',
    image: '/pages/v2/designer-workbench/assets/project-commercial.webp',
    featured: false,
    applied: false,
  },
])
const STATS = Object.freeze([
  { label: '\u8fdb\u884c\u4e2d', value: '2' },
  { label: '\u5f85\u4ea4\u4ed8', value: '1' },
  { label: '\u5f85\u7ed3\u7b97', value: '1' },
])

const PROJECTS = Object.freeze([
  {
    id: 'residential',
    title: '\u4f4f\u5b85\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
    client: 'Atlantis',
    space: '\u4f4f\u5b85',
    tag: '\u65b9\u6848\u8bbe\u8ba1',
    nextTask: '\u63d0\u4ea4\u521d\u7248\u706f\u5149\u65b9\u6848',
    deadline: '\u4eca\u5929 18:00 \u622a\u6b62',
    progress: 65,
    image: '/pages/v2/designer-workbench/assets/project-residential-card.webp',
    primary: true,
    primaryLabel: '\u7ee7\u7eed\u5904\u7406',
    detailLabel: '\u67e5\u770b\u8be6\u60c5',
  },
  {
    id: 'commercial',
    title: '\u5546\u94fa \u00b7 \u706f\u5149\u65bd\u5de5\u56fe',
    client: 'Atlantis',
    space: '\u5546\u4e1a',
    tag: '\u5f85\u4fee\u6539',
    nextTask: '\u4fee\u6539\u65bd\u5de5\u56fe',
    deadline: '7\u670826\u65e5 \u622a\u6b62',
    progress: 40,
    image: '/pages/v2/designer-workbench/assets/project-commercial.webp',
    primary: false,
    primaryLabel: '',
    detailLabel: '\u67e5\u770b\u9879\u76ee',
  },
])

const COMPLETED_PROJECTS = Object.freeze([
  {
    id: 'completed-residential',
    title: '\u4f4f\u5b85\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
    client: 'Qiny',
    space: '\u4f4f\u5b85',
    summary: '\u6574\u5957\u706f\u5149\u8bbe\u8ba1',
    completedAt: '2026\u5e746\u670818\u65e5',
    completedOrder: 20260618,
    delivery: '\u65b9\u6848\u4e0e\u706f\u5177\u6e05\u5355\u5df2\u4ea4\u4ed8',
    image: '/pages/v2/designer-workbench/assets/project-residential-card.webp',
  },
  {
    id: 'completed-commercial',
    title: '\u5546\u94fa \u00b7 \u706f\u5149\u65bd\u5de5\u56fe',
    client: 'Atlantis',
    space: '\u5546\u4e1a',
    summary: '\u706f\u5149\u65bd\u5de5\u56fe\u6df1\u5316',
    completedAt: '2026\u5e745\u670826\u65e5',
    completedOrder: 20260526,
    delivery: '\u65bd\u5de5\u56fe\u4e0e\u70b9\u4f4d\u6e05\u5355\u5df2\u4ea4\u4ed8',
    image: '/pages/v2/designer-workbench/assets/project-commercial.webp',
  },
])

const COMPLETED_HISTORY = Object.freeze([
  { id: 'delivery', title: '\u4ea4\u4ed8\u8bb0\u5f55', subtitle: '\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8\u6587\u4ef6', kind: 'folder' },
  { id: 'settlement', title: '\u7ed3\u7b97\u8bb0\u5f55', subtitle: '\u67e5\u770b\u5386\u53f2\u7ed3\u7b97\u660e\u7ec6', kind: 'wallet' },
])
const MANAGEMENT = Object.freeze([
  {
    id: 'delivery',
    title: '\u4ea4\u4ed8\u7ba1\u7406',
    subtitle: '1\u9879\u5f85\u5ba2\u6237\u786e\u8ba4',
    icon: '/pages/v2/designer-workbench/assets/icon-tab-tools-v2.png',
    kind: 'image',
  },
  {
    id: 'settlement',
    title: '\u6536\u76ca\u7ed3\u7b97',
    subtitle: '1\u9879\u5f85\u5904\u7406',
    icon: '',
    kind: 'wallet',
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

function showFeedback(title) {
  wx.showToast({
    title,
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

function getCompletedView(projects, searchValue, sortDesc) {
  const query = String(searchValue || '').trim().toLowerCase()
  return projects
    .filter((item) => !query || [item.title, item.client, item.space, item.summary]
      .some((value) => String(value).toLowerCase().includes(query)))
    .slice()
    .sort((left, right) => sortDesc
      ? right.completedOrder - left.completedOrder
      : left.completedOrder - right.completedOrder)
}
Page({
  data: {
    copy: COPY,
    categories: CATEGORIES,
    stats: STATS,
    opportunityFilters: OPPORTUNITY_FILTERS,
    opportunities: [],
    visibleOpportunities: [],
    activeOpportunityFilter: 'all',
    completedProjects: [],
    visibleCompletedProjects: [],
    completedHistory: [],
    completedSearch: '',
    completedSortDesc: true,
    projects: [],
    management: [],
    tabs: TABS,
    activeCategory: 'completed',
    headerSubtitle: COPY.marketplaceSubtitle,
    activeTab: 'projects',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 94,
    projectsLoading: true,
    projectsError: '',
  },

  onLoad() {
    this.setData(getLayout())
    this.loadProjectData()
  },

  onShow() {
    enforceV2Gate('designer')
  },

  async loadProjectData() {
    const [ongoingResponse, completedResponse, demandsResponse] = await Promise.all([
      designerApi.projects({ statusFilter: 'ongoing', pageSize: 20 }),
      designerApi.projects({ statusFilter: 'completed', pageSize: 20 }),
      designerApi.demands({ pageSize: 20 })
    ])
    const listOf = response => response.ok && response.data && (response.data.list || response.data.items) || []
    const ongoing = listOf(ongoingResponse).map((item, index) => ({
      id: item._id || item.id,
      title: item.title || '\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
      client: item.clientInfo && item.clientInfo.nickname || item.ownerName || '\u5ba2\u6237',
      space: item.categoryText || item.space || '',
      tag: item.statusText || '',
      nextTask: item.currentStepText || '\u7ee7\u7eed\u5904\u7406',
      deadline: item.timeText || '',
      progress: Number(item.progress) || 0,
      image: usableImageUrl(item.coverUrl || item.imageUrl) || PROJECTS[index % PROJECTS.length].image,
      primary: index === 0,
      primaryLabel: '\u7ee7\u7eed\u5904\u7406',
      detailLabel: '\u67e5\u770b\u8be6\u60c5',
    }))
    const completed = listOf(completedResponse).map((item, index) => ({
      id: item._id || item.id,
      title: item.title || '\u706f\u5149\u8bbe\u8ba1\u65b9\u6848',
      client: item.clientInfo && item.clientInfo.nickname || '\u5ba2\u6237',
      space: item.categoryText || '',
      summary: item.currentStepText || '\u6574\u5957\u706f\u5149\u8bbe\u8ba1',
      completedAt: item.completedAtText || item.timeText || '',
      completedOrder: Number(item.completedAt) || 0,
      delivery: item.deliveryText || '\u65b9\u6848\u4e0e\u706f\u5177\u6e05\u5355\u5df2\u4ea4\u4ed8',
      image: usableImageUrl(item.coverUrl || item.imageUrl) || COMPLETED_PROJECTS[index % COMPLETED_PROJECTS.length].image,
    }))
    const opportunities = listOf(demandsResponse).map((item, index) => ({
      id: item._id || item.id,
      title: item.title || item.categoryText || '\u53ef\u63a5\u9879\u76ee',
      owner: item.ownerName || '\u5ba2\u6237',
      category: item.category || 'all',
      budget: item.budget || '',
      area: item.area || '',
      space: item.space || item.categoryText || '',
      need: item.note || item.description || '',
      image: usableImageUrl(item.coverUrl || item.imageUrl) || OPPORTUNITIES[index % OPPORTUNITIES.length].image,
      applied: item.isCollected === true,
    }))
    this.setData({ projectsLoading: false, projectsError: ongoingResponse.ok ? '' : ongoingResponse.message, projects: ongoing, completedProjects: completed, visibleCompletedProjects: completed, opportunities, visibleOpportunities: opportunities })
  },

  onResize() {
    this.setData(getLayout())
  },


  switchCategory(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'mine') {
      this.setData({ activeCategory: id, headerSubtitle: COPY.subtitle })
      return
    }
    if (id === 'marketplace') {
      this.setData({ activeCategory: id, headerSubtitle: COPY.marketplaceSubtitle })
      return
    }
    if (id === 'completed') {
      this.setData({ activeCategory: id, headerSubtitle: COPY.marketplaceSubtitle })
    }
  },

  switchOpportunityFilter(event) {
    const id = event.currentTarget.dataset.id
    const visibleOpportunities = id === 'all'
      ? this.data.opportunities
      : this.data.opportunities.filter((item) => item.category === id)
    this.setData({
      activeOpportunityFilter: id,
      visibleOpportunities,
    })
  },

  viewOpportunity() {
    navigateTo('/pages/designer-demands/designer-demands')
  },

  applyOpportunity(event) {
    const id = event.currentTarget.dataset.id
    const opportunities = this.data.opportunities.map((item) => (
      item.id === id ? Object.assign({}, item, { applied: true }) : item
    ))
    const activeFilter = this.data.activeOpportunityFilter
    const visibleOpportunities = activeFilter === 'all'
      ? opportunities
      : opportunities.filter((item) => item.category === activeFilter)
    this.setData({ opportunities, visibleOpportunities })
    showFeedback(COPY.applicationFeedback)
  },
  searchCompleted(event) {
    const completedSearch = event.detail.value
    this.setData({
      completedSearch,
      visibleCompletedProjects: getCompletedView(
        this.data.completedProjects,
        completedSearch,
        this.data.completedSortDesc
      ),
    })
  },

  toggleCompletedSort() {
    const completedSortDesc = !this.data.completedSortDesc
    this.setData({
      completedSortDesc,
      visibleCompletedProjects: getCompletedView(
        this.data.completedProjects,
        this.data.completedSearch,
        completedSortDesc
      ),
    })
  },

  viewCompletedProject() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  viewDeliveryFiles() {
    showFeedback(COPY.deliveryFilesUnavailable)
  },

  openCompletedHistory() {
    showFeedback(COPY.historyUnavailable)
  },
  openAllProjects() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  continueProject() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  viewProject() {
    switchTo('/pages/designer-projects/designer-projects')
  },

  openManagement(event) {
    const id = event.currentTarget.dataset.id
    showFeedback(
      id === 'delivery'
        ? COPY.deliveryUnavailable
        : COPY.settlementUnavailable
    )
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'projects') return
    if (id === 'workbench') {
      redirectTo('/pages/v2/designer-workbench/index')
      return
    }
    if (id === 'learning') {
      redirectTo('/pages/v2/designer-learning/index')
      return
    }
    if (id === 'tools') {
      redirectTo('/pages/v2/designer-tools/index')
      return
    }
    if (id === 'profile') {
      redirectTo('/pages/v2/designer-profile/index')
    }
  },
})


