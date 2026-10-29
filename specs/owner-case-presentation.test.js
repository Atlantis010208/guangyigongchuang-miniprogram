'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'v2', 'owner-case-presentation')
const route = 'pages/v2/owner-case-presentation/index'
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const v2Package = app.subpackages.find(item => item.root === 'pages/v2/')

assert(v2Package && v2Package.pages.includes('owner-case-presentation/index'), 'presentation route must be registered')
for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  assert(fs.existsSync(path.join(pageRoot, `index.${extension}`)), `${route}.${extension} must exist`)
}

const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const pageWxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const pageWxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
const pageJson = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))

assert.strictEqual(pageJson.navigationStyle, 'custom')
assert.strictEqual(pageJson.disableScroll, true)
assert(/vertical="\{\{true\}\}"/.test(pageWxml), 'deck must use vertical swiper')
assert(/circular="\{\{false\}\}"/.test(pageWxml), 'deck must stop on the final slide')
assert(/autoplay="\{\{false\}\}"/.test(pageWxml), 'deck must never autoplay')
for (const layout of ['cover-full', 'image-top-copy-bottom', 'strategy-image70', 'space-overlay', 'split-editorial', 'closing-full']) {
  assert(pageWxss.includes(`deck-slide--${layout}`) || pageWxml.includes(layout), `missing template ${layout}`)
}
assert(/grid-template-rows:\s*70%\s+30%/.test(pageWxss), 'strategy template must enforce 70/30 composition')
assert(pageWxml.includes('bindchange="handleSlideChange"'), 'swiper must update adjacent preloading')
assert(pageWxml.includes('catchtap="goConsultation"'), 'closing must expose the consultation CTA')
assert(pageWxml.includes('deck-progress'), 'deck must render the default progress line')
assert(!/previewImage/.test(pageJs + pageWxml), 'immersive deck must not expose image zoom')
assert(!/<video\b|<audio\b|backgroundAudio|autoplay:\s*true/.test(pageJs + pageWxml), 'deck must not contain music, video, or autoplay paths')
assert(!/logo|brand/i.test(pageJs + pageWxml), 'deck must not render a brand mark')
assert(pageJs.includes('hideShareMenu'), 'draft preview must hide share controls')
assert(pageJs.includes('loadFontFace'), 'deck must asynchronously load configured fonts')

function createRuntime(initialPages = [{ route }]) {
  let definition
  let pages = initialPages.slice()
  const calls = []
  const timers = []
  const moduleRef = { exports: {} }
  const context = {
    module: moduleRef,
    setTimeout(callback) { timers.push(callback); return timers.length },
    clearTimeout() {},
    getCurrentPages() { return pages },
    Page(value) { definition = value },
    wx: {
      getWindowInfo() { return { statusBarHeight: 24, benchmarkLevel: 8 } },
      getDeviceInfo() { return { benchmarkLevel: 8 } },
      hideShareMenu(options = {}) { calls.push({ api: 'hideShareMenu', options }) },
      showShareMenu(options = {}) { calls.push({ api: 'showShareMenu', options }) },
      navigateBack(options = {}) { calls.push({ api: 'navigateBack', options }) },
      redirectTo(options = {}) { calls.push({ api: 'redirectTo', options }) },
      navigateTo(options = {}) { calls.push({ api: 'navigateTo', options }) },
      showToast(options = {}) { calls.push({ api: 'showToast', options }) },
      loadFontFace(options = {}) { calls.push({ api: 'loadFontFace', options }) },
    },
  }
  vm.runInNewContext(pageJs, context, { filename: path.join(pageRoot, 'index.js') })
  assert(definition, 'presentation page must register Page')
  const page = Object.assign({}, definition)
  page.data = Object.assign({}, definition.data)
  page.setData = function setData(update) { Object.assign(this.data, update) }
  return { page, calls, timers, helpers: moduleRef.exports, setPages(value) { pages = value.slice() } }
}

const runtime = createRuntime([{ route: 'pages/v2/owner-case-detail/index' }, { route }])
assert.strictEqual(runtime.helpers.decodeScene('p_test%2Bscene'), 'p_test+scene')
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(runtime.helpers.normalizeFocal({ imageFocals: { a: { x: 0.2, y: 0.8 } } }, 'a'))),
  { x: 0.2, y: 0.8, position: '20% 80%' }
)

const rawSlides = [0, 1, 2, 3].map(index => ({
  id: `slide-${index}`,
  type: index === 0 ? 'cover' : (index === 3 ? 'closing' : 'space'),
  layout: index === 0 ? 'cover-full' : (index === 3 ? 'closing-full' : 'space-overlay'),
  imageFileIds: [`file-${index}`],
  imageUrls: [`https://example.com/${index}.jpg`],
  imageFocals: {},
  sectionNo: '',
}))
const prepared = runtime.helpers.prepareSlides(rawSlides, 1)
assert(prepared[0].images[0].src && prepared[1].images[0].src && prepared[2].images[0].src, 'current and adjacent slides must preload')
assert.strictEqual(prepared[3].images[0].src, '', 'distant slides must remain deferred')

runtime.page.data.rawSlides = rawSlides
runtime.page.data.slides = runtime.helpers.prepareSlides(rawSlides, 0)
runtime.page.handleSlideChange({ detail: { current: 2 } })
assert.strictEqual(runtime.page.data.current, 2)
assert(runtime.page.data.slides[3].images[0].src, 'changing slides must preload the next slide')

runtime.page.data.from = 'detail'
runtime.page.data.caseId = 'case/a'
runtime.page.goBack()
assert.strictEqual(runtime.calls.find(call => call.api === 'navigateBack').options.delta, 1, 'detail entry must return to detail stack')

const direct = createRuntime([{ route }])
direct.page.data.caseId = 'case/a'
direct.page.redirectToDetail()
assert.strictEqual(
  direct.calls.find(call => call.api === 'redirectTo').options.url,
  '/pages/v2/owner-case-detail/index?id=case%2Fa',
  'direct share exit must return to the matching ordinary detail'
)

runtime.page.data.deckCase = { title: '\u9759\u8c27\u4e4b\u5bb6' }
runtime.page.data.caseId = 'case/a'
runtime.page.data.rawSlides = rawSlides
const share = runtime.page.onShareAppMessage()
assert.strictEqual(share.path, '/pages/v2/owner-case-presentation/index?id=case%2Fa')
assert.strictEqual(share.imageUrl, rawSlides[0].imageUrls[0])

const preview = createRuntime()
preview.page.onLoad({ scene: 'p_preview-token' })
assert(preview.calls.some(call => call.api === 'hideShareMenu'), 'scene preview must hide sharing')
assert.strictEqual(preview.page.data.isPreview, true)

runtime.calls.length = 0
runtime.page.goConsultation()
assert.strictEqual(runtime.calls.find(call => call.api === 'navigateTo').options.url, '/pages/support/contact/contact')

console.log('owner-case-presentation specification: ok')
