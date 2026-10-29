const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'v2', 'owner-cases')
const contentRoot = path.join(pageRoot, 'content')
const homeRoot = path.join(root, 'pages', 'v2', 'owner-home')

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

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
assert(homeWxml.includes('<owner-cases-content'))
assert(homeWxml.includes('owner-cases-content user-avatar="{{userAvatar}}"'))
assert(homeWxml.includes('bind:switchprofile="switchToProfile"'))
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
assert(componentWxml.includes('scroll-x="true"'))
assert(componentWxml.includes('case-space-tag'))
assert(componentWxml.includes('src="{{userAvatar}}"'))
assert(componentWxml.includes('wx:if="{{userAvatar}}"'))
assert(componentWxml.includes('class="avatar avatar-skeleton"'))
assert(componentWxml.includes('binderror="handleAvatarError"'))
assert(componentWxss.includes('.avatar-skeleton'))
assert(componentJs.includes("value: ''"))
assert(componentJs.includes('handleAvatarError()'))
assert(!componentJs.includes('owner-home/assets/avatar.png'))
assert(componentWxml.includes('padding-bottom: calc(108rpx + env(safe-area-inset-bottom)'))
assert(!componentWxml.includes('category-count'))
assert(componentJs.includes('function normalizeCaseSpaceType'))
assert(componentJs.includes('SPACE_TYPE_ALIASES'))
assert(componentJs.includes('ownerApi.profile'))
assert(!componentJs.includes('count: Number(item.count)'))
assert(!componentJs.includes("label: '\\u5168\\u90e8', count"))
assert(!componentWxss.includes('.category-count'))

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

let filterComponentDefinition
let requestedSpaceType
vm.runInNewContext(componentJs, {
  require(request) {
    if (request.includes('services/v2/owner')) {
      return {
        cases: async (params) => {
          requestedSpaceType = params.spaceType
          return {
            ok: true,
            data: {
              items: [
                { _id: 'home-1', title: '\u5357\u4eac\u79c1\u5b85\u706f\u5149', spaceType: '\u4f4f\u5b85\u7a7a\u95f4', imageUrls: ['home.jpg'] },
                { _id: 'shop-1', title: '\u5546\u4e1a\u5c55\u5385\u7167\u660e', spaceType: '\u5546\u4e1a\u7a7a\u95f4', imageUrls: ['shop.jpg'] },
                { _id: 'hotel-1', title: '\u5ea6\u5047\u9152\u5e97\u706f\u5149', spaceType: '\u9152\u5e97\u7a7a\u95f4', imageUrls: ['hotel.jpg'] },
              ],
              spaceTypes: [
                { value: '\u4f4f\u5b85\u7a7a\u95f4', label: '\u4f4f\u5b85', count: 1 },
                { value: '\u5546\u4e1a\u7a7a\u95f4', label: '\u5546\u4e1a', count: 1 },
                { value: '\u9152\u5e97\u7a7a\u95f4', label: '\u9152\u5e97', count: 1 },
              ],
            },
          }
        },
      }
    }
    throw new Error(request)
  },
  Component(definition) {
    filterComponentDefinition = definition
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

async function runFilterChecks() {
  const filterComponent = {
    ...filterComponentDefinition.methods,
    data: { ...filterComponentDefinition.data },
    setData(patch) {
      Object.assign(this.data, patch)
    },
  }
  filterComponentDefinition.lifetimes.created.call(filterComponent)
  await filterComponent.loadCases()
  assert.strictEqual(requestedSpaceType, '')
  assert.strictEqual(filterComponent.data.cases.length, 3)
  assert.strictEqual(filterComponent.data.categories.length, 4)
  assert.deepStrictEqual(
    plain(filterComponent.data.categories.map(item => item.value)),
    ['all', '\u4f4f\u5b85\u7a7a\u95f4', '\u5546\u4e1a\u7a7a\u95f4', '\u9152\u5e97\u7a7a\u95f4']
  )
  assert(filterComponent.data.categories.every(item => !Object.prototype.hasOwnProperty.call(item, 'count')))
  filterComponent.applyFilters('residential', '')
  assert.deepStrictEqual(plain(filterComponent.data.cases.map(item => item.id)), ['home-1'])
  filterComponent.applyFilters('\u5546\u4e1a\u7a7a\u95f4', '')
  assert.deepStrictEqual(plain(filterComponent.data.cases.map(item => item.id)), ['shop-1'])
  filterComponent.applyFilters('\u9152\u5e97\u7a7a\u95f4', '')
  assert.deepStrictEqual(plain(filterComponent.data.cases.map(item => item.id)), ['hotel-1'])

  console.log('owner cases preview checks passed')
}

runFilterChecks().catch((error) => {
  console.error(error)
  process.exit(1)
})
