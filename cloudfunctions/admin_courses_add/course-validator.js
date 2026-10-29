'use strict'

const ARRAY_FIELDS = ['detailImages', 'images', 'benefits', 'highlights', 'swiperImages']
const LESSON_TYPES = ['video', 'file', 'quiz']

function validateCourseContent(course, options) {
  const publishing = Boolean(options && options.publishing)
  for (const field of ARRAY_FIELDS) {
    if (course[field] !== undefined && !Array.isArray(course[field])) return { ok: false, message: `${field} 必须是数组` }
    if (Array.isArray(course[field]) && course[field].length > (field === 'detailImages' || field === 'images' ? 20 : 50)) {
      return { ok: false, message: `${field} 数量超出限制` }
    }
  }
  if (course.chapters !== undefined && !Array.isArray(course.chapters)) return { ok: false, message: '课程章节必须是数组' }
  const chapters = Array.isArray(course.chapters) ? course.chapters : []
  if (chapters.length > 100) return { ok: false, message: '课程章节不能超过 100 个' }
  const lessonIds = new Set()
  let lessonCount = 0
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex]
    if (!chapter || typeof chapter !== 'object') return { ok: false, message: `第 ${chapterIndex + 1} 章格式不正确` }
    if (publishing && (typeof chapter.title !== 'string' || !chapter.title.trim())) return { ok: false, message: `第 ${chapterIndex + 1} 章缺少标题` }
    if (!Array.isArray(chapter.lessons)) return { ok: false, message: `第 ${chapterIndex + 1} 章课时必须是数组` }
    for (let lessonIndex = 0; lessonIndex < chapter.lessons.length; lessonIndex += 1) {
      lessonCount += 1
      if (lessonCount > 500) return { ok: false, message: '课程课时不能超过 500 个' }
      const lesson = chapter.lessons[lessonIndex]
      const position = `第 ${chapterIndex + 1} 章第 ${lessonIndex + 1} 课时`
      if (!lesson || typeof lesson !== 'object') return { ok: false, message: `${position}格式不正确` }
      const id = typeof lesson.id === 'string' ? lesson.id.trim() : ''
      const title = typeof lesson.title === 'string' ? lesson.title.trim() : ''
      if (!id) return { ok: false, message: `${position}缺少课时 ID` }
      if (!title) return { ok: false, message: `${position}缺少标题` }
      if (!LESSON_TYPES.includes(lesson.type)) return { ok: false, message: `${position}类型不正确` }
      if (lessonIds.has(id)) return { ok: false, message: `课时 ID 重复：${id}` }
      lessonIds.add(id)
      if (lesson.questionCount !== undefined && (!Number.isInteger(Number(lesson.questionCount)) || Number(lesson.questionCount) < 0)) {
        return { ok: false, message: `${position}题目数量不合法` }
      }
      if (lesson.passScore !== undefined && (Number(lesson.passScore) < 0 || Number(lesson.passScore) > 100)) {
        return { ok: false, message: `${position}及格分必须在 0-100 之间` }
      }
    }
  }
  return { ok: true }
}

module.exports = { validateCourseContent }
