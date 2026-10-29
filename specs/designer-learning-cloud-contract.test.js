'use strict'

const assert = require('assert')
const Module = require('module')
const path = require('path')

const course = {
  _id: 'doc-1', courseId: 'CO1', status: 'published', isDelete: 0,
  title: '灯光设计课', description: '课程介绍', cover: 'cloud://env/cover.jpg',
  drivePassword: 'never-return',
  chapters: [{ title: '第一章', lessons: [{ id: 'l1', title: '第一课', type: 'video', duration: '10:00', videoUrl: 'cloud://secret.mp4' }] }]
}
const progress = {
  _id: 'p1', userId: 'openid-1', courseId: 'CO1', progress: 50, totalLessons: 1,
  lastLessonId: 'l1', updatedAt: new Date('2026-08-26T10:00:00Z'),
  lessonProgress: { l1: { progress: 50, isCompleted: false, lastWatchedAt: new Date('2026-08-26T10:00:00Z') } }
}
let currentOpenid = 'openid-1'
let currentUser = { _id: 'user-1', _openid: 'openid-1', roles: 2 }

function chain(collectionName, mode) {
  const api = {
    where() { return api }, field() { return api }, limit() { return api }, orderBy() { return api },
    doc() { return chain(collectionName, 'doc') },
    async get() {
      if (collectionName === 'courses') return { data: mode === 'doc' ? course : [course] }
      if (collectionName === 'users') return { data: currentUser ? [currentUser] : [] }
      if (collectionName === 'course_progress') return { data: [progress] }
      return { data: [] }
    }
  }
  return api
}

const command = {
  or(value) { return { op: 'or', value } },
  and(value) { return { op: 'and', value } },
  in(value) { return { op: 'in', value } },
  neq(value) { return { op: 'neq', value } }
}
const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'dynamic', init() {},
  database() { return { command, collection(name) { return chain(name) } } },
  getWXContext() { return { OPENID: currentOpenid } },
  async getTempFileURL({ fileList }) { return { fileList: fileList.map(fileID => ({ fileID, status: 0, tempFileURL: `https://temp/${encodeURIComponent(fileID)}` })) } }
}

const originalLoad = Module._load
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock
  return originalLoad.call(this, request, parent, isMain)
}

const cloudFunction = require(path.join(__dirname, '..', 'cloudfunctions', 'designer_learning_content', 'index'))
Module._load = originalLoad

;(async () => {
  const invalid = await cloudFunction.main({ action: 'nope', courseId: 'CO1' })
  assert.strictEqual(invalid.code, 'INVALID_ACTION')

  const introduction = await cloudFunction.main({ action: 'introduction', courseId: 'CO1', openid: 'attacker' })
  assert.strictEqual(introduction.success, true)
  assert(introduction.data.coverUrl.startsWith('https://temp/'))
  const introJson = JSON.stringify(introduction)
  for (const forbidden of ['drivePassword', 'videoUrl', 'fileUrl', 'never-return']) assert(!introJson.includes(forbidden))

  const catalog = await cloudFunction.main({ action: 'catalog', courseId: 'CO1' })
  assert.strictEqual(catalog.data.totalLessons, 1)
  assert(!JSON.stringify(catalog).includes('secret.mp4'))

  const history = await cloudFunction.main({ action: 'history', courseId: 'CO1' })
  assert.strictEqual(history.data.records[0].lessonId, 'l1')
  assert.strictEqual(history.data.records[0].progress, 50)

  currentOpenid = ''
  const unauthenticated = await cloudFunction.main({ action: 'history', courseId: 'CO1' })
  assert.strictEqual(unauthenticated.code, 'UNAUTHENTICATED')

  currentOpenid = 'openid-1'
  currentUser = { _id: 'owner-1', roles: 1 }
  const wrongRole = await cloudFunction.main({ action: 'history', courseId: 'CO1' })
  assert.strictEqual(wrongRole.code, 'NOT_DESIGNER')

  console.log('designer learning cloud contract checks passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
