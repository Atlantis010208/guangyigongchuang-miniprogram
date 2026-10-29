'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { getShareTitle, wrapPageShare, trackNavigationTitles } = require('../utils/page-share')
const generate = require('../scripts/generate-page-navigation-titles')
const vm = require('vm')

assert.strictEqual(fs.readFileSync(path.join(__dirname, '../config/page-navigation-titles.js'), 'utf8'), generate(), 'Regenerate title map after editing page JSON')
const list = { route: 'pages/course/index/index', options: { category: '办公 照明', empty: '', zero: 0 } }
const definition = wrapPageShare({})
const share = definition.onShareAppMessage.call(list)
assert.strictEqual(share.title, '课程')
assert.strictEqual(share.path, '/pages/course/index/index?category=%E5%8A%9E%E5%85%AC%20%E7%85%A7%E6%98%8E&zero=0')

const original = { title: 'old title', path: '/course?id=1&inviteCode=abc', imageUrl: '/cover.jpg' }
const custom = wrapPageShare({ onShareAppMessage() { return original }, onShareTimeline() { return { title: 'old', query: 'id=1', imageUrl: '/cover.jpg' } } })
let pages = [list]
const wxApi = { setNavigationBarTitle(options) { if (options.title === '失败') options.fail({ errMsg: 'fail' }); else if (options.success) options.success({}) } }
trackNavigationTitles(wxApi, () => pages)
wxApi.setNavigationBarTitle({ title: '课程目录' })
assert.strictEqual(custom.onShareAppMessage.call(list).title, '课程目录')
assert.strictEqual(custom.onShareAppMessage.call(list).path, original.path)
assert.strictEqual(custom.onShareAppMessage.call(list).imageUrl, original.imageUrl)
assert.strictEqual(original.title, 'old title')
assert.strictEqual(custom.onShareTimeline.call(list).title, '课程目录')
assert.strictEqual(custom.onShareTimeline.call(list).query, 'id=1')
wxApi.setNavigationBarTitle({ title: '失败' })
assert.strictEqual(getShareTitle(list), '课程目录')

const player = { route: 'pages/course/video-player/video-player' }
pages = [list, player]
wxApi.setNavigationBarTitle({ title: '如何汇报方案' })
assert.strictEqual(getShareTitle(player), '如何汇报方案')
wxApi.setNavigationBarTitle({ title: '第二节' })
assert.strictEqual(getShareTitle(player), '第二节')
pages.pop()
assert.strictEqual(getShareTitle(list), '课程目录', 'Returning must restore the previous page title')
const customHeader = { route: 'pages/v2/designer-learning/index', data: { copy: { title: '学习' } } }
assert.strictEqual(getShareTitle(customHeader), '学习')
customHeader.data.copy.title = '课程学习'
assert.strictEqual(getShareTitle(customHeader), '课程学习')
assert.strictEqual(getShareTitle({ route: 'pages/lighting-manual/index', data: { heroInfo: { docTitle: '照明设计手册' } } }), '照明设计手册')
assert.strictEqual(getShareTitle({ route: 'pages/identity/identity' }), '身份选择')
const owner = { route: 'pages/v2/owner-home/index', options: { tab: 'cases' }, data: { activePreviewTab: 'tools' } }
assert.strictEqual(definition.onShareAppMessage.call(owner).title, '工具')
assert.strictEqual(definition.onShareAppMessage.call(owner).path, '/pages/v2/owner-home/index?tab=tools')
assert.strictEqual(owner.options.tab, 'cases')
// Exercise the actual app bootstrap, so future changes cannot bypass the shared wrapper.
let registered
const runtime = {
  require(name) { return name === './utils/page-share' ? require('../utils/page-share') : {} },
  wx: { setNavigationBarTitle() {} },
  getCurrentPages: () => [list],
  Page(value) { registered = value },
  App() {}
}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), runtime)
runtime.Page({ onShareAppMessage() { return original } })
assert.strictEqual(registered.onShareAppMessage.call(list).title, '课程目录')
assert.strictEqual(registered.onShareAppMessage.call(list).path, original.path)
const asyncDefinition = wrapPageShare({ onShareAppMessage() { return { promise: Promise.resolve(original) } } })
asyncDefinition.onShareAppMessage.call(list).promise.then(config => {
  assert.strictEqual(config.title, '课程目录')
  assert.strictEqual(config.path, original.path)
})
console.log('page share uses static, dynamic and custom navigation titles; preserves share metadata')
