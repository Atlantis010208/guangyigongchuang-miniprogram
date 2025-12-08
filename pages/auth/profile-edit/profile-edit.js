/**
 * 个人资料编辑页面
 * 功能：修改昵称、头像、手机号，查看登录状态
 */
const util = require('../../../utils/util')

Page({
  data: {
    nickname: '',
    phone: '',
    avatarUrl: '',
    avatarFileID: '',
    openid: '',
    userId: '',
    saving: false,
    loading: false,
    loginExpireInfo: null
  },

  onLoad() {
    const app = getApp()
    
    // 检查登录状态
    if (!app.requireLogin(true)) {
      return
    }

    this.loadUserInfo()
    this.updateLoginExpireInfo()
  },

  onShow() {
    // 每次显示页面时更新登录状态信息
    this.updateLoginExpireInfo()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadUserInfo().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载用户信息（通过云函数）
   */
  async loadUserInfo() {
    this.setData({ loading: true })
    
    try {
      const res = await util.callCf('user_operations', {
        action: 'get'
      })
      
      if (res && res.success && res.data) {
        const user = res.data
        
        this.setData({
          userId: user.id || '',
          nickname: user.nickname || '',
          phone: user.phoneNumber || '',
          avatarUrl: user.avatarTempUrl || '',  // 使用临时链接显示
          avatarFileID: user.avatarUrl || '',    // 保存原始 fileID
          openid: wx.getStorageSync('openid') || ''
        })
        
        // 更新本地缓存
        const userDoc = {
          _id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          phoneNumber: user.phoneNumber,
          roles: user.roles
        }
        wx.setStorageSync('userDoc', userDoc)
      } else {
        console.warn('获取用户信息失败:', res?.message)
        // 降级到本地缓存
        this.loadFromLocal()
      }
    } catch (err) {
      console.error('加载用户信息失败:', err)
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 从本地缓存加载用户信息（降级方案）
   */
  loadFromLocal() {
    const userDoc = wx.getStorageSync('userDoc') || {}
    const openid = wx.getStorageSync('openid') || ''
    const rawAvatarUrl = userDoc.avatarUrl || ''

    this.setData({
      openid: openid,
      userId: userDoc._id || '',
      nickname: userDoc.nickname || userDoc.nickName || '',
      phone: userDoc.phoneNumber || '',
      avatarUrl: '',
      avatarFileID: rawAvatarUrl.startsWith('cloud://') ? rawAvatarUrl : ''
    })

    // 转换头像地址
    this.convertAvatarUrl(rawAvatarUrl)
  },

  /**
   * 转换头像URL（将 cloud:// fileID 转换为临时链接）
   */
  async convertAvatarUrl(avatarUrl) {
    if (!avatarUrl) return

    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ 
            avatarUrl: res.fileList[0].tempFileURL,
            avatarFileID: avatarUrl 
          })
        }
      } catch (e) {
        console.warn('转换头像URL失败', e)
      }
      return
    }

    // 其他情况直接使用
    this.setData({ avatarUrl })
  },

  /**
   * 更新登录过期信息
   */
  updateLoginExpireInfo() {
    const expireTime = wx.getStorageSync('loginExpireTime')
    const now = Date.now()

    if (!expireTime) {
      this.setData({ loginExpireInfo: null })
      return
    }

    const isValid = now < expireTime
    const remainMs = expireTime - now
    const remainHours = Math.floor(remainMs / (1000 * 60 * 60))
    const remainMinutes = Math.floor((remainMs % (1000 * 60 * 60)) / (1000 * 60))

    let remainText = ''
    if (remainHours > 0) {
      remainText = `${remainHours}小时${remainMinutes}分钟`
    } else if (remainMinutes > 0) {
      remainText = `${remainMinutes}分钟`
    } else {
      remainText = '不到1分钟'
    }

    this.setData({
      loginExpireInfo: {
        isValid,
        remainText,
        expireTime
      }
    })
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  /**
   * 选择并上传头像
   */
  async chooseAvatar() {
    try {
      const res = await wx.chooseMedia({ 
        count: 1, 
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      })
      
      if (!res || !res.tempFiles || !res.tempFiles.length) return
      
      const tempPath = res.tempFiles[0].tempFilePath

      // 上传到云存储
      if (!wx.cloud) {
        this.setData({ avatarUrl: tempPath })
        return
      }

      wx.showLoading({ title: '上传中...', mask: true })

      const openid = this.data.openid || wx.getStorageSync('openid') || 'unknown'
      const cloudPath = `avatars/${openid}-${Date.now()}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })

      wx.hideLoading()

      if (uploadRes && uploadRes.fileID) {
        // 获取临时链接用于显示
        let tempUrl = uploadRes.fileID
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
          if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
            tempUrl = urlRes.fileList[0].tempFileURL
          }
        } catch (e) {
          console.warn('获取临时链接失败', e)
        }
        
        this.setData({ 
          avatarUrl: tempUrl, 
          avatarFileID: uploadRes.fileID 
        })
        wx.showToast({ title: '头像已上传', icon: 'success' })
      } else {
        this.setData({ avatarUrl: tempPath })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('选择/上传头像失败', err)
      wx.showToast({ title: '头像上传失败', icon: 'none' })
    }
  },

  /**
   * 获取/更换手机号
   */
  async onGetPhoneNumber(e) {
    const detail = e && e.detail

    if (!detail || detail.errMsg.indexOf('ok') === -1) {
      console.log('用户取消手机号授权')
      return
    }

    if (!detail.code) {
      wx.showToast({ title: '授权码获取失败', icon: 'none' })
      return
    }

    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '获取中...', mask: true })

      const res = await wx.cloud.callFunction({ 
        name: 'getPhoneNumber', 
        data: { code: detail.code, saveToDb: true } 
      })

      wx.hideLoading()

      if (res && res.result && res.result.success) {
        const phoneInfo = res.result.phoneInfo
        if (phoneInfo && phoneInfo.phoneNumber) {
          const phoneNumber = phoneInfo.phoneNumber
          this.setData({ phone: phoneNumber })

          // 更新本地缓存
          const userDoc = wx.getStorageSync('userDoc') || {}
          userDoc.phoneNumber = phoneNumber
          wx.setStorageSync('userDoc', userDoc)

          wx.showToast({ title: '手机号已更新', icon: 'success' })
        }
      } else {
        wx.showToast({ 
          title: res?.result?.errorMessage || '手机号获取失败', 
          icon: 'none' 
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('获取手机号失败', err)
      wx.showToast({ title: '手机号获取失败', icon: 'none' })
    }
  },

  /**
   * 保存修改（通过云函数）
   */
  async onSave() {
    if (this.data.saving) return

    const { nickname, avatarFileID } = this.data

    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      wx.showLoading({ title: '保存中...', mask: true })

      // 通过云函数更新用户信息
      const res = await util.callCf('user_operations', {
        action: 'update',
        updateData: {
          nickname: nickname.trim(),
          avatarUrl: avatarFileID || ''
        }
      })

      wx.hideLoading()

      if (res && res.success) {
        // 更新本地缓存
        const userDoc = wx.getStorageSync('userDoc') || {}
        userDoc.nickname = nickname.trim()
        if (avatarFileID) {
          userDoc.avatarUrl = avatarFileID
        }
        wx.setStorageSync('userDoc', userDoc)

        // 更新全局数据
        const app = getApp()
        app.globalData.userDoc = userDoc

        wx.showToast({ title: '保存成功', icon: 'success' })

        setTimeout(() => {
          wx.navigateBack()
        }, 1000)
      } else {
        // 显示具体错误信息
        const errorMsg = res?.message || '保存失败'
        wx.showToast({ title: errorMsg, icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#ff3b30',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.clearLoginCache()
          
          wx.showToast({ title: '已退出登录', icon: 'success' })
          
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/auth/login/login' })
          }, 1000)
        }
      }
    })
  },

  /**
   * 注销账号
   */
  async onDeleteAccount() {
    const confirm1 = await util.showConfirm('注销账号后，您的所有数据将被清除且无法恢复。确定要继续吗？', '注销账号')
    if (!confirm1) return
    
    const confirm2 = await util.showConfirm('请再次确认：注销后账号将无法找回！', '最终确认')
    if (!confirm2) return
    
    util.showLoading('注销中...')
    
    try {
      const res = await util.callCf('user_operations', {
        action: 'delete_account'
      })
      
      util.hideLoading()
      
      if (res && res.success) {
        // 清除本地登录信息
        const app = getApp()
        app.clearLoginCache()
        
        wx.showToast({ title: '账号已注销', icon: 'success' })
        
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/auth/login/login' })
        }, 1500)
      } else {
        util.showError(res?.message || '注销失败')
      }
    } catch (err) {
      util.hideLoading()
      console.error('注销账号失败:', err)
      util.showError('注销失败')
    }
  }
})
