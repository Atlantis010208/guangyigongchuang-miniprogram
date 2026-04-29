/**
 * 答题结果页
 * - 入口：pages/quiz/detail 提交成功后 redirectTo
 * - 数据来源：quiz_attempt_get 云函数（含 attempt 与 quiz 完整答案）
 */

const TYPE_LABELS = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题'
}

/** 把秒数格式化为 "X 分 Y 秒" / "Y 秒" */
function formatDuration(sec) {
  if (typeof sec !== 'number' || sec < 0) return '0 秒'
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m} 分钟`
  return `${m} 分 ${s} 秒`
}

/** 选项 keys -> 文本（如 ['A','B'] => 'A、B'） */
function joinKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return ''
  return keys.slice().sort().join('、')
}

/** 数组转对象索引（便于 wxml 中 obj[key] 判定） */
function arrayToSet(arr) {
  const set = {}
  if (Array.isArray(arr)) {
    for (const k of arr) set[k] = true
  }
  return set
}

Page({
  data: {
    // 路由参数（二选一）
    attemptId: '',
    quizId: '',

    // 加载态
    loading: true,
    loadError: '',

    // 数据
    attempt: null,
    quiz: null,

    // 派生
    passed: false,
    passText: '',
    scorePercent: 0,
    ringColor: '#137333',
    correctCount: 0,
    durationText: '',
    reviewItems: [],

    // 题型标签
    typeLabels: TYPE_LABELS
  },

  onLoad(options) {
    const { attemptId = '', quizId = '' } = options || {}
    if (!attemptId && !quizId) {
      this.setData({ loading: false, loadError: '缺少成绩 ID' })
      return
    }
    this.setData({ attemptId, quizId })
    this._fetchAttempt()
  },

  // ============== 数据加载 ==============

  async _fetchAttempt() {
    const { attemptId, quizId } = this.data
    this.setData({ loading: true, loadError: '' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'quiz_attempt_get',
        data: attemptId ? { attemptId } : { quizId, bestOnly: true }
      })
      const result = res && res.result
      console.log('[quiz/result] quiz_attempt_get result:', result)

      if (!result || !result.success) {
        const code = (result && result.code) || 'UNKNOWN'
        let msg = (result && result.errorMessage) || '加载失败'
        if (code === 'NOT_FOUND') msg = '成绩不存在或已被删除'
        else if (code === 'FORBIDDEN') msg = '无权查看该成绩'
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
      console.error('[quiz/result] fetchAttempt error:', err)
      this.setData({ loading: false, loadError: '网络异常，请稍后重试' })
    }
  },

  /** 把后端数据加工为前端可直接渲染的视图模型 */
  _buildView(attempt, quiz) {
    // 派生 1：得分百分比、圆环颜色
    const totalScore = attempt.totalScore || quiz.totalScore || 0
    const scorePercent = totalScore > 0 ? Math.round((attempt.score / totalScore) * 100) : 0
    const passed = !!attempt.passed
    const ringColor = passed ? '#137333' : '#d97706'
    const passText = passed ? '已通过' : '未通过'

    // 派生 2：用时
    const durationText = formatDuration(attempt.durationSec || 0)

    // 派生 3：答对题数
    const correctCount = (attempt.answers || []).filter(a => a.isCorrect).length

    // 派生 4：题目回顾列表（合并 quiz.questions + attempt.answers）
    const answerMap = new Map()
    for (const a of (attempt.answers || [])) {
      answerMap.set(a.questionId, a)
    }

    const reviewItems = (quiz.questions || []).map(q => {
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
      passed,
      passText,
      scorePercent,
      ringColor,
      correctCount,
      durationText,
      reviewItems
    })
  },

  // ============== 操作 ==============

  /** 重做：携带原 quizId / courseId / lessonRef 跳回答题页 */
  onRetake() {
    const { attempt } = this.data
    if (!attempt || !attempt.quizId) {
      this.onBackToCourse()
      return
    }
    const url = `/pages/quiz/detail/detail?quizId=${attempt.quizId}` +
      (attempt.courseId ? `&courseId=${attempt.courseId}` : '') +
      (attempt.lessonRef ? `&lessonId=${attempt.lessonRef}` : '')
    wx.redirectTo({ url })
  },

  /** 返回课程：navigateBack 优先，回不到则进入课程列表 tab */
  onBackToCourse() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({
        url: '/pages/course/index/index',
        fail: () => {
          wx.reLaunch({ url: '/pages/course/index/index' })
        }
      })
    }
  }
})
