// pages/color-temp/color-temp-result/color-temp-result.js

Page({
  data: {
    result: {
      standardTemp: 0,
      desc: '',
      layers: [],
      tips: [],
      reasoning: ''
    }
  },

  onLoad(options) {
    const app = getApp()
    if (app.globalData && app.globalData.colorTempResult) {
      this.setData({ result: app.globalData.colorTempResult })
      this._saveHistory(app.globalData.colorTempResult, app.globalData.colorTempParams)
    }
  },

  _saveHistory(result, params) {
    if (!result || !params) return
    try {
      const record = {
        id: 'ct_' + Date.now(),
        timestamp: Date.now(),
        customName: '',
        params: params,
        result: result,
        summary: [params.spaceName, params.ageName, params.usageName].filter(Boolean).join(' · ') || '色温推荐',
        resultStr: '推荐 ' + result.standardTemp + 'K ' + (result.desc || '')
      }
      let history = []
      try { history = wx.getStorageSync('color_temp_history') || [] } catch (e) {}
      history.unshift(record)
      if (history.length > 20) history = history.slice(0, 20)
      wx.setStorageSync('color_temp_history', history)
      console.log('[色温结果页] 已保存历史记录')
    } catch (e) {
      console.warn('[色温结果页] 保存历史记录失败:', e)
    }
  },

  onRecalculate() {
    wx.navigateBack()
  }
})
