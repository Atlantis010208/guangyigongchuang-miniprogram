const util = require('../../utils/util')

Page({
  data: {
    projectId: '',
    project: null,
    progressSteps: [
      { text: '待确认' },
      { text: '进行中' },
      { text: '已完成' }
    ], // 供 van-steps 组件使用
    progressActive: 0,
    acceptedTimeText: '',
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ projectId: options.id });
      this.loadProjectDetail();
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 加载项目详情数据
  loadProjectDetail() {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'designer_projects',
      data: { action: 'detail', requestId: this.data.projectId },
      success: (res) => {
        wx.hideLoading();
        this.setData({ loading: false });
        if (res.result && res.result.success) {
          const project = res.result.data;
          this.processProjectData(project);
        } else {
          wx.showToast({ title: res.result ? res.result.message : '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ loading: false });
        console.error('[designer-project-detail] 加载失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 处理项目数据以适配 UI 展示
  processProjectData(project) {
    // 展平 params
    if (project.params && typeof project.params === 'object') {
      const p = project.params;
      project.space = project.space || p.space;
      project.budget = project.budget || p.budget;
      project.area = project.area || p.area;
      project.service = project.service || p.service;
      project.stage = project.stage === 'publish' && p.stage ? p.stage : project.stage;
    }

    // 提取客户信息（依赖 userNickname 和 userPhone 字段，或 contact 字段）
    let clientInfo = null;
    if (project.userNickname || project.userPhone) {
      clientInfo = {
        nickname: project.userNickname || '客户',
        phone: project.userPhone || ''
      };
    } else if (project.contact) {
      clientInfo = {
        nickname: project.contact.name || '客户',
        phone: project.contact.phone || ''
      };
    }
    project.clientInfo = clientInfo;

    // 处理时间文本
    let acceptedTimeText = '未知时间';
    if (project.acceptedAt) {
      acceptedTimeText = util.formatTime(new Date(project.acceptedAt));
    }

    // 构造 progressSteps 供 van-steps 组件展示，仅提取关键大阶段
    // 项目进度有 3 个大阶段：待确认、进行中、已完成
    const progressSteps = [
      { text: '待确认' },
      { text: '进行中' },
      { text: '已完成' }
    ];

    // 计算 active 索引
    let activeIndex = 0;
    if (project.status === 'done' || project.status === 'completed') {
      activeIndex = 2; // 已完成
    } else if (project.status === 'review' || project.status === 'design' || project.status === 'verifying') {
      activeIndex = 1; // 进行中 / 待验收
    } else {
      activeIndex = 0; // 待确认
    }

    this.setData({
      project,
      progressSteps,
      progressActive: activeIndex,
      acceptedTimeText
    });
  },

  // 提交验收
  onSubmitVerify() {
    wx.showModal({
      title: '提交验收',
      content: '确认已完成设计并提交验收？提交后将通知客户确认。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...' });
          wx.cloud.callFunction({
            name: 'designer_projects',
            data: {
              action: 'submit_verify',
              requestId: this.data.projectId
            },
            success: (r) => {
              wx.hideLoading();
              if (r.result && r.result.success) {
                wx.showToast({ title: '已提交验收', icon: 'success' });
                this.loadProjectDetail();
              } else {
                wx.showToast({ title: r.result ? r.result.message : '提交失败', icon: 'none' });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              console.error('[designer-project-detail] 提交验收失败:', err);
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 拨打客户电话
  onCallClient() {
    const phone = this.data.project?.clientInfo?.phone;
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone
      });
    } else {
      wx.showToast({ title: '无客户电话记录', icon: 'none' });
    }
  },

  // 长按复制电话
  onLongPressPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.setClipboardData({
        data: phone,
        success: () => {
          wx.showToast({ title: '已复制电话' });
        }
      });
    }
  },

  // 联系平台客服
  onContactAdmin() {
    wx.showToast({ title: '正在连接平台客服...', icon: 'none' });
    // 实际项目中可唤起客服会话组件
  }
});
