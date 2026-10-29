const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const pageRoot = path.join(previewRoot, 'designer-workbench')
const pageRoute = 'pages/v2/designer-workbench/index'
const pageUrl = '/' + pageRoute

const appConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'app.json'), 'utf8')
)
const privateConfigPath = path.join(root, 'project.private.config.json')
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage, 'preview subpackage must be registered')
assert(
  previewPackage.pages.includes('designer-workbench/index'),
  'designer workbench preview route must be registered'
)

if (fs.existsSync(privateConfigPath)) {
  const privateConfig = JSON.parse(
    fs.readFileSync(privateConfigPath, 'utf8')
  )
  const compileCondition = privateConfig.condition.miniprogram
  assert(
    compileCondition.list.some((item) => item.pathName === pageRoute),
    'local WeChat Developer Tools must retain a workbench preview condition'
  )
}

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
const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8').replace(/\r\n/g, '\n')
const sharedTabbarWxss = fs.readFileSync(
  path.join(previewRoot, 'shared', 'preview-tabbar.wxss'),
  'utf8'
)

assert.strictEqual(
  pageConfig.navigationStyle,
  'custom',
  'workbench must use custom navigation around the native WeChat capsule'
)
assert.strictEqual(
  pageConfig.enablePullDownRefresh,
  false,
  'fixed preview content must not expose pull-to-refresh chrome'
)

for (const binding of [
  'copy.workbenchTitle',
  'copy.pendingSummary',
  'copy.nextTitle',
  'copy.todayTodoTitle',
  'copy.projectsTitle',
  'copy.toolsTitle',
]) {
  assert(
    pageWxml.includes('{{' + binding + '}}'),
    'missing prototype copy binding: ' + binding
  )
}

for (const className of [
  'workbench-header',
  'summary-metrics',
  'next-action-card',
  'today-todo-section',
  'ongoing-projects-section',
  'quick-tools-section',
  'preview-tabbar',
]) {
  assert(
    pageWxml.includes('class="' + className)
      || pageWxml.includes(' ' + className),
    'missing workbench module: ' + className
  )
}

for (const interaction of [
  'continueTask',
  'viewProject',
  'openTodo',
  'openAllProjects',
  'openQuickTool',
  'switchTab',
]) {
  assert(
    pageWxml.includes('bindtap="' + interaction + '"'),
    'missing public workbench interaction: ' + interaction
  )
}

assert(
  !pageWxml.includes('9:41')
    && !pageWxml.includes('4G')
    && !pageWxml.includes('codex-clipboard-66dbd415'),
  'the page must not paint a fake status bar or render the full prototype image'
)
assert(
  !/notification|bell/i.test(pageWxml)
    && !/notification|bell|designer-invites/i.test(pageJs)
    && !/notification|bell/i.test(pageWxss),
  'the removed notification bell must not leave markup, behavior, or styles'
)
assert(
  !/style="[^"]*margin-(?:top|bottom):[^"]*\{\{/.test(pageWxml),
  'responsive compensation must never be applied to module margins'
)
for (const fixedSpacing of [
  '.next-action-card {\n  position: relative;\n  margin-top: 4rpx;',
  '.today-todo-section {\n  margin-top: 26rpx;',
  '.ongoing-projects-section {\n  margin-top: 24rpx;',
  '.quick-tools-section {\n  margin-top: 20rpx;',
]) {
  assert(
    pageWxss.includes(fixedSpacing),
    'missing fixed prototype spacing: ' + fixedSpacing
  )
}
for (const heightBinding of [
  'summaryHeight',
  'nextActionHeight',
  'nextProgressTop',
  'todoListHeight',
  'projectCardHeight',
  'quickToolListHeight',
]) {
  assert(
    pageWxml.includes('{{' + heightBinding + '}}px'),
    'missing internal-height binding: ' + heightBinding
  )
}

assert(
  /wx:for="\{\{stats\}\}"/.test(pageWxml),
  'summary metrics must render from the fixed preview data'
)
assert(
  /wx:for="\{\{todos\}\}"/.test(pageWxml),
  'today todo rows must render from the fixed preview data'
)
assert(
  /wx:for="\{\{projects\}\}"/.test(pageWxml),
  'ongoing projects must render from the fixed preview data'
)
assert(
  /wx:for="\{\{quickTools\}\}"/.test(pageWxml),
  'quick tools must render from the fixed preview data'
)
assert(
  /wx:for="\{\{tabs\}\}"/.test(pageWxml),
  'the unified five-item navigation must render from one tab model'
)

assert(
  pageWxss.includes('@import "../shared/preview-tabbar.wxss"'),
  'designer preview must reuse the shared fixed tabbar dimensions'
)
assert(
  /position:\s*fixed/.test(sharedTabbarWxss)
    && /bottom:\s*0/.test(sharedTabbarWxss),
  'the shared preview tabbar must stay fixed to the viewport bottom'
)
assert(
  sharedTabbarWxss.includes('env(safe-area-inset-bottom)'),
  'the shared preview tabbar must reserve the native bottom safe area'
)
assert(
  /height:\s*108rpx/.test(sharedTabbarWxss),
  'the shared preview tabbar must keep the approved 54px content height'
)
assert(
  /padding-bottom:\s*calc\([^;]*108rpx[^;]*env\(safe-area-inset-bottom\)[^;]*\)/s.test(
    pageWxss
  ),
  'workbench scrolling content must reserve the shared tabbar and safe area'
)

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}', 'g')
  const matches = Array.from(source.matchAll(expression))
  return matches.at(-1)?.[1] || ''
}
const enlargedTypography = {
  '.workbench-title': 50,
  '.pending-summary': 24,
  '.summary-label': 22,
  '.summary-value': 36,
  '.next-eyebrow': 22,
  '.next-title': 30,
  '.next-tag': 20,
  '.next-task': 32,
  '.next-deadline': 24,
  '.next-action-primary': 26,
  '.next-action-secondary': 24,
  '.section-title': 30,
  '.section-more': 22,
  '.todo-title': 22,
  '.todo-subtitle': 20,
  '.todo-time': 22,
  '.project-title': 22,
  '.project-tag': 18,
  '.project-progress-copy': 18,
  '.quick-tool-label': 20,
  '.designer-workbench .tab-label': 22,
}

for (const [selector, size] of Object.entries(enlargedTypography)) {
  const rule = cssRule(pageWxss, selector)
  assert(
    rule.includes('font-size: ' + size + 'rpx'),
    selector + ' must use the approved two-rpx font increase'
  )
}

function logicalPixels(value, unit) {
  return unit === 'rpx' ? value / 2 : value
}

function assertMinHitTarget(selector, axes = ['height']) {
  const rule = cssRule(pageWxss + '\n' + sharedTabbarWxss, selector)
  assert(rule, 'missing hit-target style rule: ' + selector)

  for (const axis of axes) {
    const expression = new RegExp(
      '(?:min-' + axis + '|' + axis + ')\\s*:\\s*(\\d+(?:\\.\\d+)?)(rpx|px)'
    )
    const match = rule.match(expression)
    assert(match, selector + ' must declare a stable ' + axis + ' hit target')
    assert(
      logicalPixels(Number(match[1]), match[2]) >= 44,
      selector + ' ' + axis + ' hit target must be at least 44 logical px'
    )
  }
}

assertMinHitTarget('.next-action-primary')
assertMinHitTarget('.next-action-secondary')
assertMinHitTarget('.todo-item')
assertMinHitTarget('.quick-tool')
assertMinHitTarget('.tab-item')

const expectedWebpAssets = [
  'avatar.webp',
  'project-residential.webp',
  'project-residential-card.webp',
  'project-commercial.webp',
]

for (const asset of expectedWebpAssets) {
  const assetPath = path.join(pageRoot, 'assets', asset)
  assert(fs.existsSync(assetPath), 'missing local WebP asset: ' + asset)

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

for (const nativeMetricApi of [
  'getWindowInfo',
  'getMenuButtonBoundingClientRect',
]) {
  assert(
    pageJs.includes(nativeMetricApi),
    'custom header must use wx.' + nativeMetricApi
  )
}

for (const target of [
  '/pages/designer-projects/designer-projects',
  '/pages/search/search',
  '/pages/color-temp/color-temp',
  '/pages/v2/designer-learning/index',
  '/pages/v2/designer-tools/index',
  '/pages/v2/designer-profile/index',
]) {
  assert(pageJs.includes(target), 'missing existing destination route: ' + target)
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
  assert(definition, 'designer workbench must register a Page definition')

  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) {
    Object.assign(this.data, update)
  }

  return { calls, page }
}

const compactWindow = {
  windowWidth: 375,
  windowHeight: 667,
  screenHeight: 667,
  statusBarHeight: 20,
  safeArea: { bottom: 667 },
  menuButton: { top: 26, height: 32, left: 278, right: 365, width: 87 },
}
const runtime = createRuntime(compactWindow)
runtime.page.onLoad()
assert.strictEqual(
  runtime.page.data.internalExtra,
  0,
  'compact screens must keep the approved base module heights'
)
assert.deepStrictEqual(
  [
    runtime.page.data.summaryHeight,
    runtime.page.data.nextActionHeight,
    runtime.page.data.todoListHeight,
    runtime.page.data.projectCardHeight,
    runtime.page.data.quickToolListHeight,
  ],
  [44, 178, 88, 71, 47],
  '375px screens must use the approved compact module heights'
)

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
assert.strictEqual(runtime.page.data.stats.length, 3, 'prototype has 3 metrics')
assert.strictEqual(runtime.page.data.todos.length, 0, 'todos hydrate from backend')
assert.strictEqual(runtime.page.data.projects.length, 0, 'projects hydrate from backend')
assert.strictEqual(runtime.page.data.quickTools.length, 3, 'prototype has 3 tools')
assert.strictEqual(runtime.page.data.tabs.length, 5, 'prototype has 5 tabs')

for (const windowInfo of [
  {
    windowWidth: 320,
    windowHeight: 568,
    screenHeight: 568,
    statusBarHeight: 20,
    safeArea: { bottom: 568 },
    menuButton: { top: 26, height: 32 },
  },
  {
    windowWidth: 390,
    windowHeight: 844,
    screenHeight: 844,
    statusBarHeight: 20,
    safeArea: { bottom: 810 },
    menuButton: { top: 26, height: 32 },
  },
  {
    windowWidth: 430,
    windowHeight: 932,
    screenHeight: 932,
    statusBarHeight: 20,
    safeArea: { bottom: 898 },
    menuButton: { top: 26, height: 32 },
  },
]) {
  const responsiveRuntime = createRuntime(windowInfo)
  responsiveRuntime.page.onLoad()
  assert.strictEqual(
    responsiveRuntime.page.data.navigationBarHeight,
    44,
    'native capsule navigation must remain stable at ' + windowInfo.windowWidth
  )
}
const tallWindow = {
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  statusBarHeight: 20,
  safeArea: { bottom: 810 },
  menuButton: { top: 26, height: 32 },
}
const tallRuntime = createRuntime(tallWindow)
tallRuntime.page.onLoad()
assert(
  tallRuntime.page.data.internalExtra > 0
    && tallRuntime.page.data.internalExtra <= 100,
  'tall screens must receive bounded internal height compensation'
)
const tallScale = tallWindow.windowWidth / 750
const baseModuleHeight = (88 + 356 + 176 + 142 + 94) * tallScale
const expandedModuleHeight =
  tallRuntime.page.data.summaryHeight
  + tallRuntime.page.data.nextActionHeight
  + tallRuntime.page.data.todoListHeight
  + tallRuntime.page.data.projectCardHeight
  + tallRuntime.page.data.quickToolListHeight
assert(
  Math.abs(
    expandedModuleHeight - baseModuleHeight - tallRuntime.page.data.internalExtra
  ) <= 1,
  'all tall-screen compensation must be distributed inside the five modules'
)
assert(
  tallRuntime.page.data.nextProgressTop > 204 * tallScale,
  'the primary-card progress block must follow the expanded card height'
)

runtime.page.continueTask()
assert.deepStrictEqual(
  runtime.calls.find((call) => call.api === 'switchTab')?.options.url,
  '/pages/designer-projects/designer-projects',
  'fixed preview data must enter the real project list without inventing an id'
)

runtime.calls.length = 0
runtime.page.openTodo({
  currentTarget: { dataset: { id: 'requirement' } },
})
assert.deepStrictEqual(
  runtime.calls.find((call) => call.api === 'switchTab')?.options.url,
  '/pages/designer-projects/designer-projects',
  'fixed todo data must enter real projects without inventing a project id'
)

runtime.calls.length = 0
runtime.page.openQuickTool({
  currentTarget: { dataset: { id: 'checklist' } },
})
assert(
  runtime.calls.some((call) => call.api === 'showToast'),
  'missing checklist product must provide explicit feedback instead of a wrong route'
)

runtime.calls.length = 0
runtime.page.openQuickTool({
  currentTarget: { dataset: { id: 'illuminance' } },
})
assert.deepStrictEqual(
  runtime.calls.find((call) => call.api === 'navigateTo')?.options.url,
  '/pages/search/search',
  'illuminance shortcut must reuse the existing calculator'
)

runtime.calls.length = 0
runtime.page.switchTab({
  currentTarget: { dataset: { id: 'learning' } },
})
assert.deepStrictEqual(
  runtime.calls.find((call) => call.api === 'redirectTo')?.options.url,
  '/pages/v2/designer-learning/index',
  'learning tab must open the isolated learning preview'
)

assert.notStrictEqual(
  pageUrl,
  '/pages/designer-home/designer-home',
  'the workbench must remain an isolated preview route'
)
assert(
  appConfig.pages.includes('pages/designer-home/designer-home'),
  'the existing production designer-home route must remain registered'
)

const productionHomeJs = fs.readFileSync(path.join(root, 'pages', 'designer-home', 'designer-home.js'), 'utf8')
assert(productionHomeJs.includes('enterV2IfEnabled'), 'legacy designer route must only add the fail-closed V2 gate')

const productionFingerprints = {
  'designer-home.json':
    '9d580c863bd2c2b99c52748fde5a1ea47113a0ad906035f308591204aa977847',
  'designer-home.wxml':
    // Legacy markup is now wrapped in the startup visibility gate.
    '2506335a2244f51072da07e87dec4ca646d8221541f1ed7cfaec12966c17d1da',
  'designer-home.wxss':
    '4608e3b25c8cfb9cd6e2d264b6a588ecda1a16aa8a9263f6690e0e61c18d04da',
}

for (const [file, expectedHash] of Object.entries(productionFingerprints)) {
  const source = fs.readFileSync(
    path.join(root, 'pages', 'designer-home', file)
  )
  const actualHash = crypto.createHash('sha256').update(source).digest('hex')
  assert.strictEqual(
    actualHash,
    expectedHash,
    'production pages/designer-home/' + file + ' must not be replaced'
  )
}

console.log('designer-workbench preview specification: ok')
