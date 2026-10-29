'use strict'

const cloud = require('wx-server-sdk')
const domain = require('./domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function error(code, message) {
  return { success: false, code, errorMessage: message, message }
}

async function findCourseByBusinessId(courseId) {
  const result = await db.collection('courses').where({ courseId }).limit(1).get()
  return result.data && result.data[0] || null
}

async function findCourseByDocumentId(courseId) {
  try {
    const result = await db.collection('courses').doc(courseId).get()
    return result.data || null
  } catch (_) {
    return null
  }
}

async function findCourse(courseId) {
  return await findCourseByBusinessId(courseId) || await findCourseByDocumentId(courseId)
}

function aliasesForCourse(course) {
  return Array.from(new Set([course && course.courseId, course && course._id].filter(value => typeof value === 'string' && value)))
}

async function findExistingProgress(openid, course) {
  const aliases = aliasesForCourse(course)
  const courseCondition = aliases.length === 1
    ? { courseId: aliases[0] }
    : _.or(aliases.map(courseId => ({ courseId })))
  const result = await db.collection('course_progress')
    .where(_.and([{ userId: openid }, courseCondition]))
    .limit(10)
    .get()
  const rows = result.data || []
  rows.sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
  if (rows.length > 1) console.warn('[course_progress_update] duplicate historical records', { courseId: course.courseId || course._id, count: rows.length })
  return rows[0] || null
}

exports.main = async (event) => {
  try {
    const context = cloud.getWXContext()
    const openid = context.OPENID || context.openid
    if (!openid) return error('UNAUTHENTICATED', '请先登录')

    const courseId = typeof event.courseId === 'string' ? event.courseId.trim() : ''
    const lessonId = typeof event.lessonId === 'string' ? event.lessonId.trim() : ''
    const action = event.action || 'update'
    if (!courseId || courseId.length > 128 || !lessonId || lessonId.length > 128) return error('INVALID_PARAMS', '课程 ID 或课时 ID 不合法')
    if (!['update', 'complete'].includes(action)) return error('INVALID_PARAMS', '进度操作类型不合法')

    const course = await findCourse(courseId)
    if (!course) return error('COURSE_NOT_FOUND', '课程不存在')
    if (course.status !== 'published' || Number(course.isDelete) === 1) return error('COURSE_NOT_AVAILABLE', '课程暂不可用')

    const validLessonIds = domain.videoLessonIds(course.chapters)
    if (!validLessonIds.includes(lessonId)) return error('LESSON_NOT_FOUND', '课时不存在或暂不可学习')

    const canonicalCourseId = course.courseId || course._id
    const existing = await findExistingProgress(openid, course)
    const now = new Date()
    const lessonProgress = domain.normalizeLessonProgressMap(existing && existing.lessonProgress, validLessonIds)
    const oldLesson = lessonProgress[lessonId]
    const requestedProgress = action === 'complete' ? 100 : domain.clampProgress(event.lessonProgress)
    const isCompleted = action === 'complete' || requestedProgress >= 95 || Boolean(oldLesson && oldLesson.isCompleted)
    lessonProgress[lessonId] = {
      progress: isCompleted ? 100 : requestedProgress,
      lastWatchedAt: now,
      isCompleted
    }

    const completedLessons = domain.completedLessonIds(validLessonIds, lessonProgress)
    const progress = domain.calculateOverallProgress(validLessonIds, lessonProgress)
    const payload = {
      userId: openid,
      courseId: canonicalCourseId,
      progress,
      completedLessons,
      lessonProgress,
      totalLessons: validLessonIds.length,
      lastLessonId: lessonId,
      lastLessonProgress: lessonProgress[lessonId].progress,
      updatedAt: now
    }

    if (existing) {
      await db.collection('course_progress').doc(existing._id).update({ data: payload })
    } else {
      payload.createdAt = now
      await db.collection('course_progress').doc(domain.stableRecordId(openid, canonicalCourseId)).set({ data: payload })
    }

    return {
      success: true,
      code: 'OK',
      data: {
        courseId: canonicalCourseId,
        progress,
        completedLessons,
        totalLessons: validLessonIds.length,
        lastLessonId: lessonId,
        lastLessonProgress: lessonProgress[lessonId].progress
      },
      message: '更新学习进度成功'
    }
  } catch (exception) {
    console.error('[course_progress_update] Error:', exception)
    return error('INTERNAL_ERROR', '学习进度保存失败，请稍后重试')
  }
}

exports._test = { aliasesForCourse, error }
