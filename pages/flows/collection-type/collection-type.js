const SPACE_TYPES = [
  { id: 'residential', title: '住宅空间', subtitle: '家庭照明', selected: true },
  { id: 'wellness', title: '疗愈服务空间', subtitle: '健康放松', selected: false },
  { id: 'office', title: '辅助办公空间', subtitle: '生产办公', selected: false },
  { id: 'fitness', title: '运动健身空间', subtitle: '活力运动', selected: false },
]

Page({
  data: {
    statusBarHeight: 20,
    navigationBarHeight: 44,
    spaceTypes: SPACE_TYPES,
    hasSelection: true,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const navigationBarHeight = Math.max(
      44,
      (menuButton.top - statusBarHeight) * 2 + menuButton.height
    )

    this.setData({ statusBarHeight, navigationBarHeight })
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/products/products' })
  },

  onTypeTap(event) {
    const { id } = event.currentTarget.dataset
    const spaceTypes = this.data.spaceTypes.map((item) => (
      Object.assign({}, item, { selected: item.id === id })
    ))

    this.setData({
      spaceTypes,
      hasSelection: true,
    })
  },

  onNext() {
    if (!this.data.hasSelection) return
    const selected = this.data.spaceTypes.find((item) => item.selected)
    if (!selected) return
    wx.navigateTo({
      url: `/pages/flows/collection-form/collection-form?spaceType=${selected.id}`,
    })
  },
})
