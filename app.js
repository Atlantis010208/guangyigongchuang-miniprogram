// app.js
const util = require('./utils/util')

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
