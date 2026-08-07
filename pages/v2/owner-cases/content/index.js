const ownerApi = typeof require === 'function' ? require('../../../../services/v2/owner') : { cases: async () => ({ ok: false }) }
const BASELINE_WIDTH = 375
const BASELINE_VIEWPORT_HEIGHT = 667
const BASELINE_TOP_INSET = 64
const RESERVED_BOTTOM_GAP = 14
const MAX_LAYOUT_EXPANSION = 80

const STRETCH_RATIOS = Object.freeze({
  intro: 0.125,
  search: 0.1,
  category: 0.075,
  section: 0.125,
  gridHeading: 0.05,
  caseImage: 0.1,
  rowGap: 0.2,
  contentBottom: 0.125,
})

const COPY = Object.freeze({
  title: '\u6848\u4f8b',
  subtitle: '\u4ece\u771f\u5b9e\u7a7a\u95f4\u91cc\uff0c\u627e\u5230\u9002\u5408\u4f60\u7684\u706f\u5149\u7075\u611f',
  searchPlaceholder: '\u641c\u7d22\u7a7a\u95f4\u3001\u98ce\u683c\u6216\u57ce\u5e02',
  featured: '\u7cbe\u9009\u6848\u4f8b',
  filter: '\u7b5b\u9009',
  empty: '\u6682\u65e0\u5339\u914d\u6848\u4f8b',
  profileAria: '\u8fdb\u5165\u6211\u7684\u9875\u9762',
  bookmarkAria: '\u6536\u85cf\u6848\u4f8b',
  unbookmarkAria: '\u53d6\u6d88\u6536\u85cf',
  casePreview: '\u6848\u4f8b\u8be6\u60c5\u5c06\u5728\u4e0b\u4e00\u9636\u6bb5\u63a5\u5165',
  filterPreview: '\u7b5b\u9009\u9762\u677f\u5c06\u5728\u4e0b\u4e00\u9636\u6bb5\u63a5\u5165',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
})

const CATEGORY_ITEMS = Object.freeze([
  { value: 'all', label: '\u5168\u90e8' },
  { value: 'residential', label: '\u4f4f\u5b85' },
  { value: 'commercial', label: '\u5546\u4e1a' },
  { value: 'hotel', label: '\u9152\u5e97' },
])

const CASE_ITEMS = Object.freeze([
  {
    id: 'nanjing-private',
    category: 'residential',
    title: '\u5357\u4eac \u00b7 \u79c1\u5b85\u7167\u660e',
    description: '\u73b0\u4ee3\u6781\u7b80',
    image: '/pages/v2/owner-cases/assets/case-nanjing.jpg',
  },
  {
    id: 'shanghai-minimal',
    category: 'residential',
    title: '\u4e0a\u6d77 \u00b7 \u6781\u7b80\u4f4f\u5b85',
    description: '\u65e0\u4e3b\u706f\u8bbe\u8ba1',
    image: '/pages/v2/owner-cases/assets/case-shanghai.jpg',
  },
  {
    id: 'hangzhou-lake',
    category: 'residential',
    title: '\u676d\u5dde \u00b7 \u6e56\u7554\u522b\u5885',
    description: '\u81ea\u7136\u5149\u5f71',
    image: '/pages/v2/owner-cases/assets/case-hangzhou.jpg',
  },
  {
    id: 'shenzhen-gallery',
    category: 'commercial',
    title: '\u6df1\u5733 \u00b7 \u827a\u672f\u5c55\u5385',
    description: '\u5546\u4e1a\u7167\u660e',
    image: '/pages/v2/owner-cases/assets/case-shenzhen.jpg',
  },
])

function roundMetric(value) {
  return Math.round(value * 100) / 100
}

function createCaseItems() {
  return CASE_ITEMS.map((item) => ({
    ...item,
    bookmarked: false,
    bookmarkIcon: '/pages/v2/owner-cases/assets/icon-bookmark.png',
    bookmarkAria: COPY.bookmarkAria,
  }))
}

function createCategories(activeCategory) {
  return CATEGORY_ITEMS.map((item) => ({
    ...item,
    className: item.value === activeCategory
      ? 'category category--active'
      : 'category',
  }))
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
  const screenHeight = Number(windowInfo.screenHeight) || 0
  const windowHeight = Number(windowInfo.windowHeight) || 0
  const viewportBottom = safeAreaBottom > 0
    ? safeAreaBottom
    : screenHeight || windowHeight || BASELINE_VIEWPORT_HEIGHT * scale
  const baselineBottom = BASELINE_VIEWPORT_HEIGHT * scale + topInsetDelta
  const rawExtra = Math.max(0, viewportBottom - baselineBottom)
  const layoutExtra = roundMetric(
    Math.min(
      MAX_LAYOUT_EXPANSION,
      Math.max(0, rawExtra - RESERVED_BOTTOM_GAP)
    )
  )

  return {
    statusBarHeight,
    navigationBarHeight,
    layoutExtra,
    introStretch: roundMetric(layoutExtra * STRETCH_RATIOS.intro),
    searchStretch: roundMetric(layoutExtra * STRETCH_RATIOS.search),
    categoryStretch: roundMetric(layoutExtra * STRETCH_RATIOS.category),
    sectionStretch: roundMetric(layoutExtra * STRETCH_RATIOS.section),
    gridHeadingStretch: roundMetric(
      layoutExtra * STRETCH_RATIOS.gridHeading
    ),
    caseImageStretch: roundMetric(layoutExtra * STRETCH_RATIOS.caseImage),
    rowGapStretch: roundMetric(layoutExtra * STRETCH_RATIOS.rowGap),
    contentBottomStretch: roundMetric(
      layoutExtra * STRETCH_RATIOS.contentBottom
    ),
    contentMinHeight: Math.max(0, roundMetric(viewportBottom - actualTopInset)),
  }
}

function showRouteError() {
  wx.showToast({
    title: COPY.routeError,
    icon: 'none',
  })
}

Component({
  options: {
    styleIsolation: 'isolated',
  },

  data: {
    copy: COPY,
    categories: createCategories('all'),
    cases: [],
    hasCases: false,
    loading: true,
    loadError: '',
    activeCategory: 'all',
    searchValue: '',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    layoutExtra: 0,
    introStretch: 0,
    searchStretch: 0,
    categoryStretch: 0,
    sectionStretch: 0,
    gridHeadingStretch: 0,
    caseImageStretch: 0,
    rowGapStretch: 0,
    contentBottomStretch: 0,
    contentMinHeight: 603,
  },

  lifetimes: {
    created() {
      this._caseItems = []
      this._layoutSignature = ''
    },

    attached() {
      this.updateLayout()
      this.loadCases()
    },
  },

  pageLifetimes: {
    resize() {
      this.updateLayout()
    },
  },

  methods: {

    async loadCases() {
      const response = await ownerApi.cases(30)
      const raw = response.ok && response.data && (response.data.items || response.data.list) || []
      this._caseItems = raw.map(item => ({
        id: item._id || item.id,
        category: item.category || item.spaceType || 'all',
        title: item.title || '\u706f\u5149\u8bbe\u8ba1\u6848\u4f8b',
        description: item.desc || item.description || '',
        image: item.imageUrl || (item.imageUrls && item.imageUrls[0]) || '',
        bookmarked: false,
        bookmarkIcon: '/pages/v2/owner-cases/assets/icon-bookmark.png',
        bookmarkAria: COPY.bookmarkAria,
      }))
      this.setData({ loading: false, loadError: response.ok ? '' : response.message })
      this.applyFilters(this.data.activeCategory, this.data.searchValue)
    },

    updateLayout() {
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

      const signature = [
        Number(windowInfo.windowWidth) || 0,
        Number(windowInfo.screenHeight) || Number(windowInfo.windowHeight) || 0,
        Number(windowInfo.statusBarHeight) || 0,
        Number(menuButton.top) || 0,
        Number(menuButton.height) || 0,
      ].join('|')

      if (signature === this._layoutSignature) return
      this._layoutSignature = signature
      this.setData(calculateLayout(windowInfo, menuButton))
    },

    applyFilters(activeCategory, searchValue) {
      const keyword = String(searchValue || '').trim().toLowerCase()
      const items = (this._caseItems || []).filter((item) => {
        const categoryMatch = activeCategory === 'all'
          || item.category === activeCategory
        const text = (item.title + ' ' + item.description).toLowerCase()
        return categoryMatch && (!keyword || text.includes(keyword))
      })

      this.setData({
        activeCategory,
        searchValue,
        categories: createCategories(activeCategory),
        cases: items,
        hasCases: items.length > 0,
      })
    },

    handleSearch(event) {
      this.applyFilters(this.data.activeCategory, event.detail.value)
    },

    selectCategory(event) {
      this.applyFilters(event.currentTarget.dataset.value, this.data.searchValue)
    },

    toggleBookmark(event) {
      const id = event.currentTarget.dataset.id
      this._caseItems = (this._caseItems || []).map((item) => {
        if (item.id !== id) return item
        const bookmarked = !item.bookmarked
        return {
          ...item,
          bookmarked,
          bookmarkIcon: bookmarked
            ? '/pages/v2/owner-cases/assets/icon-bookmark-active.png'
            : '/pages/v2/owner-cases/assets/icon-bookmark.png',
          bookmarkAria: bookmarked ? COPY.unbookmarkAria : COPY.bookmarkAria,
        }
      })
      this.applyFilters(this.data.activeCategory, this.data.searchValue)
    },

    openCase(event) {
      const caseId = String(event.currentTarget.dataset.id || '')
      wx.navigateTo({
        url: '/pages/v2/owner-case-detail/index?id=' + encodeURIComponent(caseId),
        fail: showRouteError,
      })
    },

    showFilterPreview() {
      wx.showToast({ title: COPY.filterPreview, icon: 'none' })
    },

    goProfile() {
      wx.navigateTo({
        url: '/pages/profile/home/home',
        fail: showRouteError,
      })
    },
  },
})




