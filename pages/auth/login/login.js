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
    userDoc: null,
    // 隐私协议相关
    agreedToTerms: false, // 用户是否同意协议（默认不勾选）
    showAgreementHint: false // 是否显示协议提示
  },

  onLoad(options) {
    // 保存来源页面（用于登录成功后返回）
    this.redirectUrl = options.redirect ? decodeURIComponent(options.redirect) : ''
    
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
        console.log('登录状态有效，返回上一页或跳转首页')
        this.navigateAfterLogin()
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
   * 登录成功后的跳转逻辑
   * 优先返回来源页面，否则返回上一页，最后才跳转首页
   */
  navigateAfterLogin() {
    // 如果有指定的重定向页面
    if (this.redirectUrl) {
      wx.redirectTo({ 
        url: this.redirectUrl,
        fail: () => {
          // 如果是 tabBar 页面，使用 switchTab
          wx.switchTab({ 
            url: this.redirectUrl,
            fail: () => wx.reLaunch({ url: '/pages/products/products' })
          })
        }
      })
      return
    }

    // 尝试返回上一页
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    // 没有上一页，跳转到首页
    wx.reLaunch({ url: '/pages/products/products' })
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
   * 切换协议同意状态
   */
  toggleAgreement() {
    this.setData({
      agreedToTerms: !this.data.agreedToTerms,
      showAgreementHint: false
    })
  },

  /**
   * 步骤1：微信登录
   * 注意：此步骤只获取 openid，不创建用户记录
   * 用户记录将在完成个人资料填写后创建
   */
  async onWxLogin() {
    // 检查是否同意隐私协议
    if (!this.data.agreedToTerms) {
      this.setData({ showAgreementHint: true })
      wx.showToast({ 
        title: '请先阅读并同意用户协议和隐私政策', 
        icon: 'none',
        duration: 2000
      })
      return
    }

    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }
    if (this.data.loginLoading) return
    
    this.setData({ loginLoading: true })

    try {
      wx.showLoading({ title: '登录中...', mask: true })

      // 第一步：只获取 openid，不创建用户记录
      // 传入 getOpenIdOnly: true，云函数不会写入数据库
      const cfRes = await wx.cloud.callFunction({ 
        name: 'login', 
        data: { getOpenIdOnly: true } 
      })
      const { result } = cfRes || {}
      
      if (!result || !result.success) {
        throw new Error((result && result.errorMessage) || '登录失败')
      }

      const { openid, unionId, isNewUser, user, loginTime, expireTime } = result

      // 调试日志
      console.log('获取 openid 成功:', { openid, unionId, isNewUser, user })

      // 保存 openid
      wx.setStorageSync('openid', openid)
      wx.setStorageSync('unionId', unionId || '')

      if (!isNewUser && user) {
        // 老用户：云函数已查询到用户记录并更新了登录时间
        wx.setStorageSync('userDoc', user)
        wx.setStorageSync('loginTime', loginTime)
        wx.setStorageSync('loginExpireTime', expireTime)

        this.setData({
          step: 2,
          openid,
          unionId: unionId || '',
          userId: user._id || '',
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
          setTimeout(() => this.navigateAfterLogin(), 1000)
          return
        }

        // 如果已有昵称头像，跳到步骤3
        if (user.nickname && user.avatarUrl) {
          this.setData({ step: 3 })
          wx.showToast({ title: '请授权手机号', icon: 'none', duration: 1500 })
          return
        }

        wx.showToast({ title: '请完善个人信息', icon: 'none', duration: 1500 })
      } else {
        // 新用户：只保存 openid，不创建数据库记录
        // 用户记录将在步骤2完成后创建
        this.setData({
          step: 2,
          openid,
          unionId: unionId || '',
          userId: '',  // 新用户暂无 userId
          userDoc: null,
          nickname: '',
          avatarUrl: '',
          phoneNumber: ''
        })

        wx.hideLoading()
        wx.showToast({ title: '请完善个人信息', icon: 'none', duration: 1500 })
      }
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
   * 微信返回的是临时文件路径，需要后续上传到云存储
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    console.log('onChooseAvatar 获取头像路径:', avatarUrl)
    
    if (!avatarUrl) {
      console.warn('未获取到头像路径')
      return
    }
    
    // 记录头像类型，便于调试
    let avatarType = 'unknown'
    if (avatarUrl.startsWith('http://tmp')) {
      avatarType = '本地临时文件'
    } else if (avatarUrl.startsWith('wxfile://')) {
      avatarType = '微信文件系统'
    } else if (avatarUrl.startsWith('https://thirdwx.qlogo.cn')) {
      avatarType = '微信头像URL'
    } else if (avatarUrl.startsWith('cloud://')) {
      avatarType = '云存储文件'
    }
    console.log('头像类型:', avatarType)
    
    this.setData({ 
      avatarUrl,
      avatarTempPath: avatarUrl
    })
    
    wx.showToast({ title: '头像已选择', icon: 'success', duration: 1000 })
  },

  /**
   * 步骤2：提交个人资料表单（官方推荐方式）
   * 通过 form submit 获取 input type="nickname" 的值
   * 
   * 新用户：在此步骤创建用户记录（调用 login 云函数）
   * 老用户：更新现有用户记录
   */
  async onProfileFormSubmit(e) {
    console.log('表单提交数据:', e.detail.value)
    
    const formData = e.detail.value || {}
    const nickname = formData.nickname || ''
    let { avatarUrl, avatarTempPath, userId, openid, unionId } = this.data

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
      let uploadSuccess = false

      // 上传头像到云存储（必须成功，否则不保存临时路径）
      if (avatarTempPath && wx.cloud) {
        // 检查是否是临时文件路径（需要上传）
        const needUpload = avatarTempPath.startsWith('http://tmp') || 
                          avatarTempPath.startsWith('wxfile://') ||
                          avatarTempPath.startsWith('https://thirdwx.qlogo.cn')
        
        if (needUpload) {
          console.log('开始上传头像到云存储...')
          
          // 尝试上传，最多重试 3 次
          for (let retry = 0; retry < 3; retry++) {
            try {
              const cloudPath = `avatars/${openid || 'unknown'}-${Date.now()}.jpg`
              console.log(`上传尝试 ${retry + 1}/3, cloudPath:`, cloudPath)
              
              const uploadRes = await wx.cloud.uploadFile({ 
                cloudPath, 
                filePath: avatarTempPath 
              })
              
              if (uploadRes && uploadRes.fileID) {
                finalAvatarUrl = uploadRes.fileID
                uploadSuccess = true
                console.log('头像上传成功:', finalAvatarUrl)
                break
              } else {
                console.warn(`上传尝试 ${retry + 1} 返回异常:`, uploadRes)
              }
            } catch (uploadErr) {
              console.warn(`头像上传尝试 ${retry + 1} 失败:`, uploadErr.message || uploadErr)
              if (retry < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000)) // 等待 1 秒后重试
              }
            }
          }
          
          // 上传失败，给用户提示
          if (!uploadSuccess) {
            wx.hideLoading()
            wx.showModal({
              title: '头像上传失败',
              content: '头像保存失败，请检查网络后重试。是否继续使用默认头像？',
              confirmText: '继续',
              cancelText: '重试',
              success: (res) => {
                if (res.confirm) {
                  // 使用空头像继续
                  finalAvatarUrl = ''
                  this.continueProfileSubmit(nickname.trim(), finalAvatarUrl, userId, openid)
                } else {
                  // 用户选择重试
                  this.setData({ profileLoading: false })
                }
              }
            })
            return
          }
        } else if (avatarTempPath.startsWith('cloud://')) {
          // 已经是云存储路径，不需要上传
          finalAvatarUrl = avatarTempPath
          uploadSuccess = true
          console.log('头像已是云存储路径，无需上传')
        }
      }

      // 继续执行保存逻辑
      await this.continueProfileSubmit(nickname.trim(), finalAvatarUrl, userId, openid)
    } catch (err) {
      wx.hideLoading()
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ profileLoading: false })
    }
  },

  /**
   * 继续执行资料保存逻辑（从头像上传后继续）
   */
  async continueProfileSubmit(nickname, finalAvatarUrl, userId, openid) {
    try {
      wx.showLoading({ title: '保存中...', mask: true })

      let newDoc = null
      const now = Date.now()
      const expireTime = now + 24 * 60 * 60 * 1000

      if (userId) {
        // 老用户：更新现有用户记录
        if (wx.cloud) {
          const db = wx.cloud.database()
          const updateData = {
            nickname: nickname,
            updatedAt: now
          }
          
          // 只有当头像有效时才更新（必须是 cloud:// 格式或空）
          if (finalAvatarUrl && finalAvatarUrl.startsWith('cloud://')) {
            updateData.avatarUrl = finalAvatarUrl
          } else if (finalAvatarUrl === '') {
            // 明确清空头像
            updateData.avatarUrl = ''
          }
          // 如果是临时路径，不更新头像字段，保留原有头像

          try {
            await db.collection('users').doc(userId).update({ data: updateData })
            console.log('通过 userId 更新成功:', userId)
          } catch (updateErr) {
            console.warn('通过 userId 更新失败，尝试 openid:', updateErr.message)
            if (openid) {
              await db.collection('users').where({ _openid: openid }).update({ data: updateData })
              console.log('通过 openid 更新成功')
            }
          }
        }

        // 更新本地缓存
        const userDoc = wx.getStorageSync('userDoc') || {}
        newDoc = { 
          ...userDoc, 
          nickname: nickname,
          updatedAt: now
        }
        
        // 只有有效头像才更新缓存
        if (finalAvatarUrl && finalAvatarUrl.startsWith('cloud://')) {
          newDoc.avatarUrl = finalAvatarUrl
        }
      } else {
        // 新用户：调用 login 云函数创建用户记录
        console.log('新用户，调用 login 云函数创建用户记录')

        const cfRes = await wx.cloud.callFunction({ 
          name: 'login', 
          data: { 
            profile: { 
              nickName: nickname, 
              avatarUrl: (finalAvatarUrl && finalAvatarUrl.startsWith('cloud://')) ? finalAvatarUrl : ''
            } 
          } 
        })
        
        const { result } = cfRes || {}
        
        if (!result || !result.success) {
          throw new Error((result && result.errorMessage) || '创建用户失败')
        }

        const { user, loginTime } = result
        newDoc = user
        userId = user && user._id ? user._id : ''

        console.log('用户记录创建成功:', { userId, user })

        // 保存登录信息到本地缓存
        wx.setStorageSync('loginTime', loginTime)
        wx.setStorageSync('loginExpireTime', expireTime)
        
        this.setData({ userId })
      }

      wx.setStorageSync('userDoc', newDoc)

      // 确定最终显示的头像 URL
      const displayAvatarUrl = (finalAvatarUrl && finalAvatarUrl.startsWith('cloud://')) 
        ? finalAvatarUrl 
        : (newDoc && newDoc.avatarUrl) || ''

      this.setData({
        step: 3,
        nickname: nickname,
        avatarUrl: displayAvatarUrl,
        userDoc: newDoc
      })

      wx.hideLoading()

      // 如果已有手机号，直接完成
      if (newDoc && newDoc.phoneNumber) {
        this.setData({ step: 4 })
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => this.navigateAfterLogin(), 1000)
        return
      }

      wx.showToast({ title: '请授权手机号', icon: 'none', duration: 1500 })
    } catch (err) {
      wx.hideLoading()
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      this.setData({ profileLoading: false })
    }
  },

  /**
   * 步骤2：跳过昵称头像
   * 注意：新用户必须填写昵称头像才能创建用户记录，不能跳过
   */
  onSkipProfile() {
    const { userId } = this.data
    
    // 新用户不能跳过，必须填写昵称头像
    if (!userId) {
      wx.showModal({
        title: '提示',
        content: '首次登录需要填写昵称和头像，请完善个人信息后继续',
        showCancel: false,
        confirmText: '好的'
      })
      return
    }

    // 老用户可以跳过
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

      setTimeout(() => this.navigateAfterLogin(), 1200)
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
          setTimeout(() => this.navigateAfterLogin(), 1000)
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

  /**
   * 显示用户服务协议
   */
  showAgreement() {
    wx.navigateTo({
      url: '/pages/auth/agreement/agreement?type=service'
    })
  },

  /**
   * 显示隐私政策
   */
  showPrivacy() {
    wx.navigateTo({
      url: '/pages/auth/agreement/agreement?type=privacy'
    })
  }
})
