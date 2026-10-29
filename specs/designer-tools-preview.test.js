const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const pageRoot = path.join(previewRoot, 'designer-tools')
const route = 'pages/v2/designer-tools/index'
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = app.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage)
assert(previewPackage.pages.includes('designer-tools/index'))

const compileCondition = privateConfig.condition.miniprogram
const conditionIndex = compileCondition.list.findIndex(
  (item) => item.pathName === route
)
assert(conditionIndex >= 0)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(pageRoot, `index.${extension}`)))
}

const config = JSON.parse(
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

assert.strictEqual(config.navigationStyle, 'custom')
assert.strictEqual(config.enablePullDownRefresh, false)
assert.strictEqual(config.disableScroll, true)
assert(!pageJs.includes('wx.cloud'))

for (const moduleName of [
  'tools-header',
  'common-section',
  'common-card',
  'common-tool',
  'feature-section',
  'feature-grid',
  'feature-tool',
  'preview-tabbar',
]) {
  assert(pageWxml.includes(moduleName), `missing module: ${moduleName}`)
}

for (const collection of ['commonTools', 'featureTools', 'tabs']) {
  assert(pageWxml.includes(`wx:for="{{${collection}}}"`))
}

assert(pageWxml.includes('bindtap="openTool"'))
assert(pageWxml.includes('bindtap="switchTab"'))

for (const nativeMetricApi of [
  'getWindowInfo',
  'getMenuButtonBoundingClientRect',
]) {
  assert(pageJs.includes(nativeMetricApi))
}

for (const destination of [
  '/pages/search/search',
  '/pages/color-temp/color-temp',
  '/pages/gallery/gallery',
  '/pages/quiz/lighting-intro/lighting-intro',
  '/pages/v2/designer-learning/index',
  '/pages/v2/designer-projects/index',
  '/pages/v2/designer-profile/index',
]) {
  assert(pageJs.includes(destination), `missing route: ${destination}`)
}

assert(pageWxss.includes('@import "../shared/preview-tabbar.wxss";'))
assert(pageWxss.includes('min-height: 184rpx;'))
assert(pageWxss.includes('min-height: 448rpx;'))
assert(pageWxss.includes('height: 272rpx;'))
assert(sharedTabbarWxss.includes('.tab-icon-layer--visible'))
assert(pageWxml.includes('class="tab-icon-stack"'))
assert(pageWxml.includes('src="{{item.icon}}"'))
assert(pageWxml.includes('src="{{item.activeIcon}}"'))
assert(pageWxml.includes('fade-in="{{false}}"'))
assert(pageJs.includes('tab-designer-tools-default.png'))
assert(pageJs.includes('tab-designer-tools-active.png'))

for (const name of [
  'illuminance.webp',
  'temperature.webp',
  'inspiration.webp',
  'quiz.webp',
]) {
  const asset = fs.readFileSync(path.join(pageRoot, 'assets', name))
  assert.strictEqual(asset.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.strictEqual(asset.subarray(8, 12).toString('ascii'), 'WEBP')
  assert(asset.length < 80 * 1024, `${name} should stay package-friendly`)
}

let definition
const calls = []
const context = {
  Page(pageDefinition) {
    definition = pageDefinition
  },
  wx: {
    getWindowInfo() {
      return { statusBarHeight: 24 }
    },
    getMenuButtonBoundingClientRect() {
      return { top: 30, height: 32 }
    },
    navigateTo(options) {
      calls.push({ api: 'navigateTo', options })
    },
    redirectTo(options) {
      calls.push({ api: 'redirectTo', options })
    },
    showToast(options) {
      calls.push({ api: 'showToast', options })
    },
  },
}

vm.runInNewContext(pageJs, context)
assert(definition)

const page = {
  ...definition,
  data: { ...definition.data },
  setData(patch) {
    Object.assign(this.data, patch)
  },
}

page.onLoad()
assert.strictEqual(page.data.statusBarHeight, 24)
assert(page.data.navigationBarHeight >= 44)
assert.strictEqual(page.data.activeTab, 'tools')

for (const destination of [
  '/pages/search/search',
  '/pages/color-temp/color-temp',
  '/pages/gallery/gallery',
  '/pages/quiz/lighting-intro/lighting-intro',
]) {
  page.openTool({ currentTarget: { dataset: { route: destination } } })
  assert.strictEqual(calls.at(-1).api, 'navigateTo')
  assert.strictEqual(calls.at(-1).options.url, destination)
}

for (const [id, destination] of [
  ['learning', '/pages/v2/designer-learning/index'],
  ['projects', '/pages/v2/designer-projects/index'],
  ['profile', '/pages/v2/designer-profile/index'],
]) {
  page.switchTab({ currentTarget: { dataset: { id } } })
  assert.strictEqual(calls.at(-1).api, 'redirectTo')
  assert.strictEqual(calls.at(-1).options.url, destination)
}

const callsBeforeActiveTab = calls.length
page.switchTab({ currentTarget: { dataset: { id: 'tools' } } })
assert.strictEqual(calls.length, callsBeforeActiveTab)

console.log('designer tools preview checks passed')
