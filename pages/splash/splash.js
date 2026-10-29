const app = getApp()

Page({
  data: {},

  onLoad() {
    wx.hideHomeButton && wx.hideHomeButton()
    if (this.hasPendingDesignPaymentLink()) {
      console.log('[splash] skip default redirect for design payment link')
      return
    }
    
    // 等待动画播放完成后跳转（5秒展示完整动画）
    this.redirectTimer = setTimeout(() => {
      this.checkAndRedirect()
    }, 5000)
  },

  onHide() {
    this.clearRedirectTimer()
  },

  onUnload() {
    this.clearRedirectTimer()
  },

  clearRedirectTimer() {
    if (!this.redirectTimer) return
    clearTimeout(this.redirectTimer)
    this.redirectTimer = null
  },

  hasPendingDesignPaymentLink() {
    return !!(app.globalData && app.globalData.pendingDesignPaymentRequestNo)
  },

  checkAndRedirect() {
    if (this.hasPendingDesignPaymentLink()) {
      console.log('[splash] blocked default redirect for design payment link')
      return
    }

    // ===== 调试：打印所有关键 Storage =====
    const debugInfo = {
      userRole: wx.getStorageSync('userRole'),
      userDoc: wx.getStorageSync('userDoc'),
      openid: wx.getStorageSync('openid'),
      loginExpireTime: wx.getStorageSync('loginExpireTime'),
      hasLaunched: wx.getStorageSync('hasLaunched'),
    }
    console.log('[splash] ===== 调试信息 =====')
    console.log('[splash] userRole:', JSON.stringify(debugInfo.userRole))
    console.log('[splash] userDoc:', JSON.stringify(debugInfo.userDoc))
    console.log('[splash] openid:', debugInfo.openid)
    console.log('[splash] loginExpireTime:', debugInfo.loginExpireTime, '当前时间:', Date.now())
    console.log('[splash] ===== 调试结束 =====')
    // ===== 调试结束 =====

    // 读取独立的用户角色缓存（不受登录过期影响）
    let userRole = debugInfo.userRole
    const userDoc = debugInfo.userDoc
    
    console.log('[splash] 用户角色:', userRole, '用户信息:', userDoc)

    // 1. 如果有 userRole 缓存（用户主动选择过角色），优先使用
    if (userRole === 'designer') {
      console.log('[splash] 设计师（userRole缓存），跳转设计师端首页')
      wx.reLaunch({
        url: '/pages/v2/designer-learning/index',
        fail(err) {
          console.error('[splash] 跳转设计师首页失败:', err)
          wx.reLaunch({ url: '/pages/v2/owner-home/index' })
        }
      })
      return
    }

    if (userRole === 'owner') {
      console.log('[splash] 业主（userRole缓存），跳转业主端首页')
      wx.reLaunch({ url: '/pages/v2/owner-home/index' })
      return
    }

    // 2. 没有 userRole 缓存，尝试从 userDoc 补写
    if (userDoc && userDoc.identitySelected) {
      if (userDoc.roles === 2) {
        wx.setStorageSync('userRole', 'designer')
        console.log('[splash] 自动补写 userRole: designer，跳转设计师端首页')
        wx.reLaunch({ url: '/pages/v2/designer-learning/index' })
      } else {
        wx.setStorageSync('userRole', 'owner')
        console.log('[splash] 自动补写 userRole: owner，跳转业主端首页')
        wx.reLaunch({ url: '/pages/v2/owner-home/index' })
      }
      return
    }

    // 3. 完全没有角色信息（首次用户）-> 进入身份选择页
    console.log('[splash] 未选择身份，跳转身份选择页')
    wx.navigateTo({
      url: '/pages/identity/identity',
      fail: () => wx.reLaunch({ url: '/pages/identity/identity' })
    })
  }
})
