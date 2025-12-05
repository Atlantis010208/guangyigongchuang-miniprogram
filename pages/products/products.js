// pages/products/products.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    assistantToolkitCover: '',
    assistantCourseCover: '',
    // features 已移除，改为电子商城入口
    showIntro: false,
    quizStep: 0,
    quiz: { area: '', space: '', service: '', budget: '' },
    estimate: 0,
    pricePer: 0,
    chargeArea: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const done = wx.getStorageSync('intro_quiz_done')
    if (!done) {
      this.setData({ showIntro: true })
    }

    // 从工具包与课程页的首图作为封面（使用当前云环境的 fileID 并尽量转换为 https）
    try {
      const toolkitCoverId = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg'
      const courseCoverId = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图1-¥365有圈子的灯光课 5.jpg'
      const fileList = [toolkitCoverId, courseCoverId]
      if (wx.cloud && wx.cloud.getTempFileURL) {
        wx.cloud.getTempFileURL({ fileList })
          .then(res => {
            const dict = {}
            ;(res && res.fileList || []).forEach(x=>{ if(x && x.fileID) dict[x.fileID] = x.tempFileURL || x.fileID })
            this.setData({
              assistantToolkitCover: dict[toolkitCoverId] || toolkitCoverId,
              assistantCourseCover: dict[courseCoverId] || courseCoverId
            })
          })
          .catch(() => {
            this.setData({ assistantToolkitCover: toolkitCoverId, assistantCourseCover: courseCoverId })
          })
      } else {
        this.setData({ assistantToolkitCover: toolkitCoverId, assistantCourseCover: courseCoverId })
      }
    } catch (e) {}
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  onBuyTap(e) {
    const product = e?.currentTarget?.dataset?.product
    if (product === 'publish') {
      wx.navigateTo({ url: '/pages/flows/publish/publish' })
      return
    }
    wx.navigateTo({ url: '/pages/support/contact/contact' })
  },

  // 附近的精彩活动：同探索页
  onNearbyActivitiesTap(){
    wx.showToast({ title: '更多活动即将上线', icon: 'none' })
  },
  onActivityTap(e){
    const id = e.currentTarget.dataset.activity || 'video'
    // video=第一张卡片（旧问卷）；photo=第二张卡片（新问卷）
    wx.navigateTo({ url: `/pages/activities/detail/detail?id=${id}` })
  },

  // 助手模块专属跳转，互不影响
  onAssistantTap(e){
    const id = e.currentTarget.dataset.activity || 'video'
    if (id === 'video') {
      wx.navigateTo({ url: '/pages/toolkit/toolkit-detail/toolkit-detail' })
      return
    }
    // 第二张改为课程详情（参考商城购买页）
    const cover = encodeURIComponent(this.data.assistantCourseCover || '')
    wx.navigateTo({ url: `/pages/course/course-detail/course-detail?cover=${cover}` })
  },

  // 节能妙招：进入节能建议页（非卡片风格）
  onSavingsTap() {
    wx.navigateTo({ url: '/pages/tips/energy/energy' })
  },

  // 电子商城入口
  onMallTap(){
    wx.navigateTo({ url: '/pages/mall/mall' })
  },

  // 英雄卡片点击：进入发布照明需求
  onProductTap(e) {
    const product = e.currentTarget.dataset.product
    if (product === 'publish') {
      wx.navigateTo({ url: '/pages/flows/publish/publish' })
      return
    }
    // 兜底：保留原产品详情逻辑（暂不使用）
    const query = encodeURIComponent(JSON.stringify({ id: 'default', title: '旗舰光环境方案', price: 7999 }))
    wx.navigateTo({ url: `/pages/product-detail/product-detail?data=${query}` })
  },

  // 主打服务卡片点击
  onServiceTap(e){
    const service = e.currentTarget.dataset.service
    // 跳转映射
    const map = {
      selection: '/pages/flows/selection/selection',
      optimize: '/pages/flows/optimize/optimize',
      full: '/pages/flows/publish/publish'
    }
    const url = map[service]
    if (url) {
      wx.navigateTo({ url })
    } else {
      wx.showToast({ title: '即将开放', icon: 'none' })
    }
  },

  onCategoryTap(e) {
    const map = {
      residential: '/pages/categories/residential/residential',
      commercial: '/pages/categories/commercial/commercial',
      office: '/pages/categories/office/office',
      hotel: '/pages/categories/hotel/hotel'
    }
    const url = map[e.currentTarget.dataset.category]
    if (url) wx.navigateTo({ url })
  },

  

  // 个人中心：点击右上角头像 -> 显示功能提示
  onUserTap() {
    wx.navigateTo({ url: '/pages/profile/home/home' })
  }
  ,

  // 助手封面图兜底：若 cloud:// 无法显示则替换为 https 或占位图
  onAssistantImageError(e){
    const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key
    const fallback = 'https://images.pexels.com/photos/271743/pexels-photo-271743.jpeg'
    if (key === 'toolkit') {
      this.setData({ assistantToolkitCover: fallback })
    } else if (key === 'course') {
      this.setData({ assistantCourseCover: fallback })
    }
  }
  ,

  // Quiz handlers
  closeQuiz(){
    // 仅关闭，不写入完成标记；下次登录仍显示
    this.setData({ showIntro:false })
  },
  nextQuiz(){
    let { quizStep, quiz } = this.data
    if (quizStep === 0 && !quiz.area) return wx.showToast({ title:'请输入面积', icon:'none' })
    if (quizStep === 1 && !quiz.space) return wx.showToast({ title:'请选择空间类型', icon:'none' })
    if (quizStep === 2 && !quiz.service) return wx.showToast({ title:'请选择服务类型', icon:'none' })
    this.setData({ quizStep: quizStep + 1 })
  },
  prevQuiz(){
    const step = this.data.quizStep
    if (step > 0) this.setData({ quizStep: step - 1 })
  },
  onQuizArea(e){ this.setData({ 'quiz.area': e.detail.value }) },
  onQuickArea(e){
    this.setData({ 'quiz.area': e.currentTarget.dataset.value, quizStep: 1 })
  },
  onQuizSpace(e){
    this.setData({ 'quiz.space': e.detail.value })
    if (this.data.quizStep === 1) this.setData({ quizStep: 2 })
  },
  onQuizService(e){
    this.setData({ 'quiz.service': e.detail.value })
    if (this.data.quizStep === 2) this.setData({ quizStep: 3 })
  },
  onQuizBudget(e){
    this.setData({ 'quiz.budget': e.detail.value })
    // 自动计算并进入结果页
    this.calcQuiz()
  },
  calcQuiz(){
    // 预算单价解析
    const { area, service, budget } = this.data.quiz
    let pricePer = 9
    if (service === '选灯配灯服务') pricePer = 5
    if (budget && /¥(\d+)/.test(budget)) {
      const m = budget.match(/¥(\d+)/)
      if (m) pricePer = Number(m[1])
    } else if (budget.indexOf('及以上')>-1) {
      pricePer = 50
    }
    let chargeArea = Number(area || 0)
    if (isNaN(chargeArea) || chargeArea <= 0) chargeArea = 50
    if (chargeArea < 50) chargeArea = 50
    const estimate = pricePer * chargeArea
    this.setData({ estimate, pricePer, chargeArea, quizStep: 4 })
    wx.setStorageSync('intro_quiz_done', true)
  },

  finishAndPrefill(){
    const { area, space, service, budget } = this.data.quiz
    const payload = {
      area: String(area || ''),
      space: space || '',
      service: service || '',
      budget: budget || ''
    }
    // 存储预填数据，发布页读取
    wx.setStorageSync('publish_prefill', payload)
    this.setData({ showIntro:false })
    wx.navigateTo({ url: '/pages/flows/publish/publish' })
  }
})
