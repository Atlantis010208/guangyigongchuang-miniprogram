/**
 * 照度计算结果页面
 * 用于展示计算结果的详细信息
 */

Page({
  data: {
    // 计算模式
    mode: 'count', // 'count' | 'quantity' | 'lux'
    
    // 主要结果
    mainValue: 0,
    mainUnit: '',
    mainLabel: '',
    
    // 头部两个次要结果
    headerLeft: { label: '', value: '' },
    headerRight: { label: '', value: '' },
    
    // 详细参数列表
    details: []
  },

  onLoad(options) {
    console.log('[calc-result] onLoad, options:', options)
    
    // 从上一页传递的数据或全局数据中获取结果
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage && prevPage.data.resultData) {
      const resultData = prevPage.data.resultData
      this.setData({
        mode: resultData.mode || 'count',
        mainValue: resultData.mainValue || 0,
        mainUnit: resultData.mainUnit || '',
        mainLabel: resultData.mainLabel || '',
        headerLeft: resultData.headerLeft || { label: '', value: '' },
        headerRight: resultData.headerRight || { label: '', value: '' },
        details: resultData.details || []
      })
    }
  },

  onShow() {
    // 设置导航栏样式
    wx.setNavigationBarTitle({ title: '计算结果' })
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#F5F7FA'
    })
  },

  // 导出 CSV（功能待实现）
  onExportCSV() {
    wx.showToast({ 
      title: '功能开发中', 
      icon: 'none' 
    })
  },

  // 重新计算（返回上一页）
  onRecalculate() {
    wx.navigateBack({
      delta: 1
    })
  }
})
