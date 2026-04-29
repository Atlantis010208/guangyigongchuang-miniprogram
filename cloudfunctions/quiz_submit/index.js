/**
 * 云函数：quiz_submit
 * 功能：服务端判分并写入 quiz_attempts 集合
 * 鉴权：仅要求登录用户（OPENID 不为空）
 *
 * 入参：
 *   {
 *     quizId: string,
 *     courseId?: string,
 *     lessonRef?: string,
 *     startedAt: number,
 *     answers: Array<{ questionId: string, selected: string[] }>
 *   }
 *
 * 判分规则（决策 2A — 全对才得分）：
 *   - single / judge：唯一选项命中正确答案得满分，否则 0
 *   - multiple：选项集合与正确答案集合完全相同得满分，否则 0
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/** 数组完全相等（顺序无关） */
function arrayEqualUnordered(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false
  }
  return true
}

/** 单道题判分，返回 { isCorrect, earned } */
function judgeQuestion(q, selected) {
  const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer : []
  const sel = Array.isArray(selected) ? selected : []
  const score = typeof q.score === 'number' ? q.score : 0

  if (q.type === 'single' || q.type === 'judge') {
    const isCorrect = sel.length === 1 && correct.length === 1 && sel[0] === correct[0]
    return { isCorrect, earned: isCorrect ? score : 0 }
  }
  if (q.type === 'multiple') {
    const isCorrect = arrayEqualUnordered(sel, correct)
    return { isCorrect, earned: isCorrect ? score : 0 }
  }
  // 未知题型按错处理
  return { isCorrect: false, earned: 0 }
}

exports.main = async (event) => {
  try {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && (wxCtx.OPENID || wxCtx.openid)
    if (!openid) {
      return { success: false, code: 'UNAUTHORIZED', errorMessage: '请先登录' }
    }

    const {
      quizId,
      courseId,
      lessonRef,
      startedAt,
      answers
    } = event || {}

    // 入参校验
    if (!quizId || typeof quizId !== 'string') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少题目集 ID' }
    }
    if (!Array.isArray(answers)) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '答题数据格式错误' }
    }

    // 读 quiz
    let quizRes
    try {
      quizRes = await db.collection('quizzes').doc(quizId).get()
    } catch (err) {
      console.warn('[quiz_submit] quiz not found:', err.message)
      return { success: false, code: 'QUIZ_NOT_FOUND', errorMessage: '题目集不存在' }
    }

    const quiz = quizRes && quizRes.data
    if (!quiz || quiz.isDelete === 1) {
      return { success: false, code: 'QUIZ_NOT_FOUND', errorMessage: '题目集不存在' }
    }

    const questions = Array.isArray(quiz.questions) ? quiz.questions : []
    if (questions.length === 0) {
      return { success: false, code: 'INVALID_QUIZ', errorMessage: '题目集没有题目' }
    }

    // 把前端 answers 整理成 questionId → selected 的索引
    const userAnswerMap = new Map()
    for (const a of answers) {
      if (a && typeof a.questionId === 'string') {
        userAnswerMap.set(a.questionId, Array.isArray(a.selected) ? a.selected.map(String) : [])
      }
    }

    // 逐题判分
    let totalScore = 0
    let earnedScore = 0
    const detail = []
    for (const q of questions) {
      const userSel = userAnswerMap.get(q.id) || []
      const { isCorrect, earned } = judgeQuestion(q, userSel)
      const qScore = typeof q.score === 'number' ? q.score : 0
      totalScore += qScore
      earnedScore += earned
      detail.push({
        questionId: q.id,
        selected: userSel,
        isCorrect,
        earned
      })
    }

    const passScore = typeof quiz.passScore === 'number' ? quiz.passScore : 60
    const passed = earnedScore >= passScore

    // 兜底 startedAt（防止前端没传或脏数据）
    const now = Date.now()
    const safeStartedAt = (typeof startedAt === 'number' && startedAt > 0 && startedAt <= now)
      ? startedAt
      : now

    const attemptDoc = {
      userId: openid,             // 与 _openid 一致，便于业务查询
      quizId,
      courseId: courseId || quiz.courseId || '',
      lessonRef: lessonRef || quiz.lessonRef || '',
      answers: detail,
      score: earnedScore,
      totalScore,
      passScore,
      passed,
      startedAt: safeStartedAt,
      submittedAt: now,
      durationSec: Math.max(0, Math.round((now - safeStartedAt) / 1000)),
      // 元信息快照（防止 quiz 后续被改名后历史记录丢失）
      quizTitleSnapshot: quiz.title || '',
      questionCountSnapshot: questions.length
    }

    const addRes = await db.collection('quiz_attempts').add({ data: attemptDoc })

    return {
      success: true,
      code: 'OK',
      data: {
        attemptId: addRes._id,
        score: earnedScore,
        totalScore,
        passed
      },
      message: passed ? '提交成功，已通过' : '提交成功'
    }
  } catch (err) {
    console.error('[quiz_submit] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
