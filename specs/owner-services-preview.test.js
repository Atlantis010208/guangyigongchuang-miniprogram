const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const homeRoot = path.join(previewRoot, 'owner-home')
const serviceRoot = path.join(previewRoot, 'owner-services')
const contentRoot = path.join(serviceRoot, 'content')
const route = 'pages/v2/owner-services/index'

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = app.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage)
assert(previewPackage.pages.includes('owner-services/index'))

const compileCondition = privateConfig.condition.miniprogram
const conditionIndex = compileCondition.list.findIndex(
  (item) => item.pathName === route
)
assert(conditionIndex >= 0)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(serviceRoot, `index.${extension}`)))
  assert(fs.existsSync(path.join(contentRoot, `index.${extension}`)))
}

const shimJs = fs.readFileSync(path.join(serviceRoot, 'index.js'), 'utf8')
const homeJs = fs.readFileSync(path.join(homeRoot, 'index.js'), 'utf8')
const homeWxml = fs.readFileSync(path.join(homeRoot, 'index.wxml'), 'utf8')
const homeConfig = JSON.parse(
  fs.readFileSync(path.join(homeRoot, 'index.json'), 'utf8')
)
const componentJs = fs.readFileSync(path.join(contentRoot, 'index.js'), 'utf8')
const componentWxml = fs.readFileSync(
  path.join(contentRoot, 'index.wxml'),
  'utf8'
)
const componentWxss = fs.readFileSync(
  path.join(contentRoot, 'index.wxss'),
  'utf8'
)
const componentConfig = JSON.parse(
  fs.readFileSync(path.join(contentRoot, 'index.json'), 'utf8')
)

assert(shimJs.includes("TARGET_ROUTE = '/pages/v2/owner-home/index'"))
assert(shimJs.includes("'?tab=services'"))
assert.strictEqual(
  homeConfig.usingComponents['owner-services-content'],
  '/pages/v2/owner-services/content/index'
)
assert(homeWxml.includes('data-preview-panel="services"'))
assert(
  homeWxml.includes(
    '<owner-services-content data-module-version="mall-v2" />'
  )
)
assert(homeWxml.includes('bindtap="switchToServices"'))
assert(homeJs.includes("'services'"))
assert(!homeJs.includes('showServicePreview'))

for (const moduleName of [
  'owner-services',
  'custom-nav',
  'services-intro',
  'collection-card',
  'collection-image-wrap',
  'mall-card',
  'mall-card-image',
  'professional-section',
  'service-grid',
  'service-card',
  'process-section',
  'process-row',
  'continue-link',
]) {
  assert(componentWxml.includes(moduleName), `missing module: ${moduleName}`)
}

assert.strictEqual(componentConfig.styleIsolation, 'isolated')
assert(!componentWxml.includes('preview-tabbar'))
assert(!componentWxml.includes('tab-item'))
assert(componentWxml.includes('bindtap="goProfile"'))
assert(componentWxml.includes('/pages/v2/owner-home/assets/avatar.png'))
assert(!componentWxml.includes('{{copy.navTitle}}'))
assert(
  componentWxml.includes(
    '/pages/v2/owner-services/assets/icon-draft-edit-v2.png'
  )
)
assert(!componentWxml.includes('class="pencil-icon"'))
assert(!componentWxml.includes('mall-plan-label'))
assert(!componentWxml.includes('mall-toolkit-label'))
assert(!componentJs.includes('mallPlanLabel'))
assert(!componentJs.includes('mallToolkitLabel'))

for (const routePath of [
  '/pages/flows/collection-type/collection-type',
  '/pages/lighting-manual/index',
  '/pages/support/contact/contact',
  '/pages/profile/home/home',
  '/pages/mall/mall',
]) {
  assert(componentJs.includes(routePath), `missing route: ${routePath}`)
}

for (const asset of [
  '/pages/v2/owner-case-detail/assets/highlight-dining.webp',
  '/pages/v2/owner-home/assets/case-nanjing.png',
  '/pages/v2/designer-tools/assets/quiz.webp',
  '/pages/v2/owner-services/assets/professional-store-v1.webp',
]) {
  assert(componentWxml.includes(asset), `missing reused asset: ${asset}`)
  assert(fs.existsSync(path.join(root, asset.slice(1))))
}

for (const requiredRule of [
  'height: 396rpx;',
  'height: 394rpx;',
  'grid-template-columns: repeat(2, minmax(0, 1fr));',
  'height: 338rpx;',
  'grid-template-columns: repeat(3, minmax(0, 1fr));',
  'padding-bottom: calc(126rpx + env(safe-area-inset-bottom));',
  'border-radius: 999rpx;',
]) {
  assert(componentWxss.includes(requiredRule), `missing visual rule: ${requiredRule}`)
}

assert(!componentWxss.includes('Inter'))
assert(!componentWxss.includes('Roboto'))
assert(!componentWxss.includes('#2563EB'))
assert(!componentWxss.includes('#7C3AED'))

let componentDefinition
const routes = []
const tabRoutes = []
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
      routes.push(options.url)
    },
    switchTab(options) {
      tabRoutes.push(options.url)
    },
    showToast() {},
  },
})

assert(componentDefinition)
assert.strictEqual(componentDefinition.data.processSteps.length, 3)

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

component.openCollection()
component.openDesignService()
component.openConsultation()
component.openMall()
component.goProfile()
assert.deepStrictEqual(routes, [
  '/pages/flows/collection-type/collection-type',
  '/pages/lighting-manual/index',
  '/pages/support/contact/contact',
  '/pages/profile/home/home',
])
assert.deepStrictEqual(tabRoutes, ['/pages/mall/mall'])

console.log('owner services preview checks passed')
