const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const homeRoot = path.join(previewRoot, 'owner-home')
const toolRoot = path.join(previewRoot, 'owner-tools')
const contentRoot = path.join(toolRoot, 'content')
const route = 'pages/v2/owner-tools/index'

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = app.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage)
assert(previewPackage.pages.includes('owner-tools/index'))

const compileCondition = privateConfig.condition.miniprogram
const conditionIndex = compileCondition.list.findIndex(
  (item) => item.pathName === route
)
assert(conditionIndex >= 0)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(toolRoot, `index.${extension}`)))
  assert(fs.existsSync(path.join(contentRoot, `index.${extension}`)))
}

const shimJs = fs.readFileSync(path.join(toolRoot, 'index.js'), 'utf8')
const homeJs = fs.readFileSync(path.join(homeRoot, 'index.js'), 'utf8')
const homeWxml = fs.readFileSync(path.join(homeRoot, 'index.wxml'), 'utf8')
const homeConfig = JSON.parse(
  fs.readFileSync(path.join(homeRoot, 'index.json'), 'utf8')
)
const componentJs = fs.readFileSync(path.join(contentRoot, 'index.js'), 'utf8')
const componentConfig = JSON.parse(
  fs.readFileSync(path.join(contentRoot, 'index.json'), 'utf8')
)
const componentWxml = fs.readFileSync(
  path.join(contentRoot, 'index.wxml'),
  'utf8'
)
const componentWxss = fs.readFileSync(
  path.join(contentRoot, 'index.wxss'),
  'utf8'
)

assert(shimJs.includes("TARGET_ROUTE = '/pages/v2/owner-home/index'"))
assert(shimJs.includes("'?tab=tools'"))
assert.strictEqual(
  homeConfig.usingComponents['owner-tools-content'],
  '/pages/v2/owner-tools/content/index'
)
assert(homeWxml.includes('data-preview-panel="tools"'))
assert(homeWxml.includes('<owner-tools-content'))
assert(homeWxml.includes('owner-tools-content user-avatar="{{userAvatar}}"'))
assert(homeWxml.includes('bind:switchprofile="switchToProfile"'))
assert(homeWxml.includes('bindtap="switchToTools"'))
assert(homeWxml.includes('/pages/v2/shared/assets/tabbar/tab-tools-default.png'))
assert(homeWxml.includes('/pages/v2/shared/assets/tabbar/tab-tools-active.png'))

for (const moduleName of [
  'owner-tools',
  'custom-nav',
  'avatar-button',
  'tools-header',
  'common-section',
  'common-card',
  'common-tool',
  'feature-section',
  'feature-grid',
  'feature-tool',
]) {
  assert(componentWxml.includes(moduleName), `missing module: ${moduleName}`)
}

assert(componentWxml.includes('wx:for="{{commonTools}}"'))
assert(componentWxml.includes('wx:for="{{featureTools}}"'))
assert(componentWxml.includes('bindtap="openTool"'))
assert(componentWxml.includes('bindtap="goProfile"'))
assert(componentWxml.includes('src="{{userAvatar}}"'))
assert(componentWxml.includes('wx:if="{{userAvatar}}"'))
assert(componentWxml.includes('class="avatar avatar-skeleton"'))
assert(componentWxml.includes('binderror="handleAvatarError"'))
assert(componentWxss.includes('.avatar-skeleton'))
assert(componentJs.includes("value: ''"))
assert(componentJs.includes('handleAvatarError()'))
assert(!componentJs.includes('owner-home/assets/avatar.png'))
assert(componentJs.includes('ownerApi.profile'))
assert(
  componentWxml.includes(
    '/pages/v2/designer-workbench/assets/icon-chevron-right-v2.png'
  )
)
assert(!componentWxml.includes('/pages/v2/owner-tools/assets/'))
assert.strictEqual(componentConfig.styleIsolation, 'isolated')
assert(!componentWxml.includes('class="chevron '))
assert(
  componentWxml.includes(
    'class="tool-chevron-image tool-chevron-image--common"'
  )
)
assert(
  componentWxml.includes(
    'class="tool-chevron-image tool-chevron-image--feature"'
  )
)
assert(!/(^|\n)\.chevron\s*\{/.test(componentWxss))
assert(
  /\.tool-chevron-image--common\s*\{[^}]*width:\s*24rpx;[^}]*height:\s*32rpx;/.test(
    componentWxss
  )
)
assert(
  /\.tool-chevron-image--feature\s*\{[^}]*width:\s*22rpx;[^}]*height:\s*28rpx;/.test(
    componentWxss
  )
)

for (const destination of [
  '/pages/search/search',
  '/pages/color-temp/color-temp',
  '/pages/gallery/gallery',
  '/pages/quiz/lighting-intro/lighting-intro',
]) {
  assert(componentJs.includes(destination), `missing route: ${destination}`)
}

for (const requiredRule of [
  'padding-bottom: calc(126rpx + env(safe-area-inset-bottom));',
  'min-height: 184rpx;',
  'width: 232rpx;',
  'height: 132rpx;',
  'font-size: 36rpx;',
  'min-height: 448rpx;',
  'height: 272rpx;',
  'font-size: 33rpx;',
  'font-size: 25rpx;',
  'grid-template-columns: repeat(2, minmax(0, 1fr));',
]) {
  assert(componentWxss.includes(requiredRule), `missing visual rule: ${requiredRule}`)
}

assert(componentJs.includes('getWindowInfo'))
assert(componentJs.includes('getMenuButtonBoundingClientRect'))
assert(!componentJs.includes('wx.cloud'))

let componentDefinition
const componentCalls = []
vm.runInNewContext(componentJs, {
  Component(definition) {
    componentDefinition = definition
  },
  wx: {
    getWindowInfo() {
      return { statusBarHeight: 24 }
    },
    getMenuButtonBoundingClientRect() {
      return { top: 30, height: 32 }
    },
    navigateTo(options) {
      componentCalls.push(options.url)
    },
    showToast() {},
  },
})
assert(componentDefinition)
assert.strictEqual(componentDefinition.data.commonTools.length, 2)
assert.strictEqual(componentDefinition.data.featureTools.length, 2)

const component = {
  ...componentDefinition.methods,
  data: { ...componentDefinition.data },
  setData(patch) {
    Object.assign(this.data, patch)
  },
}
componentDefinition.lifetimes.attached.call(component)
assert.strictEqual(component.data.statusBarHeight, 24)
assert(component.data.navigationBarHeight >= 44)
assert(component.data.headerHeight >= 74)

const allTools = [
  ...component.data.commonTools,
  ...component.data.featureTools,
]
for (const item of allTools) {
  component.openTool({ currentTarget: { dataset: { route: item.route } } })
  assert.strictEqual(componentCalls.at(-1), item.route)
}

let profileSwitchPayload
component.triggerEvent = function(name, detail, options) {
  profileSwitchPayload = { name, detail, options }
}
component.goProfile()
assert.strictEqual(profileSwitchPayload.name, 'switchprofile')
assert.strictEqual(Object.keys(profileSwitchPayload.detail).length, 0)
assert.strictEqual(profileSwitchPayload.options.bubbles, true)
assert.strictEqual(profileSwitchPayload.options.composed, true)

let homeDefinition
const homeCalls = []
vm.runInNewContext(homeJs, {
  Page(definition) {
    homeDefinition = definition
  },
  wx: {
    getWindowInfo() {
      return {
        windowWidth: 375,
        windowHeight: 667,
        screenHeight: 667,
        statusBarHeight: 20,
        safeArea: { bottom: 667 },
      }
    },
    getMenuButtonBoundingClientRect() {
      return { top: 26, height: 32 }
    },
    navigateTo(options) {
      homeCalls.push(options.url)
    },
    showToast() {},
  },
})
assert(homeDefinition)
const homePage = {
  ...homeDefinition,
  data: { ...homeDefinition.data },
  setData(patch) {
    Object.assign(this.data, patch)
  },
}
homePage.onLoad()
const callsBeforeSwitch = homeCalls.length
homePage.switchToTools()
assert.strictEqual(homePage.data.activePreviewTab, 'tools')
assert.strictEqual(homeCalls.length, callsBeforeSwitch)

function pngDimensions(filePath) {
  const file = fs.readFileSync(filePath)
  assert.strictEqual(file.toString('ascii', 1, 4), 'PNG')
  return [file.readUInt32BE(16), file.readUInt32BE(20)]
}

assert.deepStrictEqual(
  pngDimensions(
    path.join(previewRoot, 'shared', 'assets', 'tabbar', 'tab-tools-active.png')
  ),
  [64, 60]
)
assert.deepStrictEqual(
  pngDimensions(
    path.join(
      previewRoot,
      'designer-workbench',
      'assets',
      'icon-chevron-right-v2.png'
    )
  ),
  [24, 24]
)

console.log('owner tools preview checks passed')
