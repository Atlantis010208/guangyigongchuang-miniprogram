const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const detailRoot = path.join(previewRoot, 'owner-case-detail')
const casesContentRoot = path.join(previewRoot, 'owner-cases', 'content')
const detailRoute = 'pages/v2/owner-case-detail/index'
const detailUrl = '/' + detailRoute

const appConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'app.json'), 'utf8')
)
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage, 'preview subpackage must be registered')
assert(
  previewPackage.pages.includes('owner-case-detail/index'),
  'owner-case-detail preview route must be registered'
)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(
    fs.existsSync(path.join(detailRoot, 'index.' + extension)),
    detailRoute + '.' + extension + ' must exist'
  )
}

const expectedAssets = [
  'hero.webp',
  'highlight-living.webp',
  'highlight-dining.webp',
  'highlight-bedroom.webp',
  'highlight-entry.webp',
]

for (const asset of expectedAssets) {
  const assetPath = path.join(detailRoot, 'assets', asset)
  assert(fs.existsSync(assetPath), 'missing detail WebP asset: ' + asset)

  const file = fs.readFileSync(assetPath)
  assert.strictEqual(
    file.subarray(0, 4).toString('ascii'),
    'RIFF',
    asset + ' must be a valid RIFF WebP file'
  )
  assert.strictEqual(
    file.subarray(8, 12).toString('ascii'),
    'WEBP',
    asset + ' must be encoded as WebP'
  )
}

const pageConfig = JSON.parse(
  fs.readFileSync(path.join(detailRoot, 'index.json'), 'utf8')
)
const detailJs = fs.readFileSync(path.join(detailRoot, 'index.js'), 'utf8')
const detailWxml = fs.readFileSync(path.join(detailRoot, 'index.wxml'), 'utf8')
const detailWxss = fs.readFileSync(path.join(detailRoot, 'index.wxss'), 'utf8')
const casesContentJs = fs.readFileSync(
  path.join(casesContentRoot, 'index.js'),
  'utf8'
)
const casesContentWxml = fs.readFileSync(
  path.join(casesContentRoot, 'index.wxml'),
  'utf8'
)

assert.strictEqual(
  pageConfig.navigationStyle,
  'custom',
  'detail page must preserve the native status/capsule area with custom navigation'
)
assert.strictEqual(
  pageConfig.enablePullDownRefresh,
  false,
  'detail preview must not expose pull-to-refresh chrome'
)

for (const binding of [
  'copy.navTitle',
  'copy.designTitle',
  'copy.highlightsTitle',
  'copy.projectInfoTitle',
]) {
  assert(
    detailWxml.includes('{{' + binding + '}}'),
    'missing detail copy binding: ' + binding
  )
}

assert(
  detailWxml.includes('bindtap="goBack"'),
  'custom navigation must expose a back interaction'
)
assert(/<swiper\b/.test(detailWxml), 'hero media must use a native swiper')
assert(
  /<swiper-item\b/.test(detailWxml),
  'hero media must render at least one swiper item'
)
assert(
  detailWxml.includes('bindchange="handleSwiperChange"'),
  'hero swiper must update its visible index'
)
assert(
  detailWxml.includes('{{galleryIndex}}')
    && detailWxml.includes('{{galleryTotal}}'),
  'hero must render the one-based 1 / 6 gallery counter'
)
assert(
  detailWxml.includes('bindtap="previewImage"'),
  'detail images must open the native image preview'
)
assert(
  detailWxml.includes('class="detail-action-bar"'),
  'detail page must render one fixed action bar'
)
assert(
  detailWxml.includes('bindtap="toggleBookmark"'),
  'fixed action bar must expose local bookmark interaction'
)
assert(
  detailWxml.includes('bindtap="goConsultation"'),
  'fixed action bar must expose consultation interaction'
)
assert(
  !detailWxml.includes('codex-clipboard-9dcb5450'),
  'the full prototype screenshot must not be rendered by the page'
)

const actionBarRule = detailWxss.match(
  /\.detail-action-bar\s*\{([^}]*)\}/
)?.[1] || ''
assert(
  /position:\s*fixed/.test(actionBarRule)
    && /bottom:\s*0/.test(actionBarRule),
  'detail action bar must remain fixed to the viewport bottom'
)
assert(
  detailWxss.includes('env(safe-area-inset-bottom)'),
  'detail action bar must account for the bottom safe area'
)
assert(
  /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)[^;]*\)/s.test(
    detailWxss
  ),
  'scrolling content must reserve the fixed bar and bottom safe area'
)

assert(
  detailJs.includes('getMenuButtonBoundingClientRect'),
  'detail layout must derive its custom navigation from the native capsule'
)
assert(
  detailJs.includes('getWindowInfo'),
  'detail layout must derive status and safe-area metrics from the window'
)
assert(
  detailJs.includes('wx.previewImage'),
  'detail images must use the native previewImage API'
)
assert(
  detailJs.includes('/pages/support/contact/contact'),
  'consultation must enter the existing support/contact page'
)

function createDetailRuntime(windowInfo, initialPages) {
  let definition
  let currentPages = initialPages.slice()
  const calls = []

  const context = {
    Page(pageDefinition) {
      definition = pageDefinition
    },
    getCurrentPages() {
      return currentPages
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
      navigateBack(options = {}) {
        calls.push({ api: 'navigateBack', options })
      },
      redirectTo(options = {}) {
        calls.push({ api: 'redirectTo', options })
      },
      navigateTo(options = {}) {
        calls.push({ api: 'navigateTo', options })
      },
      previewImage(options = {}) {
        calls.push({ api: 'previewImage', options })
      },
      showToast(options = {}) {
        calls.push({ api: 'showToast', options })
      },
    },
  }

  vm.runInNewContext(detailJs, context, {
    filename: path.join(detailRoot, 'index.js'),
  })
  assert(definition, 'owner-case-detail must register a Page definition')

  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    Object.assign(this.data, update)
  }

  return {
    calls,
    definition,
    page,
    setPages(pages) {
      currentPages = pages.slice()
    },
  }
}

const compactWindow = {
  windowWidth: 375,
  windowHeight: 667,
  screenHeight: 667,
  statusBarHeight: 20,
  safeArea: { bottom: 667 },
  menuButton: { top: 26, height: 32, left: 278, right: 365, width: 87 },
}

for (const id of [
  'nanjing-private',
  'shanghai-minimal',
  'hangzhou-lake',
  'shenzhen-gallery',
]) {
  const runtime = createDetailRuntime(compactWindow, [{ route: detailRoute }])
  runtime.page.onLoad({ id })
  assert.strictEqual(runtime.page.data.caseId, id, 'allowed case id must be kept')
  assert.strictEqual(
    runtime.page.data.statusBarHeight,
    20,
    'status bar height must come from native window metrics'
  )
  assert.strictEqual(
    runtime.page.data.navigationBarHeight,
    44,
    'navigation height must align to the native capsule safe area'
  )
}

const invalidRuntime = createDetailRuntime(
  compactWindow,
  [{ route: detailRoute }]
)
invalidRuntime.page.onLoad({ id: 'not-a-real-case' })
assert.strictEqual(
  invalidRuntime.page.data.caseId,
  'hangzhou-lake',
  'missing or invalid ids must fall back to the prototype case'
)
assert.strictEqual(
  invalidRuntime.page.data.galleryTotal,
  6,
  'the hero counter must represent the six-image project gallery'
)

invalidRuntime.page.handleSwiperChange({ detail: { current: 2 } })
assert.strictEqual(
  invalidRuntime.page.data.galleryIndex,
  3,
  'swiper index must be presented as a one-based counter'
)

const previewSource = detailUrl + '/assets/hero.webp'
invalidRuntime.page.previewImage({
  currentTarget: { dataset: { index: 0, src: previewSource } },
})
const previewCall = invalidRuntime.calls.find(
  (call) => call.api === 'previewImage'
)
assert(previewCall, 'previewImage interaction must call wx.previewImage')
assert(
  Array.isArray(previewCall.options.urls)
    && previewCall.options.urls.length >= expectedAssets.length,
  'native image preview must receive the complete local image set'
)

const bookmarkBefore = Object.prototype.hasOwnProperty.call(
  invalidRuntime.page.data,
  'bookmarked'
)
  ? invalidRuntime.page.data.bookmarked
  : invalidRuntime.page.data.isBookmarked
invalidRuntime.page.toggleBookmark()
const bookmarkAfter = Object.prototype.hasOwnProperty.call(
  invalidRuntime.page.data,
  'bookmarked'
)
  ? invalidRuntime.page.data.bookmarked
  : invalidRuntime.page.data.isBookmarked
assert.strictEqual(
  bookmarkAfter,
  !bookmarkBefore,
  'bookmark interaction must toggle local page state'
)

invalidRuntime.calls.length = 0
invalidRuntime.page.goConsultation()
assert.deepStrictEqual(
  invalidRuntime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/support/contact/contact',
  'consultation must navigate to support/contact'
)

const stackedRuntime = createDetailRuntime(
  compactWindow,
  [{ route: 'pages/v2/owner-home/index' }, { route: detailRoute }]
)
stackedRuntime.page.onLoad({ id: 'hangzhou-lake' })
stackedRuntime.calls.length = 0
stackedRuntime.page.goBack()
assert.deepStrictEqual(
  stackedRuntime.calls.find((call) => call.api === 'navigateBack')?.options.delta,
  1,
  'normal detail return must restore the resident cases panel with navigateBack'
)

const directRuntime = createDetailRuntime(
  compactWindow,
  [{ route: detailRoute }]
)
directRuntime.page.onLoad({ id: 'hangzhou-lake' })
directRuntime.calls.length = 0
directRuntime.page.goBack()
assert.deepStrictEqual(
  directRuntime.calls.find((call) => call.api === 'redirectTo')?.options.url,
  '/pages/v2/owner-home/index?tab=cases',
  'direct-launch back must fall back to the resident cases panel'
)

assert(
  casesContentWxml.includes('data-id="{{item.id}}"')
    && casesContentWxml.includes('bindtap="openCase"'),
  'case cards must pass their id into openCase'
)

function loadCasesContent() {
  let definition
  const calls = []
  const context = {
    Component(componentDefinition) {
      definition = componentDefinition
    },
    wx: {
      navigateTo(options = {}) {
        calls.push({ api: 'navigateTo', options })
      },
      showToast(options = {}) {
        calls.push({ api: 'showToast', options })
      },
    },
  }

  vm.runInNewContext(casesContentJs, context, {
    filename: path.join(casesContentRoot, 'index.js'),
  })
  assert(definition, 'owner-cases content must register a Component definition')

  const component = Object.assign({}, definition.methods)
  component.data = Object.assign({}, definition.data)
  component.setData = function setData(update) {
    Object.assign(this.data, update)
  }

  return { calls, component }
}

const casesRuntime = loadCasesContent()
const encodedCaseId = 'hangzhou lake/\u9759\u8c27?'
casesRuntime.component.openCase({
  currentTarget: { dataset: { id: encodedCaseId } },
})
assert.deepStrictEqual(
  casesRuntime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  detailUrl + '?id=' + encodeURIComponent(encodedCaseId),
  'openCase must navigate to detail with an encoded id'
)

console.log('owner-case-detail preview specification: ok')
