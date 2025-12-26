/**
 * 个人中心首页
 * 功能：显示用户信息、导航到各子页面
 */
const auth = require('../../../utils/auth.js')

Page({
  data: {
    user: { name: '', phone: '', avatar: '' },
    userAvatarDisplay: '', // 用于显示的头像临时链接
    userAvatarFileID: '', // 原始 cloud:// fileID
    userId: '',
    openid: '',
    isAdmin: false,
    isDesigner: false,
    isLoggedIn: false // 登录状态
  },

  onShow() {
    // 检查登录状态
    const app = getApp()
    const isLoggedIn = app.isLoggedIn()
    this.setData({ isLoggedIn })
    
    if (isLoggedIn) {
      this.loadUserData()
    }
  },

  /**
   * 加载用户数据
   * 优先从云数据库获取，失败则使用本地缓存
   */
  async loadUserData() {
    try {
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      const userId = cachedDoc && cachedDoc._id ? cachedDoc._id : ''
      const openid = wx.getStorageSync('openid') || ''
      
      this.setData({ userId, openid })

      // 如果没有云开发或没有任何标识，使用本地存储
      if (!wx.cloud || (!userId && !openid)) {
        this.loadFromLocalStorage()
        return
      }

      const db = wx.cloud.database()
      let doc = null

      // 方法1：通过 _id 查询（需要 try-catch 因为文档不存在会报错）
      if (userId) {
        try {
          const d = await db.collection('users').doc(userId).get()
          doc = d && d.data
        } catch (docErr) {
          // _id 查询失败（文档可能已被删除），降级使用 _openid 查询
          console.warn('通过 _id 查询失败，尝试使用 _openid 查询', docErr.message)
        }
      }

      // 方法2：如果 _id 查询失败，通过 _openid 查询
      if (!doc && openid) {
        try {
          const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
          doc = (q && q.data && q.data[0]) || null
        } catch (queryErr) {
          console.warn('通过 _openid 查询失败', queryErr.message)
        }
      }

      // 成功获取到用户文档
      if (doc) {
        // 更新本地缓存（确保 _id 是最新的）
        try { 
          wx.setStorageSync('userDoc', doc) 
        } catch (e) {
          console.warn('更新 userDoc 缓存失败', e)
        }

        this.setData({
          user: {
            name: doc.nickname || '',
            phone: doc.phoneNumber || '',
            avatar: doc.avatarUrl || ''
          },
          userId: doc._id || '',
          isAdmin: auth.isAdmin(doc),
          isDesigner: auth.isDesigner(doc)
        })

        // 转换头像为临时链接
        if (doc.avatarUrl) {
          await this.convertAvatarUrl(doc.avatarUrl)
        }
        return
      }

      // 云端没有用户记录，可能是登录状态无效
      console.warn('云端未找到用户记录，本地缓存可能已过期')
      
      // 清理可能过期的缓存
      this.clearInvalidCache()
      
      // 使用本地存储作为兜底
      this.loadFromLocalStorage()
      
    } catch (err) {
      console.error('加载个人中心用户资料失败', err)
      // 发生错误时使用本地存储兜底
      this.loadFromLocalStorage()
    }
  },

  /**
   * 从本地存储加载用户信息（兜底方案）
   */
  async loadFromLocalStorage() {
    const local = wx.getStorageSync('user_profile') || {}
    const cachedDoc = wx.getStorageSync('userDoc') || {}
    const avatarUrl = local.avatar || cachedDoc.avatarUrl || ''
    
    this.setData({
      user: {
        name: local.name || cachedDoc.nickname || '',
        phone: local.phone || cachedDoc.phoneNumber || '',
        avatar: avatarUrl
      }
    })

    // 转换头像
    if (avatarUrl) {
      await this.convertAvatarUrl(avatarUrl)
    }
  },

  /**
   * 清理无效的缓存
   * 当云端找不到用户记录时调用
   */
  clearInvalidCache() {
    try {
      // 只清理 userDoc 中的 _id，保留其他信息
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      if (cachedDoc._id) {
        delete cachedDoc._id
        wx.setStorageSync('userDoc', cachedDoc)
        console.log('已清理无效的 userDoc._id')
      }
    } catch (e) {
      console.warn('清理缓存失败', e)
    }
  },
  
  /**
   * 编辑资料
   */
  editProfile() {
    // 检查是否已登录
    const openid = wx.getStorageSync('openid')
    if (!openid) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/auth/login/login' })
          }
        }
      })
      return
    }
    wx.navigateTo({ url: '/pages/auth/profile-edit/profile-edit' })
  },
  
  /**
   * 页面跳转
   */
  go(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    
    // 订单跳转到购物车tab页
    if (url === '/pages/cart/cart') {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  },
  
  /**
   * 拨打电话
   */
  callPhone(e) {
    e.stopPropagation() // 阻止冒泡到 profile-card
    const phone = this.data.user.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    } else {
      wx.showToast({ title: '暂无手机号', icon: 'none' })
    }
  },

  /**
   * 联系客服
   */
  onContact() { 
    wx.navigateTo({ url: '/pages/support/contact/contact' }) 
  },

  /**
   * 跳转到登录页面
   */
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/profile/home/home')
    })
  },

  /**
   * 转换头像 URL
   * 如果是 cloud:// fileID，需要转换为临时链接
   */
  async convertAvatarUrl(avatarUrl) {
    if (!avatarUrl) {
      this.setData({ userAvatarDisplay: '', userAvatarFileID: '' })
      return
    }

    // 如果是 cloud:// fileID，需要转换
    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ 
            userAvatarDisplay: res.fileList[0].tempFileURL,
            userAvatarFileID: avatarUrl 
          })
        } else {
          console.warn('头像转换失败')
          this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl })
        }
      } catch (e) {
        console.warn('头像转换异常', e)
        this.setData({ userAvatarDisplay: '', userAvatarFileID: avatarUrl })
      }
    } else {
      // 不是 cloud:// 格式，直接使用
      this.setData({ userAvatarDisplay: avatarUrl, userAvatarFileID: '' })
    }
  },

  /**
   * 头像加载失败时的处理
   */
  async onAvatarError() {
    console.warn('头像图片加载失败')
    
    const { userAvatarFileID } = this.data
    
    // 如果有 fileID，尝试重新获取
    if (userAvatarFileID && userAvatarFileID.startsWith('cloud://') && wx.cloud) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [userAvatarFileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ userAvatarDisplay: res.fileList[0].tempFileURL })
          return
        }
      } catch (e) {
        console.warn('重新获取头像失败', e)
      }
    }
    
    // 失败则显示默认头像
    this.setData({ userAvatarDisplay: '' })
  }
})
