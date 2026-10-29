const enforceV2Gate = typeof require === 'function' ? require('../../../services/v2/navigation-gate').enforceV2Gate : async () => true
const designerApi = typeof require === 'function'
  ? require('../../../services/v2/designer')
  : {
      profile: async () => ({ ok: false }),
      portfolios: async () => ({ ok: false }),
      login: async () => ({ ok: false }),
      getPhoneNumber: async () => ({ ok: false }),
      setIdentity: async () => ({ ok: false }),
      activate: async () => ({ ok: false }),
    }
const COPY = Object.freeze({
  title: '\u6211\u7684',
  subtitle: '\u7ba1\u7406\u4f60\u7684\u4e13\u4e1a\u6863\u6848',
  role: '\u8bbe\u8ba1\u5e08',
  profession: '\u4e13\u4e1a\u706f\u5149\u8bbe\u8ba1',
  mode: '\u8bbe\u8ba1\u5e08\u6a21\u5f0f',
  intro: '\u4e13\u6ce8\u4f4f\u5b85\u4e0e\u5546\u4e1a\u7a7a\u95f4\u706f\u5149\u8bbe\u8ba1',
  editProfile: '\u7f16\u8f91\u8d44\u6599',
  personalProfile: '\u4e2a\u4eba\u8d44\u6599',
  personalProfileHint: '\u67e5\u770b\u5e76\u5b8c\u5584',
  personalHomepage: '\u4e2a\u4eba\u4e3b\u9875',
  personalHomepageHint: '\u9884\u89c8\u5c55\u793a\u6548\u679c',
  works: '\u6211\u7684\u4f5c\u54c1',
  manageWorks: '\u7ba1\u7406\u4f5c\u54c1',
  emptyWorks: '\u6682\u65e0\u4f5c\u54c1',
  accountSettings: '\u8d26\u6237\u4e0e\u8bbe\u7f6e',
  messageSettings: '\u6d88\u606f\u8bbe\u7f6e',
  messageSettingsHint: '\u9879\u76ee\u901a\u77e5\u4e0e\u7cfb\u7edf\u6d88\u606f',
  ownerPortal: '\u4e1a\u4e3b\u7aef',
  ownerPortalHint: '\u5207\u6362\u5230\u4e1a\u4e3b\u9996\u9875',
  completeness: '\u5b8c\u5584\u4e13\u4e1a\u6863\u6848\uff0c\u6709\u52a9\u4e8e\u63d0\u5347\u9879\u76ee\u5339\u914d\u5ea6\u3002',
  homepageUnavailable: '\u4e2a\u4eba\u4e3b\u9875\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
  routeError: '\u9875\u9762\u6682\u65f6\u65e0\u6cd5\u6253\u5f00',
  ownerSwitchFailed: '\u5207\u6362\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  loginPageSubtitle: '\u767b\u5f55\u540e\u7ba1\u7406\u4f60\u7684\u4e13\u4e1a\u6863\u6848',
  checkingTitle: '\u6b63\u5728\u6838\u9a8c\u8bbe\u8ba1\u5e08\u8eab\u4efd',
  checkingSubtitle: '\u6b63\u5728\u786e\u8ba4\u4f60\u7684\u8d26\u53f7\u4e0e\u8bbe\u8ba1\u5e08\u6743\u9650\uff0c\u8bf7\u7a0d\u5019',
  checkingHint: '\u5df2\u5b8c\u5584\u8d44\u6599\u7684\u8d26\u53f7\u4f1a\u81ea\u52a8\u8fdb\u5165\u8bbe\u8ba1\u5e08\u7aef',
  loginTitle: '\u5b8c\u5584\u8bbe\u8ba1\u5e08\u767b\u5f55\u4fe1\u606f',
  loginSubtitle: '\u7528\u4e8e\u521b\u5efa\u4f60\u7684\u4e13\u4e1a\u6863\u6848\u4e0e\u9879\u76ee\u8054\u7cfb\u8d44\u6599',
  loginAvatar: '\u4e0a\u4f20\u5934\u50cf',
  loginNickname: '\u6635\u79f0',
  loginNicknamePlaceholder: '\u8bf7\u8f93\u5165\u8bbe\u8ba1\u5e08\u6635\u79f0',
  loginPhone: '\u624b\u673a\u53f7',
  loginPhonePlaceholder: '\u8bf7\u8f93\u5165\u624b\u673a\u53f7',
  loginPhoneAction: '\u6388\u6743\u624b\u673a\u53f7',
  loginPhoneDone: '\u5df2\u6388\u6743',
  loginConfirm: '\u786e\u8ba4\u767b\u5f55',
  loginLater: '\u7a0d\u540e\u518d\u8bf4',
  loginMeta: '\u8ba4\u8bc1\u540e\u53ef\u4f7f\u7528\u4e13\u4e1a\u6863\u6848\u529f\u80fd',
  loginAvatarRequired: '\u8bf7\u5148\u6dfb\u52a0\u5934\u50cf',
  loginNicknameRequired: '\u8bf7\u8f93\u5165\u8bbe\u8ba1\u5e08\u6635\u79f0',
  loginPhoneRequired: '\u8bf7\u5148\u6388\u6743\u624b\u673a\u53f7',
  loginFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
  loginSuccess: '\u8d44\u6599\u5df2\u63d0\u4ea4',
  uploadFailed: '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25',
})

const SETTINGS = Object.freeze([
  {
    id: 'profile',
    title: COPY.personalProfile,
    subtitle: '\u5934\u50cf\u3001\u7b80\u4ecb\u4e0e\u4e13\u4e1a\u65b9\u5411',
    icon: 'profile',
  },
  {
    id: 'notifications',
    title: COPY.messageSettings,
    subtitle: COPY.messageSettingsHint,
    icon: 'bell',
  },
])

const TABS = Object.freeze([
  {
    id: 'learning',
    label: '\u5b66\u4e60',
    icon: '/pages/v2/shared/assets/tabbar/tab-learning-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-learning-active.png',
  },
  {
    id: 'tools',
    label: '\u5de5\u5177',
    icon: '/pages/v2/shared/assets/tabbar/tab-designer-tools-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-designer-tools-active.png',
  },
  {
    id: 'projects',
    label: '\u9879\u76ee',
    icon: '/pages/v2/shared/assets/tabbar/tab-projects-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-projects-active.png',
  },
  {
    id: 'profile',
    label: '\u6211\u7684',
    icon: '/pages/v2/shared/assets/tabbar/tab-profile-default.png',
    activeIcon: '/pages/v2/shared/assets/tabbar/tab-profile-active.png',
  },
])

function calculateLayout(windowInfo, menuButton) {
  const statusBarHeight = Number(windowInfo.statusBarHeight) || 20
  const menuTop = Number(menuButton.top) || statusBarHeight + 6
  const menuHeight = Number(menuButton.height) || 32
  const navigationBarHeight = Math.max(
    44,
    (menuTop - statusBarHeight) * 2 + menuHeight
  )
  return {
    statusBarHeight,
    navigationBarHeight,
    headerHeight: Math.max(94, navigationBarHeight + 50),
  }
}

function getLayout() {
  let windowInfo = {}
  let menuButton = {}

  try {
    windowInfo = wx.getWindowInfo
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
  } catch (error) {
    windowInfo = {}
  }

  try {
    menuButton = wx.getMenuButtonBoundingClientRect()
  } catch (error) {
    menuButton = {}
  }

  return calculateLayout(windowInfo, menuButton)
}

function showRouteError() {
  wx.showToast({
    title: COPY.routeError,
    icon: 'none',
  })
}

function navigateTo(url) {
  wx.navigateTo({ url, fail: showRouteError })
}

function switchTo(url) {
  wx.switchTab({ url, fail: showRouteError })
}

function redirectTo(url) {
  wx.redirectTo({ url, fail: showRouteError })
}

function trimText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function isLoginState(response) {
  const code = response && response.code
  return ['AUTH_FAILED', 'NOT_FOUND', 'USER_NOT_FOUND', 'DESIGNER_NOT_CERTIFIED', 'CLOUD_ENV_BLOCKED'].indexOf(code) >= 0
}

function getFileExtension(filePath) {
  const match = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  return match ? match[1].toLowerCase() : 'jpg'
}

function getPhoneNumberFromResponse(response) {
  const data = response && response.data || {}
  const phoneInfo = data.phoneInfo || response.raw && response.raw.phoneInfo || {}
  const user = data.user || response.raw && response.raw.user || {}
  return phoneInfo.phoneNumber || user.phoneNumber || data.phoneNumber || ''
}

function getSharedAccount(response) {
  const data = response && response.data || {}
  return data.account && typeof data.account === 'object' ? data.account : null
}

function cacheSharedUser(user, raw) {
  if (!user || typeof user !== 'object') return
  try {
    wx.setStorageSync('userDoc', user)
    if (raw && raw.openid) wx.setStorageSync('openid', raw.openid)
    if (raw && raw.loginTime) wx.setStorageSync('loginTime', raw.loginTime)
    if (raw && raw.expireTime) wx.setStorageSync('loginExpireTime', raw.expireTime)
  } catch (_) {}
}

function maskPhone(phone) {
  const value = String(phone || '')
  if (value.length < 8) return value
  return value.slice(0, 3) + '****' + value.slice(-4)
}

Page({
  data: {
    copy: Object.assign({}, COPY, {
      subtitle: COPY.loginPageSubtitle,
    }),
    works: [],
    settings: SETTINGS,
    tabs: TABS,
    activeTab: 'profile',
    statusBarHeight: 20,
    navigationBarHeight: 44,
    headerHeight: 94,
    profileLoading: true,
    profileState: 'loading',
    profileError: '',
    designerId: '',
    avatarUrl: '',
    loginAvatarUrl: '',
    loginAvatarTempPath: '',
    loginAvatarFileID: '',
    loginNickname: '',
    loginPhone: '',
    loginPhoneDisplay: '',
    loginSubmitting: false,
    phoneAuthorizing: false,
    ownerSwitching: false,
  },

  onLoad() {
    this.setData(getLayout())
    this.loadProfile()
  },

  onShow() {
    enforceV2Gate('designer')
  },

  async loadProfile() {
    this.setData({ profileLoading: true, profileState: 'loading', profileError: '' })
    const profileResponse = await designerApi.profile()
    if (!profileResponse.ok) {
      const account = getSharedAccount(profileResponse)
      const storedAvatar = account && account.avatarUrl || ''
      this.setData({
        profileLoading: false,
        profileState: isLoginState(profileResponse) ? 'login' : 'error',
        profileError: profileResponse.message || '',
        designerId: '',
        works: [],
        avatarUrl: '',
        loginAvatarUrl: account && (account.tempAvatarUrl || storedAvatar) || '',
        loginAvatarTempPath: storedAvatar,
        loginAvatarFileID: storedAvatar,
        loginNickname: account && account.nickname || '',
        loginPhone: account && account.phoneNumber || '',
        loginPhoneDisplay: account && maskPhone(account.phoneNumber) || '',
        copy: Object.assign({}, COPY, {
          subtitle: COPY.loginPageSubtitle,
        }),
      })
      return
    }

    const worksResponse = await designerApi.portfolios()
    const profile = profileResponse.ok && profileResponse.data || {}
    const designerId = profile._id || profile.designerId || profile.id || ''
    const rawWorks = worksResponse.ok ? (Array.isArray(worksResponse.data) ? worksResponse.data : worksResponse.data && (worksResponse.data.list || worksResponse.data.items) || []) : []
    this.setData({
      profileLoading: false,
      profileState: 'ready',
      profileError: profileResponse.ok ? '' : profileResponse.message,
      designerId,
      avatarUrl: profile.tempAvatarUrl || profile.avatarUrl || profile.avatar || '',
      copy: Object.assign({}, this.data.copy, {
        subtitle: COPY.subtitle,
        role: profile.name || profile.nickname || COPY.role,
        profession: profile.profession || profile.specialty || profile.styles || COPY.profession,
        intro: profile.intro || profile.bio || COPY.intro,
      }),
      works: rawWorks.slice(0, 3).map((item, index) => ({
        id: item._id || item.id,
        label: item.title || item.spaceType || item.category || ('\u4f5c\u54c1 ' + (index + 1)),
        image: item.tempCoverImage || item.coverUrl || item.imageUrl || item.coverImage || (item.images && item.images[0]) || '',
      })).filter(item => !!item.image),
    })
  },

  onChooseLoginAvatar(event) {
    const avatarUrl = event && event.detail && event.detail.avatarUrl || ''
    if (!avatarUrl) return
    this.setData({
      loginAvatarUrl: avatarUrl,
      loginAvatarTempPath: avatarUrl,
      loginAvatarFileID: avatarUrl.indexOf('cloud://') === 0 ? avatarUrl : '',
    })
  },

  onLoginNicknameInput(event) {
    this.setData({ loginNickname: event.detail && event.detail.value || '' })
  },

  async onGetLoginPhoneNumber(event) {
    const detail = event && event.detail || {}
    if (!detail.code) {
      wx.showToast({ title: COPY.loginPhoneRequired, icon: 'none' })
      return
    }
    if (this.data.phoneAuthorizing) return

    this.setData({ phoneAuthorizing: true })
    try {
      const response = await designerApi.getPhoneNumber(detail.code)
      if (!response.ok) {
        wx.showToast({ title: response.message || COPY.loginPhoneRequired, icon: 'none' })
        return
      }
      const phone = getPhoneNumberFromResponse(response)
      cacheSharedUser(response.raw && response.raw.user, response.raw)
      this.setData({
        loginPhone: phone,
        loginPhoneDisplay: maskPhone(phone),
      })
      wx.showToast({ title: COPY.loginPhoneDone, icon: 'success' })
    } catch (error) {
      wx.showToast({ title: COPY.loginPhoneRequired, icon: 'none' })
    } finally {
      this.setData({ phoneAuthorizing: false })
    }
  },

  async uploadLoginAvatar() {
    const tempPath = this.data.loginAvatarTempPath
    if (!tempPath) return ''
    if (this.data.loginAvatarFileID) return this.data.loginAvatarFileID
    if (tempPath.indexOf('cloud://') === 0) return tempPath
    if (!wx.cloud || !wx.cloud.uploadFile) return tempPath

    const cloudPath = 'avatars/designer-login-' + Date.now() + '.' + getFileExtension(tempPath)
    const uploadResponse = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempPath,
    })
    const fileID = uploadResponse && uploadResponse.fileID || ''
    if (fileID) {
      this.setData({ loginAvatarFileID: fileID })
    }
    return fileID || tempPath
  },

  async submitDesignerLogin() {
    const nickname = trimText(this.data.loginNickname)
    if (!this.data.loginAvatarUrl) {
      wx.showToast({ title: COPY.loginAvatarRequired, icon: 'none' })
      return
    }
    if (!nickname) {
      wx.showToast({ title: COPY.loginNicknameRequired, icon: 'none' })
      return
    }
    if (!this.data.loginPhone) {
      wx.showToast({ title: COPY.loginPhoneRequired, icon: 'none' })
      return
    }
    if (this.data.loginSubmitting) return

    this.setData({ loginSubmitting: true })
    wx.showLoading({ title: '\u63d0\u4ea4\u4e2d', mask: true })
    try {
      const avatarUrl = await this.uploadLoginAvatar()
      if (!avatarUrl) {
        wx.showToast({ title: COPY.uploadFailed, icon: 'none' })
        return
      }
      const response = await designerApi.login({
        nickName: nickname,
        nickname,
        avatarUrl: avatarUrl.indexOf('cloud://') === 0 ? avatarUrl : '',
      })
      if (!response.ok) {
        wx.showToast({ title: response.message || COPY.loginFailed, icon: 'none' })
        return
      }
      cacheSharedUser(response.raw && response.raw.user, response.raw)

      const identityResponse = await designerApi.setIdentity(2)
      if (!identityResponse.ok) {
        wx.showToast({ title: identityResponse.message || COPY.loginFailed, icon: 'none' })
        return
      }
      cacheSharedUser(identityResponse.raw && identityResponse.raw.user, identityResponse.raw)
      try {
        wx.setStorageSync('userRole', 'designer')
        const app = getApp()
        if (app && app.globalData) app.globalData.userRole = 'designer'
      } catch (_) {}
      wx.showToast({ title: COPY.loginSuccess, icon: 'success' })
      await this.loadProfile()
    } catch (error) {
      wx.showToast({ title: COPY.loginFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loginSubmitting: false })
    }
  },

  deferDesignerLogin() {
    switchTo('/pages/v2/designer-learning/index')
  },

  onResize() {
    this.setData(getLayout())
  },

  editProfile() {
    navigateTo('/pages/designer-profile-edit/designer-profile-edit')
  },

  openPersonalProfile() {
    navigateTo('/pages/designer-profile-edit/designer-profile-edit')
  },

  previewHomepage() {
    const designerId = this.data.designerId
    if (!designerId) {
      wx.showToast({
        title: COPY.homepageUnavailable,
        icon: 'none',
      })
      return
    }
    navigateTo('/pages/designers/detail/detail?id=' + encodeURIComponent(designerId) + '&from=self')
  },

  manageWorks() {
    navigateTo('/pages/designer-portfolios/designer-portfolios')
  },

  openWork() {
    navigateTo('/pages/designer-portfolios/designer-portfolios')
  },

  openSetting(event) {
    const id = event.currentTarget.dataset.id
    navigateTo(
      id === 'notifications'
        ? '/pages/designer-notifications/designer-notifications'
        : '/pages/designer-profile-edit/designer-profile-edit'
    )
  },

  async switchToOwner() {
    if (this.data.ownerSwitching) return

    this.setData({ ownerSwitching: true })
    try {
      const response = await designerApi.setIdentity(1)
      if (!response.ok) {
        wx.showToast({ title: response.message || COPY.ownerSwitchFailed, icon: 'none' })
        return
      }
      cacheSharedUser(response.raw && response.raw.user, response.raw)
      try {
        wx.setStorageSync('userRole', 'owner')
        const app = getApp()
        if (app && app.globalData) app.globalData.userRole = 'owner'
      } catch (_) {}
      redirectTo('/pages/v2/owner-home/index')
    } catch (error) {
      wx.showToast({ title: COPY.ownerSwitchFailed, icon: 'none' })
    } finally {
      this.setData({ ownerSwitching: false })
    }
  },

  switchTab(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'profile') return
    if (id === 'projects') {
      redirectTo('/pages/v2/designer-projects/index')
      return
    }
    if (id === 'learning') {
      redirectTo('/pages/v2/designer-learning/index')
      return
    }
    if (id === 'tools') {
      redirectTo('/pages/v2/designer-tools/index')
    }
  },
})
