'use strict'

const designerApi = typeof require === 'function'
  ? require('../../../services/v2/designer')
  : {
      learningIntroduction: async () => ({ ok: false, message: '服务不可用' }),
      learningCatalog: async () => ({ ok: false, message: '服务不可用' }),
      learningHistory: async () => ({ ok: false, message: '服务不可用' })
    }

const SECTION_META = Object.freeze({
  intro: { title: '课程介绍', method: 'learningIntroduction' },
  catalog: { title: '课程目录', method: 'learningCatalog' },
  history: { title: '学习记录', method: 'learningHistory' }
})

Page({
  data: {
    courseId: '',
    section: 'intro',
    title: '课程介绍',
    status: 'loading',
    errorMessage: '',
    introduction: null,
    catalog: null,
    history: null,
    expandedChapters: {}
  },

  onLoad(options) {
    const courseId = decodeURIComponent(options && options.courseId || '').trim()
    const section = SECTION_META[options && options.section] ? options.section : 'intro'
    const title = SECTION_META[section].title
    this.setData({ courseId, section, title })
    wx.setNavigationBarTitle({ title })
    this.loadContent()
  },

  async loadContent() {
    if (!this.data.courseId) {
      this.setData({ status: 'error', errorMessage: '课程 ID 不存在' })
      return
    }
    const meta = SECTION_META[this.data.section]
    this.setData({ status: 'loading', errorMessage: '' })
    const response = await designerApi[meta.method](this.data.courseId)
    if (!response.ok) {
      this.setData({ status: 'error', errorMessage: response.message || '内容加载失败' })
      return
    }
    const payload = response.data || {}
    let empty = false
    if (this.data.section === 'intro') empty = !payload.description && !(payload.detailImages && payload.detailImages.length)
    if (this.data.section === 'catalog') empty = !(payload.chapters && payload.chapters.some(chapter => chapter.lessons && chapter.lessons.length))
    if (this.data.section === 'history') empty = !(payload.records && payload.records.length)
    const patch = { status: empty ? 'empty' : 'ready' }
    patch[this.data.section === 'intro' ? 'introduction' : this.data.section] = payload
    if (this.data.section === 'catalog') {
      const expandedChapters = {}
      ;(payload.chapters || []).forEach((chapter, index) => { expandedChapters[index] = index === 0 })
      patch.expandedChapters = expandedChapters
    }
    this.setData(patch)
  },

  retry() { this.loadContent() },

  toggleChapter(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.setData({ [`expandedChapters.${index}`]: !this.data.expandedChapters[index] })
  },

  openLesson(event) {
    const lessonId = event.currentTarget.dataset.lessonId || ''
    const lessonType = event.currentTarget.dataset.lessonType || 'video'
    if (!lessonId) return
    if (lessonType !== 'video') {
      wx.navigateTo({
        url: '/pages/course/course-detail/course-detail?id=' + encodeURIComponent(this.data.courseId) + '&tab=1',
        fail: () => wx.showToast({ title: '课程暂时无法打开', icon: 'none' })
      })
      return
    }
    wx.navigateTo({
      url: '/pages/course/video-player/video-player?courseId=' + encodeURIComponent(this.data.courseId) + '&lessonId=' + encodeURIComponent(lessonId),
      fail: () => wx.showToast({ title: '课程暂时无法打开', icon: 'none' })
    })
  }
})

module.exports = { SECTION_META }
