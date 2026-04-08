/**
 * 视频播放页
 * 对接 course_videos 云函数获取视频数据
 * 性能优化版 V3 - 流量优化版
 * 
 * 优化点：
 * 1. 减少不必要的 setData 调用
 * 2. 添加缓冲状态监听
 * 3. 优化视频切换逻辑，避免竞态条件
 * 4. 节流 onTimeUpdate（2000ms）
 * 5. 添加视频预加载
 * 6. 简化控件减少渲染压力
 * 7. 启用视频缓存 (custom-cache)
 * 
 * 【流量优化 V3】：
 * 8. 延迟加载视频链接：首次只获取当前课时的视频临时链接
 * 9. 按需获取：切换课时时才获取对应的视频链接
 * 10. 本地缓存：已获取的视频链接缓存到本地，避免重复请求
 * 11. 智能预加载：播放进度达到 80% 时预加载下一课时的链接
 */
Page({
  data: {
    course: null,
    currentLesson: null,
    chapters: [],
    loading: true,
    error: null,
    errorCode: null,
    
    // Player State
    isPlaying: false,
    isFullscreen: false,
    isBuffering: false,
    autoplay: true,
    
    // 视频加载状态
    videoLoaded: false,
    
    // 长视频友好提示
    isLongVideo: false,
    bufferingText: '视频加载中...',
    
    // 倍速控制
    playbackRate: 1.0,
    showOptionsPanel: false,
    
    // 🆕 多分辨率控制（默认720p以节省CDN流量）
    currentQuality: '720p',            // 当前选择的分辨率
    availableQualities: [],            // 可用的分辨率列表
    qualityLabels: {                   // 分辨率显示名称
      '480p': '480p 标清',
      '720p': '720p 高清',
      '1080p': '1080p 超清'
    },
    
    // 🆕 观看人数（从云函数获取真实数据）
    viewerCount: 0,
    
    // 已学习人数（从云函数获取真实数据）
    learnedCount: 0,
    
    // 🆕 当前播放到的视频章节索引
    currentChapterIndex: -1
  },

  // 实例属性（不触发渲染）
  // 注意：不要在这里定义复杂对象，会产生警告
  // _preloadedUrls 等复杂对象在 onLoad 中初始化

  onLoad(options) {
    // 初始化实例属性
    this._isPlaying = false;
    this._lastTimeUpdate = 0;
    this._switchingLesson = false;
    this._bufferingTimer = null;
    this._seekingTimer = null;  // 拖动进度条的定时器
    this._retryCount = 0;       // 视频重试计数器
    this._currentTime = 0;      // 当前播放时间
    this._duration = 0;         // 视频总时长
    this._viewerCountTimer = null;  // 🆕 观看人数刷新定时器
    
    // 【流量优化】视频链接缓存（避免重复获取临时链接）
    this._videoUrlCache = {};   // { lessonId: { videoUrl, videoUrls, expireAt } }
    this._preloadingLesson = null;  // 正在预加载的课时ID
    
    const { courseId, lessonId } = options;
    this.courseId = courseId;
    this.lessonId = lessonId;
    
    console.log('[video-player] onLoad:', { courseId, lessonId });
    
    if (courseId) {
      this.loadCourseVideos(courseId, lessonId);
    } else {
      this.setData({
        loading: false,
        error: '缺少课程参数',
        errorCode: 'INVALID_PARAMS'
      });
    }
  },

  onReady() {
    this.videoContext = wx.createVideoContext('courseVideo');
    console.log('[video-player] onReady, videoContext created');
    
    // 🆕 开始定时刷新观看人数
    this.startViewerCountRefresh();
  },

  async onUnload() {
    console.log('[video-player] onUnload');
    
    // 🆕 离开观看
    await this.leaveViewing();
    
    // 🆕 停止定时刷新
    this.stopViewerCountRefresh();
    
    // 保存当前观看进度
    await this.saveCurrentProgress();
    
    // 清理所有定时器
    if (this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
      this._bufferingTimer = null;
    }
    if (this._seekingTimer) {
      clearTimeout(this._seekingTimer);
      this._seekingTimer = null;
    }
    
    if (this.videoContext) {
      try {
      this.videoContext.stop();
      } catch (e) {
        // ignore
      }
    }
  },
  
  async onHide() {
    console.log('[video-player] onHide');
    
    // 🆕 离开观看（无论播放还是暂停状态）
    // 当用户切换到后台或返回上一页时，都应该标记为离开
    // 如果用户回来（onShow），会自动重新加入
    await this.leaveViewing();
    
    // 🆕 停止定时刷新
    this.stopViewerCountRefresh();
    
    // 保存当前观看进度
    await this.saveCurrentProgress();
    
    // 页面隐藏时暂停视频，减少资源占用
    if (this.videoContext && this._isPlaying) {
      console.log('[video-player] onHide, pausing video');
      this.videoContext.pause();
    }
  },
  
  onShow() {
    // 页面显示时不自动恢复播放，让用户手动点击
    // 这样可以避免一些奇怪的状态问题
    console.log('[video-player] onShow');
    
    // 🆕 重新加入观看（无论之前是播放还是暂停）
    // 只要有当前课时，就标记为正在观看
    if (this.data.currentLesson && this.data.currentLesson.id) {
      this.joinViewing();
      this.startViewerCountRefresh();
    }
  },

  /**
   * 加载课程视频数据
   */
  async loadCourseVideos(courseId, lessonId) {
    console.log('[video-player] loadCourseVideos start:', { courseId, lessonId });
    
    this.setData({ 
      loading: true, 
      error: null, 
      errorCode: null,
      videoLoaded: false,
      isBuffering: false
    });

    try {
      const startTime = Date.now();
      const res = await wx.cloud.callFunction({
        name: 'course_videos',
        data: { courseId, lessonId: lessonId || undefined }
      });
      console.log('[video-player] Cloud function took:', Date.now() - startTime, 'ms');

      if (res.result && res.result.success) {
        const { courseId: id, title, chapters, currentLesson, coverUrl, lazyLoadEnabled } = res.result.data;

        // 【流量优化】记录是否启用了延迟加载
        this._lazyLoadEnabled = lazyLoadEnabled !== false;
        console.log(`[video-player] 延迟加载模式: ${this._lazyLoadEnabled ? '已启用' : '已禁用'}`);

        // 🆕 解析可用分辨率
        const availableQualities = this.parseAvailableQualities(currentLesson);
        
        // 🆕 恢复用户分辨率偏好（默认720p以节省CDN流量）
        let currentQuality = '720p';  // 默认 720p
        try {
          const savedQuality = wx.getStorageSync('preferredQuality');
          if (savedQuality) {
            currentQuality = savedQuality;
            console.log(`[video-player] 恢复用户偏好分辨率: ${currentQuality}`);
          } else {
            console.log('[video-player] 使用默认分辨率: 720p');
          }
        } catch (e) {
          console.warn('[video-player] 读取偏好失败:', e);
        }
        
        // 🆕 如果偏好分辨率不可用，降级到最高可用分辨率
        if (!availableQualities.includes(currentQuality)) {
          const fallbackQuality = availableQualities[availableQualities.length - 1] || '720p';
          console.log(`[video-player] 偏好分辨率 ${currentQuality} 不可用，降级到 ${fallbackQuality}`);
          currentQuality = fallbackQuality;
        }
        
        // 🆕 根据选定分辨率设置视频 URL
        const videoUrl = this.getVideoUrlByQuality(currentLesson, currentQuality);
        if (videoUrl) {
          currentLesson.videoUrl = videoUrl;
          console.log(`[video-player] 使用 ${currentQuality} 视频 URL`);
        } else {
          console.warn(`[video-player] 未找到 ${currentQuality} 视频 URL`);
        }
        
        // 🆕 统一处理所有章节和课时的章节数据
        if (chapters && chapters.length > 0) {
          chapters.forEach(chapter => {
            if (chapter.lessons && chapter.lessons.length > 0) {
              chapter.lessons.forEach(lesson => {
                this._processLessonChapters(lesson);
              });
            }
          });
        }

        // 🆕 处理当前课时（如果是独立对象）
        if (currentLesson) {
          this._processLessonChapters(currentLesson);
        }
        
        // 【流量优化】设置视频封面图 poster
        if (currentLesson) {
          currentLesson.poster = coverUrl || '';
        }
        
        // 【流量优化】缓存当前课时的视频链接
        if (currentLesson && currentLesson.id) {
          this._cacheVideoUrl(currentLesson);
        }

        console.log('[video-player] Video URL:', currentLesson?.videoUrl?.substring(0, 100) + '...');

        // 检测是否是长视频（超过30分钟）
        const isLongVideo = this._isLongVideo(currentLesson?.duration);

        // 一次性更新所有状态，减少渲染次数
        this.setData({
          course: { id, title, coverUrl: coverUrl || '' },  // 【流量优化】添加封面URL
          chapters: chapters || [],
          currentLesson: currentLesson,
          currentQuality: currentQuality,        // 🆕 当前分辨率
          availableQualities: availableQualities, // 🆕 可用分辨率列表
          loading: false,
          autoplay: true,
          isLongVideo: isLongVideo,
          bufferingText: isLongVideo ? '长视频加载中，请稍候...' : '视频加载中...'
        });

        wx.setNavigationBarTitle({
          title: currentLesson?.title || title || '视频播放'
        });

        // 🆕 课程数据加载完成后，立即获取观看人数和已学习人数
        // 延迟一小段时间确保 setData 完成
        setTimeout(() => {
          this.getViewerCount();
          this.getLearnedCount();
        }, 100);

      } else {
        const errorCode = res.result?.code || 'UNKNOWN_ERROR';
        const errorMessage = res.result?.errorMessage || '加载失败';
        
        console.error('[video-player] Load failed:', errorCode, errorMessage);

        this.setData({
          loading: false,
          error: errorMessage,
          errorCode: errorCode
        });

        if (errorCode === 'UNAUTHORIZED') {
          this.showLoginPrompt();
        } else if (errorCode === 'NOT_PURCHASED') {
          this.showPurchasePrompt();
        }
      }
    } catch (err) {
      console.error('[video-player] Load error:', err);
      this.setData({
        loading: false,
        error: err.message || '网络错误',
        errorCode: 'NETWORK_ERROR'
      });
    }
  },

  showLoginPrompt() {
    wx.showModal({
      title: '请先登录',
      content: '观看课程视频需要先登录',
      confirmText: '去登录',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/login/login' });
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  showPurchasePrompt() {
    wx.showModal({
      title: '尚未购买',
      content: '您还没有购买此课程，请先购买后观看',
      confirmText: '去购买',
      cancelText: '返回',
      success: () => { wx.navigateBack(); }
    });
  },

  onRetry() {
    if (this.courseId) {
      this.loadCourseVideos(this.courseId, this.lessonId);
    }
  },

  // ==================== 视频事件（优化版 V2） ====================

  /**
   * 时间更新 - 节流 2000ms（进一步减少调用频率）
   * 使用实例属性避免触发渲染
   * 【流量优化】添加智能预加载逻辑
   */
  onTimeUpdate(e) {
    const now = Date.now();
    
    // 记录当前播放位置和总时长（用于保存进度）
    this._currentTime = e.detail.currentTime || 0;
    this._duration = e.detail.duration || 0;
    
    // ==================
    // 🆕 视频章节高亮逻辑 (无节流限制，保证高亮及时)
    // ==================
    const currentLesson = this.data.currentLesson;
    if (currentLesson && currentLesson.timeChapters && currentLesson.timeChapters.length > 0) {
      const chapters = currentLesson.timeChapters;
      let activeIndex = -1;
      
      // 找到最后一个 time <= currentTime 的章节
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (this._currentTime >= chapters[i].time) {
          activeIndex = i;
          break;
        }
      }
      
      // 如果计算出的高亮章节与当前不同，则更新 UI
      if (activeIndex !== this.data.currentChapterIndex) {
        this.setData({ currentChapterIndex: activeIndex });
      }
    }
    
    // 增加节流时间到 2 秒，减少事件处理频率
    if (now - this._lastTimeUpdate < 2000) return;
    this._lastTimeUpdate = now;
    
    // 如果正在缓冲但视频在播放，取消缓冲状态
    if (this.data.isBuffering && e.detail.currentTime > 0) {
      this._clearBuffering();
    }
    
    // 【流量优化】智能预加载：播放进度达到 80% 时预加载下一课时
    if (this._lazyLoadEnabled && this._duration > 0) {
      const progress = this._currentTime / this._duration;
      if (progress >= 0.8 && !this._preloadTriggered) {
        this._preloadTriggered = true;  // 防止重复触发
        this._preloadNextLessonUrl();
      }
    }
  },
  
  /**
   * 🆕 点击视频章节跳转
   */
  onChapterTap(e) {
    const time = e.currentTarget.dataset.time;
    if (typeof time === 'number' && this.videoContext) {
      console.log(`[video-player] 跳转到章节时间: ${time}s`);
      this.videoContext.seek(time);
      // 跳转后自动播放
      this.videoContext.play();
    }
  },

  /**
   * 视频开始播放
   * 【关键优化】不调用 setData，完全避免重渲染导致的卡顿
   */
  onVideoPlay() {
    // 只更新实例属性，不触发渲染
    this._isPlaying = true;
    this._switchingLesson = false;
    
    // 🆕 加入观看
    this.joinViewing();
    
    // 清除缓冲定时器
    if (this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
      this._bufferingTimer = null;
    }
    if (this._seekingTimer) {
      clearTimeout(this._seekingTimer);
      this._seekingTimer = null;
    }
    
    // 只有在需要隐藏缓冲层时才调用 setData
    if (this.data.isBuffering) {
      this.setData({ isBuffering: false });
    }
  },

  /**
   * 视频暂停
   * 【关键优化】不调用 setData，完全避免重渲染
   * 【观看统计】暂停时不离开观看，用户仍然算作"正在观看"
   */
  onVideoPause() {
    // 只更新实例属性，不触发渲染
    this._isPlaying = false;
    
    // ✅ 暂停时不调用 leaveViewing()，继续算作观看
    // 用户需要真正离开页面（onUnload/onHide）才停止统计
    
    // 不再调用 setData，因为 WXML 中没有使用 isPlaying
  },

  /**
   * 视频等待/缓冲中
   * 【关键优化】只在真正需要时才显示缓冲提示
   */
  onVideoWaiting() {
    // 如果视频正在播放，忽略 waiting 事件（可能是预加载下一段）
    if (this._isPlaying) return;
    
    // 清除之前的定时器
    if (this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
    }
    
    // 使用更长的延迟（2秒），只有持续缓冲才显示
    this._bufferingTimer = setTimeout(() => {
      if (!this._isPlaying && !this.data.isBuffering) {
        this.setData({ isBuffering: true });
      }
    }, 2000);
  },
  
  /**
   * 视频元数据加载完成
   */
  onVideoLoaded(e) {
    const duration = e.detail?.duration || 0;
    console.log('[video-player] onVideoLoaded, duration:', duration);
    
    // 更新视频总时长
    this._duration = duration;
    
    // 清除缓冲状态
    this._clearBuffering();
    
    // 🔧 关键：检查是否是分辨率切换后的加载
    if (this._qualityChangePending && this._seekAfterQualityChange > 0) {
      const seekTime = this._seekAfterQualityChange;
      console.log(`[video-player] 分辨率切换后恢复播放位置: ${seekTime} 秒`);
      
      // 清除标记
      this._qualityChangePending = false;
      this._seekAfterQualityChange = 0;
      
      // 延迟一小段时间确保视频组件准备好
      setTimeout(() => {
        if (this.videoContext) {
          this.videoContext.seek(seekTime);
          this.videoContext.play();
          
          wx.showToast({
            title: `已切换到${this.data.qualityLabels[this.data.currentQuality]}`,
            icon: 'none',
            duration: 1500
          });
        }
      }, 100);
      
      this.setData({ 
        videoLoaded: true,
        isBuffering: false 
      });
      return;
    }
    
    if (!this.data.videoLoaded) {
      this.setData({ videoLoaded: true });
      
      // 视频加载完成后，检查是否需要跳转到上次观看位置
      this.resumeVideoProgress(duration);
    }
  },
  
  /**
   * 视频缓冲进度更新
   * 【优化】只清除定时器，不调用 setData
   */
  onVideoProgress(e) {
    // 有缓冲进度时清除缓冲定时器（但不立即更新 UI）
    if (e.detail.buffered > 0 && this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
      this._bufferingTimer = null;
    }
  },
  
  /**
   * 视频跳转完成（拖动进度条后触发）
   * 【优化】只清除定时器，不频繁更新 UI
   */
  onVideoSeeked() {
    // 清除缓冲定时器
    if (this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
      this._bufferingTimer = null;
    }
    if (this._seekingTimer) {
      clearTimeout(this._seekingTimer);
      this._seekingTimer = null;
    }
  },
  
  /**
   * 清除缓冲状态（仅在必要时更新 UI）
   * @private
   */
  _clearBuffering() {
    // 清除定时器
    if (this._bufferingTimer) {
      clearTimeout(this._bufferingTimer);
      this._bufferingTimer = null;
    }
    if (this._seekingTimer) {
      clearTimeout(this._seekingTimer);
      this._seekingTimer = null;
    }
    
    // 只有当缓冲层显示时才更新 UI
    if (this.data.isBuffering) {
      this.setData({ isBuffering: false });
    }
  },

  /**
   * 视频播放结束
   * 【观看统计】播放完毕时不离开观看，用户仍然算作"正在观看"
   */
  async onVideoEnded() {
    console.log('[video-player] onVideoEnded');
    this._isPlaying = false;
    
    // ✅ 播放结束时不调用 leaveViewing()，继续算作观看
    // 用户需要真正离开页面或切换课程才停止统计
    
    // 记录课时完成状态
    await this.updateCourseProgress('complete');
    
    this.playNextLesson();
  },

  /**
   * 视频错误
   * 特别处理 MEDIA_ERR_SRC_NOT_SUPPORTED 错误（拖动进度条后常见）
   */
  onVideoError(e) {
    console.error('[video-player] onVideoError:', e.detail);
    this._clearBuffering();
    this._isPlaying = false;
    
    const errMsg = (e.detail.errMsg || '').toUpperCase();
    
    // 特殊处理：MEDIA_ERR_SRC_NOT_SUPPORTED 错误，尝试重新加载视频
    if (errMsg.includes('SRC_NOT_SUPPORTED') || errMsg.includes('MEDIA_ERR')) {
      console.log('[video-player] Attempting to reload video due to SRC_NOT_SUPPORTED error');
      
      // 记录重试次数，避免无限重试
      this._retryCount = (this._retryCount || 0) + 1;
      
      if (this._retryCount <= 2) {
        // 重新加载当前视频
        this._reloadCurrentVideo();
        return;
      } else {
        // 重试次数用完，重置计数器
        this._retryCount = 0;
      }
    }
    
    // 只在需要时更新缓冲状态
    if (this.data.isBuffering) {
    this.setData({ isBuffering: false });
    }
    
    // 根据错误类型提示不同信息
    let toastMsg = '视频加载失败';
    const errMsgLower = errMsg.toLowerCase();
    
    if (errMsgLower.includes('network') || errMsgLower.includes('timeout')) {
      toastMsg = '网络异常，请检查网络后重试';
    } else if (errMsgLower.includes('decode') || errMsgLower.includes('format')) {
      toastMsg = '视频格式不支持';
    } else if (errMsgLower.includes('src') || errMsgLower.includes('notfound') || errMsgLower.includes('404')) {
      toastMsg = '视频加载失败，请重试';
    } else if (errMsgLower.includes('abort')) {
      toastMsg = '视频加载被中断';
    }
    
    wx.showToast({ title: toastMsg, icon: 'none', duration: 2500 });
  },
  
  /**
   * 重新加载当前视频
   * @private
   */
  _reloadCurrentVideo() {
    const { currentLesson } = this.data;
    if (!currentLesson || !currentLesson.videoUrl) {
      console.warn('[video-player] Cannot reload: no current lesson');
      return;
    }
    
    console.log('[video-player] Reloading video:', currentLesson.title);
    
    // 显示加载提示
    wx.showLoading({ title: '重新加载中...', mask: true });
    
    // 保存当前视频 URL
    const videoUrl = currentLesson.videoUrl;
    
    // 先停止视频
    if (this.videoContext) {
      try {
        this.videoContext.stop();
      } catch (e) {
        // ignore
      }
    }
    
    // 短暂延迟后重新设置视频源
    setTimeout(() => {
      // 重新获取 videoContext
      this.videoContext = wx.createVideoContext('courseVideo');
      
      // 强制重新渲染视频组件
      this.setData({
        currentLesson: { ...currentLesson, videoUrl: '' }
      });
      
      setTimeout(() => {
        this.setData({
          currentLesson: { ...currentLesson, videoUrl: videoUrl },
          isBuffering: false,
          autoplay: true
        });
        
        wx.hideLoading();
        
        // 延迟播放
        setTimeout(() => {
          if (this.videoContext) {
            this.videoContext.play();
          }
        }, 300);
      }, 100);
    }, 200);
  },

  /**
   * 全屏状态变化
   */
  onFullscreenChange(e) {
    const isFullscreen = e.detail.fullScreen;
    console.log('[video-player] onFullscreenChange:', isFullscreen);
    
    // 只有状态变化时才更新
    if (this.data.isFullscreen !== isFullscreen) {
      this.setData({ isFullscreen });
    }
  },

  // ==================== 播放列表（优化版 V2） ====================

  /**
   * 播放下一个课时
   */
  playNextLesson() {
    const { chapters, currentLesson } = this.data;
    if (!chapters || !currentLesson) return;

    let nextLesson = null;
    let foundCurrent = false;

    for (const chapter of chapters) {
      for (const lesson of chapter.lessons || []) {
        if (foundCurrent && lesson.type === 'video' && lesson.videoUrl) {
          nextLesson = lesson;
          break;
        }
        if (lesson.id === currentLesson.id) {
          foundCurrent = true;
        }
      }
      if (nextLesson) break;
    }

    if (nextLesson) {
      wx.showToast({ title: '即将播放下一集', icon: 'none' });
      setTimeout(() => this.switchLesson(nextLesson), 1500);
    } else {
      wx.showToast({ title: '课程已结束', icon: 'none' });
      this._isPlaying = false;
      // 不需要 setData，WXML 中不使用 isPlaying
    }
  },

  /**
   * 课时点击事件
   */
  onLessonTap(e) {
    const lesson = e.currentTarget.dataset.lesson;
    
    if (!lesson) return;
    
    // 检查是否是视频类型
    if (lesson.type !== 'video') {
      wx.showToast({ title: '该章节非视频内容', icon: 'none' });
      return;
    }
    
    // 🔧 修复：检查 videoUrls 对象或 videoUrl（兼容新旧格式）
    const hasVideoUrl = lesson.videoUrl || (lesson.videoUrls && Object.keys(lesson.videoUrls).length > 0);
    if (!hasVideoUrl) {
      wx.showToast({ title: '视频地址无效', icon: 'none' });
      return;
    }
    
    // 如果点击的是当前正在播放的课时，忽略
    if (this.data.currentLesson && lesson.id === this.data.currentLesson.id) {
      return;
    }
    
    console.log('[video-player] Switching to lesson:', lesson.title);
    this.switchLesson(lesson);
  },

  /**
   * 切换课时（优化版 V4 - 流量优化版）
   * 直接切换视频源，不销毁组件，避免 videoContext 失效
   * 【流量优化】支持延迟加载：切换时按需获取视频链接
   */
  async switchLesson(lesson) {
    if (!lesson || !lesson.id) {
      console.warn('[video-player] Invalid lesson:', lesson);
      wx.showToast({ title: '课时数据无效', icon: 'none' });
      return;
    }
    
    console.log('[video-player] switchLesson start:', lesson.title);
    
    // 🆕 离开当前课时
    if (this.data.currentLesson && this._isPlaying) {
      await this.leaveViewing();
    }
    
    // 【流量优化】检查是否需要延迟加载视频链接
    const needsLazyLoad = lesson._needsLazyLoad || 
                          (!lesson.videoUrl && (!lesson.videoUrls || !this._hasValidVideoUrl(lesson.videoUrls)));
    
    if (needsLazyLoad) {
      console.log(`[video-player] 课时 ${lesson.id} 需要延迟加载视频链接`);
      
      // 检查本地缓存
      const cachedData = this._getCachedVideoUrl(lesson.id);
      if (cachedData) {
        console.log(`[video-player] 使用缓存的视频链接`);
        lesson.videoUrl = cachedData.videoUrl;
        lesson.videoUrls = cachedData.videoUrls;
        lesson._needsLazyLoad = false;
      } else {
        // 从云函数获取视频链接
        const loadedLesson = await this._lazyLoadLessonUrl(lesson.id);
        if (loadedLesson) {
          lesson.videoUrl = loadedLesson.videoUrl;
          lesson.videoUrls = loadedLesson.videoUrls;
          lesson._needsLazyLoad = false;
          
          // 更新章节列表中的数据
          this._updateLessonInChapters(lesson.id, loadedLesson);
        } else {
          console.warn('[video-player] 延迟加载视频链接失败');
          wx.showToast({ title: '加载视频失败，请重试', icon: 'none' });
          return;
        }
      }
    }
    
    // 🔧 修复：检查 videoUrls 对象或 videoUrl（兼容新旧格式）
    const hasVideoUrl = lesson.videoUrl || (lesson.videoUrls && Object.keys(lesson.videoUrls).length > 0);
    if (!hasVideoUrl) {
      console.warn('[video-player] Invalid lesson or no video URL:', lesson);
      wx.showToast({ title: '视频地址无效', icon: 'none' });
      return;
    }
    
    // 🔧 修复：根据当前分辨率设置 videoUrl
    if (lesson.videoUrls && !lesson.videoUrl) {
      const currentQuality = this.data.currentQuality || '720p';
      const videoUrl = this.getVideoUrlByQuality(lesson, currentQuality);
      if (videoUrl) {
        lesson.videoUrl = videoUrl;
        console.log(`[video-player] 为课时 ${lesson.id} 设置 ${currentQuality} URL`);
      } else {
        // 尝试其他分辨率
        const availableQualities = this.parseAvailableQualities(lesson);
        if (availableQualities.length > 0) {
          const fallbackQuality = availableQualities[availableQualities.length - 1];
          lesson.videoUrl = this.getVideoUrlByQuality(lesson, fallbackQuality);
          console.log(`[video-player] 降级使用 ${fallbackQuality} URL`);
        }
      }
    }
    
    if (!lesson.videoUrl) {
      console.warn('[video-player] 无法获取视频 URL');
      wx.showToast({ title: '视频地址无效', icon: 'none' });
      return;
    }
    
    // 【流量优化】缓存当前课时的视频链接
    this._cacheVideoUrl(lesson);
    
    // 【流量优化】重置预加载标记
    this._preloadTriggered = false;
    
    // 先保存当前视频的观看进度
    await this.saveCurrentProgress();
    
    // 设置切换标志
    this._switchingLesson = true;
    this._isPlaying = false;
    
    // 清理缓冲定时器
    this._clearBuffering();
    
    // 先停止当前视频
    if (this.videoContext) {
      try {
        this.videoContext.pause();
        this.videoContext.stop();
      } catch (e) {
        console.warn('[video-player] Stop video error:', e);
      }
    }
    
    // 检测是否是长视频
    const isLongVideo = this._isLongVideo(lesson.duration);
    
    // 🆕 处理课时内的章节数据
    this._processLessonChapters(lesson);
    
    // 直接设置新视频源（不要先清空，避免组件被销毁）
    this.setData({
      currentLesson: lesson,
      currentChapterIndex: -1, // 切换课时重置章节索引
      isBuffering: true,
      videoLoaded: false,
      autoplay: true,
      isLongVideo: isLongVideo,
      bufferingText: isLongVideo ? '长视频加载中，请稍候...' : '视频加载中...'
    });

    wx.setNavigationBarTitle({ title: lesson.title || '视频播放' });

    // 延迟重新获取 videoContext 并播放
    setTimeout(() => {
      // 重新获取 videoContext（防止组件重建后失效）
      this.videoContext = wx.createVideoContext('courseVideo');
      this._switchingLesson = false;
      
      if (this.videoContext) {
        try {
          console.log('[video-player] Calling play()');
          this.videoContext.play();
        } catch (e) {
          console.warn('[video-player] Play error:', e);
        }
      }
      
      // 🆕 刷新观看人数和已学习人数（延迟获取，确保课时已切换）
      setTimeout(() => {
        this.getViewerCount();
        this.getLearnedCount();
      }, 500);
    }, 300);
  },

  /**
   * 处理课时内的视频章节数据
   * 包括格式化时间显示和测试用的 Mock 数据注入
   * @param {Object} lesson - 课时对象
   * @private
   */
  _processLessonChapters(lesson) {
    if (!lesson) return;

    // 【测试代码】如果当前视频没有章节数据，自动加一点用于预览 UI
    // 注意：正式环境上线前应移除此 Mock 逻辑
    if (!lesson.timeChapters || lesson.timeChapters.length === 0) {
      lesson.timeChapters = [
        { time: 0, title: '前言介绍' },
        { time: 15, title: '核心原理解析' },
        { time: 45, title: '实操演示环节' },
        { time: 70, title: '课程总结与作业' }
      ];
    }

    if (lesson.timeChapters && lesson.timeChapters.length > 0) {
      // 确保按时间排序
      lesson.timeChapters.sort((a, b) => a.time - b.time);
      // 格式化时间显示
      lesson.timeChapters.forEach(chapter => {
        const mins = Math.floor(chapter.time / 60);
        const secs = Math.floor(chapter.time % 60);
        chapter.timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      });
    }
  },

  /**
   * 检测是否是长视频（超过30分钟）
   * @param {string} duration - 时长字符串，如 "01:08:33" 或 "18:21"
   * @returns {boolean} 是否是长视频
   * @private
   */
  _isLongVideo(duration) {
    if (!duration) return false;
    
    const parts = duration.split(':').map(Number);
    let totalMinutes = 0;
    
    if (parts.length === 3) {
      // HH:MM:SS 格式
      totalMinutes = parts[0] * 60 + parts[1];
    } else if (parts.length === 2) {
      // MM:SS 格式
      totalMinutes = parts[0];
    }
    
    // 超过 30 分钟认为是长视频
    return totalMinutes >= 30;
  },

  // ==================== 倍速控制 ====================

  /**
   * 打开更多选项面板
   */
  onMoreTap() {
    this.setData({ showOptionsPanel: true });
  },

  /**
   * 关闭选项面板
   */
  onCloseOptions() {
    this.setData({ showOptionsPanel: false });
  },

  /**
   * 选择播放速度
   */
  onSelectSpeed(e) {
    const rate = parseFloat(e.currentTarget.dataset.rate);
    this.setPlaybackRate(rate);
  },

  /**
   * 设置播放速度
   */
  setPlaybackRate(rate) {
    console.log('[video-player] setPlaybackRate:', rate);
    
    this.setData({ 
      playbackRate: rate,
      showOptionsPanel: false
    });

    // 重新获取 videoContext 并设置倍速
    this.videoContext = wx.createVideoContext('courseVideo');
    
    if (this.videoContext) {
      this.videoContext.playbackRate(rate);
      
      // 确保视频继续播放
      setTimeout(() => {
        if (this.videoContext) {
          this.videoContext.play();
        }
      }, 100);
    }

    wx.showToast({
      title: `已切换为 ${rate}x`,
      icon: 'none',
      duration: 1000
    });
  },

  /**
   * 恢复视频播放进度
   * @param {number} duration - 视频总时长（秒）
   */
  resumeVideoProgress(duration) {
    const { currentLesson } = this.data;
    
    if (!currentLesson || !duration) {
      return;
    }
    
    const progress = currentLesson.progress || 0;
    const isCompleted = currentLesson.isCompleted || false;
    
    // 只有进度在 5%-95% 之间才跳转到上次观看位置
    // 未学习（<5%）或已完成（≥95%）从头开始播放
    if (progress >= 5 && progress < 95 && !isCompleted) {
      // 计算跳转时间点（秒）
      const seekTime = Math.floor((progress / 100) * duration);
      
      console.log('[video-player] 恢复播放进度:', {
        progress: progress + '%',
        seekTime: seekTime + 's',
        duration: duration + 's'
      });
      
      // 延迟跳转，确保视频已准备好
      setTimeout(() => {
        if (this.videoContext) {
          this.videoContext.seek(seekTime);
          
          // 显示提示
          wx.showToast({
            title: `继续播放 ${progress}%`,
            icon: 'none',
            duration: 2000
          });
        }
      }, 500);
    } else {
      console.log('[video-player] 从头开始播放:', {
        progress: progress + '%',
        isCompleted: isCompleted
      });
    }
  },

  /**
   * 保存当前观看进度
   */
  async saveCurrentProgress() {
    const { course, currentLesson } = this.data;
    
    if (!course || !course.id || !currentLesson || !currentLesson.id) {
      return;
    }
    
    // 【关键】如果该课时已经完成，不再更新进度，保持完成状态
    if (currentLesson.isCompleted) {
      console.log('[video-player] 该课时已完成，跳过进度保存');
      return;
    }
    
    // 只有观看时间超过5秒才保存进度
    if (!this._currentTime || this._currentTime < 5) {
      return;
    }
    
    // 计算观看进度百分比
    const progress = this._duration > 0 
      ? Math.round((this._currentTime / this._duration) * 100) 
      : 0;
    
    // 如果进度小于5%，不保存（可能是刚打开就退出了）
    if (progress < 5) {
      return;
    }
    
    console.log('[video-player] 保存观看进度:', {
      courseId: course.id,
      lessonId: currentLesson.id,
      currentTime: this._currentTime,
      duration: this._duration,
      progress: progress
    });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'course_progress_update',
        data: {
          courseId: course.id,
          lessonId: currentLesson.id,
          lessonProgress: progress,
          action: 'update'
        }
      });
      
      if (res.result && res.result.success) {
        // 更新本地章节列表中的进度显示
        this.updateLocalLessonProgress(currentLesson.id, progress, progress >= 95);
      }
    } catch (err) {
      console.error('[video-player] 保存进度出错:', err);
    }
  },

  /**
   * 更新本地章节列表中的课时进度
   * @param {string} lessonId - 课时ID
   * @param {number} progress - 进度百分比
   * @param {boolean} isCompleted - 是否完成
   */
  updateLocalLessonProgress(lessonId, progress, isCompleted) {
    const { chapters } = this.data;
    if (!chapters) return;
    
    // 深拷贝章节数据
    const updatedChapters = JSON.parse(JSON.stringify(chapters));
    
    // 查找并更新对应的课时
    for (const chapter of updatedChapters) {
      for (const lesson of chapter.lessons || []) {
        if (lesson.id === lessonId) {
          lesson.progress = progress;
          lesson.isCompleted = isCompleted;
          console.log('[video-player] 本地更新课时进度:', {
            lessonId,
            progress,
            isCompleted
          });
          break;
        }
      }
    }
    
    // 更新页面数据
    this.setData({ chapters: updatedChapters });
  },

  /**
   * 更新课程学习进度
   * @param {string} action - 'update' 或 'complete'
   */
  async updateCourseProgress(action = 'update') {
    const { course, currentLesson } = this.data;
    
    if (!course || !course.id || !currentLesson || !currentLesson.id) {
      console.warn('[video-player] 缺少课程或课时信息，无法更新进度');
      return;
    }
    
    try {
      console.log('[video-player] 更新学习进度:', {
        courseId: course.id,
        lessonId: currentLesson.id,
        action: action
      });
      
      const res = await wx.cloud.callFunction({
        name: 'course_progress_update',
        data: {
          courseId: course.id,
          lessonId: currentLesson.id,
          lessonProgress: 100, // 完成时进度为100
          action: action
        }
      });
      
      if (res.result && res.result.success) {
        console.log('[video-player] 学习进度更新成功:', res.result.data);
        // 更新本地章节列表中的进度显示
        this.updateLocalLessonProgress(currentLesson.id, 100, true);
      } else {
        console.error('[video-player] 学习进度更新失败:', res.result);
      }
    } catch (err) {
      console.error('[video-player] 更新学习进度出错:', err);
    }
  },

  // ==================== 多分辨率功能 ====================

  /**
   * 解析课时支持的分辨率
   * @param {Object} lesson - 课时对象
   * @returns {Array<string>} 分辨率列表，例如 ['480p', '720p', '1080p']
   */
  parseAvailableQualities(lesson) {
    if (!lesson) {
      console.log('[video-player] 课时数据为空，返回默认分辨率');
      return ['720p'];
    }
    
    // 新格式：多分辨率 videoUrls 对象
    if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
      const qualities = Object.keys(lesson.videoUrls)
        .filter(quality => lesson.videoUrls[quality]) // 过滤空值
        .sort((a, b) => parseInt(a) - parseInt(b));   // 按分辨率从低到高排序
      
      console.log('[video-player] 解析到可用分辨率（新格式）:', qualities);
      return qualities.length > 0 ? qualities : ['720p'];
    }
    
    // 旧格式：单一 videoUrl，视为 720p
    if (lesson.videoUrl) {
      console.log('[video-player] 使用旧格式，默认 720p');
      return ['720p'];
    }
    
    console.warn('[video-player] 未找到视频 URL，返回默认分辨率');
    return ['720p'];
  },

  /**
   * 根据分辨率获取视频 URL
   * @param {Object} lesson - 课时对象
   * @param {string} quality - 分辨率，例如 '720p'
   * @returns {string} 视频 URL 或空字符串
   */
  getVideoUrlByQuality(lesson, quality) {
    if (!lesson) {
      console.warn('[video-player] 课时数据为空');
      return '';
    }
    
    // 新格式：从 videoUrls 对象获取
    if (lesson.videoUrls && lesson.videoUrls[quality]) {
      console.log(`[video-player] 获取 ${quality} URL（新格式）`);
      return lesson.videoUrls[quality];
    }
    
    // 旧格式：如果请求 720p 且有 videoUrl，返回 videoUrl
    if (quality === '720p' && lesson.videoUrl) {
      console.log('[video-player] 获取 videoUrl（旧格式兼容）');
      return lesson.videoUrl;
    }
    
    console.warn(`[video-player] 未找到 ${quality} 的视频 URL`);
    return '';
  },

  /**
   * 用户手动选择分辨率
   * @param {Event} e - 点击事件
   */
  async onSelectQuality(e) {
    const quality = e.currentTarget.dataset.quality;
    const oldQuality = this.data.currentQuality;
    
    if (quality === oldQuality) {
      console.log('[video-player] 分辨率未变化，无需切换');
      this.setData({ showOptionsPanel: false });
      return;
    }
    
    console.log(`[video-player] 用户选择切换分辨率: ${oldQuality} -> ${quality}`);
    
    // 🔧 关键：记录当前播放位置，用于视频加载完成后恢复
    this._seekAfterQualityChange = this._currentTime || 0;
    this._qualityChangePending = true;  // 标记正在切换分辨率
    
    console.log(`[video-player] 记录当前播放位置: ${this._seekAfterQualityChange} 秒`);
    
    // 获取新分辨率的视频 URL
    const newVideoUrl = this.getVideoUrlByQuality(this.data.currentLesson, quality);
    
    if (!newVideoUrl) {
      wx.showToast({
        title: '该分辨率不可用',
        icon: 'none',
        duration: 2000
      });
      this._qualityChangePending = false;
      return;
    }
    
    // 暂停当前视频
    if (this.videoContext) {
      try {
        this.videoContext.pause();
      } catch (e) {
        console.warn('[video-player] 暂停视频出错:', e);
      }
    }
    
    // 显示加载中提示
    this.setData({
      isBuffering: true,
      bufferingText: '切换清晰度中...'
    });
    
    // 更新分辨率和视频 URL
    this.setData({
      currentQuality: quality,
      'currentLesson.videoUrl': newVideoUrl,
      showOptionsPanel: false  // 关闭选项面板
    });
    
    // 保存用户偏好到本地存储
    try {
      wx.setStorageSync('preferredQuality', quality);
      console.log(`[video-player] 已保存用户分辨率偏好: ${quality}`);
    } catch (e) {
      console.warn('[video-player] 保存偏好失败:', e);
    }
    
    // 注意：不在这里 seek，而是在 onVideoLoaded 中处理
    // 这样可以确保视频加载完成后再跳转，实现真正的无缝续播
  },

  // ==================== 观看人数统计功能 ====================

  /**
   * 加入观看（用户开始播放视频）
   */
  async joinViewing() {
    if (!this.data.currentLesson || !this.data.currentLesson.id) {
      console.warn('[viewer] currentLesson 未初始化，跳过 join');
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'viewer_count',
        data: {
          action: 'join',
          courseId: this.courseId,
          lessonId: this.data.currentLesson.id
        }
      });

      if (res.result && res.result.success) {
        this.setData({
          viewerCount: res.result.viewerCount
        });
        console.log('[viewer] Join success, count:', res.result.viewerCount);
      } else {
        console.warn('[viewer] Join failed:', res.result);
      }
    } catch (err) {
      console.error('[viewer] Join error:', err);
      // 静默失败，不影响视频播放
    }
  },

  /**
   * 离开观看（用户暂停/离开页面）
   */
  async leaveViewing() {
    if (!this.data.currentLesson || !this.data.currentLesson.id) {
      console.warn('[viewer] currentLesson 未初始化，跳过 leave');
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'viewer_count',
        data: {
          action: 'leave',
          courseId: this.courseId,
          lessonId: this.data.currentLesson.id
        }
      });

      if (res.result && res.result.success) {
        this.setData({
          viewerCount: res.result.viewerCount
        });
        console.log('[viewer] Leave success, count:', res.result.viewerCount);
      } else {
        console.warn('[viewer] Leave failed:', res.result);
      }
    } catch (err) {
      console.error('[viewer] Leave error:', err);
      // 静默失败
    }
  },

  /**
   * 获取当前观看人数
   */
  async getViewerCount() {
    if (!this.data.currentLesson || !this.data.currentLesson.id) {
      console.warn('[viewer] currentLesson 未初始化，跳过 get');
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'viewer_count',
        data: {
          action: 'get',
          lessonId: this.data.currentLesson.id
        }
      });

      if (res.result && res.result.success) {
        this.setData({
          viewerCount: res.result.viewerCount
        });
        console.log('[viewer] Get count success:', res.result.viewerCount);
      } else {
        console.warn('[viewer] Get count failed:', res.result);
      }
    } catch (err) {
      console.error('[viewer] Get count error:', err);
      // 静默失败
    }
  },

  /**
   * 获取已学习人数
   */
  async getLearnedCount() {
    if (!this.courseId || !this.data.currentLesson || !this.data.currentLesson.id) {
      console.warn('[learned] courseId 或 currentLesson 未初始化，跳过 getLearnedCount', {
        courseId: this.courseId,
        hasCurrentLesson: !!this.data.currentLesson,
        lessonId: this.data.currentLesson?.id
      });
      return;
    }
    
    console.log('[learned] 获取已学习人数，lessonId:', this.data.currentLesson.id);

    try {
      const res = await wx.cloud.callFunction({
        name: 'viewer_count',
        data: {
          action: 'getLearned',
          courseId: this.courseId,
          lessonId: this.data.currentLesson.id
        }
      });

      if (res.result && res.result.success) {
        this.setData({
          learnedCount: res.result.learnedCount
        });
        console.log('[learned] Get learned count success:', res.result.learnedCount);
      } else {
        console.warn('[learned] Get learned count failed:', res.result);
      }
    } catch (err) {
      console.error('[learned] Get learned count error:', err);
      // 静默失败
    }
  },

  /**
   * 更新活跃时间（防止被清理）
   */
  async updateActivity() {
    if (!this.data.currentLesson || !this.data.currentLesson.id) {
      return;
    }

    try {
      await wx.cloud.callFunction({
        name: 'viewer_count',
        data: {
          action: 'updateActivity',
          courseId: this.courseId,
          lessonId: this.data.currentLesson.id
        }
      });
    } catch (err) {
      console.error('[viewer] Update activity error:', err);
      // 静默失败
    }
  },

  /**
   * 开始定时刷新观看人数和已学习人数（每 30 秒）
   * 【观看统计】只要用户在页面上，就持续更新活跃时间（包括暂停状态）
   */
  startViewerCountRefresh() {
    // 清除旧定时器（如果存在）
    this.stopViewerCountRefresh();

    // 首次立即获取数据
    this.getViewerCount();
    this.getLearnedCount();

    // 设置新定时器
    this._viewerCountTimer = setInterval(() => {
      if (this.data.currentLesson && this.data.currentLesson.id) {
        this.getViewerCount();
        this.getLearnedCount();

        // ✅ 只要在页面上就更新活跃时间，不论是否播放
        // 这样暂停状态也会被统计为"正在观看"
        this.updateActivity();
      }
    }, 30000); // 30 秒

    console.log('[viewer] Started viewer count refresh timer');
  },

  /**
   * 停止定时刷新
   */
  stopViewerCountRefresh() {
    if (this._viewerCountTimer) {
      clearInterval(this._viewerCountTimer);
      this._viewerCountTimer = null;
      console.log('[viewer] Stopped viewer count refresh timer');
    }
  },

  /**
   * 课后作业按钮点击事件
   */
  async onHomeworkTap(e) {
    const lessonId = e.currentTarget.dataset.lessonId;
    console.log('[homework] 点击课后作业按钮, lessonId:', lessonId);
    
    // 课后作业PDF的云存储地址映射
    const homeworkFileMap = {
      'l1-1': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/灯光课程-¥999｜二哥十年经验的灯光课（正课）/第1课 | 灯光设计基本原理/课后作业/课后作业｜灯光设计基本原则.pdf'
    };
    
    const fileID = homeworkFileMap[lessonId];
    
    if (!fileID) {
      wx.showToast({
        title: '暂无课后作业',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 显示加载提示
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    try {
      // 1. 获取临时下载链接
      console.log('[homework] 开始获取临时链接, fileID:', fileID);
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      });
      
      console.log('[homework] getTempFileURL 响应:', tempRes);
      
      if (!tempRes.fileList || tempRes.fileList.length === 0) {
        throw new Error('获取文件链接失败，请稍后重试');
      }
      
      const fileInfo = tempRes.fileList[0];
      
      if (fileInfo.status !== 0) {
        console.error('[homework] 获取临时链接失败:', fileInfo);
        throw new Error('文件不存在或无法访问');
      }
      
      const tempFileURL = fileInfo.tempFileURL;
      
      if (!tempFileURL) {
        throw new Error('文件链接无效');
      }
      
      console.log('[homework] 临时链接获取成功');
      console.log('[homework] URL:', tempFileURL.substring(0, 100) + '...');
      
      // 更新提示
      wx.showLoading({
        title: '下载中...',
        mask: true
      });
      
      // 2. 使用云存储下载文件（避免域名限制）
      console.log('[homework] 开始下载文件...');
      const downloadRes = await wx.cloud.downloadFile({
        fileID: fileID
      });
      
      console.log('[homework] 下载响应:', downloadRes);
      
      if (!downloadRes.tempFilePath) {
        throw new Error('文件下载失败，请检查网络连接');
      }
      
      console.log('[homework] 文件下载成功, tempFilePath:', downloadRes.tempFilePath);
      
      wx.hideLoading();
      
      // 3. 打开PDF文档预览（用户可在右上角菜单转发）
      console.log('[homework] 打开文档预览...');
      await wx.openDocument({
        filePath: downloadRes.tempFilePath,
        fileType: 'pdf',
        showMenu: true // 显示右上角"更多"菜单，用户可选择转发
      });
      
      console.log('[homework] 文档打开成功');
      
      // 提示用户可以转发
      setTimeout(() => {
        wx.showToast({
          title: '点击右上角可转发',
          icon: 'none',
          duration: 2000
        });
      }, 500);
      
    } catch (err) {
      console.error('[homework] 操作失败:', err);
      console.error('[homework] 错误详情:', JSON.stringify(err));
      wx.hideLoading();
      
      let errorMsg = '操作失败，请重试';
      
      if (err.errMsg) {
        if (err.errMsg.includes('downloadFile:fail')) {
          errorMsg = '文件下载失败，请检查网络连接';
        } else if (err.errMsg.includes('openDocument:fail cancel')) {
          // 用户取消打开，不显示错误提示
          console.log('[homework] 用户取消打开文档');
          return;
        } else if (err.errMsg.includes('openDocument:fail')) {
          errorMsg = '文档打开失败，请确认文件格式正确';
        } else if (err.errMsg.includes('getTempFileURL:fail')) {
          errorMsg = '文件不存在或已过期';
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      wx.showModal({
        title: '提示',
        content: errorMsg,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  // ==================== 【流量优化】延迟加载相关方法 ====================

  /**
   * 缓存视频链接到本地（有效期 1.5 小时，临时链接有效期约 2 小时）
   * @param {Object} lesson - 课时对象
   */
  _cacheVideoUrl(lesson) {
    if (!lesson || !lesson.id) return;
    
    const cacheData = {
      videoUrl: lesson.videoUrl,
      videoUrls: lesson.videoUrls,
      expireAt: Date.now() + 90 * 60 * 1000  // 1.5 小时后过期
    };
    
    this._videoUrlCache[lesson.id] = cacheData;
    console.log(`[video-player] 缓存课时 ${lesson.id} 的视频链接`);
  },

  /**
   * 从缓存获取视频链接
   * @param {string} lessonId - 课时ID
   * @returns {Object|null} 缓存数据或 null
   */
  _getCachedVideoUrl(lessonId) {
    const cached = this._videoUrlCache[lessonId];
    if (!cached) return null;
    
    // 检查是否过期
    if (Date.now() > cached.expireAt) {
      delete this._videoUrlCache[lessonId];
      console.log(`[video-player] 课时 ${lessonId} 缓存已过期`);
      return null;
    }
    
    return cached;
  },

  /**
   * 检查 videoUrls 对象是否包含有效的视频链接
   * @param {Object} videoUrls - 多分辨率视频链接对象
   * @returns {boolean} 是否有效
   */
  _hasValidVideoUrl(videoUrls) {
    if (!videoUrls || typeof videoUrls !== 'object') return false;
    
    for (const url of Object.values(videoUrls)) {
      // 有效链接：非空且不是 cloud:// 开头（已转换为临时链接）
      if (url && typeof url === 'string' && !url.startsWith('cloud://')) {
        return true;
      }
    }
    return false;
  },

  /**
   * 延迟加载某个课时的视频链接
   * @param {string} lessonId - 课时ID
   * @returns {Object|null} 包含视频链接的课时数据
   */
  async _lazyLoadLessonUrl(lessonId) {
    console.log(`[video-player] 延迟加载课时 ${lessonId} 的视频链接`);
    
    try {
      wx.showLoading({ title: '加载视频中...', mask: false });
      
      const res = await wx.cloud.callFunction({
        name: 'course_videos',
        data: {
          courseId: this.courseId,
          lessonId: lessonId,
          getLessonUrl: true  // 【流量优化】只获取单个课时的视频链接
        }
      });
      
      wx.hideLoading();
      
      if (res.result && res.result.success && res.result.data.lesson) {
        const lesson = res.result.data.lesson;
        
        // 根据当前分辨率设置 videoUrl
        if (lesson.videoUrls && !lesson.videoUrl) {
          const currentQuality = this.data.currentQuality || '720p';
          const videoUrl = this.getVideoUrlByQuality(lesson, currentQuality);
          if (videoUrl) {
            lesson.videoUrl = videoUrl;
          }
        }
        
        // 缓存到本地
        this._cacheVideoUrl(lesson);
        
        console.log(`[video-player] 延迟加载成功`);
        return lesson;
      } else {
        console.error('[video-player] 延迟加载失败:', res.result);
        return null;
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[video-player] 延迟加载出错:', err);
      return null;
    }
  },

  /**
   * 更新章节列表中某个课时的数据
   * @param {string} lessonId - 课时ID
   * @param {Object} newData - 新的课时数据
   */
  _updateLessonInChapters(lessonId, newData) {
    const { chapters } = this.data;
    if (!chapters) return;
    
    // 深拷贝章节数据
    const updatedChapters = JSON.parse(JSON.stringify(chapters));
    
    // 查找并更新对应的课时
    for (const chapter of updatedChapters) {
      for (const lesson of chapter.lessons || []) {
        if (lesson.id === lessonId) {
          // 更新视频链接
          lesson.videoUrl = newData.videoUrl;
          lesson.videoUrls = newData.videoUrls;
          lesson._needsLazyLoad = false;
          
          // 🆕 补充处理章节数据（防止按需加载时章节数据丢失）
          this._processLessonChapters(lesson);
          
          console.log(`[video-player] 更新章节列表中课时 ${lessonId} 的数据`);
          break;
        }
      }
    }
    
    // 更新页面数据
    this.setData({ chapters: updatedChapters });
  },

  /**
   * 智能预加载下一课时的视频链接
   * 在当前视频播放进度达到 80% 时调用
   */
  async _preloadNextLessonUrl() {
    if (this._preloadingLesson) {
      console.log('[video-player] 已有预加载任务进行中');
      return;
    }
    
    const { chapters, currentLesson } = this.data;
    if (!chapters || !currentLesson) return;
    
    // 找到下一个视频课时
    let foundCurrent = false;
    let nextLesson = null;
    
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons || []) {
        if (foundCurrent && lesson.type === 'video') {
          // 检查是否需要预加载
          if (lesson._needsLazyLoad && !this._getCachedVideoUrl(lesson.id)) {
            nextLesson = lesson;
            break;
          }
        }
        if (lesson.id === currentLesson.id) {
          foundCurrent = true;
        }
      }
      if (nextLesson) break;
    }
    
    if (!nextLesson) {
      console.log('[video-player] 没有需要预加载的下一课时');
      return;
    }
    
    console.log(`[video-player] 开始预加载下一课时: ${nextLesson.title}`);
    this._preloadingLesson = nextLesson.id;
    
    try {
      await this._lazyLoadLessonUrl(nextLesson.id);
      console.log(`[video-player] 预加载完成: ${nextLesson.title}`);
    } catch (err) {
      console.warn('[video-player] 预加载失败:', err);
    } finally {
      this._preloadingLesson = null;
    }
  }
});
