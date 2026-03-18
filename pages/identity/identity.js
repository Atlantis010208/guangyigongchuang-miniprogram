// pages/identity/identity.js
const app = getApp()

Page({
  data: {
    selectedRole: '', // 'owner' 或 'designer'
    loading: false
  },

  onLoad() {
    // 隐藏返回按钮（如果从其他页面进入的话），确保用户必须选择
    wx.hideHomeButton && wx.hideHomeButton()
  },

  // 选择角色
  selectRole(e) {
    const role = e.currentTarget.dataset.role
    this.setData({
      selectedRole: role
    })
  },

  // 确认选择
  async onConfirm() {
    const { selectedRole } = this.data
    if (!selectedRole) return

    // 设计师身份：跳转登录页进行验证
    if (selectedRole === 'designer') {
      wx.navigateTo({
        url: '/pages/auth/login/login?from=designer'
      })
      return
    }

    // 业主身份：调用云函数保存并跳转
    this.setData({ loading: true })

    try {
      const roleValue = 1 // 1: 业主(普通用户)

      const res = await wx.cloud.callFunction({
        name: 'user_set_identity',
        data: {
          role: roleValue
        }
      })

      if (res.result && res.result.success) {
        // 更新本地全局变量
        app.globalData.userDoc = res.result.user
        wx.setStorageSync('userDoc', res.result.user)
        // 标记已非首次启动
        app.globalData.isFirstLaunch = false

        // 直接跳转回主页
        wx.switchTab({
          url: '/pages/products/products'
        })
      } else {
        throw new Error(res.result?.errorMessage || '保存失败')
      }
    } catch (err) {
      console.error('设置身份失败', err)
      wx.showToast({
        title: '设置失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})
