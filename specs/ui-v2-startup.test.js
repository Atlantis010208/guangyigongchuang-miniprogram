'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const root = path.resolve(__dirname, '..')
function load(relative, extra = {}) {
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
    Page: value => { definition = value },
    Component: value => { definition = value },
    console: { log() {} },
    ...extra
  })
  return definition
}
for (const role of ['owner', 'designer']) {
  for (const cachedRole of [true, false]) {
    const calls = []
    const storage = { userRole: cachedRole ? role : '', userDoc: { identitySelected: true, roles: role === 'designer' ? 2 : 1 } }
    const page = load('pages/splash/splash.js', {
      getApp: () => ({ globalData: {} }),
      wx: { getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value }, reLaunch: value => calls.push(value.url) }
    })
    page.checkAndRedirect()
    assert.deepStrictEqual(calls, [role === 'owner' ? '/pages/v2/owner-home/index' : '/pages/v2/designer-learning/index'])
  }
}
for (const route of ['pages/products/products', 'pages/designer-home/designer-home']) {
  const page = load(`${route}.js`, { require: () => ({}), getApp: () => ({}) })
  assert.strictEqual(page.data.legacyVisible, false)
  // onShow may run while the asynchronous navigation is still pending.
  page.onShow.call({ data: page.data })
  assert(fs.readFileSync(path.join(root, `${route}.wxml`), 'utf8').startsWith('<block wx:if="{{legacyVisible}}">'))
  const current = { route, data: { legacyVisible: false } }
  const tab = load('custom-tab-bar/index.js', {
    getCurrentPages: () => [current], getApp: () => ({ globalData: {} }), wx: { getStorageSync() {} }
  })
  const instance = { data: tab.data, setData(value) { Object.assign(this.data, value) } }
  tab.methods._updateRole.call(instance)
  assert.strictEqual(instance.data.show, false)
  current.data.legacyVisible = true
  tab.methods._updateRole.call(instance)
  assert.strictEqual(instance.data.show, true)
}
console.log('startup routes directly to V2; legacy content and tabs remain hidden during redirect')
