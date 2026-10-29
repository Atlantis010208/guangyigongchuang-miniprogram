'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const pageRoot = path.join(root, 'pages', 'v2', 'designer-learning-content')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const previewPackage = app.subpackages.find(item => item.root === 'pages/v2/')
assert(previewPackage.pages.includes('designer-learning-content/index'))
for (const extension of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(pageRoot, `index.${extension}`)))

const pageJs = fs.readFileSync(path.join(pageRoot, 'index.js'), 'utf8')
const wxml = fs.readFileSync(path.join(pageRoot, 'index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(pageRoot, 'index.wxss'), 'utf8')
const config = JSON.parse(fs.readFileSync(path.join(pageRoot, 'index.json'), 'utf8'))
assert(!pageJs.includes('wx.cloud'))
assert(!wxml.includes('custom-navigation'))
assert(!wxml.includes('preview-tabbar'))
assert(!('navigationStyle' in config))
for (const status of ['loading', 'error', 'empty']) assert(wxml.includes(`status === '${status}'`))
for (const section of ['intro', 'catalog']) assert(wxml.includes(`section === '${section}'`))
assert(wxml.includes('catchtap="openLesson"'))
assert(wxml.includes('data-lesson-id="{{item.lessonId}}" data-lesson-type="video"'))
assert(wxml.includes('class="intro-cover" src="{{introduction.coverUrl}}" mode="widthFix"'))
assert(!wxss.includes('.intro-cover { width: 100%; height: 320rpx;'))
assert(!wxss.includes('.chapter-arrow,.row-arrow { color: #999; font-size: 42rpx; transform: rotate(90deg);'))
assert(wxss.includes('.chapter-arrow { transform: rotate(90deg); }'))

let definition
const calls = []
const services = {
  learningIntroduction: async () => ({ ok: true, data: { title: '课程', description: '介绍', detailImages: [], highlights: [] } }),
  learningCatalog: async () => ({ ok: true, data: { title: '课程', chapters: [], totalLessons: 0 } }),
  learningHistory: async () => ({ ok: true, data: { records: [], progress: 0, completedCount: 0, totalLessons: 0 } })
}
const context = {
  module: { exports: {} }, exports: {},
  require(request) { if (request.includes('services/v2/designer')) return services; throw new Error(request) },
  Page(value) { definition = value },
  wx: {
    setNavigationBarTitle(options) { calls.push({ api: 'title', options }) },
    navigateTo(options) { calls.push({ api: 'navigateTo', options }) },
    showToast(options) { calls.push({ api: 'toast', options }) }
  }
}
vm.runInNewContext(pageJs, context)
assert(definition)
const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch) } }
page.onLoad({ courseId: 'CO1', section: 'history' })
assert.strictEqual(page.data.section, 'history')
assert.strictEqual(calls[0].options.title, '学习记录')

page.setData({ courseId: 'CO1' })
page.openLesson({ currentTarget: { dataset: { lessonId: 'LESSON_1', lessonType: 'video' } } })
assert.strictEqual(calls.at(-1).api, 'navigateTo')
assert.strictEqual(calls.at(-1).options.url, '/pages/course/video-player/video-player?courseId=CO1&lessonId=LESSON_1')

console.log('designer learning content preview checks passed')
