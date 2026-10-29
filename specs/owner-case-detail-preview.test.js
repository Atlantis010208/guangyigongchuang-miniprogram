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
assert(
  previewPackage.pages.includes('owner-case-presentation/index'),
  'owner-case-presentation route must be registered'
)

for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(
    fs.existsSync(path.join(detailRoot, 'index.' + extension)),
    detailRoute + '.' + extension + ' must exist'
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

// 案例正文全部来自后台，页面不得再内联原型图或写死文案
// （assets 目录仍保留 highlight-dining.webp，它被 owner-services 面板复用）
assert(
  !/\.webp/.test(detailWxml) && !/\.webp/.test(detailJs),
  'detail page must not reference local prototype imagery'
)

for (const binding of [
  'copy.navTitle',
  'copy.designTitle',
  'copy.highlightsTitle',
]) {
  assert(
    detailWxml.includes('{{' + binding + '}}'),
    'missing detail copy binding: ' + binding
  )
}

for (const binding of [
  'detail.title',
  'detail.category',
  'detail.meta',
  'detail.desc',
]) {
  assert(
    detailWxml.includes('{{' + binding + '}}'),
    'detail body must bind backend field: ' + binding
  )
}

assert(
  detailWxml.includes('{{copy.loadingText}}')
    && detailWxml.includes('{{copy.emptyTitle}}'),
  'detail page must render loading and empty states'
)
assert(
  detailWxml.includes('bindtap="loadDetail"'),
  'empty state must offer a retry entry'
)

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
  'hero must render the one-based gallery counter'
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
  detailWxml.includes('wx:if="{{presentationAvailable}}"')
    && detailWxml.includes('bindtap="goPresentation"'),
  'published presentations must expose the immersive action conditionally'
)
assert(
  detailWxml.indexOf('bindtap="toggleBookmark"') < detailWxml.indexOf('bindtap="goPresentation"')
    && detailWxml.indexOf('bindtap="goPresentation"') < detailWxml.indexOf('bindtap="goConsultation"'),
  'action order must stay favorite, immersive, consultation'
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
assert(
  detailJs.includes('lighting_cases_list') || detailJs.includes('caseDetail'),
  'detail page must source its content from the case service'
)

function createDetailRuntime(windowInfo, initialPages) {
  let definition
  let currentPages = initialPages.slice()
  const calls = []

  const context = {
    setTimeout(callback) {
      callback()
      return 1
    },
    clearTimeout() {},
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

  // vm 中没有 require，页面会退化到"云服务不可用"的兜底实现，
  // 因此这里只验证降级路径与纯函数映射，真实数据用 applyDetail 注入
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

const realCaseId = '313b4fc069e85ff70017e91e59041171'
const mockCase = {
  _id: realCaseId,
  imageUrls: [
    'https://example.com/cover.jpg',
    'https://example.com/living.jpg',
    'https://example.com/dining.jpg',
    'https://example.com/bedroom.jpg',
    'https://example.com/entry.jpg',
    'https://example.com/night.jpg',
  ],
  title: '\u9759\u8c27\u4e4b\u5bb6',
  services: ['\u8bbe\u8ba1', '\u706f\u5177'],
  desc: '\u4ee5\u67d4\u548c\u7684\u95f4\u63a5\u5149\u5efa\u7acb\u7a7a\u95f4\u5c42\u6b21\u3002',
  city: '\u676d\u5dde',
  area: '180m\u00b2',
  style: '\u73b0\u4ee3\u7b80\u7ea6',
  officialAccountUrl: 'https://mp.weixin.qq.com/s/example',
  presentationAvailable: true,
}

async function main() {
  // 真实数据库 _id 必须原样保留，不能再被原型白名单改写
  const runtime = createDetailRuntime(compactWindow, [{ route: detailRoute }])
  runtime.page.onLoad({ id: realCaseId })
  assert.strictEqual(
    runtime.page.data.caseId,
    realCaseId,
    'a real case id must be passed through untouched'
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

  // 云服务不可用时必须落到失败态，而不是渲染任何占位案例
  await runtime.page.loadDetail()
  assert.strictEqual(
    runtime.page.data.loadFailed,
    true,
    'an unavailable case service must surface the empty state'
  )
  assert.strictEqual(
    runtime.page.data.loading,
    false,
    'the loading flag must be cleared once the request settles'
  )
  assert.strictEqual(
    runtime.page.data.detail,
    null,
    'no case content may be rendered when the request fails'
  )

  const missingIdRuntime = createDetailRuntime(
    compactWindow,
    [{ route: detailRoute }]
  )
  missingIdRuntime.page.onLoad({})
  await missingIdRuntime.page.loadDetail()
  assert.strictEqual(
    missingIdRuntime.page.data.loadFailed,
    true,
    'a missing id must surface the empty state instead of a prototype case'
  )

  // 后端字段 → 页面结构的映射
  const detailRuntime = createDetailRuntime(
    compactWindow,
    [{ route: detailRoute }]
  )
  detailRuntime.page.onLoad({ id: realCaseId })
  detailRuntime.page.applyDetail(mockCase)

  const rendered = detailRuntime.page.data
  assert.strictEqual(
    rendered.galleryTotal,
    mockCase.imageUrls.length,
    'the hero counter must reflect the number of stored images'
  )
  assert.strictEqual(
    rendered.galleryIndex,
    1,
    'the gallery counter must start at one'
  )
  assert.strictEqual(
    rendered.slides.length,
    mockCase.imageUrls.length,
    'every stored image must become a swiper slide'
  )
  assert.strictEqual(
    rendered.detail.title,
    mockCase.title,
    'title must come from the backend record'
  )
  assert.strictEqual(
    rendered.detail.category,
    mockCase.services.join('  \u00b7  '),
    'the category line must join the configured services'
  )
  assert.strictEqual(
    rendered.detail.meta,
    [mockCase.city, mockCase.area, mockCase.style].join('  \u00b7  '),
    'the meta line must join city, area and style'
  )
  assert.strictEqual(
    rendered.detail.desc,
    mockCase.desc,
    'the design concept must render the backend description'
  )
  assert.strictEqual(
    rendered.presentationAvailable,
    true,
    'the immersive entry must follow the public presentation availability flag'
  )

  // 空间亮点固定取封面之后的四张
  assert.strictEqual(
    rendered.highlights.length,
    4,
    'highlights must show up to four images after the cover'
  )
  assert.deepStrictEqual(
    rendered.highlights.map((item) => item.index),
    [1, 2, 3, 4],
    'highlights must skip the cover and stay aligned to the gallery indexes'
  )

  detailRuntime.page.handleSwiperChange({ detail: { current: 2 } })
  assert.strictEqual(
    detailRuntime.page.data.galleryIndex,
    3,
    'swiper index must be presented as a one-based counter'
  )

  detailRuntime.page.previewImage({
    currentTarget: { dataset: { index: 1 } },
  })
  const previewCall = detailRuntime.calls.find(
    (call) => call.api === 'previewImage'
  )
  assert(previewCall, 'previewImage interaction must call wx.previewImage')
  assert.deepStrictEqual(
    previewCall.options.urls,
    mockCase.imageUrls,
    'native image preview must receive the complete remote image set'
  )
  assert.strictEqual(
    previewCall.options.current,
    mockCase.imageUrls[1],
    'preview must open on the tapped image'
  )

  // 后台留空的可选字段不得渲染成空的分隔符
  const sparseRuntime = createDetailRuntime(
    compactWindow,
    [{ route: detailRoute }]
  )
  sparseRuntime.page.applyDetail({
    _id: realCaseId,
    imageUrls: ['https://example.com/only.jpg'],
    title: '',
    services: [],
    desc: '',
    city: '',
    area: '',
    style: '',
  })
  assert.strictEqual(
    sparseRuntime.page.data.detail.meta,
    '',
    'an entirely unset profile must collapse instead of rendering separators'
  )
  assert.strictEqual(
    sparseRuntime.page.data.detail.category,
    '',
    'an empty service list must collapse the category line'
  )
  assert(
    sparseRuntime.page.data.detail.title,
    'an untitled case must still fall back to a readable title'
  )
  assert.strictEqual(
    sparseRuntime.page.data.highlights.length,
    0,
    'a single-image case must not render an empty highlight grid'
  )

  const partialRuntime = createDetailRuntime(
    compactWindow,
    [{ route: detailRoute }]
  )
  partialRuntime.page.applyDetail({
    _id: realCaseId,
    imageUrls: [],
    title: 'x',
    services: [],
    desc: '',
    city: '\u676d\u5dde',
    area: '',
    style: '\u73b0\u4ee3\u7b80\u7ea6',
  })
  assert.strictEqual(
    partialRuntime.page.data.detail.meta,
    ['\u676d\u5dde', '\u73b0\u4ee3\u7b80\u7ea6'].join('  \u00b7  '),
    'a partially filled profile must join only the provided values'
  )
  assert.strictEqual(
    partialRuntime.page.data.galleryTotal,
    0,
    'a case without images must report an empty gallery'
  )

  const bookmarkBefore = detailRuntime.page.data.isBookmarked
  detailRuntime.page.toggleBookmark()
  assert.strictEqual(
    detailRuntime.page.data.isBookmarked,
    !bookmarkBefore,
    'bookmark interaction must toggle local page state'
  )

  detailRuntime.calls.length = 0
  detailRuntime.page.goPresentation()
  assert.strictEqual(
    detailRuntime.calls.find((call) => call.api === 'navigateTo')?.options.url,
    '/pages/v2/owner-case-presentation/index?id=' + encodeURIComponent(realCaseId) + '&from=detail',
    'immersive entry must open the deck with the current case id and detail origin'
  )

  const unavailableRuntime = createDetailRuntime(compactWindow, [{ route: detailRoute }])
  unavailableRuntime.page.data.caseId = realCaseId
  unavailableRuntime.page.goPresentation()
  assert.strictEqual(
    unavailableRuntime.calls.some((call) => call.api === 'navigateTo'),
    false,
    'a case without a published presentation must keep the existing detail behavior'
  )

  detailRuntime.calls.length = 0
  detailRuntime.page.goConsultation()
  assert.deepStrictEqual(
    detailRuntime.calls.find((call) => call.api === 'navigateTo')?.options.url,
    '/pages/support/contact/contact',
    'consultation must navigate to support/contact'
  )

  const stackedRuntime = createDetailRuntime(
    compactWindow,
    [{ route: 'pages/v2/owner-home/index' }, { route: detailRoute }]
  )
  stackedRuntime.page.onLoad({ id: realCaseId })
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
  directRuntime.page.onLoad({ id: realCaseId })
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
}

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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
