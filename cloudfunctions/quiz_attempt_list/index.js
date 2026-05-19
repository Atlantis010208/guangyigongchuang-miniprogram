/**
 * 云函数：quiz_attempt_list
 * 功能：查询当前用户在指定 quizId 下的历史作答记录列表
 * 鉴权：仅允许查询本人记录（openid 校验）
 *
 * 入参：
 *   { quizId: string, limit?: number }
 *   quizId  必填，单次查询一个版本
 *   limit   可选，默认 50，最大 50
 *
 * 出参（成功）：
 *   { success: true, code: 'OK', data: { attempts: AttemptSummary[] } }
 *
 * AttemptSummary 字段（不含完整 answers，减少数据量）：
 *   _id, quizId, score, totalScore, passed, submittedAt, durationSec
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && (wxCtx.OPENID || wxCtx.openid)
    if (!openid) {
      return { success: false, code: 'UNAUTHORIZED', errorMessage: '请先登录' }
    }

    const { quizId, limit } = event || {}
    if (!quizId) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少 quizId 参数' }
    }

    const safeLimit = Math.min(typeof limit === 'number' && limit > 0 ? limit : 50, 50)

    // quiz_submit 写入时：quizId = quizzes._id（数据库ID），quizBusinessId = 业务稳定ID（如 lighting-cognition-final-v1）
    // 前端传来的是业务稳定 ID，需匹配 quizBusinessId 字段
    const res = await db.collection('quiz_attempts')
      .where({ userId: openid, quizBusinessId: quizId })
      .orderBy('submittedAt', 'desc')
      .limit(safeLimit)
      .field({
        _id: true,
        quizId: true,
        score: true,
        totalScore: true,
        passed: true,
        submittedAt: true,
        durationSec: true
      })
      .get()

    const attempts = (res && res.data) ? res.data : []

    return {
      success: true,
      code: 'OK',
      data: { attempts }
    }
  } catch (err) {
    console.error('[quiz_attempt_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
