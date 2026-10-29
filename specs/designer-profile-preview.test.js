const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const pageRoot = path.join(previewRoot, 'designer-profile')
const pageRoute = 'pages/v2/designer-profile/index'
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage)
assert(previewPackage.pages.includes('designer-profile/index'))
const compileCondition = privateConfig.condition.miniprogram
assert(
  compileCondition.list.some((item) => item.pathName === pageRoute),
  'WeChat Developer Tools must retain a designer profile preview condition'
)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(pageRoot, 'index.' + extension)))
}

const pageConfig = JSON.parse(
  fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8')
)
const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const pageWxss = fs
  .readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
  .replace(/\r\n/g, '\n')
const sharedTabbarWxss = fs
  .readFileSync(path.join(previewRoot, 'shared', 'preview-tabbar.wxss'), 'utf8')
  .replace(/\r\n/g, '\n')

assert.strictEqual(pageConfig.navigationStyle, 'custom')
assert.strictEqual(pageConfig.enablePullDownRefresh, false)
assert.strictEqual(pageConfig.disableScroll, true)

for (const className of [
  'profile-header',
  'designer-checking-panel',
  'designer-checking-card',
  'checking-spinner',
  'designer-login-panel',
  'designer-login-card',
  'login-avatar-picker',
  'login-confirm-button',
  'identity-card',
  'profile-shortcuts',
  'works-section',
  'works-grid',
  'settings-section',
  'settings-card',
  'owner-entry-section',
  'owner-entry-card',
  'owner-entry-content',
  'completeness-note',
  'preview-tabbar',
]) {
  assert(
    pageWxml.includes('class="' + className)
      || pageWxml.includes(' ' + className),
    'missing profile module: ' + className
  )
}

for (const binding of [
  'copy.title',
  'copy.subtitle',
  'copy.role',
  'copy.profession',
  'copy.mode',
  'copy.intro',
  'copy.works',
  'copy.accountSettings',
  'copy.ownerPortal',
  'copy.ownerPortalHint',
  'copy.completeness',
  'copy.checkingTitle',
  'copy.checkingSubtitle',
  'copy.checkingHint',
  'copy.loginTitle',
  'copy.loginConfirm',
]) {
  assert(pageWxml.includes('{{' + binding + '}}'))
}

for (const collection of ['works', 'settings', 'tabs']) {
  assert(pageWxml.includes('wx:for="{{' + collection + '}}"'))
}

for (const interaction of [
  'editProfile',
  'openPersonalProfile',
  'previewHomepage',
  'manageWorks',
  'openWork',
  'openSetting',
  'switchToOwner',
  'switchTab',
]) {
  assert(pageWxml.includes('bindtap="' + interaction + '"'))
}

assert(!/certification|professionalCertification/.test(pageJs + pageWxml))
assert(!/callFunction/.test(pageJs))
assert(pageJs.includes('wx.cloud.uploadFile'))
assert(!pageWxml.includes('9:41') && !pageWxml.includes('4G'))
assert(!pageWxml.includes('codex-clipboard-d6a112e5'))
assert(pageWxss.includes('@import "../shared/preview-tabbar.wxss"'))
assert(/height:\s*108rpx/.test(sharedTabbarWxss))
assert(sharedTabbarWxss.includes('env(safe-area-inset-bottom)'))
assert(pageWxss.includes('@media (min-height: 760px)'))
for (const tallScreenRule of [
  'height: 348rpx;',
  'margin-top: 78rpx;',
  'height: 236rpx;',
  'margin-top: 80rpx;',
  'height: 196rpx;',
]) {
  assert(pageWxss.includes(tallScreenRule))
}

for (const [selector, expected] of [
  ['.profile-page-title', 'font-size: 56rpx'],
  ['.profile-heading--center .profile-page-title', 'font-size: 38rpx'],
  ['.designer-login-card', 'height: 814rpx'],
  ['.login-confirm-button', 'border-radius: 999rpx'],
  ['.login-confirm-button', 'width: 400rpx'],
  ['.login-confirm-button', 'height: 84rpx'],
  ['.login-confirm-button', 'background: #000000'],
  ['.identity-card', 'height: 308rpx'],
  ['.profile-avatar', 'width: 154rpx'],
  ['.profile-avatar', 'height: 154rpx'],
  ['.work-image', 'height: 196rpx'],
  ['.settings-card', 'height: 164rpx'],
]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = pageWxss.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'))?.[1]
  assert(rule && rule.includes(expected), selector + ' must match ' + expected)
}

for (const asset of [
  'login-camera.png',
  'login-shield.png',
  'icon-chevron-right-v2.png',
]) {
  const localAsset = path.join(pageRoot, 'assets', asset)
  const sharedAsset = path.join(
    previewRoot,
    'designer-workbench',
    'assets',
    asset
  )
  assert(fs.existsSync(localAsset) || fs.existsSync(sharedAsset))
  assert(pageJs.includes(asset) || pageWxml.includes(asset))
}

for (const asset of [
  'tab-learning-default.png',
  'tab-learning-active.png',
  'tab-designer-tools-default.png',
  'tab-designer-tools-active.png',
  'tab-projects-default.png',
  'tab-projects-active.png',
  'tab-profile-default.png',
  'tab-profile-active.png',
]) {
  assert(fs.existsSync(path.join(previewRoot, 'shared', 'assets', 'tabbar', asset)))
  assert(pageJs.includes(asset))
}
assert(pageWxml.includes('src="{{item.activeIcon}}"'))

for (const nativeApi of [
  'getWindowInfo',
  'getMenuButtonBoundingClientRect',
]) {
  assert(pageJs.includes(nativeApi))
}

function createRuntime(windowInfo) {
  let definition
  const calls = []
  const context = {
    Page(value) {
      definition = value
    },
    wx: {
      getWindowInfo() {
        return windowInfo
      },
      getSystemInfoSync() {
        return windowInfo
      },
      getMenuButtonBoundingClientRect() {
        return windowInfo.menuButton
      },
      navigateTo(options = {}) {
        calls.push({ api: 'navigateTo', options })
      },
      switchTab(options = {}) {
        calls.push({ api: 'switchTab', options })
      },
      redirectTo(options = {}) {
        calls.push({ api: 'redirectTo', options })
      },
      showToast(options = {}) {
        calls.push({ api: 'showToast', options })
      },
    },
  }

  vm.runInNewContext(pageJs, context, {
    filename: path.join(pageRoot, 'index.js'),
  })
  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    Object.assign(this.data, update)
  }
  return { calls, page }
}

const runtime = createRuntime({
  windowWidth: 390,
  windowHeight: 844,
  statusBarHeight: 20,
  menuButton: { top: 26, height: 32 },
})
runtime.page.onLoad()

assert.strictEqual(runtime.page.data.statusBarHeight, 20)
assert.strictEqual(runtime.page.data.navigationBarHeight, 44)
assert.strictEqual(runtime.page.data.headerHeight, 94)
assert.strictEqual(runtime.page.data.works.length, 0)
assert.strictEqual(runtime.page.data.profileState, 'loading')
assert.strictEqual(runtime.page.data.profileLoading, true)
assert.strictEqual(runtime.page.data.copy.checkingTitle, '\u6b63\u5728\u6838\u9a8c\u8bbe\u8ba1\u5e08\u8eab\u4efd')
assert.strictEqual(runtime.page.data.copy.checkingSubtitle, '\u6b63\u5728\u786e\u8ba4\u4f60\u7684\u8d26\u53f7\u4e0e\u8bbe\u8ba1\u5e08\u6743\u9650\uff0c\u8bf7\u7a0d\u5019')
assert.strictEqual(runtime.page.data.copy.checkingHint, '\u5df2\u5b8c\u5584\u8d44\u6599\u7684\u8d26\u53f7\u4f1a\u81ea\u52a8\u8fdb\u5165\u8bbe\u8ba1\u5e08\u7aef')
assert.strictEqual(runtime.page.data.copy.subtitle, '登录后管理你的专业档案')
assert.strictEqual(runtime.page.data.copy.loginPageSubtitle, '登录后管理你的专业档案')
assert.strictEqual(runtime.page.data.copy.loginTitle, '完善设计师登录信息')
assert.strictEqual(runtime.page.data.copy.loginSubtitle, '用于创建你的专业档案与项目联系资料')
assert.strictEqual(runtime.page.data.copy.loginAvatar, '上传头像')
assert.strictEqual(runtime.page.data.copy.loginNickname, '昵称')
assert.strictEqual(runtime.page.data.copy.loginNicknamePlaceholder, '请输入设计师昵称')
assert.strictEqual(runtime.page.data.copy.loginPhone, '手机号')
assert.strictEqual(runtime.page.data.copy.loginPhonePlaceholder, '请输入手机号')
assert.strictEqual(runtime.page.data.copy.loginPhoneAction, '授权手机号')
assert.strictEqual(runtime.page.data.copy.loginMeta, '认证后可使用专业档案功能')
assert(pageJs.includes('emptyWorks'))
assert(pageWxml.includes('open-type="chooseAvatar"'))
assert(pageWxml.includes('bindchooseavatar="onChooseLoginAvatar"'))
assert(pageWxml.includes('type="nickname"'))
assert(pageWxml.includes('open-type="getPhoneNumber"'))
assert(pageWxml.includes('bindgetphonenumber="onGetLoginPhoneNumber"'))
assert(pageWxml.includes('bindtap="submitDesignerLogin"'))
assert(pageWxml.includes('bindtap="deferDesignerLogin"'))
assert(pageWxml.includes('ui-v2-assets/pages/v2/designer-profile/assets/login-camera.png'))
assert(pageWxml.includes('ui-v2-assets/pages/v2/designer-profile/assets/login-shield.png'))
assert(!pageWxml.includes('designer-login-mark'))
assert(pageWxml.includes('wx:if="{{profileState === \'loading\'}}"'))
assert(pageWxml.includes('wx:elif="{{profileState === \'login\' || profileState === \'error\'}}"'))
assert(!pageWxml.includes('wx:if="{{profileState !== \'ready\'}}" class="designer-login-panel"'))
assert(pageWxml.includes('wx:if="{{works.length > 0}}"'))
assert(pageWxml.includes('works-empty'))
assert(pageWxss.includes('.designer-checking-panel'))
assert(pageWxss.includes('@keyframes checking-spin'))
assert(pageWxss.includes('@keyframes checking-progress'))
assert(!pageJs.includes('const WORKS'))
assert(pageWxml.includes('wx:if="{{avatarUrl}}"'))
assert(pageWxml.includes('profile-avatar--empty'))
assert(!pageWxml.includes("avatarUrl || './assets/profile-avatar.png'"))
assert(pageJs.includes('const response = await designerApi.setIdentity(1)'))
assert(pageJs.includes("wx.setStorageSync('userRole', 'owner')"))
assert(pageJs.includes("redirectTo('/pages/v2/owner-home/index')"))
assert(pageWxml.includes('loading="{{ownerSwitching}}"'))
assert(pageWxml.includes("ownerSwitching ? 'owner-entry-card--loading' : ''"))
assert(pageWxss.includes('.owner-entry-card--loading .owner-entry-content'))
assert(!pageJs.includes('COPY.ownerSwitching'))
assert.strictEqual(runtime.page.data.settings.length, 2)
assert.strictEqual(runtime.page.data.tabs.length, 4)
assert.strictEqual(runtime.page.data.tabs.map((item) => item.id).join(','), 'learning,tools,projects,profile')
assert.strictEqual(runtime.page.data.activeTab, 'profile')

runtime.page.editProfile()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/designer-profile-edit/designer-profile-edit'
)

runtime.calls.length = 0
runtime.page.manageWorks()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/designer-portfolios/designer-portfolios'
)

runtime.calls.length = 0
runtime.page.previewHomepage()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'showToast')?.options.title,
  '个人主页暂时无法打开'
)

runtime.calls.length = 0
runtime.page.setData({ designerId: 'designer-1' })
runtime.page.previewHomepage()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/designers/detail/detail?id=designer-1&from=self'
)

runtime.calls.length = 0
runtime.page.openSetting({
  currentTarget: { dataset: { id: 'notifications' } },
})
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/designer-notifications/designer-notifications'
)

runtime.calls.length = 0
runtime.page.switchTab({
  currentTarget: { dataset: { id: 'projects' } },
})
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'redirectTo')?.options.url,
  '/pages/v2/designer-projects/index'
)

for (const responsiveWindow of [
  {
    windowWidth: 320,
    windowHeight: 568,
    statusBarHeight: 20,
    menuButton: { top: 26, height: 32 },
  },
  {
    windowWidth: 430,
    windowHeight: 932,
    statusBarHeight: 20,
    menuButton: { top: 26, height: 32 },
  },
]) {
  const responsiveRuntime = createRuntime(responsiveWindow)
  responsiveRuntime.page.onLoad()
  assert.strictEqual(responsiveRuntime.page.data.navigationBarHeight, 44)
  assert.strictEqual(responsiveRuntime.page.data.headerHeight, 94)
}

const productionFingerprints = {
  'designer-profile.js':
    '9e31f1e3d71713407111ba197e89abd11d9b54ff593bb0dcb3b2d73a112d43f9',
  'designer-profile.json':
    'e8ef9d5725c5d7a6a59b67d8da9ce1433b34346481c85479935b5ef052d39617',
  'designer-profile.wxml':
    'ae5f58124b1280f81117c8df8d99db03e2ce7e7b31458dfa5a69db9a47f2562c',
  'designer-profile.wxss':
    '80e5a305bdb53451ac72e61b63d839f882376a89ac59334797db8ebe7647e17b',
}

for (const [file, expectedHash] of Object.entries(productionFingerprints)) {
  const source = fs.readFileSync(
    path.join(root, 'pages', 'designer-profile', file)
  )
  const actualHash = crypto.createHash('sha256').update(source).digest('hex')
  assert.strictEqual(actualHash, expectedHash)
}

console.log('designer-profile preview specification: ok')
