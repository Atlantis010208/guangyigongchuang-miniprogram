'use strict'

const ACTIONS = Object.freeze(['introduction', 'catalog', 'history'])
const LESSON_TYPES = Object.freeze(['video', 'file', 'quiz'])

function text(value, fallback) {
  if (typeof value !== 'string') return fallback || ''
  const normalized = value.trim()
  return normalized || fallback || ''
}

function number(value, fallback) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : (fallback || 0)
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(number(value, 0))))
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(number(value, 0)))
}

function toMillis(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return toMillis(value.toDate())
  if (value instanceof Date) {
    const result = value.getTime()
    return Number.isFinite(result) ? result : null
  }
  const direct = Number(value)
  if (Number.isFinite(direct) && direct > 0) return direct
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function stringList(value, limit) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const output = []
  for (const item of value) {
    const normalized = text(item)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= (limit || 20)) break
  }
  return output
}

function validateRequest(event) {
  const action = text(event && event.action)
  const courseId = text(event && event.courseId)
  if (!ACTIONS.includes(action)) {
    return { ok: false, code: 'INVALID_ACTION', message: '不支持的学习内容操作' }
  }
  if (!courseId || courseId.length > 128) {
    return { ok: false, code: 'INVALID_PARAMS', message: '课程 ID 不合法' }
  }
  return { ok: true, action, courseId }
}

function canonicalCourseId(course) {
  return text(course && course.courseId) || text(course && course._id)
}

function getDetailImages(course) {
  const detailImages = stringList(course && course.detailImages, 20)
  if (detailImages.length) return detailImages
  const images = stringList(course && course.images, 20)
  if (images.length) return images
  const detailImage = text(course && course.detailImage)
  return detailImage ? [detailImage] : []
}

function getCover(course) {
  const swiperImages = stringList(course && course.swiperImages, 5)
  return text(course && course.cover) || text(course && course.coverUrl) || swiperImages[0] || ''
}

function buildIntroduction(course) {
  const instructor = course && typeof course.instructor === 'object' && course.instructor
    ? course.instructor
    : {}
  return {
    id: text(course && course._id),
    courseId: canonicalCourseId(course),
    title: text(course && course.title, '课程介绍'),
    subtitle: text(course && course.subtitle),
    description: text(course && course.description),
    coverUrl: getCover(course),
    detailImages: getDetailImages(course),
    instructor: {
      name: text(course && course.instructorName) || text(instructor.name),
      avatarUrl: text(course && course.instructorAvatar) || text(instructor.avatarUrl) || text(instructor.avatar)
    },
    targetAudience: text(course && course.targetAudience),
    highlights: stringList(course && course.highlights, 20),
    benefits: stringList(course && course.benefits, 20)
  }
}

function sanitizeLesson(lesson, index, seenIds) {
  if (!lesson || typeof lesson !== 'object') return null
  const id = text(lesson.id)
  const title = text(lesson.title)
  const type = text(lesson.type)
  if (!id || !title || !LESSON_TYPES.includes(type) || seenIds.has(id)) return null
  seenIds.add(id)
  const output = { id, index, title, type }
  if (type === 'video') output.duration = text(lesson.duration)
  if (type === 'file') output.format = text(lesson.format)
  if (type === 'quiz') {
    output.questionCount = nonNegativeInteger(lesson.questionCount)
    output.passScore = Math.max(0, Math.min(100, nonNegativeInteger(lesson.passScore || 60)))
  }
  return output
}

function buildCatalog(course) {
  const rawChapters = Array.isArray(course && course.chapters) ? course.chapters : []
  const seenIds = new Set()
  const chapters = []
  let totalLessons = 0
  rawChapters.forEach((chapter, chapterOffset) => {
    if (!chapter || typeof chapter !== 'object') return
    const lessons = []
    const rawLessons = Array.isArray(chapter.lessons) ? chapter.lessons : []
    rawLessons.forEach((lesson) => {
      const sanitized = sanitizeLesson(lesson, lessons.length + 1, seenIds)
      if (sanitized) lessons.push(sanitized)
    })
    totalLessons += lessons.length
    chapters.push({
      index: chapterOffset + 1,
      title: text(chapter.title, `第${chapterOffset + 1}章`),
      lessonCount: lessons.length,
      lessons
    })
  })
  return {
    id: text(course && course._id),
    courseId: canonicalCourseId(course),
    title: text(course && course.title, '课程目录'),
    totalLessons,
    chapters
  }
}

function buildLessonIndex(course) {
  const catalog = buildCatalog(course)
  const index = Object.create(null)
  catalog.chapters.forEach((chapter) => {
    chapter.lessons.forEach((lesson) => {
      index[lesson.id] = {
        lessonTitle: lesson.title,
        chapterTitle: chapter.title,
        type: lesson.type
      }
    })
  })
  return { catalog, index }
}

function buildHistory(course, record, limit) {
  const result = buildLessonIndex(course)
  const lessonProgress = record && record.lessonProgress && typeof record.lessonProgress === 'object'
    ? record.lessonProgress
    : {}
  const records = []
  Object.keys(lessonProgress).forEach((lessonId) => {
    const metadata = result.index[lessonId]
    const raw = lessonProgress[lessonId]
    if (!metadata || !raw || typeof raw !== 'object') return
    const progress = clampProgress(raw.progress)
    const isCompleted = raw.isCompleted === true || progress >= 100
    records.push({
      lessonId,
      lessonTitle: metadata.lessonTitle,
      chapterTitle: metadata.chapterTitle,
      progress: isCompleted ? 100 : progress,
      isCompleted,
      lastWatchedAt: toMillis(raw.lastWatchedAt)
    })
  })
  records.sort((left, right) => (right.lastWatchedAt || 0) - (left.lastWatchedAt || 0))
  const limited = records.slice(0, Math.max(1, Math.min(20, nonNegativeInteger(limit || 20))))
  const requestedLastLessonId = text(record && record.lastLessonId)
  const lastLessonId = result.index[requestedLastLessonId] ? requestedLastLessonId : ''
  const lastRecord = limited.find(item => item.lessonId === lastLessonId) || limited[0]
  return {
    courseId: canonicalCourseId(course),
    progress: clampProgress(record && record.progress),
    totalLessons: nonNegativeInteger(record && record.totalLessons) || result.catalog.totalLessons,
    completedCount: records.filter(item => item.isCompleted).length,
    lastLessonId,
    lastWatchedAt: lastRecord && lastRecord.lastWatchedAt || toMillis(record && record.updatedAt),
    records: limited
  }
}

function collectCloudFileIds(value, output) {
  const target = output || new Set()
  if (typeof value === 'string' && value.startsWith('cloud://')) target.add(value)
  else if (Array.isArray(value)) value.forEach(item => collectCloudFileIds(item, target))
  else if (value && typeof value === 'object') Object.keys(value).forEach(key => collectCloudFileIds(value[key], target))
  return target
}

function replaceCloudUrls(value, urlMap) {
  if (typeof value === 'string') return value.startsWith('cloud://') ? (urlMap[value] || '') : value
  if (Array.isArray(value)) return value.map(item => replaceCloudUrls(item, urlMap))
  if (!value || typeof value !== 'object') return value
  const output = {}
  Object.keys(value).forEach((key) => { output[key] = replaceCloudUrls(value[key], urlMap) })
  return output
}

module.exports = {
  ACTIONS,
  LESSON_TYPES,
  text,
  clampProgress,
  nonNegativeInteger,
  toMillis,
  stringList,
  validateRequest,
  canonicalCourseId,
  buildIntroduction,
  buildCatalog,
  buildLessonIndex,
  buildHistory,
  collectCloudFileIds,
  replaceCloudUrls
}
