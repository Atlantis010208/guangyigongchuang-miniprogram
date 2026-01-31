/**
 * 配件列表页面
 * 所有配件数据应从云端数据库获取，不再使用硬编码测试数据
 */
const util = require('../../../utils/util')

Page({
  data:{
    title:'配件列表',
    items:[],
    loading: false
  },

  onLoad(options){
    const title = options && options.title ? decodeURIComponent(options.title) : '配件列表'
    this.setData({ title })
    this.loadAccessoriesFromCloud(title)
  },

  /**
   * 从云端加载配件数据
   */
  async loadAccessoriesFromCloud(category) {
    this.setData({ loading: true })
    
    try {
      const res = await util.callCf('accessories_list', { category })
      
      if (res && res.success && res.data) {
        this.setData({ items: res.data })
      } else {
        console.warn('[配件列表] 云函数返回异常:', res?.message)
        this.setData({ items: [] })
        wx.showToast({ title: '暂无配件数据', icon: 'none' })
      }
    } catch (err) {
      console.error('[配件列表] 加载失败:', err)
      this.setData({ items: [] })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
