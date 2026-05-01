/**
 * 业主端「灯光设计认知与判断力测试」结果页
 * - 入口：pages/quiz/detail _doSubmit 成功后 redirectTo（业主测试场景）/ pages/quiz/lighting-intro 「查看上次结果」
 * - 数据来源：quiz_attempt_get 云函数（含 attempt + 完整 quiz）
 * - 派生：等级（参数依赖 / 经验模仿 / 设计判断 / 原则主导） + 模块得分（道 / 术 / 标准） + 题目回顾
 */

const {
  pickLevel,
  aggregateModuleScores,
  buildReviewSummary
} = require('../../../utils/lighting-quiz-constants')

const TYPE_LABELS = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题'
}

/** 把秒数格式化为「X 分 Y 秒」/「Y 秒」/「X 分钟」 */
function formatDuration(sec) {
  if (typeof sec !== 'number' || sec < 0) return '0 秒'
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m} 分钟`
  return `${m} 分 ${s} 秒`
}

/** 把答案 key 数组拼接成展示文本（按字母序） */
function joinKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return ''
  return keys.slice().sort().join('、')
}

/** 数组转 set 对象（便于 wxml 中 obj[key] 直接判定高亮） */
function arrayToSet(arr) {
  const set = {}
  if (Array.isArray(arr)) {
    for (const k of arr) set[k] = true
  }
  return set
}

Page({
  data: {
    // 路由
    attemptId: '',

    // 加载态
    loading: true,
    loadError: '',

    // 原始数据
    attempt: null,
    quiz: null,

    // 派生 - 等级
    level: null,
    scorePercent: 0,

    // 派生 - meta
    durationText: '',
    correctCount: 0,

    // 派生 - 模块得分
    moduleScores: [],
    reviewSummary: '',

    // 派生 - 题目回顾
    reviewExpanded: false,
    reviewItems: [],

    // 题型标签
    typeLabels: TYPE_LABELS
  },

  // ============== 生命周期 ==============

  onLoad(options) {
    const { attemptId = '' } = options || {}
    if (!attemptId) {
      this.setData({ loading: false, loadError: '缺少成绩 ID' })
      return
    }
    this.setData({ attemptId })
    this._fetchAttempt()
  },

  // ============== 数据加载 ==============

  async _fetchAttempt() {
    const { attemptId } = this.data
    this.setData({ loading: true, loadError: '' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'quiz_attempt_get',
        data: { attemptId }
      })
      const result = res && res.result
      console.log('[lighting-result] quiz_attempt_get result:', result)

      if (!result || !result.success) {
        const code = (result && result.code) || 'UNKNOWN'
        let msg = (result && result.errorMessage) || '加载失败'
        if (code === 'NOT_FOUND') msg = '成绩不存在或已被删除'
        else if (code === 'FORBIDDEN') msg = '无权查看该成绩'
        else if (code === 'UNAUTHORIZED') msg = '请先登录'
        this.setData({ loading: false, loadError: msg })
        return
      }

      const { attempt, quiz } = result.data || {}
      if (!attempt || !quiz) {
        this.setData({ loading: false, loadError: '成绩数据异常' })
        return
      }

      this._buildView(attempt, quiz)
    } catch (err) {
      console.error('[lighting-result] fetchAttempt error:', err)
      this.setData({ loading: false, loadError: '网络异常，请稍后重试' })
    }
  },

  /** 把后端数据加工为前端可直接渲染的视图模型 */
  _buildView(attempt, quiz) {
    // 1. 等级
    const level = pickLevel(attempt.score)
    const totalScore = attempt.totalScore || quiz.totalScore || 100
    const scorePercent = totalScore > 0
      ? Math.max(0, Math.min(100, Math.round((attempt.score / totalScore) * 100)))
      : 0

    // 2. meta 派生
    const durationText = formatDuration(attempt.durationSec || 0)
    const correctCount = (attempt.answers || []).filter((a) => a && a.isCorrect).length

    // 3. 模块得分
    const { moduleScores, allEqual } = aggregateModuleScores(attempt, quiz)
    const reviewSummary = buildReviewSummary(moduleScores, allEqual)

    // 4. 题目回顾（合并 quiz.questions + attempt.answers）
    const answerMap = new Map()
    for (const a of (attempt.answers || [])) {
      answerMap.set(a.questionId, a)
    }
    const reviewItems = (quiz.questions || []).map((q) => {
      const a = answerMap.get(q.id) || { selected: [], isCorrect: false, earned: 0 }
      return {
        questionId: q.id,
        type: q.type,
        stem: q.stem || '',
        options: q.options || [],
        score: q.score || 0,
        explanation: q.explanation || '',

        userSelected: a.selected || [],
        userSelectedSet: arrayToSet(a.selected),
        userAnswerText: joinKeys(a.selected),

        correctAnswer: q.correctAnswer || [],
        correctSet: arrayToSet(q.correctAnswer),
        correctAnswerText: joinKeys(q.correctAnswer),

        isCorrect: !!a.isCorrect,
        earned: a.earned || 0
      }
    })

    this.setData({
      loading: false,
      loadError: '',
      attempt,
      quiz,
      level,
      scorePercent,
      durationText,
      correctCount,
      moduleScores,
      reviewSummary,
      reviewItems
    })
  },

  // ============== 用户操作 ==============

  toggleReview() {
    this.setData({ reviewExpanded: !this.data.reviewExpanded })
  },

  /** 重新测试：跳回 detail 携带 quizId + category，开启新一轮 attempt */
  onRetake() {
    const { attempt } = this.data
    if (!attempt || !attempt.quizId) {
      this.onBackHome()
      return
    }
    wx.redirectTo({
      url: `/pages/quiz/detail/detail?quizId=${attempt.quizId}&category=lighting-cognition`,
      fail: () => {
        wx.navigateTo({
          url: `/pages/quiz/detail/detail?quizId=${attempt.quizId}&category=lighting-cognition`
        })
      }
    })
  },

  /** 错误兜底：返回首页 */
  onBackHome() {
    wx.switchTab({
      url: '/pages/products/products',
      fail: () => {
        wx.reLaunch({ url: '/pages/products/products' })
      }
    })
  }
})
