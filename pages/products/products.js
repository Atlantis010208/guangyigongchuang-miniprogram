// pages/products/products.js
const util = require('../../utils/util')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userAvatar: '', // 用户头像URL（临时链接）
    avatarFileID: '', // 用户头像 cloud:// fileID（用于重试）
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

    // 从数据库动态获取工具包和课程的封面图片
    this.loadAssistantCovers()
  },

  /**
   * 从数据库加载工具包和课程的封面图片
   * 小程序端可以直接使用 cloud:// 协议显示图片
   */
  async loadAssistantCovers() {
    // 默认封面（使用数据库中的第一张主图，小程序直接支持 cloud:// 协议）
    const defaultToolkitCover = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg'
    const defaultCourseCover = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/二哥十年经验灯光设计课/主图1-¥365有圈子的灯光课 5.jpg'
    
    // 先设置默认封面，确保图片能立即显示
    this.setData({
      assistantToolkitCover: defaultToolkitCover,
      assistantCourseCover: defaultCourseCover
    })
    console.log('[首页] 已设置默认封面')
    
    // 然后尝试从数据库获取最新封面（异步更新）
    try {
      if (!wx.cloud) {
        console.warn('[首页] 云开发不可用')
        return
      }

      const db = wx.cloud.database()

      // 并行查询工具包和课程
      const [toolkitRes, courseRes] = await Promise.all([
        db.collection('toolkits')
          .where({ status: 'active' })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
          .catch(e => { console.warn('[首页] 查询工具包失败:', e); return { data: [] } }),
        db.collection('courses')
          .where({ status: 'published' })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
          .catch(e => { console.warn('[首页] 查询课程失败:', e); return { data: [] } })
      ])

      // 提取封面图片（优先使用 cover，其次使用 images[0]）
      let toolkitCover = defaultToolkitCover
      let courseCover = defaultCourseCover

      if (toolkitRes.data && toolkitRes.data.length > 0) {
        const toolkit = toolkitRes.data[0]
        toolkitCover = toolkit.cover || (toolkit.images && toolkit.images[0]) || defaultToolkitCover
        console.log('[首页] 从数据库获取工具包封面:', toolkitCover)
      }

      if (courseRes.data && courseRes.data.length > 0) {
        const course = courseRes.data[0]
        courseCover = course.cover || (course.images && course.images[0]) || defaultCourseCover
        console.log('[首页] 从数据库获取课程封面:', courseCover)
      }

      // 更新封面（如果与默认不同）
      if (toolkitCover !== defaultToolkitCover || courseCover !== defaultCourseCover) {
        this.setData({
          assistantToolkitCover: toolkitCover,
          assistantCourseCover: courseCover
        })
        console.log('[首页] 封面已更新')
      }
    } catch (e) {
      console.warn('[首页] 加载封面失败:', e)
      // 保持默认封面
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   * 每次显示时刷新用户头像（用户可能刚登录或修改了头像）
   */
  onShow() {
    this.loadUserAvatar()
  },

  /**
   * 加载用户头像
   * 优先从 app.globalData.userDoc 获取，其次从本地缓存获取
   * 自动处理 cloud:// fileID 转换和过期临时链接刷新
   */
  async loadUserAvatar() {
    try {
      const app = getApp()
      let avatarUrl = ''
      let avatarFileID = '' // 保存原始 fileID 用于重试

      // 优先从全局数据获取
      if (app.globalData && app.globalData.userDoc && app.globalData.userDoc.avatarUrl) {
        avatarUrl = app.globalData.userDoc.avatarUrl
      } else {
        // 从本地缓存获取
        const userDoc = util.getStorage('userDoc')
        if (userDoc && userDoc.avatarUrl) {
          avatarUrl = userDoc.avatarUrl
        }
      }

      if (!avatarUrl) {
        console.log('用户未设置头像，显示默认图标')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      // 如果头像是云存储的 fileID，需要转换为临时链接
      if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
        avatarFileID = avatarUrl // 保存原始 fileID
        try {
          console.log('正在转换头像 fileID:', avatarUrl)
          const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
          if (res && res.fileList && res.fileList[0]) {
            const fileItem = res.fileList[0]
            if (fileItem.tempFileURL) {
              console.log('头像转换成功:', fileItem.tempFileURL)
              this.setData({ 
                userAvatar: fileItem.tempFileURL,
                avatarFileID: avatarFileID 
              })
            } else if (fileItem.status !== 0) {
              // 文件可能已被删除
              console.warn('头像文件可能已被删除:', fileItem.status)
              this.setData({ userAvatar: '', avatarFileID: '' })
            } else {
              console.warn('头像转换返回空链接')
              this.setData({ userAvatar: '', avatarFileID: avatarFileID })
            }
          } else {
            console.warn('头像转换返回数据异常')
            this.setData({ userAvatar: '', avatarFileID: avatarFileID })
          }
        } catch (e) {
          console.warn('转换头像URL失败', e)
          // 保存 fileID 以便稍后重试
          this.setData({ userAvatar: '', avatarFileID: avatarFileID })
        }
        return
      }

      // 如果是 tcb.qcloud.la 的临时链接（可能已过期），需要从云数据库重新获取
      if (avatarUrl.includes('tcb.qcloud.la') || avatarUrl.includes('.tcb.')) {
        console.log('检测到临时链接，尝试刷新')
        await this.refreshAvatarFromCloud()
        return
      }

      // 其他情况（如普通 http/https 外链），直接使用
      console.log('使用外部头像链接:', avatarUrl)
      this.setData({ userAvatar: avatarUrl, avatarFileID: '' })
    } catch (e) {
      console.warn('加载用户头像失败', e)
      this.setData({ userAvatar: '', avatarFileID: '' })
    }
  },

  /**
   * 从云数据库重新获取头像 fileID 并转换为临时链接
   */
  async refreshAvatarFromCloud() {
    if (!wx.cloud) {
      console.warn('云开发不可用')
      this.setData({ userAvatar: '', avatarFileID: '' })
      return
    }

    try {
      const openid = util.getStorage('openid')
      const userDoc = util.getStorage('userDoc')
      const userId = userDoc && userDoc._id

      if (!userId && !openid) {
        console.log('用户未登录，无法刷新头像')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      console.log('从云数据库获取头像...', { userId, openid })
      const db = wx.cloud.database()
      let userRecord = null

      if (userId) {
        try {
          const res = await db.collection('users').doc(userId).get()
          userRecord = res && res.data
        } catch (e) {
          console.warn('通过 userId 查询失败:', e.message)
        }
      }
      
      if (!userRecord && openid) {
        try {
          const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
          userRecord = res && res.data && res.data[0]
        } catch (e) {
          console.warn('通过 openid 查询失败:', e.message)
        }
      }

      if (!userRecord || !userRecord.avatarUrl) {
        console.log('用户记录不存在或无头像')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      const fileID = userRecord.avatarUrl
      console.log('数据库中的头像:', fileID)

      // 如果数据库中存的是 cloud:// fileID，则转换
      if (fileID.startsWith('cloud://')) {
        const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          console.log('头像刷新成功')
          this.setData({ 
            userAvatar: res.fileList[0].tempFileURL,
            avatarFileID: fileID 
          })

          // 更新本地缓存中的 avatarUrl 为 fileID（确保缓存的是原始 fileID）
          const cachedDoc = util.getStorage('userDoc') || {}
          cachedDoc.avatarUrl = fileID
          util.setStorage('userDoc', cachedDoc)

          // 更新全局数据
          const app = getApp()
          if (app.globalData && app.globalData.userDoc) {
            app.globalData.userDoc.avatarUrl = fileID
          }
        } else {
          console.warn('头像文件可能已被删除')
          this.setData({ userAvatar: '', avatarFileID: '' })
        }
      } else {
        // 数据库中存的不是 fileID（可能是外部链接），直接使用
        console.log('使用外部头像链接')
        this.setData({ userAvatar: fileID, avatarFileID: '' })
      }
    } catch (e) {
      console.warn('从云数据库刷新头像失败', e)
      this.setData({ userAvatar: '', avatarFileID: '' })
    }
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
  },

  /**
   * 头像图片加载失败时的处理
   * 当临时链接过期或文件不存在时触发
   */
  async onAvatarError() {
    console.warn('头像图片加载失败，尝试重新获取')
    
    const { avatarFileID } = this.data
    
    // 如果有保存的 fileID，尝试重新获取临时链接
    if (avatarFileID && avatarFileID.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarFileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          console.log('重新获取头像成功')
          this.setData({ userAvatar: res.fileList[0].tempFileURL })
          return
        }
      } catch (e) {
        console.warn('重新获取头像失败', e)
      }
    }
    
    // 重试失败，尝试从云数据库重新获取
    await this.refreshAvatarFromCloud()
  },

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
