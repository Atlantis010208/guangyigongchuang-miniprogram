/**
 * 课程作业答题页
 * - 入口：pages/course/video-player 点击 quiz 类型课时
 * - 单题模式：每屏一题，复用 publish 步骤式动效
 * - 服务端判分：交卷调用 quiz_submit；前端不直接读 correctAnswer
 */

const TYPE_LABELS = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题'
}

Page({
  data: {
    // 路由参数
    quizId: '',
    courseId: '',
    lessonId: '',

    // 加载态
    loading: true,
    loadError: '',
    loadRetryable: true,

    // 题目集
    quiz: null,
    questions: [],

    // 作答状态
    currentIndex: 0,
    answers: [],          // [{ questionId, selected: [] }]
    selectedMaps: [],     // [{ A: true, B: true }, ...] 与 questions 同长，供 wxml 高亮判断
    startedAt: 0,

    // UI 派生
    progress: 0,
    isFirst: true,
    isLast: false,
    isCurrentAnswered: false,
    nextBtnText: '下一题',

    // 提交态
    submitting: false,
    submitError: '',

    // 题型标签查找表（供 wxml 用）
    typeLabels: TYPE_LABELS
  },

  // ============== 生命周期 ==============

  onLoad(options) {
    const { quizId = '', courseId = '', lessonId = '' } = options || {}
    if (!quizId) {
      this.setData({
        loading: false,
        loadError: '缺少题目集 ID',
        loadRetryable: false
      })
      return
    }
    this.setData({ quizId, courseId, lessonId })
    this._fetchQuiz()
  },

  onUnload() {
    // 清掉返回拦截，避免影响其他页面
    if (this._leaveAlertEnabled && wx.disableAlertBeforeUnload) {
      try { wx.disableAlertBeforeUnload() } catch (e) {}
      this._leaveAlertEnabled = false
    }
    // 清理自动跳转定时器，避免页面销毁后还触发 setData
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer)
      this._autoAdvanceTimer = null
    }
  },

  // ============== 数据加载 ==============

  async _fetchQuiz() {
    const { quizId } = this.data
    this.setData({ loading: true, loadError: '' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'quiz_detail',
        data: { quizId }
      })
      const result = res && res.result
      console.log('[quiz/detail] quiz_detail result:', result)

      if (!result || !result.success) {
        const code = (result && result.code) || 'UNKNOWN'
        const msg = (result && result.errorMessage) || '加载失败'

        // 对 NOT_FOUND / QUIZ_NOT_PUBLISHED 给出更友好的文案，且不允许重试
        let displayMsg = msg
        let retryable = true
        if (code === 'NOT_FOUND') {
          displayMsg = '题目集不存在或已被删除'
          retryable = false
        } else if (code === 'QUIZ_NOT_PUBLISHED') {
          displayMsg = '题目集尚未发布，无法作答'
          retryable = false
        } else if (code === 'UNAUTHORIZED') {
          displayMsg = '请先登录'
          retryable = false
        }

        this.setData({
          loading: false,
          loadError: displayMsg,
          loadRetryable: retryable
        })
        return
      }

      const quiz = result.data || {}
      const questions = Array.isArray(quiz.questions) ? quiz.questions : []

      if (questions.length === 0) {
        this.setData({
          loading: false,
          loadError: '题目集没有题目',
          loadRetryable: false
        })
        return
      }

      // 初始化作答数组 + 每题的 selectedMap
      const answers = questions.map(q => ({
        questionId: q.id,
        selected: []
      }))
      const selectedMaps = questions.map(() => ({}))

      this.setData({
        loading: false,
        loadError: '',
        quiz,
        questions,
        answers,
        selectedMaps,
        startedAt: Date.now(),
        currentIndex: 0
      }, () => {
        this._recomputeDerived()
      })
    } catch (err) {
      console.error('[quiz/detail] fetchQuiz error:', err)
      this.setData({
        loading: false,
        loadError: '网络异常，请检查网络后重试',
        loadRetryable: true
      })
    }
  },

  onRetryLoad() {
    this._fetchQuiz()
  },

  onBack() {
    // 直接 navigateBack；如果没有上一页（极端情况），退回到课程页
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/course/index/index' })
    }
  },

  // ============== 选项点击 ==============

  onOptionTap(e) {
    const { qidx, key, type } = e.currentTarget.dataset
    const idx = Number(qidx)
    console.log('[quiz/detail] onOptionTap:', { qidx, key, type, currentIndex: this.data.currentIndex })
    if (Number.isNaN(idx) || idx !== this.data.currentIndex) return

    const answers = this.data.answers.slice()
    const current = { ...answers[idx], selected: answers[idx].selected.slice() }

    if (type === 'multiple') {
      // toggle
      const i = current.selected.indexOf(key)
      if (i > -1) {
        current.selected.splice(i, 1)
      } else {
        current.selected.push(key)
      }
    } else {
      // single / judge：覆盖
      current.selected = [key]
    }
    answers[idx] = current

    // 同步重建该题的 selectedMap
    const newMap = {}
    for (const k of current.selected) newMap[k] = true
    const selectedMaps = this.data.selectedMaps.slice()
    selectedMaps[idx] = newMap

    this.setData({ answers, selectedMaps, submitError: '' }, () => {
      this._recomputeDerived()
      this._maybeEnableLeaveAlert()
      this._scheduleAutoAdvance(type, idx)
    })
  },

  // 单选/判断题选完一项后，自动跳到下一题；多选与末题不跳
  _scheduleAutoAdvance(type, idx) {
    if (type === 'multiple') return
    if (idx !== this.data.currentIndex) return
    if (this.data.isLast) return
    if (this.data.submitting) return

    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer)
    }
    this._autoAdvanceTimer = setTimeout(() => {
      this._autoAdvanceTimer = null
      // 二次校验：定时器触发瞬间状态可能已变（用户主动 prev/next、提交中、到末题）
      if (idx !== this.data.currentIndex) return
      if (this.data.submitting) return
      if (this.data.isLast) return
      this.setData({
        currentIndex: this.data.currentIndex + 1,
        submitError: ''
      }, () => this._recomputeDerived())
    }, 280)
  },

  // ============== 翻页 ==============

  onPrev() {
    if (this.data.currentIndex <= 0) return
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer)
      this._autoAdvanceTimer = null
    }
    this.setData({
      currentIndex: this.data.currentIndex - 1,
      submitError: ''
    }, () => this._recomputeDerived())
  },

  onNext() {
    const { currentIndex, questions, isCurrentAnswered, submitting, isLast } = this.data
    console.log('[quiz/detail] onNext:', { currentIndex, isCurrentAnswered, submitting, isLast })

    // 提交中：快速返回，避免重复调用
    if (submitting) {
      console.log('[quiz/detail] onNext blocked by submitting')
      return
    }

    // 未作答：给 toast 提示，避免用户以为按钮坏了
    if (!isCurrentAnswered) {
      const tip = (questions[currentIndex] && questions[currentIndex].type === 'multiple')
        ? '请至少选一个选项' : '请先选择一个答案'
      wx.showToast({ title: tip, icon: 'none' })
      return
    }

    if (currentIndex < questions.length - 1) {
      this.setData({
        currentIndex: currentIndex + 1,
        submitError: ''
      }, () => this._recomputeDerived())
    } else {
      this._confirmSubmit()
    }
  },

  // ============== 提交 ==============

  _confirmSubmit() {
    console.log('[quiz/detail] _confirmSubmit called')
    wx.showModal({
      title: '确定提交吗？',
      content: '提交后无法修改答案',
      confirmText: '确认交卷',
      cancelText: '再检查',
      success: (res) => {
        console.log('[quiz/detail] _confirmSubmit modal result:', res)
        if (res.confirm) this._doSubmit()
      },
      fail: (err) => {
        console.error('[quiz/detail] _confirmSubmit modal fail:', err)
        // showModal 异常时，退一步直接提交，避免“点交卷没反应”
        this._doSubmit()
      }
    })
  },

  async _doSubmit() {
    const { quizId, courseId, lessonId, startedAt, answers } = this.data
    console.log('[quiz/detail] _doSubmit start:', { quizId, courseId, lessonId, answersLen: answers.length })
    this.setData({ submitting: true, submitError: '' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'quiz_submit',
        data: {
          quizId,
          courseId,
          lessonRef: lessonId,
          startedAt,
          answers
        }
      })
      const result = res && res.result
      console.log('[quiz/detail] quiz_submit result:', result)

      if (!result || !result.success) {
        const msg = (result && result.errorMessage) || '提交失败，请重试'
        this.setData({ submitting: false, submitError: msg })
        return
      }

      const attemptId = result.data && result.data.attemptId
      if (!attemptId) {
        this.setData({ submitting: false, submitError: '提交结果异常，请联系客服' })
        return
      }

      // 提交成功后，关闭返回拦截
      try { if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload() } catch (e) {}

      // redirectTo 防止用户返回到答题页
      wx.redirectTo({
        url: `/pages/quiz/result/result?attemptId=${attemptId}`,
        fail: () => {
          // 如果当前在子包入口被限制，兜底用 navigateTo
          wx.navigateTo({ url: `/pages/quiz/result/result?attemptId=${attemptId}` })
        }
      })
    } catch (err) {
      console.error('[quiz/detail] submit error:', err)
      this.setData({
        submitting: false,
        submitError: '提交失败，点击「交卷」重试'
      })
    }
  },

  // ============== 派生字段重算 ==============

  _recomputeDerived() {
    const { currentIndex, questions, answers } = this.data
    if (!questions || questions.length === 0) return

    const total = questions.length
    const isFirst = currentIndex === 0
    const isLast = currentIndex === total - 1
    const cur = answers[currentIndex] || { selected: [] }
    const isCurrentAnswered = Array.isArray(cur.selected) && cur.selected.length > 0
    const progress = Math.round(((currentIndex + 1) / total) * 100)

    this.setData({
      isFirst,
      isLast,
      isCurrentAnswered,
      progress,
      nextBtnText: isLast ? '交卷' : '下一题'
    })
  },

  // ============== 离开拦截 ==============

  _maybeEnableLeaveAlert() {
    if (this._leaveAlertEnabled) return
    const hasAnyAnswer = (this.data.answers || []).some(a => a && a.selected && a.selected.length > 0)
    if (!hasAnyAnswer) return

    // 仅微信 7.0.7+ 基础库支持
    if (wx.enableAlertBeforeUnload) {
      try {
        wx.enableAlertBeforeUnload({
          message: '离开后答题进度将丢失，确定离开吗？'
        })
        this._leaveAlertEnabled = true
      } catch (e) {
        console.warn('[quiz/detail] enableAlertBeforeUnload failed:', e)
      }
    }
  }
})
