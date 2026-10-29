const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'v2', 'owner-home')
const route = 'pages/v2/owner-home/index'

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage, 'owner-home preview subpackage must be registered')
assert(
  previewPackage.pages.includes('owner-home/index'),
  'owner-home preview route must be registered'
)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(
    fs.existsSync(path.join(pageRoot, 'index.' + extension)),
    route + '.' + extension + ' must exist'
  )
}

const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const js = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const wxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
const tabbarWxss = fs.readFileSync(
  path.join(root, 'pages', 'v2', 'shared', 'preview-tabbar.wxss'),
  'utf8'
)

function loadLayout(windowInfo) {
  let pageDefinition
  const context = {
    Page(definition) {
      pageDefinition = definition
    },
    wx: {
      getWindowInfo() {
        return windowInfo
      },
      getMenuButtonBoundingClientRect() {
        return windowInfo.menuButton
      },
    },
  }

  vm.runInNewContext(js, context, {
    filename: path.join(pageRoot, 'index.js'),
  })

  const updates = {}
  const page = Object.assign({}, pageDefinition, {
    setData(data) {
      Object.assign(updates, data)
    },
  })

  page.onLoad()
  return Object.assign({}, page.data, updates)
}

const compactLayout = loadLayout({
  windowWidth: 375,
  windowHeight: 667,
  screenHeight: 667,
  statusBarHeight: 20,
  safeArea: { bottom: 667 },
  menuButton: { top: 26, height: 32 },
})
const tallLayout = loadLayout({
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  statusBarHeight: 47,
  safeArea: { bottom: 810 },
  menuButton: { top: 55, height: 32 },
})

assert.strictEqual(compactLayout.layoutExtra, 0)
assert(tallLayout.layoutExtra > compactLayout.layoutExtra)
assert(tallLayout.layoutExtra <= 80)
assert(tallLayout.heroHeight > compactLayout.heroHeight)
assert(tallLayout.caseImageStretch > compactLayout.caseImageStretch)

for (const metric of [
  compactLayout.contentMinHeight,
  tallLayout.contentMinHeight,
  tallLayout.nextCardStretch,
  tallLayout.toolsGapStretch,
  tallLayout.toolCardStretch,
]) {
  assert(Number.isFinite(metric), 'responsive layout metrics must be finite')
  assert(metric >= 0, 'responsive layout metrics must be non-negative')
}

for (const binding of [
  'copy.heroLine1',
  'copy.heroLine2',
  'copy.heroCta',
  'copy.nextTitle',
  'copy.casesTitle',
  'copy.toolsTitle',
  'copy.illuminanceTitle',
  'copy.colorTitle',
]) {
  assert(wxml.includes('{{' + binding + '}}'), 'missing copy binding: ' + binding)
}

assert(wxml.includes('wx:for="{{featuredCases}}"'), 'featured cases must be data-driven')
assert(wxml.includes('src="{{userAvatar}}"'), 'owner home avatar must be data-driven')
assert(wxml.includes('wx:if="{{userAvatar}}"'))
assert(wxml.includes('class="avatar avatar-skeleton"'))
assert(wxml.includes('binderror="handleAvatarError"'))
assert(wxss.includes('.avatar-skeleton'))
assert(js.includes("userAvatar: ''"))
assert(js.includes('handleAvatarError()'))
assert(!js.includes('owner-home/assets/avatar.png'))
assert(!wxml.includes('owner-home/assets/avatar.png'))
assert(wxml.includes('owner-cases-content user-avatar="{{userAvatar}}"'))
assert(wxml.includes('owner-services-content data-module-version="mall-v2" user-avatar="{{userAvatar}}"'))
assert(wxml.includes('owner-tools-content user-avatar="{{userAvatar}}"'))
assert(wxml.includes('preview-tabbar__inner--owner-four'))
assert(!wxml.includes('{{copy.tabProfile}}'))
assert(!wxml.includes("activePreviewTab === 'profile'"))
assert(!wxml.includes('tab-profile-default.png'))
assert(!wxml.includes('tab-profile-active.png'))

for (const residentPanel of ['cases', 'services', 'tools']) {
  assert(
    wxml.includes('wx:if="{{activePreviewTab === \'' + residentPanel + '\'}}"'),
    'inactive resident tab content must be conditionally rendered: ' + residentPanel
  )
}

for (const binding of [
  'contentMinHeight',
  'heroSubtitleGap',
  'nextCardStretch',
  'casesGapStretch',
  'caseImageStretch',
  'toolsGapStretch',
  'toolCardStretch',
]) {
  assert(wxml.includes('{{' + binding + '}}'), 'missing layout binding: ' + binding)
}

for (const target of [
  '/pages/flows/publish/publish',
  '/pages/search/search',
  '/pages/color-temp/color-temp',
  '/pages/profile/home/home',
]) {
  assert(js.includes(target), 'missing preview route: ' + target)
}

for (const residentPanel of ['cases', 'services', 'tools']) {
  assert(
    wxml.includes('data-preview-panel="' + residentPanel + '"'),
    'missing resident panel: ' + residentPanel
  )
}
assert(wxml.includes('bindtap="switchToServices"'))

for (const asset of [
  'hero-room.png',
  'case-nanjing.png',
  'case-shanghai.png',
  'icon-calculator.png',
  'icon-temperature.png',
]) {
  assert(
    fs.existsSync(path.join(pageRoot, 'assets', asset)),
    'missing preview asset: ' + asset
  )
}

for (const asset of [
  'tab-home-default.png',
  'tab-home-active.png',
  'tab-cases-default.png',
  'tab-cases-active.png',
  'tab-services-default.png',
  'tab-services-active.png',
  'tab-tools-default.png',
  'tab-tools-active.png',
]) {
  assert(
    fs.existsSync(path.join(root, 'pages', 'v2', 'shared', 'assets', 'tabbar', asset)),
    'missing shared tab asset: ' + asset
  )
  assert(wxml.includes(asset), 'unused shared tab asset: ' + asset)
}
assert.strictEqual((wxml.match(/class="tab-icon-stack"/g) || []).length, 4)

assert(
  !wxml.includes('codex-clipboard-979c8b91'),
  'the full reference screenshot must not be rendered by the page'
)
assert(
  tabbarWxss.includes('env(safe-area-inset-bottom)'),
  'the preview tab bar must account for the bottom safe area'
)
assert(
  js.includes('getMenuButtonBoundingClientRect'),
  'the page must position content from the native WeChat capsule'
)
const pageContentRule = wxss.match(/\.page-content\s*\{([^}]*)\}/)?.[1] || ''
assert(
  /display:\s*flex/.test(pageContentRule)
    && /flex-direction:\s*column/.test(pageContentRule),
  'the content layout must distribute tall-screen metrics vertically'
)

assert(js.includes('const COPY = Object.freeze'), 'copy must be stable')
assert(js.includes('\\u'), 'copy must remain portable Unicode source')

console.log('owner-home preview specification: ok')
