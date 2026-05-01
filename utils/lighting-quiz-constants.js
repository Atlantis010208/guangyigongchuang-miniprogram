/**
 * 业主端「灯光设计认知与判断力测试」共享常量
 * - QUIZ_ID_FULL / QUIZ_ID_QUICK：两个版本的业务侧稳定 ID
 * - QUIZ_ID（兼容别名）：默认指向完整版，供存量引用兼容
 * - QUIZ_VERSIONS：两个版本的 UI 元数据（label / title / subtitle / estimatedMinutes）
 * - LEVELS：4 段认知阶段配色 + 解读文案（严格按 docx 第五章原文）
 * - MODULE_META：道 / 术 / 标准 三个模块元数据
 * - pickLevel(score)：按分数取等级
 * - aggregateModuleScores(attempt, quiz)：按模块聚合得分 + 标记 best/worst
 * - shuffleQuizOptions(questions)：Fisher-Yates 选项洗牌（判断题豁免）
 *
 * 注意：本常量文件被 utils/* (CommonJS) 与小程序页面共同引用，统一使用 module.exports
 */

const QUIZ_ID_FULL = 'lighting-cognition-final-v1'
const QUIZ_ID_QUICK = 'lighting-cognition-quick-v1'

// 兑底别名：以前的代码仅考虑完整版，微调后几处 require QUIZ_ID 的位置仍可照常使用
const QUIZ_ID = QUIZ_ID_FULL

/**
 * 版本列表（UI 仅需、与后台题库独立）
 * - id：前端内部标识 ('full' | 'quick')，仅用于 tab 选中
 * - quizId：业务 ID，拉题 / 历史记录都用这个
 * - label：segmented tab 上的短名
 * - title / subtitle：介绍页 hero 区动态文案
 * - estimatedMinutes：meta-bar 展示的预计用时
 * - badge：segmented tab 右上角弱展示（可空）
 */
const QUIZ_VERSIONS = [
  {
    id: 'full',
    quizId: QUIZ_ID_FULL,
    label: '完整版',
    title: '灯光设计认知与判断力测试',
    subtitle: '从「道·术·标准」三个层面完整评估认知阶段',
    estimatedMinutes: 8,
    badge: '推荐'
  },
  {
    id: 'quick',
    quizId: QUIZ_ID_QUICK,
    label: '快测版',
    title: '灯光判断力快测（10 题）',
    subtitle: '3 分钟内快速评估你的灯光设计判断力',
    estimatedMinutes: 3,
    badge: ''
  }
]

const LEVELS = [
  {
    code: 'param-dependent',
    range: [0, 39],
    emoji: '🟥',
    name: '参数依赖型',
    mainColor: '#d93025',
    bgColor: '#ffe9e6',
    summary: '0–39 分｜参数型认知阶段',
    interpretation:
      '你相信数字，却还没真正理解光。你更在意亮不亮、够不够、达不达标，但这些只能保证「看得见」，无法保证「住得好」。当前问题：缺乏第一性判断，容易被灯具、品牌、效果图牵着走。建议方向：重建对「人—空间—光」的关系认知。'
  },
  {
    code: 'experience-imitate',
    range: [40, 59],
    emoji: '🟧',
    name: '经验模仿型',
    mainColor: '#d97706',
    bgColor: '#fff4e6',
    summary: '40–59 分｜经验型操作阶段',
    interpretation:
      '你做过不少项目，但判断还不稳定。你知道一些套路，也踩过一些坑，但更多依赖感觉和过往经验。当前问题：没有一套可反复验证的设计原则。建议方向：从「会做」升级到「为什么这么做」。'
  },
  {
    code: 'design-judgement',
    range: [60, 79],
    emoji: '🟨',
    name: '设计判断型',
    mainColor: '#1a73e8',
    bgColor: '#e6f0ff',
    summary: '60–79 分｜设计型判断阶段',
    interpretation:
      '你已经在用设计师的方式思考灯光。你开始关注生活、情绪与长期使用感，并能解释大部分设计选择。当前问题：判断体系还不够锋利。建议方向：建立更清晰的边界感与取舍能力。'
  },
  {
    code: 'principle-driven',
    range: [80, 100],
    emoji: '🟩',
    name: '原则主导型',
    mainColor: '#137333',
    bgColor: '#e6f4ea',
    summary: '80–100 分｜原则型设计阶段',
    interpretation:
      '你已经不再被方案牵着走，而是你在做判断。你清楚什么时候该加灯，什么时候必须停下来。当前状态：具备成熟灯光设计师的底层思维。建议方向：系统化输出你的判断体系，形成个人方法论。'
  }
]

const MODULE_META = {
  dao: { code: 'dao', name: '道（认知方向）', total: 30, idPrefix: 'd-' },
  shu: { code: 'shu', name: '术（落地工艺）', total: 40, idPrefix: 's-' },
  biaozhun: { code: 'biaozhun', name: '标准（判断尺度）', total: 30, idPrefix: 'j-' }
}

/**
 * 按分数挑选等级（默认兜底 LEVELS[0]）
 * @param {number} score
 * @returns {object} 等级对象
 */
function pickLevel(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0))
  const found = LEVELS.find((l) => s >= l.range[0] && s <= l.range[1])
  return found || LEVELS[0]
}

/**
 * 按 question.module 或 id 前缀派生题目所属模块
 * @param {object} q 题目对象
 * @returns {'dao'|'shu'|'biaozhun'|null}
 */
function deriveModuleCode(q) {
  if (!q) return null
  if (q.module && MODULE_META[q.module]) return q.module
  const id = String(q.id || '')
  if (id.startsWith(MODULE_META.dao.idPrefix)) return 'dao'
  if (id.startsWith(MODULE_META.shu.idPrefix)) return 'shu'
  if (id.startsWith(MODULE_META.biaozhun.idPrefix)) return 'biaozhun'
  return null
}

/**
 * 把 attempt + quiz 聚合为模块得分数组（含 best / worst 标记）
 * @param {object} attempt
 * @param {object} quiz
 * @returns {{ moduleScores: object[], allEqual: boolean }}
 */
function aggregateModuleScores(attempt, quiz) {
  const moduleEarned = { dao: 0, shu: 0, biaozhun: 0 }
  const moduleTotal = { dao: 0, shu: 0, biaozhun: 0 }
  const moduleQCount = { dao: 0, shu: 0, biaozhun: 0 }

  // 1. 题目 id → module 映射；同时累计每模块题数
  const idToModule = new Map()
  const questions = (quiz && Array.isArray(quiz.questions)) ? quiz.questions : []
  for (const q of questions) {
    const mod = deriveModuleCode(q)
    if (!mod) continue
    idToModule.set(q.id, mod)
    moduleTotal[mod] += Number(q.score) || 0
    moduleQCount[mod] += 1
  }

  // 2. 按 module 累加 earned
  const answers = (attempt && Array.isArray(attempt.answers)) ? attempt.answers : []
  for (const a of answers) {
    const mod = idToModule.get(a.questionId)
    if (!mod) continue
    moduleEarned[mod] += Number(a.earned) || 0
  }

  // 3. 兜底：若 quiz.questions 缺失（旧 attempt 直读情况），用 MODULE_META.total 兜底
  const codes = ['dao', 'shu', 'biaozhun']
  const moduleScores = codes.map((code) => {
    const total = moduleTotal[code] > 0 ? moduleTotal[code] : MODULE_META[code].total
    const earned = moduleEarned[code]
    const percent = total > 0 ? Math.round((earned / total) * 100) : 0
    const questionCount = moduleQCount[code]
    return {
      code,
      name: MODULE_META[code].name,
      earned,
      total,
      percent,
      questionCount,
      // 该模块题数 1（如 quick 版的 biaozhun 仅 1 题）→ 二元判分意义弱，UI 弱化
      fewSamples: questionCount === 1,
      // 该模块题数 0 → 兜底场景（应不会发生），UI 直接隐藏
      empty: questionCount === 0,
      status: 'normal'
    }
  })

  // 4. 标记 best / worst：仅在题量 >= 2 的模块之间评选
  //    questionCount=1 的模块得分率只有 0/100 两种结果，参与 best/worst 会产生误导
  const eligible = moduleScores.filter((m) => m.questionCount >= 2)
  const eligiblePercents = eligible.map((m) => m.percent)
  const allEqual = eligiblePercents.length === 0
    || eligiblePercents.every((p) => p === eligiblePercents[0])
  if (!allEqual && eligiblePercents.length >= 2) {
    const maxP = Math.max.apply(null, eligiblePercents)
    const minP = Math.min.apply(null, eligiblePercents)
    eligible.forEach((m) => {
      if (m.percent === maxP) m.status = 'best'
      else if (m.percent === minP) m.status = 'worst'
      else m.status = 'normal'
    })
  }

  return { moduleScores, allEqual }
}

/**
 * 由模块得分数组生成「优势 / 短板」简评文案
 * @param {object[]} moduleScores
 * @param {boolean} allEqual
 * @returns {string}
 */
function buildReviewSummary(moduleScores, allEqual) {
  if (allEqual) return '各模块均衡发展，建议进阶学习'
  const best = moduleScores.find((m) => m.status === 'best')
  const worst = moduleScores.find((m) => m.status === 'worst')
  if (!best || !worst) return '各模块均衡发展，建议进阶学习'
  return `优势：${best.name} ${best.percent}% · 短板：${worst.name} ${worst.percent}%`
}

/**
 * 对题目列表中每题的 options 顺序做 Fisher-Yates 洗牌（纯函数，不修改入参）。
 *
 * 设计原则：
 * 1. 仅对单选 / 多选题打乱，**判断题豁免**：判断题的 A=正确 / B=错误 是阅读直觉，
 *    打乱后会让用户每题都要重新认读「哪边是正确」，体验下降。
 * 2. 仅打乱 options 数组顺序，不修改 option.key（A/B/C/D）。
 *    评分链路（quiz_submit）按 key 匹配 correctAnswer，与 options 数组位置无关。
 * 3. 题目顺序本身不改（要打乱题目顺序请用 shuffleQuestions 字段控制）。
 *
 * @param {Array} questions quiz_detail 返回的去答案题目数组
 * @returns {Array} 全新数组，每题 options 已洗牌（判断题除外）
 */
function shuffleQuizOptions(questions) {
  if (!Array.isArray(questions)) return []
  return questions.map((q) => {
    if (!q || !Array.isArray(q.options) || q.type === 'judge') {
      return q
    }
    const opts = q.options.slice()
    // Fisher-Yates 洗牌
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = opts[i]
      opts[i] = opts[j]
      opts[j] = tmp
    }
    return { ...q, options: opts }
  })
}

module.exports = {
  QUIZ_ID,
  QUIZ_ID_FULL,
  QUIZ_ID_QUICK,
  QUIZ_VERSIONS,
  LEVELS,
  MODULE_META,
  pickLevel,
  deriveModuleCode,
  aggregateModuleScores,
  buildReviewSummary,
  shuffleQuizOptions
}
