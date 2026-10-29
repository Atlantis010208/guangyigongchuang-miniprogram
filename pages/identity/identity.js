// pages/identity/identity.js
const app = getApp()

Page({
  data: {
    selectedRole: '', // 'owner' | 'designer'
    loading: false
  },

  onLoad() {
    wx.hideHomeButton && wx.hideHomeButton()
  },

  selectRole(e) {
    const role = e.currentTarget.dataset.role
    this.setData({ selectedRole: role })
  },

  onApplyDesigner() {
    wx.navigateTo({
      url: '/pages/auth/designer-denied/designer-denied'
    })
  },

  async saveIdentity(roleValue) {
    const roleName = roleValue === 2 ? 'designer' : 'owner'
    const targetUrl = roleValue === 2 ? '/pages/v2/designer-learning/index' : '/pages/v2/owner-home/index'

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'user_set_identity',
        data: { role: roleValue }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result && (res.result.errorMessage || res.result.message) || '保存失败')
      }

      const user = res.result.user
      app.globalData.userDoc = user
      app.globalData.userRole = roleName
      app.globalData.isFirstLaunch = false
      wx.setStorageSync('userDoc', user)
      wx.setStorageSync('userRole', roleName)

      wx.reLaunch({ url: targetUrl })
    } catch (err) {
      console.error('设置身份失败', err)
      wx.showToast({
        title: '设置失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onConfirm() {
    const { selectedRole } = this.data
    if (!selectedRole || this.data.loading) return

    await this.saveIdentity(selectedRole === 'designer' ? 2 : 1)
  }
})
