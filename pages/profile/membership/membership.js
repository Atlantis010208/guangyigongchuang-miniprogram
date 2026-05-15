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
const { fetchMembershipStatus, formatExpireDate } = require('../../../utils/membership.js')

const MEMBER_CARD_BG_FILE_IDS = {
  free: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-none.png',
  normal: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-normal.png',
  premium: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/images/membership-card/level-premium.png'
}
const _cardBgCache = {}

const ICONS = {
  crownGold: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23D4A66A"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>',
  crownDark: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238C6A3B"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>',
  checkGold: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23D4A66A"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="%23FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  checkGray: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23C7C7CC"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" stroke="%23FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crossGray: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23C7C7CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  iconCalc: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="16" y1="18" x2="16" y2="18.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="12" y1="18" x2="12" y2="18.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/></svg>',
  iconPdf: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15H7v-4h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1z"/><path d="M13 15h-1v-4h1a2 2 0 0 1 2 2 2 2 0 0 1-2 2z"/><path d="M17 11v4"/><path d="M17 13h2"/></svg>',
  iconSign: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="2.5"/><path d="M4 19v-1a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4v1"/><line x1="15" y1="10" x2="19" y2="10"/><line x1="15" y1="14" x2="19" y2="14"/></svg>',
  iconGallery: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  iconDownload: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  iconTarget: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  iconDoc: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  iconBulb: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%231A1A1E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2v1"/><path d="M15.09 5.09l.71-.71"/><path d="M19 12h1"/><path d="M15.09 18.91l.71.71"/><path d="M12 21v1"/><path d="M8.91 18.91l-.71.71"/><path d="M5 12H4"/><path d="M8.91 5.09l-.71-.71"/><circle cx="12" cy="12" r="4"/></svg>'
}

Page({
  data: {
    isLoggedIn: false,
    isLoading: true,
    effectiveLevel: 'normal',
    memberExpireDate: '',
    ICONS,
    topCardBg: '',
    unlockedBenefits: [],
    compareList: [
      { name: '照度计算器 Pro 版', icon: ICONS.iconCalc, normal: true, premium: true },
      { name: '导出 PDF 结果报告', icon: ICONS.iconPdf, normal: true, premium: true },
      { name: '自定义报告署名', icon: ICONS.iconSign, normal: true, premium: true },
      { name: '灵感图库预览', icon: ICONS.iconGallery, normal: false, premium: true },
      { name: '灵感图库下载', icon: ICONS.iconDownload, normal: false, premium: true }
    ],
    exclusiveValues: [
      { title: '专业测算', desc: '适用于照度评估与方案测算', icon: ICONS.iconTarget },
      { title: '高效交付', desc: 'PDF 报告便于保存、分享与交付', icon: ICONS.iconDoc },
      { title: '灵感支持', desc: '图库预览与下载辅助设计参考', icon: ICONS.iconBulb }
    ],
    descList: [
      { title: '照度计算器 Pro 版', desc: '适用于专业照度测算与方案评估', icon: ICONS.iconCalc },
      { title: 'PDF 结果报告', desc: '便于保存、分享与项目交付', icon: ICONS.iconPdf },
      { title: '自定义署名', desc: '提升报告专业度与品牌识别', icon: ICONS.iconSign },
      { title: '灵感图库预览 / 下载', desc: '高级会员专享，用于设计参考与素材整理', icon: ICONS.iconGallery }
    ]
  },

  onShow() {
    const app = getApp()
    const isLoggedIn = app && app.isLoggedIn ? app.isLoggedIn() : false
    this.setData({ isLoggedIn })
    if (isLoggedIn) {
      this.loadAll()
    } else {
      this.setData({ isLoading: false })
    }
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
      this.applyMembership(membership)
    } catch (err) {
      console.warn('[membership] loadAll failed:', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  applyMembership(membership) {
    const effectiveLevel = membership.effectiveLevel === 'premium' ? 'premium' : 'normal'
    const memberExpireDate = membership.vipExpireAt ? formatExpireDate(membership.vipExpireAt) : '长期有效'
    
    let unlockedBenefits = [
      { id: 'calc', title: '照度计算器 Pro 版', sub: '解锁专业照度计算能力', icon: ICONS.iconCalc, styleClass: effectiveLevel === 'premium' ? 'col-3' : 'col-3' },
      { id: 'pdf', title: '导出 PDF 结果报告', sub: '支持一键生成 PDF 报告', icon: ICONS.iconPdf, styleClass: effectiveLevel === 'premium' ? 'col-3' : 'col-3' },
      { id: 'sign', title: '自定义报告署名', sub: '支持个人 / 公司署名', icon: ICONS.iconSign, styleClass: effectiveLevel === 'premium' ? 'col-3' : 'col-3' }
    ]

    if (effectiveLevel === 'premium') {
      unlockedBenefits.push(
        { id: 'gallery_view', title: '灵感图库预览', sub: '支持方案参考与内容浏览', icon: ICONS.iconGallery, styleClass: 'col-2' },
        { id: 'gallery_down', title: '灵感图库下载', sub: '支持素材下载与整理', icon: ICONS.iconDownload, styleClass: 'col-2' }
      )
    }

    this.setData({
      effectiveLevel,
      memberExpireDate,
      unlockedBenefits
    })
    this._loadCardBg(effectiveLevel)
  },

  _loadCardBg(level) {
    const lv = MEMBER_CARD_BG_FILE_IDS[level] ? level : 'normal'
    if (_cardBgCache[lv]) {
      this.setData({ topCardBg: _cardBgCache[lv] })
      return
    }
    if (!wx.cloud || !wx.cloud.getTempFileURL) return
    wx.cloud.getTempFileURL({ fileList: [MEMBER_CARD_BG_FILE_IDS[lv]] })
      .then((res) => {
        const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
        if (url) {
          _cardBgCache[lv] = url
          if (this.data.effectiveLevel === lv) {
            this.setData({ topCardBg: url })
          }
        }
      })
      .catch(() => {})
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/auth/login/login' })
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

  onTapCta() {
    if (!this.data.isLoggedIn) {
      this.onGoLogin()
      return
    }
    if (this.data.effectiveLevel === 'premium') {
      this.startRenewal()
    } else {
      wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
    }
  },

  async startRenewal() {
    if (this._isRenewing) return
    this._isRenewing = true

    wx.showLoading({ title: '正在创建订单…', mask: true })
    try {
      const createRes = await wx.cloud.callFunction({
        name: 'membership_create_order',
        data: { skuId: 'vip_premium_year' }
      })
      const create = createRes && createRes.result
      if (!create || !create.success) {
        wx.hideLoading()
        wx.showToast({ title: (create && create.errorMessage) || '创建订单失败', icon: 'none' })
        this._isRenewing = false
        return
      }

      const orderNo = create.data && create.data.orderNo
      if (!orderNo) {
        wx.hideLoading()
        wx.showToast({ title: '订单号缺失', icon: 'none' })
        this._isRenewing = false
        return
      }

      wx.showLoading({ title: '正在调起支付…', mask: true })
      const payRes = await wx.cloud.callFunction({
        name: 'wxpayFunctions',
        data: { type: 'wxpay_order', orderNo, description: '光乙高级会员续费' }
      })
      const pay = payRes && payRes.result
      if (!pay || pay.code !== 0 || !pay.data) {
        wx.hideLoading()
        wx.showToast({ title: (pay && pay.message) || '支付下单失败', icon: 'none' })
        this._isRenewing = false
        return
      }

      wx.hideLoading()
      const p = pay.data
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: p.timeStamp,
          nonceStr: p.nonceStr,
          package: p.packageVal,
          signType: p.signType,
          paySign: p.paySign,
          success: resolve,
          fail: reject
        })
      })

      wx.showToast({ title: '续费成功', icon: 'success', duration: 1500 })
      setTimeout(() => {
        this._isRenewing = false
        this.loadAll()
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      const errMsg = (err && err.errMsg) || ''
      if (errMsg.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请稍后重试', icon: 'none' })
      }
      this._isRenewing = false
    }
  }
})
