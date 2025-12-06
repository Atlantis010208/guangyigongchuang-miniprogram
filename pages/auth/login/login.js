/**
 * 登录页面
 * 功能：三步授权流程 - 微信登录 + 昵称头像 + 手机号验证
 * 登录状态有效期：1天
 * 
 * 参考微信官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html
 * - 头像：使用 button open-type="chooseAvatar" + bindchooseavatar
 * - 昵称：使用 input type="nickname" + form submit 收集
 */
const util = require('../../../utils/util')

// 登录有效期：1天（毫秒）
const LOGIN_EXPIRE_DURATION = 24 * 60 * 60 * 1000

Page({
  data: {
    step: 1, // 当前步骤：1-微信登录，2-昵称头像，3-手机号授权，4-完成
    loginLoading: false,
    profileLoading: false,
    phoneLoading: false,
    openid: '',
    unionId: '',
    userId: '',
    nickname: '',
    avatarUrl: '',
    avatarTempPath: '', // 头像临时路径（用于上传）
    phoneNumber: '',
    userDoc: null
  },

  onLoad() {
    // 检查是否已登录且未过期
    this.checkLoginStatus()
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    try {
      const userDoc = wx.getStorageSync('userDoc')
      const openid = wx.getStorageSync('openid')
      const expireTime = wx.getStorageSync('loginExpireTime')
      const now = Date.now()

      if (userDoc && userDoc._id && openid && expireTime && now < expireTime) {
        console.log('登录状态有效，直接跳转首页')
        wx.reLaunch({ url: '/pages/products/products' })
        return
      }

      if (expireTime && now >= expireTime) {
        console.log('登录已过期，需要重新登录')
        this.clearLoginCache()
      }
    } catch (e) {
      console.warn('检查登录状态失败', e)
    }
  },

  /**
   * 清理登录缓存
   */
  clearLoginCache() {
    try {
      wx.removeStorageSync('userDoc')
      wx.removeStorageSync('openid')
      wx.removeStorageSync('unionId')
      wx.removeStorageSync('loginTime')
      wx.removeStorageSync('loginExpireTime')
      wx.removeStorageSync('userInfo')
    } catch (e) {
      console.warn('清理登录缓存失败', e)
    }
  },

  /**
   * 步骤1：微信登录
   */
  async onWxLogin() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }
    if (this.data.loginLoading) return
    
    this.setData({ loginLoading: true })

    try {
      wx.showLoading({ title: '登录中...', mask: true })

      const cfRes = await wx.cloud.callFunction({ name: 'login', data: {} })
      const { result } = cfRes || {}
      
      if (!result || !result.success) {
        throw new Error((result && result.errorMessage) || '登录失败')
      }

      const { openid, unionId, user, loginTime, expireTime } = result

      // 调试日志
      console.log('登录成功，云函数返回:', {
        openid,
        userId: user && user._id,
        user
      })

      // 保存到本地缓存
      wx.setStorageSync('openid', openid)
      wx.setStorageSync('unionId', unionId || '')
      wx.setStorageSync('userDoc', user)
      wx.setStorageSync('loginTime', loginTime)
      wx.setStorageSync('loginExpireTime', expireTime)

      const userId = user && user._id ? user._id : ''
      console.log('设置 userId:', userId)

      this.setData({
        step: 2,
        openid,
        unionId: unionId || '',
        userId,
        userDoc: user,
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || '',
        phoneNumber: user.phoneNumber || ''
      })

      wx.hideLoading()

      // 如果用户信息完整，直接跳转
      if (user.nickname && user.avatarUrl && user.phoneNumber) {
        this.setData({ step: 4 })
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => wx.reLaunch({ url: '/pages/products/products' }), 1000)
        return
      }

      // 如果已有昵称头像，跳到步骤3
      if (user.nickname && user.avatarUrl) {
        this.setData({ step: 3 })
        if (user.phoneNumber) {
          this.setData({ step: 4 })
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => wx.reLaunch({ url: '/pages/products/products' }), 1000)
          return
        }
      }

      wx.showToast({ title: '请完善个人信息', icon: 'none', duration: 1500 })
    } catch (err) {
      wx.hideLoading()
      console.error('微信登录失败', err)
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loginLoading: false })
    }
  },

  /**
   * 步骤2：选择头像（官方 chooseAvatar 方式）
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    console.log('onChooseAvatar 获取头像:', avatarUrl)
    if (avatarUrl) {
      this.setData({ 
        avatarUrl,
        avatarTempPath: avatarUrl
      })
    }
  },

  /**
   * 步骤2：提交个人资料表单（官方推荐方式）
   * 通过 form submit 获取 input type="nickname" 的值
   */
  async onProfileFormSubmit(e) {
    console.log('表单提交数据:', e.detail.value)
    
    const formData = e.detail.value || {}
    const nickname = formData.nickname || ''
    let { avatarUrl, avatarTempPath, userId, openid } = this.data

    console.log('获取到的昵称:', nickname)
    console.log('获取到的头像:', avatarUrl)
    console.log('当前 userId:', userId)
    console.log('当前 openid:', openid)

    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    if (this.data.profileLoading) return
    this.setData({ profileLoading: true })

    try {
      wx.showLoading({ title: '保存中...', mask: true })

      let finalAvatarUrl = avatarUrl

      // 上传头像到云存储
      if (avatarTempPath && wx.cloud) {
        try {
          const cloudPath = `avatars/${openid || 'unknown'}-${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({ 
            cloudPath, 
            filePath: avatarTempPath 
          })
          if (uploadRes && uploadRes.fileID) {
            finalAvatarUrl = uploadRes.fileID
            console.log('头像上传成功:', finalAvatarUrl)
          }
        } catch (uploadErr) {
          console.warn('头像上传失败，使用临时路径', uploadErr)
        }
      }

      // 更新云数据库
      if (wx.cloud) {
        const db = wx.cloud.database()
        const updateData = {
          nickname: nickname.trim(),
          avatarUrl: finalAvatarUrl,
          updatedAt: Date.now()
        }

        if (userId) {
          // 方法1：通过 userId 更新
          try {
            await db.collection('users').doc(userId).update({ data: updateData })
            console.log('通过 userId 更新成功:', userId)
          } catch (updateErr) {
            console.warn('通过 userId 更新失败，尝试 openid:', updateErr.message)
            // 降级使用 openid 更新
            if (openid) {
              await db.collection('users').where({ _openid: openid }).update({ data: updateData })
              console.log('通过 openid 更新成功')
            }
          }
        } else if (openid) {
          // 方法2：如果没有 userId，通过 openid 更新
          await db.collection('users').where({ _openid: openid }).update({ data: updateData })
          console.log('通过 openid 更新成功')
        }
      }

      // 更新本地缓存
      const userDoc = wx.getStorageSync('userDoc') || {}
      const newDoc = { 
        ...userDoc, 
        nickname: nickname.trim(), 
        avatarUrl: finalAvatarUrl 
      }
      wx.setStorageSync('userDoc', newDoc)

      this.setData({
        step: 3,
        nickname: nickname.trim(),
        avatarUrl: finalAvatarUrl,
        userDoc: newDoc
      })

      wx.hideLoading()

      // 如果已有手机号，直接完成
      if (newDoc.phoneNumber) {
        this.setData({ step: 4 })
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => wx.reLaunch({ url: '/pages/products/products' }), 1000)
        return
      }

      wx.showToast({ title: '请授权手机号', icon: 'none', duration: 1500 })
    } catch (err) {
      wx.hideLoading()
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ profileLoading: false })
    }
  },

  /**
   * 步骤2：跳过昵称头像
   */
  onSkipProfile() {
    this.setData({ step: 3 })
  },

  /**
   * 步骤3：获取手机号
   */
  async onGetPhoneNumber(e) {
    const detail = e && e.detail
    
    if (!detail || detail.errMsg.indexOf('ok') === -1) {
      console.log('用户拒绝授权手机号')
      wx.showToast({ title: '需要手机号才能继续', icon: 'none' })
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

    if (this.data.phoneLoading) return
    this.setData({ phoneLoading: true })

    try {
      wx.showLoading({ title: '验证中...', mask: true })

      // 传递 userId 作为备用查询条件
      const res = await wx.cloud.callFunction({ 
        name: 'getPhoneNumber', 
        data: { 
          code: detail.code, 
          saveToDb: true,
          userId: this.data.userId  // 传递 userId 给云函数
        } 
      })

      if (!res || !res.result || !res.result.success) {
        throw new Error((res && res.result && res.result.errorMessage) || '手机号获取失败')
      }

      const { phoneInfo, user } = res.result
      const phoneNumber = phoneInfo && phoneInfo.phoneNumber ? phoneInfo.phoneNumber : ''

      if (!phoneNumber) {
        throw new Error('未能获取到手机号')
      }

      // 更新本地缓存
      const userDoc = wx.getStorageSync('userDoc') || {}
      const newDoc = { ...userDoc, phoneNumber }
      wx.setStorageSync('userDoc', newDoc)

      this.setData({
        step: 4,
        phoneNumber: this.formatPhone(phoneNumber),
        userDoc: user || newDoc
      })

      wx.hideLoading()
      wx.showToast({ title: '授权成功', icon: 'success' })

      setTimeout(() => wx.reLaunch({ url: '/pages/products/products' }), 1200)
    } catch (err) {
      wx.hideLoading()
      console.error('获取手机号失败', err)
      wx.showToast({ title: err.message || '手机号获取失败', icon: 'none' })
    } finally {
      this.setData({ phoneLoading: false })
    }
  },

  /**
   * 步骤3：跳过手机号授权
   */
  onSkipPhone() {
    wx.showModal({
      title: '提示',
      content: '跳过手机号授权后，设计师将无法主动联系您。确定跳过吗？',
      confirmText: '继续跳过',
      cancelText: '去授权',
      success: (res) => {
        if (res.confirm) {
          this.setData({ step: 4 })
          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => wx.reLaunch({ url: '/pages/products/products' }), 1000)
        }
      }
    })
  },

  /**
   * 格式化手机号（隐藏中间4位）
   */
  formatPhone(phone) {
    if (!phone || phone.length < 7) return phone
    return phone.substring(0, 3) + '****' + phone.substring(7)
  },

  showAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '感谢您使用光乙共创平台。本协议是您与平台之间关于使用平台服务的协议，请在使用前仔细阅读。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  showPrivacy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们重视您的隐私保护。本政策说明我们如何收集、使用和保护您的个人信息。您的信息仅用于提供照明设计服务。',
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
