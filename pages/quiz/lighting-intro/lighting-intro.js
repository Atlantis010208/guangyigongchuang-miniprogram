/**
 * 业主端「灯光设计认知与判断力测试」介绍页
 * - 入口：pages/products/products 「灯光测试」hotel 卡片
 * - 多版本：介绍页 segmented tab 提供「完整版 (30 题) / 快测版 (10 题)」二选一
 * - 主流程：onLoad 并行拉两个版本的 quiz_detail + lastAttempt → 根据选中版本派生视图
 *           → 点「开始测试」→ navigateTo /pages/quiz/detail 携带当前版本 quizDocId
 *           → 点「查看上次结果」→ navigateTo /pages/quiz/lighting-result 携带当前版本 lastAttemptId
 *
 * 安全：quiz_detail 返回的题目结构已剔除 correctAnswer / explanation
 */

const { QUIZ_VERSIONS } = require('../../../utils/lighting-quiz-constants')

Page({
  data: {
    // 加载态
    loading: true,
    loadError: '',

    // 版本列表 + 当前选中（默认「完整版」）
    versions: QUIZ_VERSIONS,
    currentVersionId: 'full',
    currentVersion: QUIZ_VERSIONS[0],

    // 按版本 id 索引的原始数据 map：避免切换 tab 时重复拉取
    quizzes: {},        // { full: quizFull, quick: quizQuick }
    lastAttempts: {},   // { full: attempt|null, quick: attempt|null }

    // 派生字段 - 当前选中版本的视图模型（随 currentVersionId 切换）
    quiz: null,
    estimatedMinutes: 5,
    hasLastAttempt: false,
    lastAttemptId: '',

    // 收益卡数据
    benefits: [
      { id: 1, text: '你的设计认知等级' },
      { id: 2, text: '当前优势与短板方向' },
      { id: 3, text: '是否适合继续进阶学习灯光设计原则课' }
    ],

    // 操作态
    starting: false
  },

  // ============== 生命周期 ==============

  onLoad() {
    // 并行拉两个版本的题目集元数据 + 上次记录；任何一边失败都不阻塞主流程
    this._fetchAllQuizzes()
    this._fetchAllLastAttempts()
  },

  onShow() {
    // 每次显示都刷新两个版本的「上次记录」：
    // 用户可能在某个版本的结果页跳回介绍页，两个版本的状态都需要同步刷新
    if (!this.data.loading && !this.data.loadError) {
      this._fetchAllLastAttempts()
    }
  },

  // ============== 数据加载 ==============

  /**
   * 并行拉取两个版本的 quiz_detail
   * - 任一版本可拿到就不展示错误页，最大化可用性
   * - 两个版本都拿不到时才展示错误页（以首个错误码为准提示文案）
   */
  async _fetchAllQuizzes() {
    this.setData({ loading: true, loadError: '' })
    try {
      const versions = this.data.versions
      const responses = await Promise.all(
        versions.map((v) =>
          wx.cloud.callFunction({
            name: 'quiz_detail',
            data: { quizId: v.quizId }
          }).catch((err) => {
            console.warn('[lighting-intro] fetchQuiz', v.id, 'failed:', err)
            return null
          })
        )
      )

      const quizzes = {}
      let firstError = ''
      versions.forEach((v, idx) => {
        const result = responses[idx] && responses[idx].result
        if (result && result.success && result.data) {
          quizzes[v.id] = result.data
        } else if (!firstError) {
          const code = (result && result.code) || 'UNKNOWN'
          let msg = (result && result.errorMessage) || '加载失败'
          if (code === 'NOT_FOUND') msg = '测试暂不可用'
          else if (code === 'QUIZ_NOT_PUBLISHED') msg = '测试尚未发布'
          else if (code === 'UNAUTHORIZED') msg = '请先登录后再开始测试'
          firstError = msg
        }
      })

      // 两个版本都失败才走错误页
      if (Object.keys(quizzes).length === 0) {
        this.setData({ loading: false, loadError: firstError || '加载失败' })
        return
      }

      this.setData({
        loading: false,
        loadError: '',
        quizzes
      }, () => {
        this._applyCurrentVersion()
      })
    } catch (err) {
      console.error('[lighting-intro] fetchAllQuizzes error:', err)
      this.setData({ loading: false, loadError: '网络异常，请稍后重试' })
    }
  },

  /**
   * 并行拉取两个版本的 lastAttempt
   * - NOT_FOUND 静默（该版本从未作答）
   * - 其他错误也静默，仅不展示「查看上次结果」入口
   */
  async _fetchAllLastAttempts() {
    try {
      const versions = this.data.versions
      const responses = await Promise.all(
        versions.map((v) =>
          wx.cloud.callFunction({
            name: 'quiz_attempt_get',
            data: { quizId: v.quizId, bestOnly: false }
          }).catch((err) => {
            console.warn('[lighting-intro] fetchLastAttempt', v.id, 'failed:', err)
            return null
          })
        )
      )

      const lastAttempts = {}
      versions.forEach((v, idx) => {
        const result = responses[idx] && responses[idx].result
        const attempt = result && result.success && result.data && result.data.attempt
        if (attempt && attempt._id) {
          lastAttempts[v.id] = attempt
        }
      })

      this.setData({ lastAttempts }, () => {
        this._applyCurrentVersion()
      })
    } catch (err) {
      console.warn('[lighting-intro] fetchAllLastAttempts error (silent):', err)
    }
  },

  /**
   * 从 currentVersionId 派生当前版本的视图模型字段
   * - 在 _fetchAllQuizzes / _fetchAllLastAttempts / onSwitchVersion 中都会调用
   * - 安全兑底：当前版本拿不到题时 quiz 为 null，wxml 用 wx:elif="{{quiz}}" 避迟渲染
   */
  _applyCurrentVersion() {
    const { currentVersionId, versions, quizzes, lastAttempts } = this.data
    const currentVersion = versions.find((v) => v.id === currentVersionId) || versions[0]
    const quiz = quizzes[currentVersionId] || null
    const lastAttempt = lastAttempts[currentVersionId] || null
    // 预估用时优先从 quiz 题量推导，其次退到版本元数据中的 estimatedMinutes
    const estimatedMinutes = quiz
      ? this._estimateMinutes(quiz)
      : (currentVersion.estimatedMinutes || 5)

    this.setData({
      currentVersion,
      quiz,
      estimatedMinutes,
      hasLastAttempt: !!(lastAttempt && lastAttempt._id),
      lastAttemptId: (lastAttempt && lastAttempt._id) || ''
    })
  },

  /** 根据题量线性推导预计用时（每 6 题约 1 分钟）。 */
  _estimateMinutes(quiz) {
    const count = (quiz && Array.isArray(quiz.questions)) ? quiz.questions.length : 0
    if (count <= 0) return 5
    const minutes = Math.ceil(count / 6)
    return Math.max(2, minutes)
  },

  /** 切换版本：仅更新 currentVersionId，重新派生视图（不重拉数据） */
  onSwitchVersion(e) {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    if (!id || id === this.data.currentVersionId) return
    // 防御异常参数：必须是 versions 中存在的 id
    if (!this.data.versions.some((v) => v.id === id)) return
    this.setData({ currentVersionId: id }, () => {
      this._applyCurrentVersion()
    })
  },

  // ============== 用户操作 ==============

  onStart() {
    if (this.data.starting) return

    // 检查登录态：未登录引导
    const app = getApp()
    if (!app || typeof app.isLoggedIn !== 'function' || !app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '完成测试后，可以保存你的认知阶段记录与历史成绩。是否前往登录？',
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: (r) => {
          if (r.confirm) {
            const redirect = encodeURIComponent('/pages/quiz/lighting-intro/lighting-intro')
            wx.navigateTo({
              url: `/pages/auth/login/login?redirect=${redirect}`,
              fail: (err) => {
                console.error('[lighting-intro] navigate to login failed:', err)
                wx.showToast({ title: '登录页跳转失败', icon: 'none' })
              }
            })
          }
        }
      })
      return
    }

    if (!this.data.quiz || !this.data.quiz._id) {
      wx.showToast({ title: '测试数据未就绪', icon: 'none' })
      return
    }

    this.setData({ starting: true })
    const quizDocId = this.data.quiz._id
    wx.navigateTo({
      url: `/pages/quiz/detail/detail?quizId=${quizDocId}&category=lighting-cognition`,
      fail: (err) => {
        console.error('[lighting-intro] navigate to detail failed:', err)
        wx.showToast({ title: '页面跳转失败，请稍后重试', icon: 'none' })
      },
      complete: () => {
        // 给一点点延迟再恢复 starting，避免按钮快速反复闪烁
        setTimeout(() => this.setData({ starting: false }), 400)
      }
    })
  },

  onViewLast() {
    if (!this.data.lastAttemptId) {
      wx.showToast({ title: '暂无历史记录', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/quiz/lighting-result/lighting-result?attemptId=${this.data.lastAttemptId}`,
      fail: (err) => {
        console.error('[lighting-intro] navigate to last result failed:', err)
        wx.showToast({ title: '查看上次结果失败', icon: 'none' })
      }
    })
  },

  onBackHome() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/products/products' })
    }
  }
})
