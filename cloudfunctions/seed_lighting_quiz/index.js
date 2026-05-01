/**
 * 云函数：seed_lighting_quiz
 * 功能：把业主端「灯光设计认知与判断力测试」的题库（30 题完整版 + 10 题快测版）幂等写入 quizzes 集合
 * 触发：仅由后台 / MCP / cloudbase 控制台手动调用，不暴露给小程序端
 *
 * 入参：
 *   {
 *     forceUpdate?: boolean = true,   // 已存在时是否覆盖白名单字段
 *     dryRun?: boolean = false,       // true 时只校验 + 返回概要，不真写库
 *     targetQuizId?: string           // 可选，仅处理指定 quizId 的 seed；不传则全部处理
 *   }
 *
 * 返回：
 *   {
 *     success,
 *     code,
 *     errorMessage?,
 *     data?: {
 *       results: [{ action, docId, quizId, questionCount, totalScore }, ...]
 *     }
 *   }
 *
 * 数据来源（多版本）：
 *   ./data/lighting-cognition-final-v1.json   30 题完整版
 *   ./data/lighting-cognition-quick-v1.json   10 题快测版
 */
const cloud = require('wx-server-sdk')
const fullSeed = require('./data/lighting-cognition-final-v1.json')
const quickSeed = require('./data/lighting-cognition-quick-v1.json')

// seed 数组，按业务排序（完整版在前、快测版在后）
const SEEDS = [fullSeed, quickSeed]

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_TYPES = ['single', 'multiple', 'judge']
const VALID_STATUS = ['draft', 'published']
const VALID_MODULES = ['dao', 'shu', 'biaozhun']

class SeedValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SeedValidationError'
  }
}

/** 校验单道题，通过返回 null，否则返回错误描述 */
function validateQuestion(q, index) {
  const prefix = `第 ${index + 1} 题（${q && q.id ? q.id : '无 id'}）`
  if (!q || typeof q !== 'object') return `${prefix} 数据缺失`
  if (!q.id || typeof q.id !== 'string') return `${prefix} 缺少 id`
  if (!VALID_TYPES.includes(q.type)) return `${prefix} type 必须是 ${VALID_TYPES.join('/')}`
  if (q.module && !VALID_MODULES.includes(q.module)) {
    return `${prefix} module 必须是 ${VALID_MODULES.join('/')}`
  }
  if (!q.stem || typeof q.stem !== 'string' || !q.stem.trim()) return `${prefix} 题干为空`
  if (!Array.isArray(q.options) || q.options.length < 2) {
    return `${prefix} 至少需要 2 个选项`
  }
  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i]
    if (!opt || !opt.key || !opt.text) {
      return `${prefix} 第 ${i + 1} 个选项缺少 key 或 text`
    }
  }
  if (!Array.isArray(q.correctAnswer) || q.correctAnswer.length === 0) {
    return `${prefix} 必须设置至少 1 个正确答案`
  }
  if (q.type === 'multiple' && q.correctAnswer.length < 2) {
    return `${prefix} 多选题至少 2 个正确答案`
  }
  if ((q.type === 'single' || q.type === 'judge') && q.correctAnswer.length !== 1) {
    return `${prefix} 单选/判断题正确答案必须为 1 个`
  }
  // 正确答案必须是 options 中的 key
  const optionKeys = new Set(q.options.map((o) => o.key))
  for (const ans of q.correctAnswer) {
    if (!optionKeys.has(ans)) return `${prefix} 正确答案 ${ans} 不在选项中`
  }
  if (typeof q.score !== 'number' || q.score <= 0) {
    return `${prefix} score 必须是正数`
  }
  return null
}

/** 校验整份 seed，失败抛 SeedValidationError */
function validateSeed(data) {
  if (!data || typeof data !== 'object') {
    throw new SeedValidationError('seed 数据为空')
  }
  if (!data.quizId || typeof data.quizId !== 'string') {
    throw new SeedValidationError('seed 缺少 quizId')
  }
  if (!data.title || typeof data.title !== 'string') {
    throw new SeedValidationError('seed 缺少 title')
  }
  if (data.status && !VALID_STATUS.includes(data.status)) {
    throw new SeedValidationError(`seed.status 必须是 ${VALID_STATUS.join('/')}`)
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new SeedValidationError('seed.questions 必须是非空数组')
  }

  let totalScore = 0
  for (let i = 0; i < data.questions.length; i++) {
    const errMsg = validateQuestion(data.questions[i], i)
    if (errMsg) throw new SeedValidationError(errMsg)
    totalScore += data.questions[i].score
  }

  // totalScore 一致性校验：若 seed 写了 totalScore，则必须等于实际累加值
  if (typeof data.totalScore === 'number' && data.totalScore !== totalScore) {
    throw new SeedValidationError(
      `seed.totalScore (${data.totalScore}) 与题目分值之和 (${totalScore}) 不一致`
    )
  }

  return { totalScore, questionCount: data.questions.length }
}

/** 把 seed 规范化为待写入数据库的对象（白名单字段） */
function normalizeSeed(data, totalScore) {
  return {
    quizId: data.quizId,
    category: data.category || '',
    title: String(data.title).trim(),
    description: data.description ? String(data.description) : '',
    passScore: typeof data.passScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(data.passScore)))
      : 60,
    totalScore,
    status: data.status || 'draft',
    shuffleQuestions: !!data.shuffleQuestions,
    shuffleOptions: !!data.shuffleOptions,
    questions: data.questions.map((q) => ({
      id: String(q.id),
      module: q.module || '',
      type: q.type,
      stem: String(q.stem).trim(),
      imageUrls: Array.isArray(q.imageUrls) ? q.imageUrls : [],
      options: q.options.map((opt) => ({
        key: String(opt.key),
        text: String(opt.text || ''),
        ...(opt.imageUrl ? { imageUrl: opt.imageUrl } : {})
      })),
      correctAnswer: q.correctAnswer.map(String),
      explanation: q.explanation ? String(q.explanation) : '',
      score: q.score
    }))
  }
}

/**
 * 处理单个 seed：校验 → 查重 → upsert
 * @returns {Promise<{ action, docId, quizId, questionCount, totalScore }>}
 */
async function processSeed(seed, { forceUpdate, dryRun }) {
  // 1. 校验 seed
  const { totalScore, questionCount } = validateSeed(seed)
  const payload = normalizeSeed(seed, totalScore)

  // 2. 按 quizId 查重
  const existRes = await db.collection('quizzes')
    .where({ quizId: payload.quizId })
    .limit(1)
    .get()

  const now = Date.now()

  // 2a. 不存在 → add
  if (!existRes.data || existRes.data.length === 0) {
    if (dryRun) {
      console.log('[seed_lighting_quiz] dryRun: would create new quiz', payload.quizId)
      return {
        action: 'created',
        docId: '<dry-run>',
        quizId: payload.quizId,
        questionCount,
        totalScore
      }
    }
    const insertData = {
      ...payload,
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
    const addRes = await db.collection('quizzes').add({ data: insertData })
    console.log(`[seed_lighting_quiz] inserted: ${addRes._id} (${payload.quizId})`)
    return {
      action: 'created',
      docId: addRes._id,
      quizId: payload.quizId,
      questionCount,
      totalScore
    }
  }

  // 2b. 存在 → update（仅当 forceUpdate=true）
  const docId = existRes.data[0]._id
  if (!forceUpdate) {
    console.log(`[seed_lighting_quiz] noop: ${docId} (${payload.quizId}) exists and forceUpdate=false`)
    return {
      action: 'noop',
      docId,
      quizId: payload.quizId,
      questionCount,
      totalScore
    }
  }

  const updateData = {
    title: payload.title,
    description: payload.description,
    category: payload.category,
    passScore: payload.passScore,
    totalScore: payload.totalScore,
    status: payload.status,
    shuffleQuestions: payload.shuffleQuestions,
    shuffleOptions: payload.shuffleOptions,
    questions: payload.questions,
    isDelete: 0,
    updatedAt: now
  }

  if (dryRun) {
    console.log(`[seed_lighting_quiz] dryRun: would update ${docId} (${payload.quizId}) with ${questionCount} questions`)
    return {
      action: 'updated',
      docId,
      quizId: payload.quizId,
      questionCount,
      totalScore
    }
  }

  await db.collection('quizzes').doc(docId).update({ data: updateData })
  console.log(`[seed_lighting_quiz] updated: ${docId} (${payload.quizId}, ${questionCount} questions)`)
  return {
    action: 'updated',
    docId,
    quizId: payload.quizId,
    questionCount,
    totalScore
  }
}

exports.main = async (event) => {
  const { forceUpdate = true, dryRun = false, targetQuizId } = event || {}

  try {
    // 选择待处理 seed：传 targetQuizId 时仅处理对应版本，否则全部处理
    const seedsToProcess = targetQuizId
      ? SEEDS.filter((s) => s.quizId === targetQuizId)
      : SEEDS

    if (seedsToProcess.length === 0) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: `未找到 quizId=${targetQuizId} 对应的 seed`
      }
    }

    // 串行处理每个 seed（保证日志顺序与失败可定位；总量小，不需要并行）
    const results = []
    for (const seed of seedsToProcess) {
      const r = await processSeed(seed, { forceUpdate, dryRun })
      results.push(r)
    }

    return {
      success: true,
      code: 'OK',
      data: { results }
    }
  } catch (err) {
    if (err instanceof SeedValidationError) {
      console.error('[seed_lighting_quiz] validation error:', err.message)
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: err.message
      }
    }
    console.error('[seed_lighting_quiz] server error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
