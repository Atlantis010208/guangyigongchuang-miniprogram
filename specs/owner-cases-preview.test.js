const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'v2', 'owner-cases')
const contentRoot = path.join(pageRoot, 'content')
const homeRoot = path.join(root, 'pages', 'v2', 'owner-home')
const route = 'pages/v2/owner-cases/index'

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const previewPackage = appConfig.subpackages.find(
  (item) => item.root === 'pages/v2/'
)
assert(previewPackage)
assert(previewPackage.pages.includes('owner-cases/index'))

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(pageRoot, `index.${extension}`)))
  assert(fs.existsSync(path.join(contentRoot, `index.${extension}`)))
}

const shimJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const homeWxml = fs.readFileSync(path.join(homeRoot, 'index.wxml'), 'utf8')
const homeConfig = JSON.parse(
  fs.readFileSync(path.join(homeRoot, 'index.json'), 'utf8')
)
const componentJs = fs.readFileSync(path.join(contentRoot, 'index.js'), 'utf8')
const componentWxml = fs.readFileSync(path.join(contentRoot, 'index.wxml'), 'utf8')
const componentWxss = fs.readFileSync(path.join(contentRoot, 'index.wxss'), 'utf8')
const componentConfig = JSON.parse(
  fs.readFileSync(path.join(contentRoot, 'index.json'), 'utf8')
)

assert(shimJs.includes("TARGET_ROUTE = '/pages/v2/owner-home/index'"))
assert(shimJs.includes("'?tab=cases'"))
assert.strictEqual(
  homeConfig.usingComponents['owner-cases-content'],
  '/pages/v2/owner-cases/content/index'
)
assert(homeWxml.includes('data-preview-panel="cases"'))
assert(homeWxml.includes('<owner-cases-content />'))
assert(homeWxml.includes('bindtap="switchToCases"'))
assert.strictEqual(componentConfig.styleIsolation, 'isolated')
assert(!componentWxml.includes('preview-tabbar'))

for (const moduleName of [
  'owner-cases',
  'custom-nav',
  'search-box',
  'category-row',
  'cases-section',
  'case-grid',
]) {
  assert(componentWxml.includes(moduleName), `missing module: ${moduleName}`)
}
assert(componentWxml.includes('bindinput="handleSearch"'))
assert(componentWxml.includes('bindtap="selectCategory"'))
assert(componentWxml.includes('catchtap="toggleBookmark"'))
assert(componentWxml.includes('padding-bottom: calc(108rpx + env(safe-area-inset-bottom)'))

let componentDefinition
vm.runInNewContext(componentJs, {
  Component(definition) {
    componentDefinition = definition
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
    navigateTo() {},
    showToast() {},
  },
})
assert(componentDefinition)
assert.strictEqual(componentDefinition.data.cases.length, 0)
assert.strictEqual(componentDefinition.data.categories.length, 4)

const component = {
  ...componentDefinition.methods,
  data: { ...componentDefinition.data },
  setData(patch) {
    Object.assign(this.data, patch)
  },
}
componentDefinition.lifetimes.created.call(component)
componentDefinition.lifetimes.attached.call(component)
assert.strictEqual(component.data.layoutExtra, 0)
assert(component.data.contentMinHeight > 0)

console.log('owner cases preview checks passed')