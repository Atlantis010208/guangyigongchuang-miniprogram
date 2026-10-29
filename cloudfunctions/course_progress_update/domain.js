'use strict'

const crypto = require('crypto')

function number(value, fallback) {
  const result = Number(value)
  return Number.isFinite(result) ? result : (fallback || 0)
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(number(value, 0))))
}

function videoLessonIds(chapters) {
  const ids = []
  const seen = new Set()
  ;(Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
    ;(chapter && Array.isArray(chapter.lessons) ? chapter.lessons : []).forEach((lesson) => {
      const id = lesson && typeof lesson.id === 'string' ? lesson.id.trim() : ''
      if (lesson && lesson.type === 'video' && id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    })
  })
  return ids
}

function stableRecordId(openid, courseId) {
  return `cp_${crypto.createHash('sha256').update(`${openid}:${courseId}`).digest('hex').slice(0, 48)}`
}

function normalizeLessonProgressMap(value, validIds) {
  const source = value && typeof value === 'object' ? value : {}
  const valid = new Set(validIds)
  const output = {}
  Object.keys(source).forEach((lessonId) => {
    if (!valid.has(lessonId) || !source[lessonId] || typeof source[lessonId] !== 'object') return
    const progress = clampProgress(source[lessonId].progress)
    const completed = source[lessonId].isCompleted === true || progress >= 100
    output[lessonId] = {
      progress: completed ? 100 : progress,
      lastWatchedAt: source[lessonId].lastWatchedAt || null,
      isCompleted: completed
    }
  })
  return output
}

function calculateOverallProgress(validIds, lessonProgress) {
  if (!validIds.length) return 0
  const total = validIds.reduce((sum, lessonId) => sum + clampProgress(lessonProgress[lessonId] && lessonProgress[lessonId].progress), 0)
  return clampProgress(total / validIds.length)
}

function completedLessonIds(validIds, lessonProgress) {
  return validIds.filter(lessonId => lessonProgress[lessonId] && lessonProgress[lessonId].isCompleted === true)
}

module.exports = {
  clampProgress,
  videoLessonIds,
  stableRecordId,
  normalizeLessonProgressMap,
  calculateOverallProgress,
  completedLessonIds
}
