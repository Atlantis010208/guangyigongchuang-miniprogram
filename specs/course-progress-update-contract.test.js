'use strict'

const assert = require('assert')
const Module = require('module')
const path = require('path')

let course = {
  _id: 'doc-1', courseId: 'CO1', status: 'published', isDelete: 0,
  chapters: [{ title: '第一章', lessons: [{ id: 'l1', title: '第一课', type: 'video' }] }]
}
let existing = null
let write = null

function collectionChain(name, documentId) {
  const api = {
    where() { return api }, limit() { return api }, field() { return api },
    doc(id) { return collectionChain(name, id) },
    async get() {
      if (name === 'courses') return { data: documentId ? course : [course] }
      if (name === 'course_progress') return { data: existing ? [existing] : [] }
      return { data: [] }
    },
    async set({ data }) { write = { method: 'set', id: documentId, data }; return { stats: { created: 1 } } },
    async update({ data }) { write = { method: 'update', id: documentId, data }; return { stats: { updated: 1 } } }
  }
  return api
}

const command = {
  or(value) { return { op: 'or', value } },
  and(value) { return { op: 'and', value } }
}
const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'dynamic', init() {},
  getWXContext() { return { OPENID: 'openid-1' } },
  database() { return { command, collection(name) { return collectionChain(name) } } }
}
const originalLoad = Module._load
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock
  return originalLoad.call(this, request, parent, isMain)
}
const progressFunction = require(path.join(__dirname, '..', 'cloudfunctions', 'course_progress_update', 'index'))
Module._load = originalLoad

;(async () => {
  const invalidLesson = await progressFunction.main({ courseId: 'CO1', lessonId: 'missing', lessonProgress: 50 })
  assert.strictEqual(invalidLesson.code, 'LESSON_NOT_FOUND')

  write = null
  existing = null
  const created = await progressFunction.main({ courseId: 'CO1', lessonId: 'l1', lessonProgress: 30 })
  assert.strictEqual(created.success, true)
  assert.strictEqual(write.method, 'set')
  assert(write.id.startsWith('cp_'))
  assert.strictEqual(write.data.lastLessonProgress, 30)

  existing = {
    _id: 'historical', courseId: 'CO1', userId: 'openid-1',
    lessonProgress: { l1: { progress: 100, isCompleted: true } },
    updatedAt: new Date('2026-08-25T00:00:00Z')
  }
  write = null
  const completed = await progressFunction.main({ courseId: 'CO1', lessonId: 'l1', lessonProgress: 10 })
  assert.strictEqual(completed.data.lastLessonProgress, 100)
  assert.strictEqual(write.method, 'update')
  assert.strictEqual(write.data.lessonProgress.l1.isCompleted, true)
  assert.strictEqual(write.data.progress, 100)

  course = Object.assign({}, course, { status: 'offline' })
  const unavailable = await progressFunction.main({ courseId: 'CO1', lessonId: 'l1', lessonProgress: 10 })
  assert.strictEqual(unavailable.code, 'COURSE_NOT_AVAILABLE')

  console.log('course progress update contract checks passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
