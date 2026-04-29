/**
 * 云函数：quiz_attempt_get
 * 功能：获取作答记录（结果回放 + video-player 通过状态查询）
 * 鉴权：仅要求登录用户；只能读自己的 attempt
 *
 * 入参（二选一）：
 *   1) { attemptId: string }                 → 结果页拉取详情
 *   2) { quizId: string, bestOnly?: boolean } → video-player 查通过状态
 *      - bestOnly=true 返回得分最高的一条；否则返回最近一条
 *
 * 出参：
 *   - 路径 1：{ data: { attempt, quiz } }（quiz 含正确答案与解析）
 *   - 路径 2：{ data: { attempt, quiz } } 或 NOT_FOUND
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/** 取 quiz 完整数据（带答案/解析），用于结果页展示 */
async function fetchQuizFull(quizId) {
  if (!quizId) return null
  try {
    const res = await db.collection('quizzes').doc(quizId).get()
    return res && res.data ? res.data : null
  } catch (e) {
    return null
  }
}

/** 把 quiz 转成结果页需要的精简结构 */
function buildQuizForResult(quiz) {
  if (!quiz) return null
  return {
    _id: quiz._id,
    quizId: quiz.quizId,
    title: quiz.title || '',
    description: quiz.description || '',
    passScore: quiz.passScore || 60,
    totalScore: quiz.totalScore || 0,
    questions: Array.isArray(quiz.questions) ? quiz.questions : []
  }
}

exports.main = async (event) => {
  try {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && (wxCtx.OPENID || wxCtx.openid)
    if (!openid) {
      return { success: false, code: 'UNAUTHORIZED', errorMessage: '请先登录' }
    }

    const { attemptId, quizId, bestOnly = false } = event || {}

    // 路径 1：按 attemptId 查询
    if (attemptId) {
      let attemptRes
      try {
        attemptRes = await db.collection('quiz_attempts').doc(attemptId).get()
      } catch (e) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '成绩不存在' }
      }
      const attempt = attemptRes && attemptRes.data
      if (!attempt) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '成绩不存在' }
      }
      // 越权校验：必须是本人的 attempt
      if (attempt.userId !== openid && attempt._openid !== openid) {
        return { success: false, code: 'FORBIDDEN', errorMessage: '无权查看该成绩' }
      }

      const quiz = await fetchQuizFull(attempt.quizId)
      return {
        success: true,
        code: 'OK',
        data: {
          attempt,
          quiz: buildQuizForResult(quiz)
        }
      }
    }

    // 路径 2：按 quizId 查询自己的 attempts
    if (quizId) {
      let q = db.collection('quiz_attempts')
        .where({ userId: openid, quizId })

      // bestOnly：先按 score 倒序；否则按 submittedAt 倒序
      if (bestOnly) {
        q = q.orderBy('score', 'desc').orderBy('submittedAt', 'desc')
      } else {
        q = q.orderBy('submittedAt', 'desc')
      }

      const res = await q.limit(1).get()
      const attempt = res.data && res.data[0]
      if (!attempt) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '尚无作答记录' }
      }

      // video-player 主要用 passed 字段，不需要完整 quiz；但仍带上以便复用
      const quiz = await fetchQuizFull(attempt.quizId)
      return {
        success: true,
        code: 'OK',
        data: {
          attempt,
          quiz: buildQuizForResult(quiz)
        }
      }
    }

    return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少查询参数' }
  } catch (err) {
    console.error('[quiz_attempt_get] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
