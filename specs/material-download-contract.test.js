'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const quiet = { log() {}, warn() {}, error() {} }
const lesson = { id: 'intro', title: '课程介绍', type: 'video', videoUrl: 'https://example.test/video.mp4' }
const course = { _id: 'fixture-doc', courseId: 'CO_FIXTURE', title: '课程', driveLink: 'https://example.test/material', drivePassword: '2580', chapters: [{ title: '介绍', lessons: [lesson] }] }

async function backend(filename, loggedIn = true, purchased = true) {
  const chain = name => {
    const api = {
      where() { return api }, limit() { return api }, field() { return api },
      async get() { return { data: name === 'courses' ? [course] : name === 'orders' && purchased ? [{ courseId: course.courseId, items: [] }] : [] } }
    }
    return api
  }
  const cloud = {
    init() {}, DYNAMIC_CURRENT_ENV: 'fixture',
    getWXContext() { return { OPENID: loggedIn ? 'fixture-user' : '' } },
    database() { return { command: { in: x => x, neq: x => x, or: x => x, and: x => x }, collection: chain } }
  }
  const exports = {}
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, console: quiet,
    require(name) {
      if (name === 'wx-server-sdk') return cloud
      if (name === './common/phone') return { generatePhoneMatchList() { return [] } }
      if (name === './common/identity') return { async resolveIdentity() { return { ok: true, identity: loggedIn ? { userId: 'fixture-user' } : null } } }
      throw new Error('Unexpected dependency: ' + name)
    }
  }, { filename })
  return exports.main({ courseId: course.courseId })
}

async function pageScenario(fields) {
  let page
  const copied = [], notices = []
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/course/video-player/video-player.js'), 'utf8'), {
    Page(config) { page = config }, console: quiet, setTimeout() {},
    wx: {
      cloud: { async callFunction() { return { result: { success: true, data: { courseId: course.courseId, title: course.title, currentLesson: { ...lesson }, chapters: [], ...fields } } } } },
      getStorageSync() { return '' }, setNavigationBarTitle() {},
      setClipboardData({ data, success }) { copied.push(data); if (success) success() },
      showToast(notice) { notices.push(notice.title) }
    }
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.parseAvailableQualities = () => ['720p']
  page.getVideoUrlByQuality = value => value.videoUrl
  page._prepareLessonForPlayback = async value => ({ success: true, lesson: value })
  for (const name of ['_mergeLessonIntoChapters', '_processLessonChapters', '_cacheVideoUrl']) page[name] = () => {}
  page._isLongVideo = () => false
  await page.loadCourseVideos(course.courseId)
  assert.equal(page.data.error, null)
  page.onMaterialDownloadTap({ currentTarget: { dataset: { chapterIndex: 3 } } })
  page.onCopyMaterialAll()
  return { page, copied, notices }
}

;(async () => {
  const candidate = process.argv.find(arg => arg.startsWith('--cloud-source='))
  const filename = candidate ? path.resolve(candidate.slice('--cloud-source='.length)) : path.join(root, 'cloudfunctions/course_videos/index.js')
  const res = await backend(filename)
  assert.equal(res.success, true)
  assert.equal(res.data.driveLink, course.driveLink, 'Backend must return configured material link')
  assert.equal(res.data.drivePassword, course.drivePassword)
  assert.equal((await backend(filename, false)).code, 'UNAUTHORIZED')
  assert.equal((await backend(filename, true, false)).code, 'NOT_PURCHASED')
  const filled = await pageScenario(res.data)
  assert.equal(filled.page.data.showMaterialModal, true)
  assert.equal(filled.page.data.materialPackage.link, course.driveLink)
  assert.equal(filled.copied.length, 1)
  assert.ok(filled.copied[0].includes(course.driveLink))
  assert.ok(filled.copied[0].includes('访问密码：2580'))
  filled.page.onCopyMaterialLink()
  filled.page.onCopyMaterialPassword()
  assert.equal(filled.copied[1], course.driveLink)
  assert.equal(filled.copied[2], course.drivePassword)
  for (const fields of [{}, { driveLink: '', drivePassword: '' }]) {
    const empty = await pageScenario(fields)
    assert.equal(empty.page.data.showMaterialModal, false, 'Missing material must not open a blank modal')
    assert.equal(empty.copied.length, 0)
    assert.ok(empty.notices.some(title => title.includes('暂未配置')))
  }
  const noPassword = await pageScenario({ driveLink: course.driveLink, drivePassword: '' })
  assert.equal(noPassword.copied.length, 1)
  assert.ok(!noPassword.copied[0].includes('访问密码'))
  console.log('material download contract checks passed (API, permissions, modal, clipboard, missing data)')
})().catch(error => { console.error(error); process.exitCode = 1 })
