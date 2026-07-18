/**
 * 灯光测试历史记录页
 * - 展示用户在「完整版」和「快测版」两个版本的所有历史 attempts
 * - 顶部 Tab 分版本展示，切换不重新请求
 * - 点击记录跳转 lighting-result 详情页
 */

const {
  QUIZ_ID_FULL,
  QUIZ_ID_QUICK,
  pickLevel
} = require('../../../utils/lighting-quiz-constants')

/** 把毫秒时间戳格式化为 "YYYY-MM-DD HH:mm" */
function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 把秒数格式化为 "X 分 Y 秒" / "X 分钟" / "Y 秒" */
function formatDuration(sec) {
  if (typeof sec !== 'number' || sec <= 0) return ''
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m} 分钟`
  return `${m} 分 ${s} 秒`
}

/** 对单条 attempt 派生显示字段 */
function buildAttemptView(attempt) {
  if (!attempt) return null
  const totalScore = attempt.totalScore || 100
  const score = attempt.score || 0
  const level = pickLevel(score)
  return {
    ...attempt,
    dateText: formatDate(attempt.submittedAt),
    durationText: formatDuration(attempt.durationSec),
    scoreText: `${score} / ${totalScore} 分`,
    levelName: level ? level.name : '',
    levelColor: level ? level.mainColor : '#888',
    levelBgColor: level ? level.bgColor : '#f5f5f5'
  }
}

Page({
  data: {
    // 加载态
    loading: true,
    loadError: '',

    // 版本 Tab
    activeTab: 'full',   // 'full' | 'quick'
    tabs: [
      { id: 'full', label: '完整版' },
      { id: 'quick', label: '快测版' }
    ],

    // 各版本历史记录（已派生显示字段）
    fullList: [],
    quickList: []
  },

  // ============== 生命周期 ==============

  onLoad() {
    this._fetchAll()
  },

  // ============== 数据加载 ==============

  async _fetchAll() {
    this.setData({ loading: true, loadError: '' })
    try {
      // 并行请求两个版本
      const [resF, resQ] = await Promise.all([
        wx.cloud.callFunction({
          name: 'quiz_attempt_list',
          data: { quizId: QUIZ_ID_FULL, limit: 50 }
        }).catch((err) => {
          console.warn('[lighting-history] fetch full failed:', err)
          return null
        }),
        wx.cloud.callFunction({
          name: 'quiz_attempt_list',
          data: { quizId: QUIZ_ID_QUICK, limit: 50 }
        }).catch((err) => {
          console.warn('[lighting-history] fetch quick failed:', err)
          return null
        })
      ])

      const fullAttempts = (resF && resF.result && resF.result.success && resF.result.data && resF.result.data.attempts) || []
      const quickAttempts = (resQ && resQ.result && resQ.result.success && resQ.result.data && resQ.result.data.attempts) || []

      // 两个版本都失败时才展示错误
      if (!resF && !resQ) {
        this.setData({ loading: false, loadError: '加载失败，请稍后重试' })
        return
      }

      this.setData({
        loading: false,
        loadError: '',
        fullList: fullAttempts.map(buildAttemptView),
        quickList: quickAttempts.map(buildAttemptView)
      })
    } catch (err) {
      console.error('[lighting-history] fetchAll error:', err)
      this.setData({ loading: false, loadError: '网络异常，请检查网络后重试' })
    }
  },

  // ============== 用户操作 ==============

  onSwitchTab(e) {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    if (!id || id === this.data.activeTab) return
    this.setData({ activeTab: id })
  },

  onTapRecord(e) {
    const attemptId = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    if (!attemptId) return
    wx.navigateTo({
      url: `/pages/quiz/lighting-result/lighting-result?attemptId=${attemptId}`,
      fail: (err) => {
        console.error('[lighting-history] navigate to result failed:', err)
        wx.showToast({ title: '跳转失败', icon: 'none' })
      }
    })
  },

  onGoTest() {
    // 返回介绍页
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
    } else {
      wx.navigateTo({ url: '/pages/quiz/lighting-intro/lighting-intro' })
    }
  },

  onRetry() {
    this._fetchAll()
  }
})
