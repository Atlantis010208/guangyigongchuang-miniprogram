/**
 * 云函数：admin_quiz_save
 * 功能：新增 / 更新题目集
 * 权限：仅管理员
 *
 * 入参：
 *   { id?: string, data: QuizPayload }
 *   - id 存在 → 更新；不存在 → 新增
 *
 * QuizPayload 字段（白名单）：
 *   title, courseId?, lessonRef?, description?,
 *   questions[], passScore, shuffleQuestions?, shuffleOptions?, status
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_TYPES = ['single', 'multiple', 'judge']
const VALID_STATUS = ['draft', 'published']

/** 校验单道题目，返回错误信息字符串；通过返回 null */
function validateQuestion(q, index) {
  const prefix = `第 ${index + 1} 题`
  if (!q || typeof q !== 'object') return `${prefix} 数据缺失`
  if (!q.id || typeof q.id !== 'string') return `${prefix} 缺少 id`
  if (!VALID_TYPES.includes(q.type)) return `${prefix} 类型必须是 single/multiple/judge`
  if (!q.stem || typeof q.stem !== 'string' || !q.stem.trim()) return `${prefix} 题干不能为空`
  if (!Array.isArray(q.options) || q.options.length < 2) return `${prefix} 至少需要 2 个选项`
  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i]
    if (!opt || !opt.key || !opt.text) return `${prefix} 第 ${i + 1} 个选项缺少 key 或 text`
  }
  if (!Array.isArray(q.correctAnswer) || q.correctAnswer.length === 0) {
    return `${prefix} 必须设置至少 1 个正确答案`
  }
  if (q.type === 'multiple' && q.correctAnswer.length < 2) {
    return `${prefix} 多选题至少需要 2 个正确答案`
  }
  if ((q.type === 'single' || q.type === 'judge') && q.correctAnswer.length !== 1) {
    return `${prefix} 单选/判断题正确答案必须为 1 个`
  }
  // 正确答案必须是已有选项的 key
  const optionKeys = new Set(q.options.map(o => o.key))
  for (const ans of q.correctAnswer) {
    if (!optionKeys.has(ans)) return `${prefix} 正确答案 ${ans} 不在选项中`
  }
  if (typeof q.score !== 'number' || q.score <= 0) return `${prefix} 分值必须是正数`
  return null
}

/** 把前端传入的 payload 规范化为待写入数据库的对象 */
function normalizePayload(data) {
  const out = {}
  const fields = [
    'title', 'courseId', 'lessonRef', 'description',
    'shuffleQuestions', 'shuffleOptions', 'status'
  ]
  fields.forEach(f => {
    if (data[f] !== undefined) out[f] = data[f]
  })

  // status 兜底
  if (out.status && !VALID_STATUS.includes(out.status)) {
    out.status = 'draft'
  }

  // 题目数组
  if (Array.isArray(data.questions)) {
    out.questions = data.questions.map(q => ({
      id: String(q.id),
      type: q.type,
      stem: String(q.stem || '').trim(),
      imageUrls: Array.isArray(q.imageUrls) ? q.imageUrls : [],
      options: (q.options || []).map(opt => ({
        key: String(opt.key),
        text: String(opt.text || ''),
        imageUrl: opt.imageUrl || undefined
      })),
      correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [],
      explanation: q.explanation ? String(q.explanation) : '',
      score: typeof q.score === 'number' ? q.score : 10
    }))
    out.totalScore = out.questions.reduce((sum, q) => sum + (q.score || 0), 0)
  }

  // 及格分
  if (typeof data.passScore === 'number') {
    out.passScore = Math.max(0, Math.min(100, Math.round(data.passScore)))
  }

  return out
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

    const { id, data } = event
    if (!data || typeof data !== 'object') {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少题目集数据' }
    }

    // 题目逐题校验（如果传了 questions）
    if (Array.isArray(data.questions)) {
      for (let i = 0; i < data.questions.length; i++) {
        const errMsg = validateQuestion(data.questions[i], i)
        if (errMsg) {
          return { success: false, code: 'INVALID_QUESTION', errorMessage: errMsg }
        }
      }
    }

    const payload = normalizePayload(data)
    const now = Date.now()

    if (id) {
      // 更新
      payload.updatedAt = now
      const res = await db.collection('quizzes').doc(id).update({ data: payload })
      if (res.stats.updated === 0) {
        return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
      }
      return {
        success: true,
        code: 'OK',
        data: { id, questionCount: (payload.questions && payload.questions.length) || 0 },
        message: '题目集更新成功'
      }
    } else {
      // 新增：必填字段校验
      if (!payload.title || !payload.title.trim()) {
        return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少测试名称' }
      }
      if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
        return { success: false, code: 'INVALID_PARAMS', errorMessage: '至少需要 1 道题目' }
      }

      const insertData = {
        ...payload,
        quizId: `quiz_${now}_${Math.random().toString(36).substring(2, 8)}`,
        passScore: payload.passScore != null ? payload.passScore : 60,
        status: payload.status || 'draft',
        isDelete: 0,
        createdAt: now,
        updatedAt: now
      }
      const res = await db.collection('quizzes').add({ data: insertData })
      return {
        success: true,
        code: 'OK',
        data: { id: res._id, questionCount: insertData.questions.length },
        message: '题目集创建成功'
      }
    }
  } catch (err) {
    console.error('[admin_quiz_save] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
