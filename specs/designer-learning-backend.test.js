'use strict'

const assert = require('assert')
const path = require('path')
const domain = require(path.join(__dirname, '..', 'cloudfunctions', 'designer_learning_content', 'domain'))
const progressDomain = require(path.join(__dirname, '..', 'cloudfunctions', 'course_progress_update', 'domain'))
const addValidator = require(path.join(__dirname, '..', 'cloudfunctions', 'admin_courses_add', 'course-validator'))
const updateValidator = require(path.join(__dirname, '..', 'cloudfunctions', 'admin_courses_update', 'course-validator'))
const adminProgressDomain = require(path.join(__dirname, '..', 'cloudfunctions', 'admin_course_progress_list', 'domain'))
const adminAuth = require(path.join(__dirname, '..', 'cloudfunctions', 'admin_course_progress_list', 'admin_auth'))

const course = {
  _id: 'doc-1',
  courseId: 'CO1',
  title: '灯光设计课',
  subtitle: '系统学习',
  description: '课程正文',
  cover: 'cloud://env/cover.jpg',
  instructorName: '二哥',
  instructorAvatar: 'cloud://env/avatar.jpg',
  detailImages: ['cloud://env/detail-1.jpg', '', 'cloud://env/detail-1.jpg'],
  highlights: ['系统课程', '案例实战'],
  benefits: ['掌握方法'],
  drivePassword: 'secret',
  chapters: [
    {
      title: '第一章',
      lessons: [
        { id: 'l1', title: '光的基础', type: 'video', duration: '10:00', videoUrl: 'cloud://secret/video.mp4' },
        { id: 'f1', title: '课程资料', type: 'file', format: 'PDF', fileUrl: 'cloud://secret/file.pdf' },
        { id: 'q1', title: '课后作业', type: 'quiz', quizId: 'quiz-secret', questionCount: 5, passScore: 80 },
        { id: 'l1', title: '重复课时', type: 'video' },
        { id: '', title: '无效课时', type: 'video' }
      ]
    }
  ]
}

assert.deepStrictEqual(domain.validateRequest({ action: 'catalog', courseId: ' CO1 ' }), { ok: true, action: 'catalog', courseId: 'CO1' })
assert.strictEqual(domain.validateRequest({ action: 'unknown', courseId: 'CO1' }).code, 'INVALID_ACTION')
assert.strictEqual(domain.validateRequest({ action: 'catalog', courseId: '' }).code, 'INVALID_PARAMS')

const introduction = domain.buildIntroduction(course)
assert.strictEqual(introduction.courseId, 'CO1')
assert.strictEqual(introduction.detailImages.length, 1)
assert.strictEqual(introduction.instructor.name, '二哥')
const introductionJson = JSON.stringify(introduction)
for (const forbidden of ['drivePassword', 'videoUrl', 'fileUrl']) assert(!introductionJson.includes(forbidden))

const ids = domain.collectCloudFileIds(introduction)
assert(ids.has('cloud://env/cover.jpg'))
assert(ids.has('cloud://env/avatar.jpg'))
assert(ids.has('cloud://env/detail-1.jpg'))
const replaced = domain.replaceCloudUrls(introduction, { 'cloud://env/cover.jpg': 'https://temp/cover.jpg' })
assert.strictEqual(replaced.coverUrl, 'https://temp/cover.jpg')
assert.strictEqual(replaced.instructor.avatarUrl, '')

const catalog = domain.buildCatalog(course)
assert.strictEqual(catalog.totalLessons, 3)
assert.strictEqual(catalog.chapters[0].lessons[0].index, 1)
assert.strictEqual(catalog.chapters[0].lessons[2].passScore, 80)
const catalogJson = JSON.stringify(catalog)
for (const forbidden of ['videoUrl', 'videoUrls', 'fileUrl', 'quizId', 'cloud://secret']) assert(!catalogJson.includes(forbidden))

const history = domain.buildHistory(course, {
  progress: 34.6,
  totalLessons: 3,
  completedLessons: ['l1', 'deleted'],
  lastLessonId: 'l1',
  lessonProgress: {
    l1: { progress: 150, isCompleted: true, lastWatchedAt: new Date('2026-08-26T10:00:00Z') },
    f1: { progress: -20, isCompleted: false, lastWatchedAt: new Date('2026-08-25T10:00:00Z') },
    deleted: { progress: 100, isCompleted: true, lastWatchedAt: new Date('2026-08-27T10:00:00Z') }
  }
})
assert.strictEqual(history.progress, 35)
assert.strictEqual(history.completedCount, 1)
assert.strictEqual(history.records.length, 2)
assert.strictEqual(history.records[0].lessonId, 'l1')
assert.strictEqual(history.records[0].progress, 100)
assert.strictEqual(history.records[1].progress, 0)
assert(!history.records.some(item => item.lessonId === 'deleted'))

const emptyHistory = domain.buildHistory(course, null)
assert.strictEqual(emptyHistory.progress, 0)
assert.deepStrictEqual(emptyHistory.records, [])

assert.deepStrictEqual(progressDomain.videoLessonIds(course.chapters), ['l1'])
assert.strictEqual(progressDomain.clampProgress(95.4), 95)
assert.strictEqual(progressDomain.clampProgress(-5), 0)
assert.strictEqual(progressDomain.stableRecordId('openid', 'CO1'), progressDomain.stableRecordId('openid', 'CO1'))
assert.notStrictEqual(progressDomain.stableRecordId('openid', 'CO1'), progressDomain.stableRecordId('openid', 'CO2'))
const normalizedProgress = progressDomain.normalizeLessonProgressMap({
  l1: { progress: 20, isCompleted: true },
  removed: { progress: 100, isCompleted: true }
}, ['l1'])
assert.deepStrictEqual(Object.keys(normalizedProgress), ['l1'])
assert.strictEqual(normalizedProgress.l1.progress, 100)
assert.strictEqual(progressDomain.calculateOverallProgress(['l1', 'l2'], normalizedProgress), 50)
assert.deepStrictEqual(progressDomain.completedLessonIds(['l1', 'l2'], normalizedProgress), ['l1'])

for (const validator of [addValidator, updateValidator]) {
  assert.strictEqual(validator.validateCourseContent(course, { publishing: true }).ok, false)
  const validCourse = { chapters: [{ title: '第一章', lessons: [{ id: 'v1', title: '第一课', type: 'video' }] }] }
  assert.strictEqual(validator.validateCourseContent(validCourse, { publishing: true }).ok, true)
  const duplicateCourse = { chapters: [{ title: '第一章', lessons: [
    { id: 'v1', title: '第一课', type: 'video' },
    { id: 'v1', title: '第二课', type: 'video' }
  ] }] }
  assert(validator.validateCourseContent(duplicateCourse, { publishing: true }).message.includes('重复'))
}

const params = adminProgressDomain.normalizeParams({ limit: 500, offset: -1, orderBy: 'unsafe', order: 'up', keyword: ' 灯光 ' })
assert.strictEqual(params.limit, 100)
assert.strictEqual(params.offset, 0)
assert.strictEqual(params.orderBy, 'updatedAt')
assert.strictEqual(params.keyword, '灯光')
const adminFormatted = adminProgressDomain.formatRecord({
  _id: 'p1', userId: 'openid', courseId: 'CO1', progress: 55, totalLessons: 3,
  completedLessons: ['l1'], lastLessonId: 'l1',
  lessonProgress: { l1: { progress: 100, isCompleted: true, lastWatchedAt: 1000 }, missing: { progress: 100, isCompleted: true } }
}, { _id: 'u1', nickname: '设计师' }, course)
assert.strictEqual(adminFormatted.completedCount, 1)
assert.strictEqual(adminFormatted.completedLessons.length, 1)
assert.strictEqual(adminFormatted.lastLessonId, 'l1')
const validToken = Buffer.from(JSON.stringify({ userId: 'admin', roles: 0, exp: Date.now() + 10000 })).toString('base64')
assert.strictEqual(adminAuth.decodeAdminToken(validToken).userId, 'admin')
assert.strictEqual(adminAuth.decodeAdminToken('broken'), null)

console.log('designer learning backend domain checks passed')
