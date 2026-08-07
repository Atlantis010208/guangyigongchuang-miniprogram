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
  'identity-card',
  'profile-shortcuts',
  'works-section',
  'works-grid',
  'settings-section',
  'settings-card',
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
  'copy.completeness',
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
  'switchTab',
]) {
  assert(pageWxml.includes('bindtap="' + interaction + '"'))
}

assert(!/certification|professionalCertification/.test(pageJs + pageWxml))
assert(!/wx\.cloud|callFunction/.test(pageJs))
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
  ['.identity-card', 'height: 308rpx'],
  ['.profile-avatar', 'width: 154rpx'],
  ['.profile-avatar', 'height: 154rpx'],
  ['.work-image', 'height: 196rpx'],
  ['.settings-card', 'height: 164rpx'],
]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = pageWxss.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'))?.[1]
  assert(rule && rule.includes(expected), selector + ' must match ' + expected)
}

for (const asset of [
  'profile-avatar.png',
  'portfolio-bedroom.png',
  'project-residential-card.webp',
  'project-commercial.webp',
  'icon-tab-workbench-v2.png',
  'icon-tab-learning-v2.png',
  'icon-tab-tools-v2.png',
  'icon-tab-projects-v2.png',
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
assert.strictEqual(runtime.page.data.settings.length, 2)
assert.strictEqual(runtime.page.data.tabs.length, 5)
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
