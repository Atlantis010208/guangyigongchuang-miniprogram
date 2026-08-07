const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const pageRoot = path.join(previewRoot, 'designer-projects')
const pageRoute = 'pages/v2/designer-projects/index'

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage, 'preview subpackage must be registered')
assert(
  previewPackage.pages.includes('designer-projects/index'),
  'designer projects preview route must be registered'
)

const compileCondition = privateConfig.condition.miniprogram
assert(
  compileCondition.list.some((item) => item.pathName === pageRoute),
  'WeChat Developer Tools must retain a designer projects preview condition'
)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(
    fs.existsSync(path.join(pageRoot, 'index.' + extension)),
    pageRoute + '.' + extension + ' must exist'
  )
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
  'projects-header',
  'category-tabs',
  'project-stats',
  'projects-section-heading',
  'project-list',
  'project-card',
  'management-panel',
  'opportunity-filters',
  'opportunity-card',
  'application-note',
  'completed-search',
  'completed-card',
  'completed-history',
  'completed-note',
  'preview-tabbar',
]) {
  assert(
    pageWxml.includes('class="' + className)
      || pageWxml.includes(' ' + className),
    'missing project prototype module: ' + className
  )
}

for (const binding of [
  'copy.title',
  'headerSubtitle',
  'copy.opportunitySection',
  'copy.applicationNote',
  'copy.completedSection',
  'copy.completedNote',
  'copy.sectionTitle',
  'copy.allProjects',
  'copy.nextStep',
  'copy.progress',
  'copy.separator',
]) {
  assert(
    pageWxml.includes('{{' + binding + '}}'),
    'missing prototype copy binding: ' + binding
  )
}

for (const collection of [
  'categories',
  'stats',
  'projects',
  'management',
  'tabs',
]) {
  assert(
    pageWxml.includes('wx:for="{{' + collection + '}}"'),
    'missing fixed preview collection: ' + collection
  )
}

for (const interaction of [
  'switchCategory',
  'switchOpportunityFilter',
  'viewOpportunity',
  'applyOpportunity',
  'toggleCompletedSort',
  'viewCompletedProject',
  'viewDeliveryFiles',
  'openCompletedHistory',
  'openAllProjects',
  'continueProject',
  'viewProject',
  'openManagement',
  'switchTab',
]) {
  assert(
    pageWxml.includes('bindtap="' + interaction + '"'),
    'missing project preview interaction: ' + interaction
  )
}

assert(pageJs.includes('marketplaceSubtitle'))
assert(pageWxml.includes('bindinput="searchCompleted"'))
assert(pageWxss.includes('@import "./completed.wxss"'))
assert(!pageWxml.includes('{{copy.clientLabel}}?'), 'client metadata must not contain broken separators')
assert(!pageWxml.includes('opportunity-filter-hint'), 'duplicate filter hint must stay removed')
assert(!pageWxss.includes('.filter-glyph'), 'filter icon styles must stay removed')
assert(!pageWxml.includes('search-button'), 'search control must stay removed')
assert(!pageJs.includes('openSearch'), 'search interaction must stay removed')

assert(
  !pageWxml.includes('9:41')
    && !pageWxml.includes('4G')
    && !pageWxml.includes('codex-clipboard-4bda4807'),
  'the preview must use the native status and capsule areas'
)
assert(
  !/wx\.cloud|callFunction/.test(pageJs),
  'the fixed visual preview must not mutate or fetch production data'
)
assert(
  pageWxss.includes('@import "../shared/preview-tabbar.wxss"'),
  'designer projects must reuse the shared tabbar geometry'
)
assert(/height:\s*108rpx/.test(sharedTabbarWxss))
assert(sharedTabbarWxss.includes('env(safe-area-inset-bottom)'))

for (const [selector, expected] of [
  ['.projects-title', 'font-size: 56rpx'],
  ['.category-tabs', 'height: 72rpx'],
  ['.project-stats', 'height: 112rpx'],
  ['.project-card--primary', 'height: 440rpx'],
  ['.project-card--secondary', 'height: 376rpx'],
  ['.management-panel', 'height: 104rpx'],
  ['.opportunity-filters', 'height: 88rpx'],
  ['.opportunity-card', 'height: 432rpx'],
]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = pageWxss.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'))?.[1]
  assert(rule && rule.includes(expected), selector + ' must match ' + expected)
}

assert(pageWxss.includes('.detail-action {\n  justify-self: end;\n  justify-content: flex-end;\n  width: 152rpx;'))

for (const spacing of [
  'margin: 24rpx 28rpx 0;',
  'margin: 28rpx 28rpx 0;',
  'margin-top: 14rpx;',
  'margin: 18rpx 28rpx 0;',
]) {
  assert(pageWxss.includes(spacing), 'missing prototype spacing: ' + spacing)
}

const referencedAssets = [
  'project-residential-card.webp',
  'project-commercial.webp',
  'icon-tab-workbench-v2.png',
  'icon-tab-learning-v2.png',
  'icon-tab-tools-v2.png',
  'icon-tab-projects-v2.png',
  'icon-tab-profile-v2.png',
  'icon-chevron-right-v2.png',
]
for (const asset of referencedAssets) {
  const assetPath = path.join(
    previewRoot,
    'designer-workbench',
    'assets',
    asset
  )
  assert(fs.existsSync(assetPath), 'missing reused local asset: ' + asset)
  assert(pageJs.includes(asset) || pageWxml.includes(asset), 'unused asset: ' + asset)
}

for (const nativeApi of [
  'getWindowInfo',
  'getMenuButtonBoundingClientRect',
]) {
  assert(pageJs.includes(nativeApi), 'custom header must use wx.' + nativeApi)
}

function createRuntime(windowInfo) {
  let definition
  const calls = []
  const context = {
    Page(pageDefinition) {
      definition = pageDefinition
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
  assert(definition, 'designer projects preview must register Page')

  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    Object.assign(this.data, update)
  }

  return { calls, page }
}

const windowInfo = {
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  statusBarHeight: 20,
  safeArea: { bottom: 810 },
  menuButton: { top: 26, height: 32, left: 290, right: 377, width: 87 },
}
const runtime = createRuntime(windowInfo)
runtime.page.onLoad()

assert.strictEqual(runtime.page.data.statusBarHeight, 20)
assert.strictEqual(runtime.page.data.navigationBarHeight, 44)
assert.strictEqual(runtime.page.data.headerHeight, 94)
assert.strictEqual(runtime.page.data.categories.length, 3)
assert.strictEqual(runtime.page.data.stats.length, 3)
assert.strictEqual(runtime.page.data.projects.length, 0)
assert.strictEqual(runtime.page.data.opportunityFilters.length, 5)
assert.strictEqual(runtime.page.data.opportunities.length, 0)
assert.strictEqual(runtime.page.data.visibleOpportunities.length, 0)
assert.strictEqual(runtime.page.data.management.length, 0)
assert.strictEqual(runtime.page.data.completedProjects.length, 0)
assert.strictEqual(runtime.page.data.visibleCompletedProjects.length, 0)
assert.strictEqual(runtime.page.data.completedHistory.length, 0)
assert.strictEqual(runtime.page.data.tabs.length, 5)
assert.strictEqual(runtime.page.data.activeTab, 'projects')
assert.strictEqual(runtime.page.data.activeCategory, 'completed')
assert.strictEqual(runtime.page.data.headerSubtitle, runtime.page.data.copy.marketplaceSubtitle)

runtime.calls.length = 0
runtime.page.viewDeliveryFiles()
assert(runtime.calls.some((call) => call.api === 'showToast'))

runtime.calls.length = 0
runtime.page.openAllProjects()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'switchTab')?.options.url,
  '/pages/designer-projects/designer-projects'
)

runtime.calls.length = 0
runtime.page.switchTab({ currentTarget: { dataset: { id: 'workbench' } } })
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'redirectTo')?.options.url,
  '/pages/v2/designer-workbench/index'
)

runtime.calls.length = 0
runtime.page.switchCategory({
  currentTarget: { dataset: { id: 'marketplace' } },
})
assert.strictEqual(runtime.page.data.activeCategory, 'marketplace')
assert.strictEqual(runtime.page.data.headerSubtitle, runtime.page.data.copy.marketplaceSubtitle)
assert.strictEqual(runtime.calls.length, 0)



runtime.calls.length = 0
runtime.page.viewOpportunity()
assert.strictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/designer-demands/designer-demands'
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
  'designer-projects.js':
    '0520221e8483e44203d81cfe05e53f8110cd1b447df159bf216d7ffb286bc403',
  'designer-projects.json':
    '6a6b151e32d1585ee121cac2f50e96646ddbcdfae300d97533135024e0272851',
  'designer-projects.wxml':
    '832c70591d6d1000567997ce4c054c14ae09444402251b5398dd4e03c3fe48e4',
  'designer-projects.wxss':
    'dbcb23c22149e3767e5076c21a17313c304777a797defe8eb6366a484cad090b',
}

for (const [file, expectedHash] of Object.entries(productionFingerprints)) {
  const source = fs.readFileSync(
    path.join(root, 'pages', 'designer-projects', file)
  )
  const actualHash = crypto.createHash('sha256').update(source).digest('hex')
  assert.strictEqual(
    actualHash,
    expectedHash,
    'production pages/designer-projects/' + file + ' must remain unchanged'
  )
}

console.log('designer-projects preview specification: ok')
