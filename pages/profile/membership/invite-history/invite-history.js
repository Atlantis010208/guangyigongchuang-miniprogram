/**
 * 会员邀请记录独立页
 *
 * 用途：展示当前用户的邀请码、累计邀请数据、邀请记录列表
 * 区别于：/pages/profile/invitations/invitations（设计师邀请工单页面）
 *
 * 邀请记录通过云函数 invitations_query (action=listMine) 拉取，云函数内会按 createdAt
 * 倒序返回当前登录用户邀请的所有用户。失败时降级为空列表，不阻断页面渲染。
 *
 * 配套设计：specs/invite_reward_backend/{requirements,design,tasks}.md
 */
const {
  fetchMembershipStatus,
  getInviteProgress,
  getFallbackStatus,
  formatExpireDate
} = require('../../../../utils/membership.js')

Page({
  data: {
    isLoggedIn: false,
    membership: getFallbackStatus(false),
    inviteProgress: { inCycle: 0, needed: 2, percent: 0, nextRewardDays: 7 },
    records: [],
    hasRecords: false,
    isLoading: true
  },

  onShow() {
    const app = getApp()
    const isLoggedIn = app && app.isLoggedIn ? app.isLoggedIn() : false
    this.setData({ isLoggedIn })

    if (!isLoggedIn) {
      this.setData({ isLoading: false })
      return
    }

    this.loadAll()
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadAll() {
    this.setData({ isLoading: true })
    try {
      const membership = await fetchMembershipStatus()
      const invitedCount = (membership.inviteStats && membership.inviteStats.invitedCount) || 0
      const inviteProgress = getInviteProgress(invitedCount)

      const records = await this._fetchInviteRecords()

      this.setData({
        membership,
        inviteProgress,
        records,
        hasRecords: records.length > 0
      })
    } catch (err) {
      console.warn('[invite-history] loadAll failed:', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 调用 invitations_query 云函数拉取当前用户的邀请记录
   */
  _fetchInviteRecords() {
    return new Promise((resolve) => {
      if (!wx.cloud || !wx.cloud.callFunction) {
        resolve([])
        return
      }
      wx.cloud.callFunction({
        name: 'invitations_query',
        data: { action: 'listMine', pageSize: 50 },
        success: (res) => {
          const ok = res && res.result && res.result.success
          const list = (ok && res.result.data && res.result.data.list) || []
          resolve(list.map((r) => {
            const nickname = r.invitedNickname || '朋友'
            const createdAtText = r.createdAt ? formatExpireDate(r.createdAt) : ''
            return {
              // 同时返回新旧字段名，以兼容 invite-history.wxml
              id: r._id,
              _id: r._id,
              inviteeName: nickname,
              invitedNickname: nickname,
              invitedAvatarUrl: r.invitedAvatarUrl || '',
              inviteCode: r.inviteCode || '',
              createdAt: r.createdAt || 0,
              createdAtText,
              acceptedLabel: createdAtText,
              rewarded: !!r.rewardGranted,
              rewardGranted: !!r.rewardGranted,
              rewardDays: r.rewardDays || 0,
              status: r.status || '',
              registered: r.status === 'registered' || (!r.status && !!(r.invitedUserId || r.invitedNickname)),
              shared: r.status === 'shared'
            }
          }))
        },
        fail: (err) => {
          console.warn('[invite-history] invitations_query failed:', err && err.errMsg)
          resolve([])
        }
      })
    })
  },

  onCopyInviteCode() {
    const code = this.data.membership.inviteCode
    if (!code) {
      wx.showToast({ title: '邀请码生成中…', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  onShareAppMessage() {
    const code = this.data.membership.inviteCode || ''
    // fire-and-forget：分享时预建记录（不阻塞分享流程）
    if (wx.cloud && wx.cloud.callFunction) {
      wx.cloud.callFunction({
        name: 'invitations_query',
        data: { action: 'createShare' }
      }).catch(err => console.warn('[invite-history] createShare 失败:', err))
    }
    return {
      title: '光乙共创：邀你一起体验专业灯光设计工具',
      path: code
        ? `/pages/products/products?inviteCode=${encodeURIComponent(code)}`
        : '/pages/products/products'
    }
  },

  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/profile/membership/invite-history/invite-history')
    })
  }
})
