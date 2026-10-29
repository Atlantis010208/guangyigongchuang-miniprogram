const assert = require('assert')

const storage = new Map()
const toasts = []
const navigations = []
let pageDefinition
let componentDefinition

global.wx = {
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375 }),
  getMenuButtonBoundingClientRect: () => ({ top: 26, height: 32 }),
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  getFileSystemManager: () => ({ accessSync: () => { throw new Error('expired') } }),
  showToast: (options) => toasts.push(options),
  redirectTo: (options) => navigations.push({ type: 'redirectTo', ...options }),
  navigateBack: (options) => navigations.push({ type: 'navigateBack', ...options }),
  showModal: () => {},
  vibrateShort: () => {},
  cloud: {
    callFunction: async ({ data }) => data.action === 'getPublished'
      ? { result: { success: false, code: 'NOT_PUBLISHED' } }
      : { result: { success: true, code: 'OK', data: { id: 'submission-1' } } },
    uploadFile: async () => ({ fileID: 'cloud://test/file' }),
  },
}
global.getCurrentPages = () => [{}]
global.Page = (definition) => { pageDefinition = definition }
global.Component = (definition) => { componentDefinition = definition }

require('../pages/flows/collection-form/collection-form')
require('../components/ranking-sorter/ranking-sorter')

function createPage() {
  const page = {
    ...pageDefinition,
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch) { Object.assign(this.data, patch) },
  }
  Object.keys(pageDefinition).forEach((key) => {
    if (typeof pageDefinition[key] === 'function') page[key] = pageDefinition[key].bind(page)
  })
  return page
}

;(async () => {
for (const spaceType of ['residential', 'wellness', 'office', 'fitness']) {
  const page = createPage()
  await page.onLoad({ spaceType })
  assert.strictEqual(page.form.spaceType, spaceType)
  assert.match(page.storageKey, new RegExp(`:${spaceType}$`))
  assert.strictEqual(page.data.view, 'overview')
}

const page = createPage()
await page.onLoad({ spaceType: 'residential' })
page.showModule(0)
assert.strictEqual(page.data.view, 'module')
page.showQuestion(0, 0)
assert.strictEqual(page.data.currentQuestion.code, 'A1')
page.onBack()
assert.strictEqual(page.data.view, 'module')

page.showQuestion(0, 1)
wx.chooseLocation = ({ success }) => success({ name: '项目现场', address: '深圳市南山区', latitude: 22.5431, longitude: 114.0579 })
page.onChooseLocation()
assert.deepStrictEqual(page.data.currentAnswer, { name: '项目现场', address: '深圳市南山区', latitude: 22.5431, longitude: 114.0579 })
page.onBack()

const answers = {}
page.form.modules.forEach((module) => module.questions.forEach((question) => {
  if (!question.required) return
  if (question.code === 'C1' || question.code === 'C3') answers[question.id] = 'no'
  else if (question.code === 'D1') answers[question.id] = 'switch'
  else if (question.type === 'single') answers[question.id] = question.options[0].id
  else if (question.type === 'multiple') answers[question.id] = question.options.slice(0, question.validation.minSelections || 1).map((option) => option.id)
  else if (question.type === 'ranking') answers[question.id] = question.options.map((item) => item.id)
  else if (question.type === 'number') answers[question.id] = String(Math.max(10, question.validation.min))
  else if (question.type === 'location') answers[question.id] = { name: '项目位置', address: '深圳市', latitude: 22.5431, longitude: 114.0579 }
  else answers[question.id] = '测试项目'
}))
page.setData({ answers })
assert.deepStrictEqual(page.deriveModuleCards().map((module) => module.status), ['completed', 'completed', 'completed', 'completed'])
page.showReview()
const submittedStorageKey = page.storageKey
const submittedActiveDraftKey = page.activeDraftKey
await page.onConfirm()
assert.strictEqual(page.data.submitted, true)
assert.strictEqual(toasts.at(-1).title, '提交成功')
assert.strictEqual(navigations.at(-1).type, 'redirectTo')
assert.match(navigations.at(-1).url, /^\/pages\/flows\/collection-form-result\/collection-form-result\?id=submission-1&requestId=/)
assert.strictEqual(storage.has(submittedStorageKey), false)
assert.strictEqual(storage.has(submittedActiveDraftKey), false)

const recovered = page.revalidateCachedFiles({
  c5_scene_photos: [{ name: 'expired.jpg', tempPath: 'wxfile://expired', valid: true }],
})
assert.strictEqual(recovered.c5_scene_photos[0].valid, false)

const ranking = {
  ...componentDefinition.methods,
  data: {
    orderedItems: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    dragging: false,
    draggingId: '',
    dragOffset: 0,
  },
  rowStep: 56,
  events: [],
  setData(patch) { Object.assign(this.data, patch) },
  triggerEvent(name, detail) { this.events.push({ name, detail }) },
}
Object.keys(componentDefinition.methods).forEach((key) => {
  ranking[key] = componentDefinition.methods[key].bind(ranking)
})
ranking.onTouchStart({ touches: [{ clientY: 100 }], currentTarget: { dataset: { index: 0 } } })
assert.strictEqual(ranking.data.dragging, true)
ranking.onTouchMove({ touches: [{ clientY: 160 }] })
ranking.onTouchEnd()
assert.deepStrictEqual(ranking.events.find((event) => event.name === 'change').detail.value, ['b', 'a', 'c'])
assert.deepStrictEqual(
  ranking.events.filter((event) => event.name === 'dragstate').map((event) => event.detail.dragging),
  [true, false]
)

ranking.events = []
ranking.onTouchStart({ touches: [{ clientY: 100 }], currentTarget: { dataset: { index: 0 } } })
ranking.onTouchEnd()
assert.strictEqual(ranking.events.some((event) => event.name === 'change'), false)

console.log('collection-form flow tests passed')
})().catch((error) => { console.error(error); process.exit(1) })
