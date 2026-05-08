/**
 * 会员中心首页
 * 配套文档：specs/membership_center/design.md §2.2.2
 *
 * 包含 4 区块：
 * 1. 用户状态卡片（4 种身份：免费/普通/高级/试用中）
 * 2. 邀请卡片（邀请码 + 进度 + 邀请按钮）
 * 3. 升级入口卡片（动态文案）
 * 4. 购买记录（最近 3 条）
 */
const {
  fetchMembershipStatus,
  formatExpireDate,
  getInviteProgress,
  getFallbackStatus
} = require('../../../utils/membership.js')

const HISTORY_PREVIEW_LIMIT = 3

Page({
  data: {
    isLoggedIn: false,
    user: {
      name: '',
      avatar: '',
      avatarDisplay: ''
    },
    membership: getFallbackStatus(false),
    statusLabel: '普通用户',
    statusSubtitle: '开通会员，解锁更多功能',
    showToolkitNote: false,
    showUpgradeEntry: true,
    upgradeTitle: '开通会员，解锁全部功能',
    upgradeSubtitle: '最低 ¥69/年',
    showRenewalSimple: false,
    renewalText: '',
    inviteProgress: { inCycle: 0, needed: 2, percent: 0, nextRewardDays: 7 },
    history: [],
    hasMembershipOrders: false,
    hasMoreHistory: false,
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

  /**
   * 加载用户基础信息 + 会员状态 + 购买记录
   */
  async loadAll() {
    this.setData({ isLoading: true })
    try {
      this.loadLocalUser()
      const [membership, history] = await Promise.all([
        fetchMembershipStatus(),
        this.loadMembershipHistory()
      ])
      this.applyMembership(membership, history)
    } catch (err) {
      console.warn('[membership] loadAll failed:', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 从本地缓存加载用户基本信息（昵称、头像）
   */
  loadLocalUser() {
    const cachedDoc = wx.getStorageSync('userDoc') || {}
    const localProfile = wx.getStorageSync('user_profile') || {}

    const name = localProfile.name || cachedDoc.nickname || ''
    const avatar = localProfile.avatar || cachedDoc.avatarUrl || ''

    this.setData({
      'user.name': name,
      'user.avatar': avatar
    })

    // 转换 cloud:// 头像为临时链接
    if (avatar && avatar.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      wx.cloud.getTempFileURL({ fileList: [avatar] })
        .then((res) => {
          const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
          if (url) this.setData({ 'user.avatarDisplay': url })
        })
        .catch(() => {})
    } else {
      this.setData({ 'user.avatarDisplay': avatar })
    }
  },

  /**
   * 加载会员订单历史
   */
  async loadMembershipHistory() {
    try {
      if (!wx.cloud || !wx.cloud.database) return []
      const db = wx.cloud.database()
      const res = await db.collection('orders')
        .where({ category: 'membership', status: 'paid', isDelete: 0 })
        .orderBy('createdAt', 'desc')
        .limit(HISTORY_PREVIEW_LIMIT + 1) // 多取一条用于判断 hasMoreHistory
        .get()
      return (res && res.data) || []
    } catch (e) {
      console.warn('[membership] 加载购买记录失败:', e)
      return []
    }
  },

  /**
   * 根据会员状态 + 购买记录 计算 UI 展示数据
   */
  applyMembership(membership, history) {
    const safeMembership = membership || getFallbackStatus(true)
    const { effectiveLevel, vipExpireAt, remainingDays, toolkitPerpetual, inviteStats } = safeMembership

    // 1. 状态卡片文案
    const statusInfo = this.computeStatusInfo(safeMembership)

    // 2. 升级入口卡片
    const upgradeInfo = this.computeUpgradeInfo(safeMembership)

    // 3. 邀请进度
    const invitedCount = (inviteStats && inviteStats.invitedCount) || 0
    const inviteProgress = getInviteProgress(invitedCount)

    // 4. 购买记录
    const formattedHistory = (history || []).slice(0, HISTORY_PREVIEW_LIMIT).map((order) => ({
      orderNo: order.orderNo,
      skuName: this.getSkuDisplayName(order),
      createdLabel: formatExpireDate(order.createdAt)
    }))

    this.setData({
      membership: safeMembership,
      statusLabel: statusInfo.label,
      statusSubtitle: statusInfo.subtitle,
      showToolkitNote: !!toolkitPerpetual,
      showUpgradeEntry: upgradeInfo.showEntry,
      upgradeTitle: upgradeInfo.title,
      upgradeSubtitle: upgradeInfo.subtitle,
      showRenewalSimple: upgradeInfo.showRenewal,
      renewalText: upgradeInfo.renewalText,
      inviteProgress,
      history: formattedHistory,
      hasMembershipOrders: formattedHistory.length > 0,
      hasMoreHistory: (history || []).length > HISTORY_PREVIEW_LIMIT
    })
  },

  /**
   * 计算状态卡片文案
   */
  computeStatusInfo(m) {
    const { effectiveLevel, vipExpireAt, remainingDays } = m
    if (effectiveLevel === 'premium') {
      return {
        label: '高级会员',
        subtitle: vipExpireAt
          ? `会员有效期至 ${formatExpireDate(vipExpireAt)} · 剩 ${remainingDays} 天`
          : ''
      }
    }
    if (effectiveLevel === 'normal') {
      return {
        label: m.toolkitPerpetual ? '普通会员（赠送）' : '普通会员',
        subtitle: vipExpireAt
          ? `会员有效期至 ${formatExpireDate(vipExpireAt)} · 剩 ${remainingDays} 天`
          : ''
      }
    }
    return {
      label: '普通用户',
      subtitle: '开通会员，解锁更多功能'
    }
  },

  /**
   * 计算升级入口卡片文案
   */
  computeUpgradeInfo(m) {
    const { effectiveLevel, vipExpireAt } = m
    if (effectiveLevel === 'premium') {
      return {
        showEntry: false,
        showRenewal: true,
        renewalText: vipExpireAt
          ? `高级会员有效期至 ${formatExpireDate(vipExpireAt)}`
          : '高级会员',
        title: '',
        subtitle: ''
      }
    }
    if (effectiveLevel === 'normal') {
      return {
        showEntry: true,
        showRenewal: false,
        title: '升级到高级会员',
        subtitle: '解锁灵感图库与全部课程'
      }
    }
    // free（含未来的试用中状态）
    return {
      showEntry: true,
      showRenewal: false,
      title: '开通会员，解锁全部功能',
      subtitle: '最低 ¥69/年'
    }
  },

  /**
   * 从订单中提取 SKU 展示名
   */
  getSkuDisplayName(order) {
    if (!order) return '会员订单'
    const items = (order.params && order.params.items) || []
    if (items[0] && items[0].name) return items[0].name
    if (order.skuId === 'vip_premium_year') return '光乙高级会员（1 年）'
    if (order.skuId === 'vip_normal_year') return '光乙普通会员（1 年）'
    return '会员订单'
  },

  /* ---------- 事件 ---------- */

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

  onShareInvitation() {
    // 触发原生分享面板
    wx.showShareMenu({ withShareTicket: false })
    wx.showToast({ title: '点击右上角分享', icon: 'none', duration: 1500 })
  },

  onShareAppMessage() {
    const code = this.data.membership.inviteCode || ''
    return {
      title: '光乙共创：邀你一起体验专业灯光设计工具',
      path: code
        ? `/pages/products/products?inviteCode=${encodeURIComponent(code)}`
        : '/pages/products/products'
    }
  },

  onGoUpgrade() {
    if (!this.data.isLoggedIn) {
      this.onGoLogin()
      return
    }
    wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
  },

  onGoRenewal() {
    if (!this.data.isLoggedIn) {
      this.onGoLogin()
      return
    }
    wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
  },

  onGoInvitations() {
    wx.navigateTo({ url: '/pages/profile/membership/invite-history/invite-history' })
  },

  onGoOrders() {
    wx.navigateTo({ url: '/pages/profile/orders/orders' })
  },

  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login/login?redirect=' + encodeURIComponent('/pages/profile/membership/membership')
    })
  }
})
