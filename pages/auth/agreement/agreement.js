/**
 * 用户协议/隐私政策页面
 * 用于展示完整的协议内容，符合小程序隐私合规要求
 */
Page({
  data: {
    type: 'service', // 'service' 用户服务协议 | 'privacy' 隐私政策
    title: '',
    updateTime: '2024年12月1日'
  },

  onLoad(options) {
    const type = options.type || 'service'
    const title = type === 'privacy' ? '隐私政策' : '用户服务协议'
    
    this.setData({ type, title })
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({ title })
  },

  /**
   * 确认按钮点击
   */
  onConfirm() {
    wx.navigateBack()
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: this.data.title,
      path: `/pages/auth/agreement/agreement?type=${this.data.type}`
    }
  }
})

