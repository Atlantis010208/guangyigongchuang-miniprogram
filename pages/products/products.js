// pages/products/products.js
const util = require('../../utils/util')

// 避坑指南 PDF 文件地址（压缩版）
const PDF_BIKENG_GUIDE = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/（已压缩）2、工具包｜装修灯光注意事项-避坑指南（最新）.pdf'

// 灯光设计服务说明书 PDF 文件地址
const PDF_DESIGN_SERVICE = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/灯光设计服务说明书.pdf'

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userAvatar: '', // 用户头像URL（临时链接）
    avatarFileID: '', // 用户头像 cloud:// fileID（用于重试）
    assistantToolkitCover: '',
    assistantCourseCover: '',
    assistantCourseId: '', // 课程 ID，用于跳转详情页
    assistantCourseTitle: '' // 课程标题
    // features 已移除，改为电子商城入口
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 检查是否需要选择身份
    this.checkIdentitySelection()
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
    const defaultCourseId = 'CO_DEFAULT_001' // 默认课程 ID
    const defaultCourseTitle = '十年经验二哥 灯光设计课'
    
    // 先设置默认封面和课程信息，确保立即可用
    this.setData({
      assistantToolkitCover: defaultToolkitCover,
      assistantCourseCover: defaultCourseCover,
      assistantCourseId: defaultCourseId,
      assistantCourseTitle: defaultCourseTitle
    })
    console.log('[首页] 已设置默认封面和课程信息')
    
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

      let courseId = ''
      let courseTitle = ''
      if (courseRes.data && courseRes.data.length > 0) {
        const course = courseRes.data[0]
        // 提取封面：优先使用 cover，如果是对象则取其值
        let cover = course.cover
        if (cover && typeof cover === 'object') {
          cover = cover.fileID || cover.downloadUrl || ''
        }
        courseCover = cover || (course.images && course.images[0]) || defaultCourseCover
        // 保存课程 ID 和标题
        courseId = course.courseId || course._id || ''
        courseTitle = course.title || '灯光设计课'
        console.log('[首页] 从数据库获取课程:', { courseCover, courseId, courseTitle })
      }

      // 更新封面和课程信息
      this.setData({
        assistantToolkitCover: toolkitCover,
        assistantCourseCover: courseCover,
        assistantCourseId: courseId,
        assistantCourseTitle: courseTitle
      })
      console.log('[首页] 封面和课程信息已更新')
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
    // 更新自定义 tabBar 的选中状态和角色
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 0 })
    }
    // 每次显示时也检查身份选择状态
    this.checkIdentitySelection()
    this.loadUserAvatar()
    // 预加载避坑指南 PDF（后台静默下载）
    this.preloadPdfFile(PDF_BIKENG_GUIDE)
    // 预加载灯光设计服务说明书 PDF（后台静默下载）
    this.preloadPdfFile(PDF_DESIGN_SERVICE)
  },

  /**
   * 检查用户是否已选择身份
   * 首次启动或未选择身份时，跳转到身份选择页
   */
  checkIdentitySelection() {
    const app = getApp()
    if (!app) return

    // 管理员(roles=0)不需要选择身份，直接放行
    const userDoc = wx.getStorageSync('userDoc') || {}
    if (userDoc.roles === 0) return

    // 已选择身份的用户不再跳转
    if (userDoc.identitySelected === true) return

    // 首次启动 或 用户未选择身份 -> 跳转身份选择页
    if (app.globalData.isFirstLaunch || !userDoc.identitySelected) {
      // 检查云端用户记录
      const openid = wx.getStorageSync('openid')
      if (openid && userDoc._id) {
        // 已登录用户，检查云端 identitySelected 状态
        if (userDoc.identitySelected !== true) {
          wx.navigateTo({ url: '/pages/identity/identity' })
        }
      } else {
        // 未登录用户，首次启动跳转身份选择页
        wx.navigateTo({ url: '/pages/identity/identity' })
      }
    }
  },

  /**
   * 预加载 PDF 文件（后台静默下载，不显示加载提示）
   * @param {string} fileID - 云存储文件 ID
   */
  preloadPdfFile(fileID) {
    // 生成缓存 key
    const cacheKey = 'pdf_cache_' + this.hashCode(fileID)
    
    // 检查是否已有缓存
    try {
      const cachedPath = wx.getStorageSync(cacheKey)
      if (cachedPath) {
        const fs = wx.getFileSystemManager()
        try {
          fs.accessSync(cachedPath)
          console.log('[预加载] PDF 已缓存，无需下载')
          return // 缓存有效，无需下载
        } catch (e) {
          // 缓存失效，继续下载
          wx.removeStorageSync(cacheKey)
        }
      }
    } catch (e) {
      // 忽略缓存读取错误
    }
    
    // 后台静默下载
    console.log('[预加载] 开始下载 PDF...')
    wx.cloud.downloadFile({
      fileID: fileID,
      success: res => {
        const tempFilePath = res.tempFilePath
        const fs = wx.getFileSystemManager()
        const savedPath = `${wx.env.USER_DATA_PATH}/pdf_bikeng_${Date.now()}.pdf`
        
        try {
          fs.saveFileSync(tempFilePath, savedPath)
          wx.setStorageSync(cacheKey, savedPath)
          console.log('[预加载] PDF 下载完成并缓存:', savedPath)
        } catch (saveErr) {
          console.warn('[预加载] PDF 保存失败:', saveErr)
        }
      },
      fail: err => {
        console.warn('[预加载] PDF 下载失败:', err)
      }
    })
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
    const type = e.currentTarget.dataset.activity || 'video'
    if (type === 'video') {
      // 灯光工具包
      wx.navigateTo({ url: '/pages/toolkit/toolkit-detail/toolkit-detail' })
      return
    }
    // 灯光设计课 - 跳转到课程详情页，传递课程 ID
    const courseId = this.data.assistantCourseId
    if (courseId) {
      wx.navigateTo({ url: `/pages/course/course-detail/course-detail?id=${courseId}` })
    } else {
      // 如果没有获取到课程 ID，直接跳转到课程中心
      wx.showToast({ title: '正在跳转课程中心...', icon: 'none' })
      wx.switchTab({ url: '/pages/course/index/index' })
    }
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
    wx.showToast({ title: '请选择具体商品', icon: 'none' })
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
    const category = e.currentTarget.dataset.category
    
    // 避坑指南 - 直接打开云存储中的 PDF 文件
    if (category === 'residential') {
      this.openPdfFile(PDF_BIKENG_GUIDE)
      return
    }
    
    // 设计流程 - 打开灯光设计服务说明书 PDF
    if (category === 'commercial') {
      this.openPdfFile(PDF_DESIGN_SERVICE)
      return
    }
    
    // 照度计算 - 跳转到照明计算页面
    if (category === 'office') {
      wx.switchTab({ url: '/pages/search/search' })
      return
    }
    
    // 酒店照明 - 功能开发中
    if (category === 'hotel') {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none' })
      return
    }
  },

  /**
   * 打开云存储中的 PDF 文件（带缓存优化）
   * @param {string} fileID - 云存储文件 ID（cloud:// 协议）
   */
  async openPdfFile(fileID) {
    // 生成缓存 key（使用 fileID 的 hash）
    const cacheKey = 'pdf_cache_' + this.hashCode(fileID)
    
    // 先检查本地缓存
    try {
      const cachedPath = wx.getStorageSync(cacheKey)
      if (cachedPath) {
        // 验证缓存文件是否存在
        const fs = wx.getFileSystemManager()
        try {
          fs.accessSync(cachedPath)
          console.log('使用缓存的 PDF 文件:', cachedPath)
          // 缓存有效，直接打开
          wx.openDocument({
            filePath: cachedPath,
            fileType: 'pdf',
            showMenu: true,
            success: () => console.log('打开缓存 PDF 成功'),
            fail: err => {
              console.warn('打开缓存 PDF 失败，重新下载:', err)
              // 缓存文件损坏，清除缓存并重新下载
              wx.removeStorageSync(cacheKey)
              this.downloadAndOpenPdf(fileID, cacheKey)
            }
          })
          return
        } catch (e) {
          // 缓存文件不存在，清除缓存记录
          console.log('缓存文件已失效，重新下载')
          wx.removeStorageSync(cacheKey)
        }
      }
    } catch (e) {
      console.log('读取缓存失败:', e)
    }
    
    // 没有缓存，下载文件
    this.downloadAndOpenPdf(fileID, cacheKey)
  },

  /**
   * 下载并打开 PDF 文件
   */
  downloadAndOpenPdf(fileID, cacheKey) {
    // 显示下载进度
    wx.showLoading({ title: '正在下载 0%', mask: true })
    
    const downloadTask = wx.cloud.downloadFile({
      fileID: fileID,
      success: res => {
        wx.hideLoading()
        const tempFilePath = res.tempFilePath
        
        // 保存到本地永久存储（避免临时文件被清理）
        const fs = wx.getFileSystemManager()
        const savedPath = `${wx.env.USER_DATA_PATH}/pdf_${Date.now()}.pdf`
        
        try {
          fs.saveFileSync(tempFilePath, savedPath)
          // 缓存文件路径
          wx.setStorageSync(cacheKey, savedPath)
          console.log('PDF 已缓存到:', savedPath)
          
          // 打开 PDF
          wx.openDocument({
            filePath: savedPath,
            fileType: 'pdf',
            showMenu: true,
            success: () => console.log('打开 PDF 成功'),
            fail: err => {
              console.error('打开 PDF 失败:', err)
              wx.showToast({ title: '打开文件失败', icon: 'none' })
            }
          })
        } catch (saveErr) {
          console.warn('保存 PDF 失败，使用临时文件:', saveErr)
          // 保存失败，直接使用临时文件打开
          wx.openDocument({
            filePath: tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            success: () => console.log('打开临时 PDF 成功'),
            fail: err => {
              console.error('打开 PDF 失败:', err)
              wx.showToast({ title: '打开文件失败', icon: 'none' })
            }
          })
        }
      },
      fail: err => {
        wx.hideLoading()
        console.error('下载 PDF 失败:', err)
        wx.showToast({ title: '下载失败，请检查网络', icon: 'none' })
      }
    })
    
    // 监听下载进度
    downloadTask.onProgressUpdate(res => {
      const progress = res.progress || 0
      wx.showLoading({ title: `正在下载 ${progress}%`, mask: true })
    })
  },

  /**
   * 简单的字符串 hash 函数
   */
  hashCode(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
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

  // 助手封面图兜底：若 cloud:// 无法显示则显示空图
  onAssistantImageError(e){
    const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key
    // 不再使用测试图片作为兜底
    if (key === 'toolkit') {
      this.setData({ assistantToolkitCover: '' })
    } else if (key === 'course') {
      this.setData({ assistantCourseCover: '' })
    }
  }
})
