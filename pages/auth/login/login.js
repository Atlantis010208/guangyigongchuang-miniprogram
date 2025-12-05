Page({
  data: { loading: false },
  onLoad(){
    // 若本地已缓存用户信息，直接跳过登录
    try{
      const doc = wx.getStorageSync('userDoc')
      const openid = wx.getStorageSync('openid')
      if(doc && doc._id && openid){
        wx.reLaunch({ url: '/pages/products/products' })
        return
      }
    }catch(e){}
  },
  async onWxLogin() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前版本不支持云开发', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      // 先获取用户基本信息（头像昵称）
      const profile = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于创建灯光设计需求',
          success: resolve,
          fail: reject
        })
      })

      const app = getApp()
      if (profile && profile.userInfo) {
        app.globalData.userInfo = profile.userInfo
        try { wx.setStorageSync('userInfo', profile.userInfo) } catch (e) {}
      }

      // 调用云函数，确保用户已在云数据库 users 集合中
      const cfRes = await wx.cloud.callFunction({ name: 'login', data: { profile: profile.userInfo } })
      const { result } = cfRes || {}
      if (!result || !result.success) throw new Error((result && result.errorMessage) || '登录失败')

      // 缓存 openid 与用户文档
      try {
        wx.setStorageSync('openid', result.openid)
        wx.setStorageSync('userDoc', result.user)
      } catch (e) {}

      wx.showToast({ title: '登录成功', icon: 'success' })
      wx.reLaunch({ url: '/pages/auth/profile-edit/profile-edit' })
    } catch (err) {
      console.error('登录失败', err)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})


