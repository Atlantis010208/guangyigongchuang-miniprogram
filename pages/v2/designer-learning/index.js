const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const designerApi = typeof require === 'function' ? require('../../../services/v2/designer') : { courses: async () => ({ ok: false, data: [] }) }
const COPY = Object.freeze({
  title: '\u5b66\u4e60',
  subtitle: '\u7cfb\u7edf\u638c\u63e1\u4e13\u4e1a\u706f\u5149\u8bbe\u8ba1\u65b9\u6cd5',
  courseTitle: '\u4e8c\u54e5\u706f\u5149\u8bbe\u8ba1\u5b9e\u6218\u7cfb\u7edf\u8bfe',
  courseSubtitle: '\u96f6\u57fa\u7840\u5230\u7cbe\u901a\uff0c\u638c\u63e1\u4e13\u4e1a\u706f\u5149\u8bbe\u8ba1\u6838\u5fc3\u903b\u8f91',
  instructor: '\u4e8c\u54e5',
  experience: '10\u5e74\u706f\u5149\u8bbe\u8ba1\u7ecf\u9a8c',
  startLearning: '\u7acb\u5373\u5b66\u4e60',
  courseIntroLink: '\u67e5\u770b\u8bfe\u7a0b\u4ecb\u7ecd',
  courseContent: '\u8bfe\u7a0b\u5185\u5bb9',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const HIGHLIGHTS = Object.freeze([
  {
    id: 'system',
    title: '\u7cfb\u7edf\u8bfe\u7a0b',
    subtitle: '\u5b8c\u6574\u65b9\u6cd5\u4f53\u7cfb',
  },
  {
    id: 'practice',
    title: '\u6848\u4f8b\u5b9e\u6218',
    subtitle: '\u771f\u5b9e\u9879\u76ee\u62c6\u89e3',
  },
  {
    id: 'delivery',
    title: '\u4e13\u4e1a\u843d\u5730',
    subtitle: '\u4ece\u65b9\u6848\u5230\u65bd\u5de5',
  },
])

const CONTENT_ITEMS = Object.freeze([
  {
    id: 'intro',
    icon: 'play',
    title: '\u8bfe\u7a0b\u4ecb\u7ecd',
    subtitle: '\u4e86\u89e3\u8bfe\u7a0b\u4f53\u7cfb\u4e0e\u5b66\u4e60\u65b9\u5f0f',
  },
  {
    id: 'catalog',
    icon: 'document',
    title: '\u8bfe\u7a0b\u76ee\u5f55',
    subtitle: '\u6309\u8bfe\u7a0b\u7ae0\u8282\u987a\u5e8f\u7cfb\u7edf\u5b66\u4e60',
  },
  {
    id: 'history',
    icon: 'clock',
    title: '\u5b66\u4e60\u8bb0\u5f55',
    subtitle: '\u67e5\u770b\u6700\u8fd1\u5b66\u4e60\u5185\u5bb9',
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
    headerHeight: Math.max(60, navigationBarHeight + 16),
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
    highlights: HIGHLIGHTS,
    contentItems: CONTENT_ITEMS,
    tabs: TABS,
    activeTab: 'learning',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 60,
    courseId: '',
    loading: true,
    loadError: '',
  },

  onLoad() {
    this.setData(getLayout())
    this.loadCourse()
  },

  onShow() {
    enforceV2Gate('designer')
  },

  async loadCourse() {
    const response = await designerApi.courses({ limit: 1 })
    const courses = response.ok && Array.isArray(response.data) ? response.data : []
    const course = courses[0]
    if (!course) {
      this.setData({ loading: false, loadError: response.message || '\u6682\u65e0\u8bfe\u7a0b' })
      return
    }
    this.setData({
      loading: false,
      courseId: course.courseId || course.id || course._id || '',
      copy: Object.assign({}, this.data.copy, {
        courseTitle: course.title || COPY.courseTitle,
        courseSubtitle: course.subtitle || course.description || COPY.courseSubtitle,
        instructor: course.instructorName || course.teacher || COPY.instructor,
      })
    })
  },

  onResize() {
    this.setData(getLayout())
  },

  openCourseRoute(tab) {
    const courseId = this.data.courseId || ''
    if (!courseId) { wx.showToast({ title: '\u6682\u65e0\u53ef\u5b66\u4e60\u8bfe\u7a0b', icon: 'none' }); return false }
    const query = tab ? '&tab=' + encodeURIComponent(tab) : ''
    navigateTo('/pages/course/course-detail/course-detail?id=' + encodeURIComponent(courseId) + query)
    return true
  },

  startLearning() { this.openCourseRoute('') },

  openCourseIntro() { this.openCourseRoute('') },

  openContentItem(event) {
    const id = event.currentTarget.dataset.id
    this.openCourseRoute(id === 'intro' ? '' : '1')
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'learning') return
    if (id === 'workbench') {
      redirectTo('/pages/v2/designer-workbench/index')
      return
    }
    if (id === 'projects') {
      redirectTo('/pages/v2/designer-projects/index')
      return
    }
    if (id === 'profile') {
      redirectTo('/pages/v2/designer-profile/index')
      return
    }
    if (id === 'tools') {
      redirectTo('/pages/v2/designer-tools/index')
    }
  },
})


