/**
 * 云函数：admin_quiz_delete
 * 功能：删除题目集（软删除）+ 清理引用该题目集的课程章节中 lesson.quizId
 * 权限：仅管理员
 *
 * 入参：{ id: string, hardDelete?: boolean }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 在某个课程的 chapters 中清空所有引用 quizId 的 lesson
 * 返回是否有变更
 */
function cleanCourseChapters(course, quizId) {
  if (!course || !Array.isArray(course.chapters)) return { changed: false, chapters: course.chapters }
  let changed = false
  const newChapters = course.chapters.map(ch => {
    if (!ch || !Array.isArray(ch.lessons)) return ch
    const newLessons = ch.lessons.map(l => {
      if (l && l.type === 'quiz' && l.quizId === quizId) {
        changed = true
        const { quizId: _q, questionCount: _qc, ...rest } = l
        return rest
      }
      return l
    })
    return { ...ch, lessons: newLessons }
  })
  return { changed, chapters: newChapters }
}

exports.main = async (event) => {
  try {
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }

    const { id, hardDelete = false } = event
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少题目集 ID' }
    }

    // 1. 软/硬删除 quizzes 文档
    if (hardDelete) {
      const res = await db.collection('quizzes').doc(id).remove()
      if (res.stats.removed === 0) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
      }
    } else {
      const res = await db.collection('quizzes').doc(id).update({
        data: { isDelete: 1, updatedAt: Date.now() }
      })
      if (res.stats.updated === 0) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
      }
    }

    // 2. 找出所有引用了该 quizId 的课程，把 lesson.quizId 清空
    let lessonsCleaned = 0
    let coursesUpdated = 0
    try {
      const courseRes = await db.collection('courses')
        .where({ isDelete: _.neq(1) })
        .field({ _id: true, chapters: true })
        .limit(200)
        .get()

      for (const course of (courseRes.data || [])) {
        const { changed, chapters } = cleanCourseChapters(course, id)
        if (changed) {
          // 统计本次清理的 lesson 数
          const before = (course.chapters || []).reduce((sum, ch) => sum + (ch.lessons || []).filter(l => l.type === 'quiz' && l.quizId === id).length, 0)
          lessonsCleaned += before
          await db.collection('courses').doc(course._id).update({
            data: { chapters, updatedAt: Date.now() }
          })
          coursesUpdated++
        }
      }
    } catch (e) {
      console.warn('[admin_quiz_delete] 清理 lesson.quizId 失败:', e.message)
    }

    return {
      success: true,
      code: 'OK',
      data: { deleted: 1, lessonsCleaned, coursesUpdated },
      message: '题目集删除成功'
    }
  } catch (err) {
    console.error('[admin_quiz_delete] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
