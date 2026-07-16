const assert = require('assert')

let pageDefinition
global.Page = (definition) => { pageDefinition = definition }
global.wx = {}

const { mergeTypeTitles } = require('../pages/flows/collection-type/collection-type')

const current = [
  { id: 'residential', title: '住宅空间', subtitle: '家庭照明', selected: true },
  { id: 'wellness', title: '疗愈服务空间', subtitle: '健康放松', selected: false },
]
const merged = mergeTypeTitles(current, [
  { spaceType: 'residential', title: '  住宅灯光设计需求收集  ' },
  { spaceType: 'unknown', title: '无效类型' },
  { spaceType: 'wellness', title: '' },
])
assert.strictEqual(merged[0].title, '住宅灯光设计需求收集')
assert.strictEqual(merged[0].selected, true)
assert.strictEqual(merged[1].title, '疗愈服务空间')
assert.strictEqual(typeof pageDefinition.loadFormTitles, 'function')

const storage = new Map()
const calls = []
global.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  cloud: {
    callFunction: async (options) => {
      calls.push(options)
      return { result: { success: true, data: { types: [{ spaceType: 'residential', title: '住宅灯光需求表' }] } } }
    },
  },
}
const page = {
  ...pageDefinition,
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  setData(patch) { Object.assign(this.data, patch) },
}
Object.keys(pageDefinition).forEach((key) => {
  if (typeof pageDefinition[key] === 'function') page[key] = pageDefinition[key].bind(page)
})

;(async () => {
  await page.loadFormTitles()
  assert.strictEqual(page.data.spaceTypes[0].title, '住宅灯光需求表')
  assert.deepStrictEqual(calls[0], { name: 'collection_form_public', data: { action: 'listTypes' } })
  assert.strictEqual(storage.get('collection_form_type_titles:v1')[0].title, '住宅灯光需求表')
  console.log('collection-type tests passed')
})().catch((error) => { console.error(error); process.exit(1) })