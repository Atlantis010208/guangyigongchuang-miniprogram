Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 空间类型选项
    spaceTypes: ['住宅', '商业', '办公', '酒店', '餐饮', '其他'],
    selectedSpaceType: '住宅', // 默认选中

    // 预算范围
    budgetMin: 5000,
    budgetMax: 25000,

    // 面积大小
    areaMin: '',
    areaMax: '',

    // 配套要求
    facilities: [
      { id: 'subway', name: '靠近地铁', icon: 'logistics' },
      { id: 'pet', name: '宠物友好', icon: 'like-o' },
      { id: 'bathroom', name: '独立卫浴', icon: 'wap-home-o' },
      { id: 'balcony', name: '独立阳台', icon: 'photo-o' },
      { id: 'furnished', name: '家电齐配', icon: 'desktop-o' },
      { id: 'south', name: '朝南采光', icon: 'sun-o' }
    ],
    selectedFacilities: ['subway', 'furnished'], // 默认选中项
    
    // 匹配结果数（模拟）
    resultCount: 24,

    // 底部安全区
    safeAreaBottom: 34
  },

  lifetimes: {
    attached() {
      // 获取系统信息适配底部安全区
      const sysInfo = wx.getSystemInfoSync()
      this.setData({
        safeAreaBottom: sysInfo.safeArea.bottom ? (sysInfo.screenHeight - sysInfo.safeArea.bottom) : 34
      })
    }
  },

  methods: {
    // 关闭弹窗
    onClose() {
      this.triggerEvent('close')
    },

    // 切换空间类型
    selectSpaceType(e) {
      const type = e.currentTarget.dataset.type
      this.setData({ selectedSpaceType: type })
    },

    // 输入预算
    onBudgetMinInput(e) {
      this.setData({ budgetMin: e.detail.value })
    },
    onBudgetMaxInput(e) {
      this.setData({ budgetMax: e.detail.value })
    },

    // 输入面积
    onAreaMinInput(e) {
      this.setData({ areaMin: e.detail.value })
    },
    onAreaMaxInput(e) {
      this.setData({ areaMax: e.detail.value })
    },

    // 切换配套要求多选
    toggleFacility(e) {
      const id = e.currentTarget.dataset.id
      let selected = [...this.data.selectedFacilities]
      const index = selected.indexOf(id)
      if (index > -1) {
        selected.splice(index, 1)
      } else {
        selected.push(id)
      }
      this.setData({ selectedFacilities: selected })
    },

    // 重置表单
    resetFilters() {
      this.setData({
        selectedSpaceType: '',
        budgetMin: '',
        budgetMax: '',
        areaMin: '',
        areaMax: '',
        selectedFacilities: []
      })
    },

    // 确认筛选
    confirmFilters() {
      const filters = {
        spaceType: this.data.selectedSpaceType,
        budget: [this.data.budgetMin, this.data.budgetMax],
        area: [this.data.areaMin, this.data.areaMax],
        facilities: this.data.selectedFacilities
      }
      console.log('应用筛选条件:', filters)
      
      // 触发确认事件，并传出数据，然后关闭弹窗
      this.triggerEvent('confirm', filters)
      this.onClose()
    }
  }
})
