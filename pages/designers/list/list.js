// 设计师列表页：筛选与预约
const util = require('../../../utils/util')

Page({
  data: {
    // 搜索关键词
    searchKeyword: '',
    // 筛选条件
    filters: {
      spaceType: '',      // 擅长空间类型
      minRating: 0,       // 最低评分
      hasCalcExp: false   // 有照度计算经验
    },
    // 选中的空间类型
    selectedSpace: '',
    // 设计师列表
    designers: [],
    loading: true,
    // 排序
    sortBy: 'rating' // rating, projects, price
  },

  onLoad() {
    this.loadDesigners()
  },

  onShow() {
    this.loadDesigners()
  },

  async loadDesigners() {
    this.setData({ loading: true })
    try {
      const { filters, sortBy } = this.data
      const page = 1
      const pageSize = 20
      const res = await wx.cloud.callFunction({
        name: 'designers_list',
        data: { filters, sortBy, page, pageSize }
      })
      const items = (res && res.result && res.result.items) ? res.result.items : []
      this.setData({ designers: items, loading: false })
    } catch (e) {
      this.setData({ designers: [], loading: false })
    }
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    // 可以添加防抖搜索
  },

  // 筛选标签点击
  onFilterTap(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ sortBy: filter })
    this.loadDesigners()
  },

  // 切换空间筛选（暂时简化）
  toggleSpaceFilter() {
    // 可以弹出选择器
    util.showToast('筛选功能开发中')
  },

  // 查看设计师详情
  onDesignerTap(e) {
    const id = e.currentTarget.dataset.id
    util.navigateTo(`/pages/designers/detail/detail?id=${id}`)
    util.hapticFeedback('light')
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadDesigners().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
