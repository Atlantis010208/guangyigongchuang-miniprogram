/**
 * 课程详情页
 * 对接 course_detail 获取课程详情（包含章节大纲）
 * 对接 course_purchase_check 检查购买状态
 */
Page({
  data: {
    course: null,
    activeTab: 0, // 0: 介绍, 1: 目录
    isPurchased: false, // 默认未购买
    loading: true,
    error: null,
    checkingPurchase: false
  },

  onLoad(options) {
    const { id, autoPlay } = options;
    this.courseId = id;
    this.autoPlay = autoPlay === '1';
    
    if (id) {
      this.loadCourseDetail(id);
    }
  },

  onShow() {
    // 页面显示时重新检查购买状态（用户可能刚完成支付）
    if (this.courseId && this.data.course) {
      this.checkPurchaseStatus(this.courseId);
    }
  },

  /**
   * 加载课程详情
   */
  async loadCourseDetail(courseId) {
    this.setData({ loading: true, error: null });

    try {
      // 调用 course_detail 获取课程详情
      const res = await wx.cloud.callFunction({
        name: 'course_detail',
        data: {
          id: courseId,
          courseId: courseId
        }
      });

      console.log('[course-detail] course_detail Response:', res.result);

      if (res.result && res.result.success) {
        const course = res.result.data;

        // 确保 detailImages 是数组
        // 注意：不再用 images 回退填充，因为 images 可能包含封面图（旧数据兼容逻辑）
        // 详情图片和封面图应该是分开的
        if (!Array.isArray(course.detailImages)) {
          course.detailImages = [];
        }

        this.setData({
          course,
          loading: false
        });

        // 设置导航栏标题
        wx.setNavigationBarTitle({
          title: course.title
        });

        // 检查购买状态
        await this.checkPurchaseStatus(course.id || course.courseId || courseId);

        // 如果设置了自动播放且已购买，自动开始播放
        if (this.autoPlay && this.data.isPurchased) {
          this.onStartLearning();
        }
      } else {
        throw new Error(res.result?.errorMessage || '课程不存在');
      }
    } catch (err) {
      console.error('[course-detail] Load error:', err);
      this.setData({
        loading: false,
        error: err.message || '加载失败'
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 检查用户是否已购买课程
   */
  async checkPurchaseStatus(courseId) {
    this.setData({ checkingPurchase: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'course_purchase_check',
        data: { courseId }
      });

      console.log('[course-detail] purchase_check Response:', res.result);

      if (res.result && res.result.success) {
        const { isPurchased, purchasedAt, orderId } = res.result.data;
        this.setData({
          isPurchased: isPurchased || false,
          checkingPurchase: false
        });

        // 记录购买信息（可用于后续逻辑）
        if (isPurchased) {
          this.purchaseInfo = { purchasedAt, orderId };
        }
      } else {
        this.setData({
          isPurchased: false,
          checkingPurchase: false
        });
      }
    } catch (err) {
      console.error('[course-detail] Check purchase error:', err);
      // 检查失败默认为未购买
      this.setData({
        isPurchased: false,
        checkingPurchase: false
      });
    }
  },

  /**
   * Tab 切换
   */
  onTabChange(e) {
    const index = e.currentTarget.dataset.index;
    
    // 如果未购买且切换到大纲 Tab，提示购买
    if (index === 1 && !this.data.isPurchased) {
      wx.showToast({
        title: '请先购买课程',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ activeTab: index });
  },

  /**
   * 购买课程
   */
  onPurchase() {
    const { course } = this.data;
    if (!course) return;

    // 构造订单商品数据（与确认订单页兼容）
    const orderItem = {
      id: course.id || course.courseId,
      name: course.title,
      title: course.title,
      price: course.price,
      quantity: 1,
      image: course.coverUrl || course.cover,
      category: 'course', // 标记为课程类商品
      specs: {} // 课程无规格
    };

    // 跳转到订单确认页
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?item=${encodeURIComponent(JSON.stringify(orderItem))}`
    });
  },

  /**
   * 开始学习（已购买状态）
   */
  onStartLearning() {
    const { course, isPurchased } = this.data;
    
    if (!isPurchased) {
      wx.showToast({
        title: '请先购买课程',
        icon: 'none'
      });
      return;
    }

    // 切换到大纲 Tab
    this.setData({ activeTab: 1 });

    // 跳转到视频播放页
    const courseId = course.id || course.courseId;
    wx.navigateTo({
      url: `/pages/course/video-player/video-player?courseId=${courseId}`
    });
  },

  /**
   * 复制网盘链接
   */
  onCopyLink() {
    const { course } = this.data;
    if (!course || !course.driveLink) return;

    wx.setClipboardData({
      data: course.driveLink,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 复制提取码
   */
  onCopyPassword() {
    const { course } = this.data;
    if (!course || !course.drivePassword) return;

    wx.setClipboardData({
      data: course.drivePassword,
      success: () => {
        wx.showToast({
          title: '提取码已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 一键复制链接和提取码
   */
  onCopyAll() {
    const { course } = this.data;
    if (!course || !course.driveLink) return;

    const content = `网盘链接：${course.driveLink}\n提取码：${course.drivePassword}`;

    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 点击课时
   */
  onLessonTap(e) {
    const { type, title, id } = e.currentTarget.dataset;
    const { isPurchased, course } = this.data;

    // 未购买状态不允许访问课时
    if (!isPurchased) {
      wx.showToast({
        title: '请先购买课程',
        icon: 'none'
      });
      return;
    }

    if (type === 'video') {
      const courseId = course.id || course.courseId;
      wx.navigateTo({
        url: `/pages/course/video-player/video-player?courseId=${courseId}&lessonId=${id}`,
        fail: (err) => {
          console.error('Navigate failed:', err);
          wx.showToast({ title: '无法打开播放页', icon: 'none' });
        }
      });
    } else {
      // 文件下载逻辑 - 需要调用 course_videos 获取文件链接
      wx.showModal({
        title: '下载资料',
        content: '即将下载: ' + title,
        confirmText: '下载',
        confirmColor: '#007aff',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '下载中...' });
            setTimeout(() => {
              wx.hideLoading();
              wx.showToast({ title: '下载完成' });
            }, 1500);
          }
        }
      });
    }
  }
});
