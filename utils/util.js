// 工具函数
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 格式化价格
const formatPrice = (price) => {
  if (typeof price === 'number') {
    return `RMB ${price.toLocaleString()}`
  }
  return price
}

// 防抖函数
const debounce = (func, wait) => {
  let timeout
  return function (...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), wait)
  }
}

// 节流函数
const throttle = (func, limit) => {
  let inThrottle
  return function (...args) {
    const context = this
    if (!inThrottle) {
      func.apply(context, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// 深度克隆
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (obj instanceof Array) return obj.map(item => deepClone(item))
  if (typeof obj === 'object') {
    const clonedObj = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj
  }
}

// 显示加载提示
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

// 隐藏加载提示
const hideLoading = () => {
  wx.hideLoading()
}

// 显示成功提示
const showSuccess = (title = '操作成功') => {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  })
}

// 显示错误提示
const showError = (title = '操作失败') => {
  wx.showToast({
    title,
    icon: 'error',
    duration: 2000
  })
}

// 显示普通提示
const showToast = (title) => {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  })
}

// 确认对话框
const showConfirm = (content, title = '提示') => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm)
      },
      fail: () => {
        resolve(false)
      }
    })
  })
}

// 页面跳转
const navigateTo = (url) => {
  wx.navigateTo({ url })
}

const redirectTo = (url) => {
  wx.redirectTo({ url })
}

const switchTab = (url) => {
  wx.switchTab({ url })
}

// 存储相关
const setStorage = (key, data) => {
  try {
    wx.setStorageSync(key, data)
    return true
  } catch (e) {
    console.error('存储失败:', e)
    return false
  }
}

const getStorage = (key, defaultValue = null) => {
  try {
    return wx.getStorageSync(key) || defaultValue
  } catch (e) {
    console.error('读取存储失败:', e)
    return defaultValue
  }
}

const removeStorage = (key) => {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.error('删除存储失败:', e)
    return false
  }
}

// 检查网络状态
const checkNetwork = () => {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => {
        resolve(res.networkType !== 'none')
      },
      fail: () => {
        resolve(false)
      }
    })
  })
}

// 分享配置
const getShareConfig = (title, path, imageUrl) => {
  return {
    title: title || 'Apple 产品',
    path: path || '/pages/products/products',
    imageUrl: imageUrl || '/images/share-default.png'
  }
}

// 苹果风格的震动反馈
const hapticFeedback = (type = 'light') => {
  if (wx.vibrateShort) {
    wx.vibrateShort({
      type // light, medium, heavy
    })
  }
}

// 安全区域适配
const getSafeArea = () => {
  const systemInfo = wx.getSystemInfoSync()
  return {
    top: systemInfo.safeArea?.top || 0,
    bottom: systemInfo.safeArea?.bottom || systemInfo.screenHeight,
    height: systemInfo.safeArea?.height || systemInfo.screenHeight
  }
}

module.exports = {
  formatTime,
  formatPrice,
  debounce,
  throttle,
  deepClone,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showToast,
  showConfirm,
  navigateTo,
  redirectTo,
  switchTab,
  setStorage,
  getStorage,
  removeStorage,
  checkNetwork,
  getShareConfig,
  hapticFeedback,
  getSafeArea,
  callCf: (name, data) => {
    try {
      if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve({ success: false, code: 'CF_UNAVAILABLE', errorMessage: 'cloud not available' })
      return wx.cloud.callFunction({ name, data }).then(res => (res && res.result) ? res.result : { success: false, code: 'CF_EMPTY', errorMessage: 'empty result' }).catch(err => ({ success: false, code: 'CF_ERROR', errorMessage: (err && err.message) || 'error' }))
    } catch (e) {
      return Promise.resolve({ success: false, code: 'CF_ERROR', errorMessage: (e && e.message) || 'error' })
    }
  }
}
