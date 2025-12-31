/**
 * 视频播放页
 * 对接 course_videos 云函数获取视频数据
 * 性能优化版 V2 - 深度优化卡顿问题
 * 
 * 优化点：
 * 1. 减少不必要的 setData 调用
 * 2. 添加缓冲状态监听
 * 3. 优化视频切换逻辑，避免竞态条件
 * 4. 节流 onTimeUpdate（2000ms）
 * 5. 添加视频预加载
 * 6. 简化控件减少渲染压力
 * 7. 启用视频缓存 (custom-cache)
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
    showOptionsPanel: false
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
  },

  onUnload() {
    console.log('[video-player] onUnload');
    
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
  
  onHide() {
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
        const { courseId: id, title, chapters, currentLesson } = res.result.data;

        console.log('[video-player] Video URL:', currentLesson?.videoUrl?.substring(0, 100) + '...');

        // 检测是否是长视频（超过30分钟）
        const isLongVideo = this._isLongVideo(currentLesson?.duration);

        // 一次性更新所有状态，减少渲染次数
        this.setData({
          course: { id, title },
          chapters: chapters || [],
          currentLesson: currentLesson,
          loading: false,
          autoplay: true,
          isLongVideo: isLongVideo,
          bufferingText: isLongVideo ? '长视频加载中，请稍候...' : '视频加载中...'
        });

        wx.setNavigationBarTitle({
          title: currentLesson?.title || title || '视频播放'
        });

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
   */
  onTimeUpdate(e) {
    const now = Date.now();
    // 增加节流时间到 2 秒，减少事件处理频率
    if (now - this._lastTimeUpdate < 2000) return;
    this._lastTimeUpdate = now;
    
    // 如果正在缓冲但视频在播放，取消缓冲状态
    if (this.data.isBuffering && e.detail.currentTime > 0) {
      this._clearBuffering();
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
   */
  onVideoPause() {
    // 只更新实例属性，不触发渲染
    this._isPlaying = false;
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
    // 清除缓冲状态
    this._clearBuffering();
    
    if (!this.data.videoLoaded) {
      this.setData({ videoLoaded: true });
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
   */
  onVideoEnded() {
    console.log('[video-player] onVideoEnded');
    this._isPlaying = false;
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
    
    // 检查视频地址是否存在
    if (!lesson.videoUrl) {
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
   * 切换课时（优化版 V3）
   * 直接切换视频源，不销毁组件，避免 videoContext 失效
   */
  switchLesson(lesson) {
    if (!lesson || !lesson.videoUrl) {
      console.warn('[video-player] Invalid lesson:', lesson);
      return;
    }
    
    console.log('[video-player] switchLesson start:', lesson.title);
    
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
    
    // 直接设置新视频源（不要先清空，避免组件被销毁）
    this.setData({
      currentLesson: lesson,
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
    }, 300);
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
  }
});
