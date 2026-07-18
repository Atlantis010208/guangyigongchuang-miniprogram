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

    // 读题目集：先按 _id 查；失败时回退按业务 quizId 字段查
    // 兼容业主端「灯光测试」用稳定业务 ID（如 lighting-cognition-final-v1）调用的场景
    let quiz = null
    try {
      const docRes = await db.collection('quizzes').doc(quizId).get()
      quiz = docRes && docRes.data
    } catch (err) {
      // doc 不存在 / quizId 不是 ObjectId 形态时云开发会抛错；回退按业务 quizId 字段查
      try {
        const wRes = await db.collection('quizzes')
          .where({ quizId, isDelete: _.neq(1) })
          .limit(1)
          .get()
        if (wRes.data && wRes.data.length > 0) {
          quiz = wRes.data[0]
        }
      } catch (e2) {
        console.warn('[quiz_detail] fallback query failed:', e2.message)
      }
    }

    if (!quiz) {
      console.warn('[quiz_detail] quiz not found by id or quizId field:', quizId)
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
      category: quiz.category || '',           // 业务类型，前端按此分流跳转结果页（'' = 课程作业 / 'lighting-cognition' = 业主灯光测试）
      title: quiz.title,
      description: quiz.description || '',
      passScore: quiz.passScore || 60,
      totalScore: quiz.totalScore || 0,
      shuffleQuestions: quiz.shuffleQuestions === true, // 题目顺序打乱标志（前端按需洗牌）
      shuffleOptions: quiz.shuffleOptions === true,     // 选项顺序打乱标志（前端按需洗牌，判断题豁免在前端实现）
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
