const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const app = require('../app.json')
const packages = (app.subpackages || []).map(pkg => pkg.root.replace(/\/$/, ''))
const packageOf = file => packages.find(pkg => file.startsWith(pkg + '/')) || ''
const visited = new Set()
function checkStyles(file) {
  if (visited.has(file)) return
  visited.add(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  for (const match of source.matchAll(/@import\s+["']([^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))
    assert.ok(fs.existsSync(path.join(root, target)), `Missing WXSS: ${file} -> ${target}`)
    assert.ok(!packageOf(target) || packageOf(target) === packageOf(file),
      `Cross-subpackage WXSS import: ${file} -> ${target}`)
    checkStyles(target)
  }
}
checkStyles('pages/color-temp/color-temp.wxss')
checkStyles('pages/color-temp/color-temp-result/color-temp-result.wxss')
checkStyles('pages/search/search.wxss')

let definition
global.Page = value => { definition = value }
require('../pages/color-temp/color-temp')
assert.ok(definition.data.spaceTypes.length > 0, 'Color temperature form must have spaces')
assert.strictEqual(typeof definition.onCalculate, 'function')
assert.strictEqual(typeof definition.onHistoryTap, 'function')
assert.strictEqual(typeof definition.doCalculate, 'function')
const formDefinition = definition
const template = fs.readFileSync(path.join(root, 'pages/color-temp/color-temp.wxml'), 'utf8')
assert.match(template, /bindtap="onCalculate"/)
require('../pages/color-temp/color-temp-result/color-temp-result')
assert.strictEqual(typeof definition.onLoad, 'function')
assert.strictEqual(typeof definition._saveHistory, 'function')
const resultDefinition = definition
require('../pages/color-temp/history/history')
assert.strictEqual(typeof definition.loadHistory, 'function')
assert.strictEqual(typeof definition.onItemTap, 'function')
const historyDefinition = definition
function instantiate(page) {
  return Object.assign({}, page, {
    data: JSON.parse(JSON.stringify(page.data)),
    setData(values) { Object.assign(this.data, values) }
  })
}
const storage = new Map()
const application = { globalData: {} }
let route
let notice
global.getApp = () => application
global.wx = {
  navigateTo(options) { route = options.url },
  navigateBack(options) { options.success() },
  showToast(options) { notice = options.title },
  showLoading() {}, hideLoading() {},
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) }
}
const form = instantiate(formDefinition)
form.onCalculate()
assert.strictEqual(notice, '请选择空间类型')
assert.strictEqual(route, undefined)
form.onSpaceChange({ detail: { value: '0' } })
form.onAgeChange({ detail: { value: '1' } })
form.onToggleFixture({ currentTarget: { dataset: { id: 'basic' } } })
form.doCalculate()
assert.strictEqual(route, '/pages/color-temp/color-temp-result/color-temp-result')
assert.strictEqual(application.globalData.colorTempResult.standardTemp, 3500)
assert.strictEqual(application.globalData.colorTempResult.layers.length, 1)
const result = instantiate(resultDefinition)
result.onLoad({})
assert.strictEqual(result.data.sceneList.length, 6)
assert.strictEqual(result.data.displayedTemp, 3500)
assert.strictEqual(storage.get('color_temp_history').length, 1)
const history = instantiate(historyDefinition)
history.onShow()
assert.strictEqual(history.data.historyList.length, 1)
history.onItemTap({ currentTarget: { dataset: { id: history.data.historyList[0].id } } })
const restored = instantiate(formDefinition)
restored.onShow()
assert.strictEqual(restored.data.spaceIndex, 0)
assert.strictEqual(restored.data.ageIndex, 1)
assert.strictEqual(restored.data.fixtureSelectedMap.basic, true)
assert.strictEqual(storage.has('color_temp_history_selected'), false)
console.log('Color temperature pages and package style dependencies passed')
