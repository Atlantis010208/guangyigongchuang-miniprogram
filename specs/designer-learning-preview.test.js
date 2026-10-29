const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const previewRoot = path.join(root, 'pages', 'v2')
const pageRoot = path.join(previewRoot, 'designer-learning')
const route = 'pages/v2/designer-learning/index'
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const privateConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8')
)
const previewPackage = app.subpackages.find(
  (item) => item.root === 'pages/v2/'
)

assert(previewPackage)
assert(previewPackage.pages.includes('designer-learning/index'))

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
  'learning-header',
  'course-feature',
  'course-hero',
  'course-card',
  'highlights-card',
  'content-card',
  'preview-tabbar',
]) {
  assert(pageWxml.includes(moduleName), `missing module: ${moduleName}`)
}

for (const collection of ['highlights', 'contentItems', 'tabs']) {
  assert(pageWxml.includes(`wx:for="{{${collection}}}"`))
}

for (const interaction of [
  'startLearning',
  'openCourseIntro',
  'openContentItem',
  'switchTab',
]) {
  assert(pageWxml.includes(`bindtap="${interaction}"`))
}

for (const metricApi of [
  'getWindowInfo',
  'getMenuButtonBoundingClientRect',
]) {
  assert(pageJs.includes(metricApi))
}

assert(pageWxss.includes('@import "../shared/preview-tabbar.wxss";'))
assert(pageWxss.includes('height: 272rpx;'))
assert(pageWxss.includes('min-height: 276rpx;'))
assert(sharedTabbarWxss.includes('.tab-icon-layer--visible'))
assert(pageWxml.includes('class="tab-icon-stack"'))
assert(pageWxml.includes('src="{{item.icon}}"'))
assert(pageWxml.includes('src="{{item.activeIcon}}"'))
assert(pageWxml.includes('fade-in="{{false}}"'))
assert(pageJs.includes('tab-learning-default.png'))
assert(pageJs.includes('tab-learning-active.png'))
assert(!pageWxml.includes('instructor-card'))
assert(!pageJs.includes('openInstructor'))
assert(pageJs.includes('/pages/v2/designer-learning-content/index?courseId='))
assert(pageJs.includes('/pages/course/course-detail/course-detail?id='))
for (const section of ['intro', 'catalog', 'history']) assert(pageJs.includes(`'${section}'`))

const heroPath = path.join(pageRoot, 'assets', 'course-hero.webp')
const hero = fs.readFileSync(heroPath)
assert.strictEqual(hero.subarray(0, 4).toString('ascii'), 'RIFF')
assert.strictEqual(hero.subarray(8, 12).toString('ascii'), 'WEBP')
assert(hero.length < 80 * 1024)

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
    switchTab(options) {
      calls.push({ api: 'switchTab', options })
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
assert.strictEqual(page.data.activeTab, 'learning')

page.startLearning()
assert.strictEqual(calls.at(-1).api, 'showToast')

page.openContentItem({
  currentTarget: { dataset: { id: 'catalog' } },
})
assert.strictEqual(calls.at(-1).api, 'showToast')

page.setData({ courseId: 'COURSE_1' })
page.openContentItem({
  currentTarget: { dataset: { id: 'catalog' } },
})
assert.strictEqual(calls.at(-1).api, 'navigateTo')
assert.strictEqual(
  calls.at(-1).options.url,
  '/pages/course/course-detail/course-detail?id=COURSE_1&tab=1'
)

page.switchTab({
  currentTarget: { dataset: { id: 'projects' } },
})
assert.strictEqual(
  calls.at(-1).options.url,
  '/pages/v2/designer-projects/index'
)

page.switchTab({
  currentTarget: { dataset: { id: 'profile' } },
})
assert.strictEqual(
  calls.at(-1).options.url,
  '/pages/v2/designer-profile/index'
)

page.switchTab({
  currentTarget: { dataset: { id: 'tools' } },
})
assert.strictEqual(calls.at(-1).api, 'redirectTo')
assert.strictEqual(
  calls.at(-1).options.url,
  '/pages/v2/designer-tools/index'
)

console.log('designer learning preview checks passed')
