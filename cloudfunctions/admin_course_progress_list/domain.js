'use strict'

const ORDER_FIELDS = ['updatedAt', 'createdAt', 'progress']

function finite(value, fallback) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(finite(value, 0))))
}

function toMillis(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return toMillis(value.toDate())
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(result) ? result : null
}

function normalizeParams(event) {
  const orderBy = ORDER_FIELDS.includes(event && event.orderBy) ? event.orderBy : 'updatedAt'
  const order = event && event.order === 'asc' ? 'asc' : 'desc'
  return {
    courseId: typeof (event && event.courseId) === 'string' ? event.courseId.trim().slice(0, 128) : '',
    keyword: typeof (event && event.keyword) === 'string' ? event.keyword.trim().slice(0, 50) : '',
    orderBy,
    order,
    limit: Math.max(1, Math.min(100, Math.round(finite(event && event.limit, 20)))),
    offset: Math.max(0, Math.round(finite(event && event.offset, 0)))
  }
}

function lessonIndex(course) {
  const index = Object.create(null)
  ;(course && Array.isArray(course.chapters) ? course.chapters : []).forEach((chapter) => {
    ;(chapter && Array.isArray(chapter.lessons) ? chapter.lessons : []).forEach((lesson) => {
      if (!lesson || typeof lesson.id !== 'string' || !lesson.id || index[lesson.id]) return
      index[lesson.id] = { lessonTitle: lesson.title || lesson.id, chapterTitle: chapter.title || '' }
    })
  })
  return index
}

function formatRecord(record, user, course) {
  const index = lessonIndex(course)
  const completedLessons = []
  const learningLessons = []
  const rawMap = record && record.lessonProgress && typeof record.lessonProgress === 'object' ? record.lessonProgress : {}
  Object.keys(rawMap).forEach((lessonId) => {
    if (!index[lessonId] || !rawMap[lessonId] || typeof rawMap[lessonId] !== 'object') return
    const progress = clampProgress(rawMap[lessonId].progress)
    const isCompleted = rawMap[lessonId].isCompleted === true || progress >= 100
    const detail = {
      lessonId,
      lessonTitle: index[lessonId].lessonTitle,
      chapterTitle: index[lessonId].chapterTitle,
      progress: isCompleted ? 100 : progress,
      isCompleted,
      lastWatchedAt: toMillis(rawMap[lessonId].lastWatchedAt)
    }
    ;(isCompleted ? completedLessons : learningLessons).push(detail)
  })
  const sortLatest = (left, right) => (right.lastWatchedAt || 0) - (left.lastWatchedAt || 0)
  completedLessons.sort(sortLatest)
  learningLessons.sort(sortLatest)
  const lastLessonId = index[record.lastLessonId] ? record.lastLessonId : ''
  return {
    recordId: record._id,
    userId: user && user._id || '',
    nickname: user && (user.nickname || user.name) || '未知用户',
    avatarUrl: user && (user.avatarUrl || user.avatar) || '',
    courseId: record.courseId,
    courseName: course && course.title || '未知课程',
    courseCover: course && (course.cover || course.coverUrl) || '',
    progress: clampProgress(record.progress),
    totalLessons: Math.max(0, Math.round(finite(record.totalLessons, 0))),
    completedCount: completedLessons.length,
    completedLessons,
    learningLessons,
    lastLessonId,
    createdAt: toMillis(record.createdAt),
    updatedAt: toMillis(record.updatedAt)
  }
}

module.exports = { ORDER_FIELDS, normalizeParams, lessonIndex, formatRecord, clampProgress, toMillis }
