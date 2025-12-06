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
   * 加载用户信息
   */
  loadUserInfo() {
    const userDoc = wx.getStorageSync('userDoc') || {}
    const openid = wx.getStorageSync('openid') || ''
    const rawAvatarUrl = userDoc.avatarUrl || ''

    this.setData({
      openid: openid,
      userId: userDoc._id || '',
      nickname: userDoc.nickname || userDoc.nickName || '',
      phone: userDoc.phoneNumber || '',
      avatarUrl: '', // 先置空，等转换后再设置
      avatarFileID: rawAvatarUrl.startsWith('cloud://') ? rawAvatarUrl : ''
    })

    // 转换头像地址为可用的临时链接
    this.convertAvatarUrl(rawAvatarUrl)
  },

  /**
   * 转换头像URL
   * 如果是 cloud:// fileID 则获取临时链接
   * 如果是已过期的 tcb.qcloud.la 链接，尝试从云数据库重新获取 fileID
   */
  async convertAvatarUrl(avatarUrl) {
    if (!avatarUrl) return

    // 如果是 cloud:// 开头的 fileID，需要转换为临时链接
    if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
        if (res && res.fileList && res.fileList[0]) {
          const item = res.fileList[0]
          if (item.tempFileURL) {
            this.setData({ 
              avatarUrl: item.tempFileURL,
              avatarFileID: avatarUrl 
            })
          } else {
            // 转换失败，可能文件不存在
            this.setData({ avatarUrl: '' })
          }
        }
      } catch (e) {
        console.warn('转换头像URL失败', e)
        this.setData({ avatarUrl: '' })
      }
      return
    }

    // 如果是 tcb.qcloud.la 的临时链接（可能已过期），尝试从云数据库重新获取
    if (avatarUrl.includes('tcb.qcloud.la') || avatarUrl.includes('.tcb.')) {
      try {
        await this.refreshAvatarFromCloud()
      } catch (e) {
        console.warn('刷新头像失败', e)
        this.setData({ avatarUrl: '' })
      }
      return
    }

    // 其他情况（如 http/https 外链），直接使用
    this.setData({ avatarUrl })
  },

  /**
   * 从云数据库重新获取头像 fileID 并转换
   */
  async refreshAvatarFromCloud() {
    if (!wx.cloud) return

    const { userId, openid } = this.data
    if (!userId && !openid) return

    const db = wx.cloud.database()
    let userRecord = null

    try {
      if (userId) {
        const res = await db.collection('users').doc(userId).get()
        userRecord = res && res.data
      } else if (openid) {
        const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
        userRecord = res && res.data && res.data[0]
      }
    } catch (e) {
      console.warn('查询用户记录失败', e)
      return
    }

    if (!userRecord || !userRecord.avatarUrl) return

    const fileID = userRecord.avatarUrl

    // 如果数据库中存的是 cloud:// fileID，则转换
    if (fileID.startsWith('cloud://')) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          this.setData({ 
            avatarUrl: res.fileList[0].tempFileURL,
            avatarFileID: fileID
          })

          // 更新本地缓存中的 avatarUrl 为 fileID（确保缓存的是原始 fileID）
          const userDoc = wx.getStorageSync('userDoc') || {}
          userDoc.avatarUrl = fileID
          try { wx.setStorageSync('userDoc', userDoc) } catch (e) {}
        }
      } catch (e) {
        console.warn('获取临时链接失败', e)
      }
    }
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

      const cloudPath = `avatars/${this.data.openid || 'unknown'}-${Date.now()}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })

      wx.hideLoading()

      if (uploadRes && uploadRes.fileID) {
        this.setData({ 
          avatarUrl: uploadRes.fileID, 
          avatarFileID: uploadRes.fileID 
        })
        wx.showToast({ title: '头像已更新', icon: 'success' })
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
          const newDoc = { ...userDoc, phoneNumber }
          try { wx.setStorageSync('userDoc', newDoc) } catch (e) {}

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
   * 保存修改
   */
  async onSave() {
    if (this.data.saving) return

    const { nickname, phone, avatarUrl, avatarFileID, userId, openid } = this.data

    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      wx.showLoading({ title: '保存中...', mask: true })

      // 保存到数据库时，优先使用 fileID（cloud://格式），确保不会保存过期的临时链接
      const avatarToSave = avatarFileID || avatarUrl

      const db = wx.cloud.database()
      const updateData = {
        nickname: nickname.trim(),
        avatarUrl: avatarToSave,
        updatedAt: Date.now()
      }

      if (userId) {
        await db.collection('users').doc(userId).update({ data: updateData })
      } else if (openid) {
        // 兜底逻辑
        const exist = await db.collection('users').where({ _openid: openid }).limit(1).get()
        if (exist && exist.data && exist.data.length) {
          await db.collection('users').doc(exist.data[0]._id).update({ data: updateData })
        }
      }

      // 更新本地缓存（保存 fileID 格式）
      const userDoc = wx.getStorageSync('userDoc') || {}
      const newDoc = { ...userDoc, nickname: nickname.trim(), avatarUrl: avatarToSave }
      try { wx.setStorageSync('userDoc', newDoc) } catch (e) {}

      // 更新全局数据
      const app = getApp()
      app.globalData.userDoc = newDoc

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })

      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
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
  }
})
