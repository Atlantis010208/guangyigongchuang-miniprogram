const app = getApp()
const util = require('../../utils/util')

const STATUS_COPY = {
  ready: {
    subtitle: '请确认是否在电脑端登录光乙平台',
    title: '等待你的确认',
    desc: '当前微信身份将用于登录电脑端工作台。'
  },
  loading: {
    subtitle: '正在确认网页登录',
    title: '确认中',
    desc: '请稍候，正在为电脑端完成安全确认。'
  },
  success: {
    subtitle: '网页登录已确认',
    title: '已确认登录',
    desc: '请回到电脑端继续使用光乙平台。'
  },
  error: {
    subtitle: '网页登录无法确认',
    title: '确认失败',
    desc: '二维码可能已过期或不存在，请在电脑端重新获取。'
  },
  canceled: {
    subtitle: '本次网页登录已取消',
    title: '已取消登录',
    desc: '电脑端不会登录当前微信身份。'
  }
}

function getRoleLabel(userDoc) {
  const roles = userDoc && typeof userDoc.roles === 'number' ? userDoc.roles : 1
  if (roles === 0) return '管理员账号'
  if (roles === 2) return '设计师账号'
  return '用户/会员账号'
}

function getDisplayName(userDoc) {
  return (userDoc && (userDoc.nickname || userDoc.nickName || userDoc.name)) || '当前微信用户'
}

function getAvatarUrl(userDoc) {
  return (userDoc && (userDoc.avatarUrl || userDoc.avatar)) || ''
}

function getAvatarLetter(displayName) {
  const name = String(displayName || '').trim()
  return name ? name.substring(0, 1).toUpperCase() : 'G'
}

Page({
  data: {
    scene: '',
    status: 'ready',
    loading: false,
    subtitle: STATUS_COPY.ready.subtitle,
    statusTitle: STATUS_COPY.ready.title,
    statusDesc: STATUS_COPY.ready.desc,
    displayName: '当前微信用户',
    avatarUrl: '',
    avatarLetter: 'G',
    roleLabel: '用户/会员账号',
    canConfirm: true
  },

  onLoad(options = {}) {
    wx.hideHomeButton && wx.hideHomeButton()

    const scene = this.resolveScene(options)
    const userDoc = this.getUserDoc()
    const displayName = getDisplayName(userDoc)
    const avatarUrl = getAvatarUrl(userDoc)

    this.setData({
      scene,
      displayName,
      avatarUrl,
      avatarLetter: getAvatarLetter(displayName),
      roleLabel: getRoleLabel(userDoc)
    })

    if (!scene) {
      this.applyStatus('error', '二维码参数缺失，请在电脑端重新获取登录二维码。')
      return
    }

    this.applyStatus('ready')
  },

  resolveScene(options) {
    const rawScene = options.scene || ''
    if (!rawScene) return ''

    try {
      return decodeURIComponent(String(rawScene)).trim()
    } catch (e) {
      return String(rawScene).trim()
    }
  },

  getUserDoc() {
    try {
      return (app && app.globalData && app.globalData.userDoc) || wx.getStorageSync('userDoc') || {}
    } catch (e) {
      return {}
    }
  },

  applyStatus(status, desc) {
    const copy = STATUS_COPY[status] || STATUS_COPY.error
    this.setData({
      status,
      subtitle: copy.subtitle,
      statusTitle: copy.title,
      statusDesc: desc || copy.desc,
      canConfirm: status === 'ready' || status === 'loading',
      loading: status === 'loading'
    })
  },

  async onConfirmLogin() {
    if (this.data.loading || !this.data.scene) return

    this.applyStatus('loading')

    try {
      const userDoc = this.getUserDoc()
      const result = await util.callCf('web_login_qr_confirm', {
        scene: this.data.scene,
        profile: {
          nickname: getDisplayName(userDoc),
          avatarUrl: getAvatarUrl(userDoc)
        }
      })

      if (!result || !result.success) {
        throw new Error(this.getErrorMessage(result))
      }

      util.hapticFeedback('light')
      this.applyStatus('success')
    } catch (err) {
      console.error('[web-login-confirm] confirm failed:', err)
      this.applyStatus('error', err && err.message ? err.message : STATUS_COPY.error.desc)
    }
  },

  getErrorMessage(result) {
    const code = result && result.code
    if (code === 'LOGIN_SESSION_EXPIRED') return '二维码已过期，请在电脑端重新获取。'
    if (code === 'LOGIN_SESSION_NOT_FOUND') return '登录二维码不存在，请在电脑端重新获取。'
    if (code === 'LOGIN_SESSION_CONSUMED') return '本次登录二维码已使用，请在电脑端重新获取。'
    if (code === 'UNAUTHENTICATED') return '当前微信身份不可用，请重新打开小程序后再试。'
    if (code === 'INVALID_SCENE') return '二维码参数无效，请在电脑端重新获取。'
    return (result && (result.errorMessage || result.message)) || STATUS_COPY.error.desc
  },

  onCancel() {
    this.applyStatus('canceled')
  },

  goHome() {
    wx.switchTab({
      url: '/pages/products/products',
      fail: () => wx.reLaunch({ url: '/pages/products/products' })
    })
  }
})
