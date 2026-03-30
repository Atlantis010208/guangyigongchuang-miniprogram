/**
 * 课程列表页
 * 对接 courses_list 云函数获取课程数据
 */
const util = require('../../../utils/util')
const { courses: mockCourses } = require('../data.js');

Page({
  data: {
    userAvatar: '', // 用户头像URL（临时链接）
    avatarFileID: '', // 用户头像 cloud:// fileID（用于重试）
    courses: [],
    featuredCourse: null,
    loading: true,
    error: null,
    // 分页参数
    pagination: {
      limit: 20,
      offset: 0,
      hasMore: false
    }
  },

  onLoad() {
    this.loadCourses();
  },

  onShow() {
    // 更新自定义 tabBar 的选中状态和角色
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 2 }) // 课程在 ownerList 中变成了索引 2
    }
    // 每次显示时刷新用户头像（用户可能刚登录或修改了头像）
    this.loadUserAvatar();
    // 每次显示时刷新课程列表（确保获取最新数据，包括价格更新）
    this.loadCourses();
  },

  onPullDownRefresh() {
    // 下拉刷新，重新加载数据
    this.setData({
      'pagination.offset': 0,
      courses: [],
      featuredCourse: null
    });
    this.loadCourses().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    // 上拉加载更多
    if (this.data.pagination.hasMore && !this.data.loading) {
      this.loadMoreCourses();
    }
  },

  /**
   * 加载课程列表
   */
  async loadCourses() {
    this.setData({ loading: true, error: null });

    try {
      const res = await wx.cloud.callFunction({
        name: 'courses_list',
        data: {
          limit: this.data.pagination.limit,
          offset: 0
        }
      });

      console.log('[courses_list] Response:', res.result);

      if (res.result && res.result.success) {
        const { data, total, pagination } = res.result;
        
        // 🔍 调试日志：查看返回的课程数量
        console.log('[课程中心] 云函数返回课程数量:', data.length);
        console.log('[课程中心] 课程列表:', data);
        
        // 区分推荐课程和普通课程
        const featuredCourse = data.find(c => c.isFeatured) || data[0] || null;

        // 临时修正：强制更新推荐课程标题以匹配 UI 设计要求
        if (featuredCourse) {
          featuredCourse.title = '二哥10年经验灯光课，不错过任何精彩瞬间。立即观看。';
        }
        
        const otherCourses = data.filter(c => c !== featuredCourse);
        
        console.log('[课程中心] 推荐课程:', featuredCourse);
        console.log('[课程中心] 其他课程数量:', otherCourses.length);

        this.setData({
          courses: otherCourses,
          featuredCourse: featuredCourse,
          isPurchased: featuredCourse ? featuredCourse.isPurchased : false,
          loading: false,
          pagination: {
            ...this.data.pagination,
            offset: pagination.offset + data.length,
            hasMore: pagination.hasMore
          }
        });
      } else {
        throw new Error(res.result?.errorMessage || '加载失败');
      }
    } catch (err) {
      console.error('[courses_list] Error:', err);
      this.setData({
        loading: false,
        error: err.message || '网络错误，请稍后重试'
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载更多课程
   */
  async loadMoreCourses() {
    if (!this.data.pagination.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'courses_list',
        data: {
          limit: this.data.pagination.limit,
          offset: this.data.pagination.offset
        }
      });

      if (res.result && res.result.success) {
        const { data, pagination } = res.result;
        
        this.setData({
          courses: [...this.data.courses, ...data],
          loading: false,
          pagination: {
            ...this.data.pagination,
            offset: this.data.pagination.offset + data.length,
            hasMore: pagination.hasMore
          }
        });
      }
    } catch (err) {
      console.error('[courses_list] Load more error:', err);
      this.setData({ loading: false });
    }
  },

  /**
   * 重试加载
   */
  onRetry() {
    this.loadCourses();
  },

  /**
   * 点击播放按钮
   */
  onPlayTap(e) {
    const id = e.currentTarget.dataset.id;
    // 跳转到课程详情页，传递 autoPlay 参数
    wx.navigateTo({
      url: `/pages/course/course-detail/course-detail?id=${id}&autoPlay=1`,
    });
  },

  /**
   * 点击课程卡片
   */
  onCourseTap(e) {
    const id = e.currentTarget.dataset.id;
    const purchased = e.currentTarget.dataset.purchased === true;
    wx.navigateTo({
      url: purchased
        ? `/pages/course/course-detail/course-detail?id=${id}&tab=1`
        : `/pages/course/course-detail/course-detail?id=${id}`,
    });
  },

  /**
   * 点击头像 - 跳转到个人中心
   */
  onUserTap() {
    wx.navigateTo({ url: '/pages/profile/home/home' })
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
        console.log('[课程中心] 用户未设置头像，显示默认图标')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      // 如果头像是云存储的 fileID，需要转换为临时链接
      if (avatarUrl.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
        avatarFileID = avatarUrl // 保存原始 fileID
        try {
          console.log('[课程中心] 正在转换头像 fileID:', avatarUrl)
          const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
          if (res && res.fileList && res.fileList[0]) {
            const fileItem = res.fileList[0]
            if (fileItem.tempFileURL) {
              console.log('[课程中心] 头像转换成功:', fileItem.tempFileURL)
              this.setData({ 
                userAvatar: fileItem.tempFileURL,
                avatarFileID: avatarFileID 
              })
            } else if (fileItem.status !== 0) {
              // 文件可能已被删除
              console.warn('[课程中心] 头像文件可能已被删除:', fileItem.status)
              this.setData({ userAvatar: '', avatarFileID: '' })
            } else {
              console.warn('[课程中心] 头像转换返回空链接')
              this.setData({ userAvatar: '', avatarFileID: avatarFileID })
            }
          } else {
            console.warn('[课程中心] 头像转换返回数据异常')
            this.setData({ userAvatar: '', avatarFileID: avatarFileID })
          }
        } catch (e) {
          console.warn('[课程中心] 转换头像URL失败', e)
          // 保存 fileID 以便稍后重试
          this.setData({ userAvatar: '', avatarFileID: avatarFileID })
        }
        return
      }

      // 如果是 tcb.qcloud.la 的临时链接（可能已过期），需要从云数据库重新获取
      if (avatarUrl.includes('tcb.qcloud.la') || avatarUrl.includes('.tcb.')) {
        console.log('[课程中心] 检测到临时链接，尝试刷新')
        await this.refreshAvatarFromCloud()
        return
      }

      // 其他情况（如普通 http/https 外链），直接使用
      console.log('[课程中心] 使用外部头像链接:', avatarUrl)
      this.setData({ userAvatar: avatarUrl, avatarFileID: '' })
    } catch (e) {
      console.warn('[课程中心] 加载用户头像失败', e)
      this.setData({ userAvatar: '', avatarFileID: '' })
    }
  },

  /**
   * 从云数据库重新获取头像 fileID 并转换为临时链接
   */
  async refreshAvatarFromCloud() {
    if (!wx.cloud) {
      console.warn('[课程中心] 云开发不可用')
      this.setData({ userAvatar: '', avatarFileID: '' })
      return
    }

    try {
      const openid = util.getStorage('openid')
      const userDoc = util.getStorage('userDoc')
      const userId = userDoc && userDoc._id

      if (!userId && !openid) {
        console.log('[课程中心] 用户未登录，无法刷新头像')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      console.log('[课程中心] 从云数据库获取头像...', { userId, openid })
      const db = wx.cloud.database()
      let userRecord = null

      if (userId) {
        try {
          const res = await db.collection('users').doc(userId).get()
          userRecord = res && res.data
        } catch (e) {
          console.warn('[课程中心] 通过 userId 查询失败:', e.message)
        }
      }
      
      if (!userRecord && openid) {
        try {
          const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
          userRecord = res && res.data && res.data[0]
        } catch (e) {
          console.warn('[课程中心] 通过 openid 查询失败:', e.message)
        }
      }

      if (!userRecord || !userRecord.avatarUrl) {
        console.log('[课程中心] 用户记录不存在或无头像')
        this.setData({ userAvatar: '', avatarFileID: '' })
        return
      }

      const fileID = userRecord.avatarUrl
      console.log('[课程中心] 数据库中的头像:', fileID)

      // 如果数据库中存的是 cloud:// fileID，则转换
      if (fileID.startsWith('cloud://')) {
        const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          console.log('[课程中心] 头像刷新成功')
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
          console.warn('[课程中心] 头像文件可能已被删除')
          this.setData({ userAvatar: '', avatarFileID: '' })
        }
      } else {
        // 数据库中存的不是 fileID（可能是外部链接），直接使用
        console.log('[课程中心] 使用外部头像链接')
        this.setData({ userAvatar: fileID, avatarFileID: '' })
      }
    } catch (e) {
      console.warn('[课程中心] 从云数据库刷新头像失败', e)
      this.setData({ userAvatar: '', avatarFileID: '' })
    }
  },

  /**
   * 头像图片加载失败时的处理
   * 当临时链接过期或文件不存在时触发
   */
  async onAvatarError() {
    console.warn('[课程中心] 头像图片加载失败，尝试重新获取')
    
    const { avatarFileID } = this.data
    
    // 如果有保存的 fileID，尝试重新获取临时链接
    if (avatarFileID && avatarFileID.startsWith('cloud://') && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [avatarFileID] })
        if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          console.log('[课程中心] 重新获取头像成功')
          this.setData({ userAvatar: res.fileList[0].tempFileURL })
          return
        }
      } catch (e) {
        console.warn('[课程中心] 重新获取头像失败', e)
      }
    }
    
    // 重试失败，尝试从云数据库重新获取
    await this.refreshAvatarFromCloud()
  }
});
