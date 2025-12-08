/**
 * 用户设置页面
 * 功能：通知设置、隐私设置、退出登录
 * 数据来源：云函数 settings_operations
 */
const util = require('../../../utils/util')

Page({
  data: {
    settings: {
      orderNotification: true,
      promotionNotification: false,
      deviceNotification: true
    },
    appVersion: 'v1.0.0',
    loading: false,
    syncing: false
  },

  onLoad() {
    this.loadSettings()
  },

  onShow() {
    // 每次显示时刷新设置（可能在其他地方修改过）
  },

  /**
   * 加载用户设置
   * 优先从云端获取，失败则从本地存储恢复
   */
  async loadSettings() {
    this.setData({ loading: true })

    try {
      // 调用云函数获取设置
      const res = await util.callCf('settings_operations', {
        action: 'get'
      })

      if (res && res.success && res.data) {
        const settings = res.data.settings || {}
        this.setData({ settings })
        
        // 同步到本地存储作为缓存
        this.syncToLocal(settings)
        
        console.log('从云端加载设置成功:', settings)
      } else {
        // 云函数调用失败，从本地存储恢复
        console.warn('云函数获取设置失败，使用本地数据:', res)
        this.loadFromLocal()
      }

    } catch (err) {
      console.error('加载设置异常:', err)
      // 降级到本地存储
      this.loadFromLocal()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 从本地存储加载设置（兜底方案）
   */
  loadFromLocal() {
    const settings = wx.getStorageSync('user_settings') || {
      orderNotification: true,
      promotionNotification: false,
      deviceNotification: true
    }
    this.setData({ settings })
  },

  /**
   * 保存设置到云端
   * @param {object} newSettings - 要更新的设置项
   */
  async saveSettings(newSettings) {
    // 防止重复提交
    if (this.data.syncing) return
    
    this.setData({ syncing: true })

    try {
      // 合并新设置
      const mergedSettings = {
        ...this.data.settings,
        ...newSettings
      }

      // 调用云函数保存设置
      const res = await util.callCf('settings_operations', {
        action: 'update',
        settings: mergedSettings
      })

      if (res && res.success) {
        // 更新本地状态
        this.setData({ settings: mergedSettings })
        // 同步到本地存储
        this.syncToLocal(mergedSettings)
        
        console.log('设置已保存到云端')
      } else {
        // 云函数失败，只保存到本地
        console.warn('云函数保存设置失败，保存到本地:', res)
        this.setData({ settings: mergedSettings })
        this.syncToLocal(mergedSettings)
      }

    } catch (err) {
      console.error('保存设置异常:', err)
      // 降级到本地存储
      const mergedSettings = {
        ...this.data.settings,
        ...newSettings
      }
      this.setData({ settings: mergedSettings })
      this.syncToLocal(mergedSettings)
    } finally {
      this.setData({ syncing: false })
    }
  },

  /**
   * 同步设置到本地存储
   */
  syncToLocal(settings) {
    try {
      wx.setStorageSync('user_settings', settings)
    } catch (err) {
      console.warn('同步本地存储失败:', err)
    }
  },

  /**
   * 订单状态通知开关
   */
  onOrderNotificationChange(e) {
    const value = e.detail.value
    this.setData({ 'settings.orderNotification': value })
    this.saveSettings({ orderNotification: value })
  },

  /**
   * 优惠活动通知开关
   */
  onPromotionNotificationChange(e) {
    const value = e.detail.value
    this.setData({ 'settings.promotionNotification': value })
    this.saveSettings({ promotionNotification: value })
  },

  /**
   * 设备状态通知开关
   */
  onDeviceNotificationChange(e) {
    const value = e.detail.value
    this.setData({ 'settings.deviceNotification': value })
    this.saveSettings({ deviceNotification: value })
  },

  /**
   * 重置设置为默认值
   */
  async resetSettings() {
    const confirmed = await util.showConfirm('确定要重置所有设置为默认值吗？')
    if (!confirmed) return

    wx.showLoading({ title: '重置中...', mask: true })

    try {
      const res = await util.callCf('settings_operations', {
        action: 'reset'
      })

      if (res && res.success && res.data) {
        const settings = res.data.settings || {
          orderNotification: true,
          promotionNotification: false,
          deviceNotification: true
        }
        this.setData({ settings })
        this.syncToLocal(settings)
        wx.showToast({ title: '设置已重置', icon: 'success' })
      } else {
        // 本地重置
        const defaultSettings = {
          orderNotification: true,
          promotionNotification: false,
          deviceNotification: true
        }
        this.setData({ settings: defaultSettings })
        this.syncToLocal(defaultSettings)
        wx.showToast({ title: '设置已重置', icon: 'success' })
      }

    } catch (err) {
      console.error('重置设置异常:', err)
      wx.showToast({ title: '重置失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 关于我们
   */
  goToAbout() {
    wx.showModal({
      title: '关于我们',
      content: '光乙共创平台\n版本：v1.0.0\n© 2024 光乙照明科技',
      confirmText: '知道了',
      showCancel: false
    })
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账户吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除用户相关数据
          wx.removeStorageSync('user_profile')
          wx.removeStorageSync('user_token')
          wx.removeStorageSync('userDoc')
          wx.removeStorageSync('openid')
          wx.removeStorageSync('loginTime')
          wx.removeStorageSync('loginExpireTime')
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
          
          // 跳转到登录页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/auth/login/login'
            })
          }, 1500)
        }
      }
    })
  }
})
