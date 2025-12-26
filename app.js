// app.js
const util = require('./utils/util')

// 登录有效期：1天（毫秒）
const LOGIN_EXPIRE_DURATION = 24 * 60 * 60 * 1000

App({
  onLaunch(options) {
    console.log('小程序启动', options)
    
    // 初始化云开发（用于将 cloud:// fileID 转为 https 临时链接）
    try {
      if (wx && wx.cloud && wx.cloud.init) {
        wx.cloud.init({
          env: 'cloud1-5gb9c5u2c58ad6d7',
          traceUser: true
        })
      }
    } catch (e) {
      console.warn('wx.cloud 初始化失败或不可用', e)
    }

    this.initCollectionsIfDev()

    // 检查更新
    this.checkForUpdate()
    
    // 初始化全局数据
    this.initGlobalData()
    
    // 获取系统信息
    this.getSystemInfo()

    // 检查登录状态
    this.checkLoginStatus()
  },

  onShow(options) {
    console.log('小程序显示', options)
  },

  onHide() {
    console.log('小程序隐藏')
  },

  onError(msg) {
    console.error('小程序错误:', msg)
    // 可以在这里上报错误信息
  },

  // 页面未找到时重定向
  onPageNotFound(res) {
    console.warn('页面未找到，重定向:', res && res.path)
    wx.reLaunch({ url: '/pages/products/products' })
  },

  // 检查小程序更新
  checkForUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()
      
      updateManager.onCheckForUpdate((res) => {
        console.log('检查更新结果:', res.hasUpdate)
      })

      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success(res) {
            if (res.confirm) {
              updateManager.applyUpdate()
            }
          }
        })
      })

      updateManager.onUpdateFailed(() => {
        console.error('新版本下载失败')
      })
    }
  },

  // 初始化全局数据
  initGlobalData() {
    this.globalData = {
      userInfo: null,
      userDoc: null,
      openid: '',
      isLoggedIn: false,
      loginExpired: false,
      systemInfo: null,
      networkType: 'unknown',
      isFirstLaunch: false,
      cartCount: 0,
      favoriteCount: 0,
      searchHistory: []
    }

    // 检查是否首次启动
    const hasLaunched = util.getStorage('hasLaunched')
    if (!hasLaunched) {
      this.globalData.isFirstLaunch = true
      util.setStorage('hasLaunched', true)
    }

    // 加载购物车数量
    this.loadCartCount()
  },

  initCollectionsIfDev() {
    try {
      const info = wx.getAccountInfoSync()
      const envVersion = info && info.miniProgram && info.miniProgram.envVersion ? info.miniProgram.envVersion : ''
      if (wx.cloud && wx.cloud.database) {
        const REQUIRED_VER = 'v3'
        const currentVer = wx.getStorageSync('collections_inited_ver') || ''
        const db = wx.cloud.database()
        const check = async (name) => {
          try { await db.collection(name).count() } catch (e) { return e }
          return null
        }
        Promise.all([check('orders'), check('requests'), check('designers'), check('appointments')]).then(errs => {
          const needInit = errs.some(e => e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) || currentVer !== REQUIRED_VER
          if (needInit && wx.cloud && wx.cloud.callFunction) {
            wx.cloud.callFunction({ name: 'initCollections' })
              .then(res => { wx.setStorageSync('collections_inited_ver', REQUIRED_VER); console.log('集合初始化结果:', res && res.result ? res.result : res) })
              .catch(err => { console.warn('集合初始化失败:', err) })
          } else {
            wx.setStorageSync('collections_inited_ver', REQUIRED_VER)
          }
        }).catch(()=>{})
      }
    } catch (_) {}
  },

  // 获取系统信息
  getSystemInfo() {
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res
        console.log('系统信息:', res)
      },
      fail: (err) => {
        console.error('获取系统信息失败:', err)
      }
    })

    // 获取网络状态
    wx.getNetworkType({
      success: (res) => {
        this.globalData.networkType = res.networkType
        console.log('网络类型:', res.networkType)
      }
    })

    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      this.globalData.networkType = res.networkType
      console.log('网络状态变化:', res)
      
      if (!res.isConnected) {
        util.showToast('网络连接已断开')
      }
    })
  },

  // 加载购物车数量
  loadCartCount() {
    const cartItems = util.getStorage('cartItems', [])
    this.globalData.cartCount = cartItems.length
  },

  // 更新购物车数量
  updateCartCount(count) {
    this.globalData.cartCount = count
    
    // 更新底部标签栏的角标
    if (count > 0) {
      wx.setTabBarBadge({
        index: 3, // 购物袋页面的索引
        text: count.toString()
      })
    } else {
      wx.removeTabBarBadge({
        index: 3
      })
    }
  },

  // 添加到购物车
  addToCart(product) {
    const cartItems = util.getStorage('cartItems', [])
    
    // 检查商品是否已存在
    const existingIndex = cartItems.findIndex(item => item.id === product.id)
    
    if (existingIndex >= 0) {
      // 增加数量
      cartItems[existingIndex].quantity += 1
      util.showToast('商品数量已增加')
    } else {
      // 添加新商品
      cartItems.push({
        ...product,
        quantity: 1,
        addTime: new Date().getTime()
      })
      util.showToast('已添加到购物袋')
    }
    
    util.setStorage('cartItems', cartItems)
    this.updateCartCount(cartItems.length)
    
    // 触发震动反馈
    util.hapticFeedback('light')
  },

  // 从购物车移除
  removeFromCart(productId) {
    const cartItems = util.getStorage('cartItems', [])
    const filteredItems = cartItems.filter(item => item.id !== productId)
    
    util.setStorage('cartItems', filteredItems)
    this.updateCartCount(filteredItems.length)
    
    util.showToast('已从购物袋移除')
  },

  // 获取用户信息
  getUserInfo() {
    return new Promise((resolve, reject) => {
      if (this.globalData.userInfo) {
        resolve(this.globalData.userInfo)
        return
      }

      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          this.globalData.userInfo = res.userInfo
          util.setStorage('userInfo', res.userInfo)
          resolve(res.userInfo)
        },
        fail: (err) => {
          console.error('获取用户信息失败:', err)
          reject(err)
        }
      })
    })
  },

  // 用户登录
  userLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('登录成功:', res.code)
            // 这里可以发送 res.code 到后台换取 openId, sessionKey, unionId
            resolve(res.code)
          } else {
            console.error('登录失败:', res.errMsg)
            reject(res.errMsg)
          }
        },
        fail: (err) => {
          console.error('登录失败:', err)
          reject(err)
        }
      })
    })
  },

  /**
   * 检查登录状态
   * 如果登录已过期或云端记录不存在，清理缓存并标记需要重新登录
   */
  checkLoginStatus() {
    try {
      const userDoc = util.getStorage('userDoc')
      const openid = util.getStorage('openid')
      const expireTime = util.getStorage('loginExpireTime')
      const now = Date.now()

      // 没有登录信息
      if (!userDoc || !openid) {
        this.globalData.isLoggedIn = false
        this.globalData.loginExpired = false
        console.log('用户未登录')
        return
      }

      // 检查是否过期
      if (expireTime && now >= expireTime) {
        console.log('登录已过期，需要重新登录')
        this.clearLoginCache()
        this.globalData.isLoggedIn = false
        this.globalData.loginExpired = true
        return
      }

      // 临时标记为已登录（等待云端验证）
      this.globalData.isLoggedIn = true
      this.globalData.loginExpired = false
      this.globalData.userDoc = userDoc
      this.globalData.openid = openid
      console.log('本地登录状态有效，剩余时间:', Math.round((expireTime - now) / 1000 / 60), '分钟')

      // 异步验证云端登录状态
      this.verifyCloudLoginStatus()
    } catch (e) {
      console.warn('检查登录状态失败', e)
      this.globalData.isLoggedIn = false
    }
  },

  /**
   * 验证云端登录状态
   * 检查云数据库中用户记录是否存在，以及登录是否过期
   */
  async verifyCloudLoginStatus() {
    try {
      if (!wx.cloud) return

      // 调用云函数验证登录状态
      const res = await wx.cloud.callFunction({ 
        name: 'login', 
        data: { verifyOnly: true } 
      })

      if (!res || !res.result || !res.result.success) {
        console.log('云端登录验证失败，清除本地登录状态')
        this.clearLoginCache()
        this.globalData.isLoggedIn = false
        this.globalData.loginExpired = true
        // 不再强制跳转登录页，让用户可以继续浏览
        // 需要登录的功能会在使用时引导用户登录
        return
      }

      // 云端验证成功，更新本地缓存
      const { user, loginTime, expireTime } = res.result
      util.setStorage('userDoc', user)
      util.setStorage('loginTime', loginTime)
      util.setStorage('loginExpireTime', expireTime)
      this.globalData.userDoc = user
      console.log('云端登录验证成功')
    } catch (e) {
      console.warn('云端登录验证异常', e)
      // 网络异常时不清除登录状态，保持离线可用
    }
  },

  /**
   * 清理登录缓存
   */
  clearLoginCache() {
    try {
      util.removeStorage('userDoc')
      util.removeStorage('openid')
      util.removeStorage('unionId')
      util.removeStorage('loginTime')
      util.removeStorage('loginExpireTime')
      util.removeStorage('userInfo')
      
      this.globalData.userDoc = null
      this.globalData.openid = ''
      this.globalData.userInfo = null
      
      console.log('已清理登录缓存')
    } catch (e) {
      console.warn('清理登录缓存失败', e)
    }
  },

  /**
   * 刷新登录状态（延长有效期）
   * 可在用户活跃时调用
   */
  async refreshLoginStatus() {
    if (!this.globalData.isLoggedIn) return false
    
    try {
      if (!wx.cloud) return false
      
      const res = await wx.cloud.callFunction({ name: 'login', data: {} })
      if (res && res.result && res.result.success) {
        const { openid, unionId, user, loginTime, expireTime } = res.result
        
        util.setStorage('openid', openid)
        util.setStorage('unionId', unionId || '')
        util.setStorage('userDoc', user)
        util.setStorage('loginTime', loginTime)
        util.setStorage('loginExpireTime', expireTime)
        
        this.globalData.userDoc = user
        this.globalData.openid = openid
        this.globalData.isLoggedIn = true
        
        console.log('登录状态已刷新')
        return true
      }
    } catch (e) {
      console.warn('刷新登录状态失败', e)
    }
    return false
  },

  /**
   * 检查是否需要登录
   * 如果需要登录，跳转到登录页面
   * @param {object} options 配置选项
   * @param {boolean} options.redirect 是否自动跳转登录页，默认 true
   * @param {boolean} options.showModal 是否显示确认弹窗，默认 true
   * @param {string} options.redirectUrl 登录成功后的回调页面 URL
   * @returns {boolean} 是否已登录
   */
  requireLogin(options = {}) {
    const { redirect = true, showModal = true, redirectUrl = '' } = options
    
    this.checkLoginStatus()
    
    if (!this.globalData.isLoggedIn) {
      if (redirect) {
        if (showModal) {
          wx.showModal({
            title: '需要登录',
            content: '此功能需要登录后使用，是否前往登录？',
            confirmText: '去登录',
            cancelText: '暂不登录',
            success: (res) => {
              if (res.confirm) {
                const url = redirectUrl 
                  ? `/pages/auth/login/login?redirect=${encodeURIComponent(redirectUrl)}`
                  : '/pages/auth/login/login'
                wx.navigateTo({ url })
              }
            }
          })
        } else {
          const url = redirectUrl 
            ? `/pages/auth/login/login?redirect=${encodeURIComponent(redirectUrl)}`
            : '/pages/auth/login/login'
          wx.navigateTo({ url })
        }
      }
      return false
    }
    return true
  },

  /**
   * 检查是否已登录（不跳转，仅返回状态）
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    this.checkLoginStatus()
    return this.globalData.isLoggedIn
  },

  /**
   * 获取当前用户信息
   * @returns {object|null} 用户文档
   */
  getCurrentUser() {
    if (!this.globalData.isLoggedIn) {
      return null
    }
    return this.globalData.userDoc || util.getStorage('userDoc')
  },

  // 分享配置
  onShareAppMessage() {
    return util.getShareConfig(
      'Apple 产品官方小程序',
      '/pages/products/products',
      '/images/share-logo.png'
    )
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: 'Apple 产品官方小程序',
      query: '',
      imageUrl: '/images/share-timeline.png'
    }
  },

  // 全局数据
  globalData: {}
})
