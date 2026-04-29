/**
 * 云函数：quiz_detail
 * 功能：获取题目集（去答案、去解析）
 * 鉴权：仅要求登录用户（OPENID 不为空）
 *
 * 入参：{ quizId: string }
 * 出参：{ success, code, errorMessage?, data? }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/** 剔除题目中的答案与解析字段 */
function stripAnswers(question) {
  if (!question) return question
  const { correctAnswer, explanation, ...safe } = question
  return safe
}

exports.main = async (event) => {
  try {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && (wxCtx.OPENID || wxCtx.openid)
    if (!openid) {
      return { success: false, code: 'UNAUTHORIZED', errorMessage: '请先登录' }
    }

    const { quizId } = event || {}
    if (!quizId || typeof quizId !== 'string') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少题目集 ID' }
    }

    // 读题目集（quizId 为 _id）
    let res
    try {
      res = await db.collection('quizzes').doc(quizId).get()
    } catch (err) {
      // doc 不存在时云开发会抛错
      console.warn('[quiz_detail] doc not found:', err.message)
      return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
    }

    const quiz = res && res.data
    if (!quiz) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
    }

    // 软删除校验
    if (quiz.isDelete === 1) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '题目集已被删除' }
    }

    // 发布状态校验
    if (quiz.status !== 'published') {
      return {
        success: false,
        code: 'QUIZ_NOT_PUBLISHED',
        errorMessage: '题目集尚未发布或已下架'
      }
    }

    // 构造去答案版本
    const safeQuiz = {
      _id: quiz._id,
      quizId: quiz.quizId,
      title: quiz.title,
      description: quiz.description || '',
      passScore: quiz.passScore || 60,
      totalScore: quiz.totalScore || 0,
      courseId: quiz.courseId,
      lessonRef: quiz.lessonRef,
      questions: Array.isArray(quiz.questions) ? quiz.questions.map(stripAnswers) : []
    }

    return {
      success: true,
      code: 'OK',
      data: safeQuiz,
      message: '获取题目集成功'
    }
  } catch (err) {
    console.error('[quiz_detail] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
