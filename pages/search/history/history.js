// 引入工具函数用于格式化时间
const formatTime = (date) => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

Page({
  data: {
    historyList: []
  },

  onShow() {
    this.loadHistory()
  },

  loadHistory() {
    try {
      const history = wx.getStorageSync('calc_history') || []
      // 格式化时间显示
      const formattedHistory = history.map(item => {
        return {
          ...item,
          timeStr: formatTime(new Date(item.timestamp))
        }
      })
      this.setData({
        historyList: formattedHistory
      })
    } catch (e) {
      console.error('读取历史记录失败', e)
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    
    // 根据 id 从原始数据中获取完整记录（避免 dataset 传递大对象导致数据丢失）
    const history = wx.getStorageSync('calc_history') || []
    const item = history.find(h => h.id === id)
    
    if (!item) {
      wx.showToast({
        title: '记录不存在',
        icon: 'none'
      })
      return
    }
    
    // 将选中的记录存入 storage，供上一页读取
    wx.setStorageSync('calc_history_selected', item)
    
    wx.navigateBack({
      delta: 1,
      success: () => {
        wx.showToast({
          title: '已回填数据',
          icon: 'success',
          duration: 1500
        })
      }
    })
  },

  onEditTitle(e) {
    const id = e.currentTarget.dataset.id
    const currentName = e.currentTarget.dataset.name || '计算记录'
    
    wx.showModal({
      title: '修改标题',
      content: currentName,
      editable: true,
      placeholderText: '请输入标题',
      success: (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim()
          if (!newName) return
          
          this.updateTitle(id, newName)
        }
      }
    })
  },

  updateTitle(id, newName) {
    try {
      let history = wx.getStorageSync('calc_history') || []
      const index = history.findIndex(item => item.id === id)
      
      if (index > -1) {
        history[index].customName = newName
        wx.setStorageSync('calc_history', history)
        
        // 更新页面数据
        this.loadHistory()
        
        wx.showToast({
          title: '修改成功',
          icon: 'none'
        })
      }
    } catch (e) {
      console.error('更新标题失败', e)
    }
  }
})