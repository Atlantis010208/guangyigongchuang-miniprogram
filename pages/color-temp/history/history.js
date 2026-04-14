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
      const history = wx.getStorageSync('color_temp_history') || []
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
      console.error('[色温历史] 读取历史记录失败', e)
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id

    const history = wx.getStorageSync('color_temp_history') || []
    const item = history.find(h => h.id === id)

    if (!item) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }

    wx.setStorageSync('color_temp_history_selected', item)

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
    const currentName = e.currentTarget.dataset.name || '色温推荐'

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
      let history = wx.getStorageSync('color_temp_history') || []
      const index = history.findIndex(item => item.id === id)

      if (index > -1) {
        history[index].customName = newName
        wx.setStorageSync('color_temp_history', history)
        this.loadHistory()
        wx.showToast({ title: '修改成功', icon: 'none' })
      }
    } catch (e) {
      console.error('[色温历史] 更新标题失败', e)
    }
  }
})
