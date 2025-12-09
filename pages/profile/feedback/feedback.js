/**
 * 用户反馈页面
 * 功能：提交反馈、查看历史反馈、查看反馈详情
 * 数据来源：云函数 feedback_operations
 */
const util = require('../../../utils/util')

Page({
  data: {
    activeTab: 'submit', // submit-提交反馈, history-历史记录
    
    // 反馈类型选项
    feedbackTypes: [
      { value: 'suggestion', label: '功能建议', icon: '💡', iconImage: '/images/功能建议单.png' },
      { value: 'bug', label: '问题反馈', icon: '🐛', iconImage: '/images/问题反馈.png' },
      { value: 'complaint', label: '投诉', icon: '😤', iconImage: '/images/投诉.png' },
      { value: 'other', label: '其他', icon: '📝', iconImage: '/images/其他服务.png' }
    ],
    
    // 表单数据
    form: {
      type: 'suggestion',
      content: '',
      images: [],
      contact: ''
    },
    
    // 提交状态
    submitting: false,
    
    // 历史记录
    historyList: [],
    loading: false,
    loadingMore: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    unreadCount: 0,
    
    // 详情弹窗
    showDetail: false,
    currentDetail: null
  },

  onLoad() {
    // 预加载历史记录数量
    this.loadUnreadCount()
  },

  onShow() {
    // 如果在历史记录页，刷新数据
    if (this.data.activeTab === 'history') {
      this.loadHistory(true)
    }
  },

  /**
   * 切换标签
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    
    this.setData({ activeTab: tab })
    
    if (tab === 'history' && this.data.historyList.length === 0) {
      this.loadHistory(true)
    }
  },

  /**
   * 选择反馈类型
   */
  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ 'form.type': type })
  },

  /**
   * 内容输入
   */
  onContentInput(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  /**
   * 联系方式输入
   */
  onContactInput(e) {
    this.setData({ 'form.contact': e.detail.value })
  },

  /**
   * 选择图片
   */
  chooseImage() {
    const count = 9 - this.data.form.images.length
    if (count <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath)
        this.setData({
          'form.images': [...this.data.form.images, ...newImages]
        })
      }
    })
  },

  /**
   * 移除图片
   */
  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.form.images]
    images.splice(index, 1)
    this.setData({ 'form.images': images })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.form.images[index],
      urls: this.data.form.images
    })
  },

  /**
   * 提交反馈
   */
  async submit() {
    const { form } = this.data
    
    // 验证内容
    if (!form.content || form.content.trim().length === 0) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' })
      return
    }

    if (form.content.length > 500) {
      wx.showToast({ title: '反馈内容不能超过500字', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    try {
      // 上传图片到云存储
      let uploadedImages = []
      if (form.images.length > 0) {
        uploadedImages = await this.uploadImages(form.images)
      }

      // 调用云函数提交反馈
      const res = await util.callCf('feedback_operations', {
        action: 'submit',
        feedback: {
          type: form.type,
          content: form.content.trim(),
          images: uploadedImages,
          contact: form.contact
        }
      })

      if (res && res.success) {
        wx.showToast({ title: '反馈已提交', icon: 'success' })
        
        // 重置表单
        this.setData({
          form: {
            type: 'suggestion',
            content: '',
            images: [],
            contact: ''
  }
})

        // 切换到历史记录并刷新
        setTimeout(() => {
          this.setData({ activeTab: 'history' })
          this.loadHistory(true)
        }, 1500)
        
      } else {
        wx.showToast({ 
          title: res.errorMessage || '提交失败', 
          icon: 'none' 
        })
      }

    } catch (err) {
      console.error('提交反馈异常:', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
      wx.hideLoading()
    }
  },

  /**
   * 上传图片到云存储
   */
  async uploadImages(images) {
    const uploadedImages = []
    
    for (let i = 0; i < images.length; i++) {
      const filePath = images[i]
      const cloudPath = `feedback/${Date.now()}_${i}_${Math.random().toString(36).substr(2, 8)}.jpg`
      
      try {
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath
        })
        
        if (uploadRes.fileID) {
          uploadedImages.push(uploadRes.fileID)
        }
      } catch (err) {
        console.error('上传图片失败:', err)
      }
    }
    
    return uploadedImages
  },

  /**
   * 加载未读数量
   */
  async loadUnreadCount() {
    try {
      const res = await util.callCf('feedback_operations', {
        action: 'list',
        page: 1,
        pageSize: 100
      })

      if (res && res.success && res.data) {
        const unreadCount = (res.data.list || []).filter(
          item => item.hasReply && !item.isRead
        ).length
        this.setData({ unreadCount })
      }
    } catch (err) {
      console.error('加载未读数量失败:', err)
    }
  },

  /**
   * 加载历史记录
   */
  async loadHistory(refresh = false) {
    if (refresh) {
      this.setData({ page: 1, hasMore: true, historyList: [] })
    }

    if (!this.data.hasMore) return
    if (refresh ? this.data.loading : this.data.loadingMore) return

    this.setData(refresh ? { loading: true } : { loadingMore: true })

    try {
      const res = await util.callCf('feedback_operations', {
        action: 'list',
        page: this.data.page,
        pageSize: this.data.pageSize
      })

      if (res && res.success && res.data) {
        const { list, totalPages } = res.data
        
        // 格式化时间
        const formattedList = (list || []).map(item => ({
          ...item,
          createdAtText: this.formatTime(item.createdAt)
        }))

        // 计算未读数量
        const unreadCount = formattedList.filter(
          item => item.hasReply && !item.isRead
        ).length

        this.setData({
          historyList: refresh ? formattedList : [...this.data.historyList, ...formattedList],
          hasMore: this.data.page < totalPages,
          page: this.data.page + 1,
          unreadCount
        })
      }

    } catch (err) {
      console.error('加载历史记录失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false, loadingMore: false })
    }
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (!this.data.loadingMore && this.data.hasMore) {
      this.loadHistory(false)
    }
  },

  /**
   * 查看反馈详情
   */
  async viewDetail(e) {
    const feedbackId = e.currentTarget.dataset.id
    
    wx.showLoading({ title: '加载中...', mask: true })

    try {
      const res = await util.callCf('feedback_operations', {
        action: 'detail',
        feedbackId
      })

      if (res && res.success && res.data) {
        const detail = res.data
        
        // 格式化时间
        detail.createdAtText = this.formatTime(detail.createdAt)
        if (detail.replyTime) {
          detail.replyTimeText = this.formatTime(detail.replyTime)
        }

        this.setData({
          showDetail: true,
          currentDetail: detail
        })

        // 如果之前未读，更新列表状态
        if (detail.reply && detail.isRead) {
          const historyList = this.data.historyList.map(item => {
            if (item._id === feedbackId) {
              return { ...item, isRead: true }
            }
            return item
          })
          
          const unreadCount = historyList.filter(
            item => item.hasReply && !item.isRead
          ).length
          
          this.setData({ historyList, unreadCount })
        }

      } else {
        wx.showToast({ title: res.errorMessage || '加载失败', icon: 'none' })
      }

    } catch (err) {
      console.error('获取反馈详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 关闭详情弹窗
   */
  closeDetail() {
    this.setData({ showDetail: false, currentDetail: null })
  },

  /**
   * 预览详情图片
   */
  previewDetailImage(e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.currentDetail.imageUrls || []
    wx.previewImage({
      current: urls[index],
      urls
    })
  },

  /**
   * 阻止冒泡
   */
  noop() {},

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    if (this.data.activeTab === 'history') {
      this.loadHistory(true).finally(() => {
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  }
})
