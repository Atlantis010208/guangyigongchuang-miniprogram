// pages/refund/detail/detail.js
const util = require('../../../utils/util');

Page({
  data: {
    refundNo: '',
    refund: null,
    orderInfo: null,
    steps: [],
    activeStep: 0,
    statusIcon: 'clock-o',
    statusClass: 'pending',
    statusDesc: '',
    showCancelBtn: false
  },

  onLoad(options) {
    const { refundNo, orderNo } = options;
    if (!refundNo && !orderNo) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ refundNo: refundNo || '' });
    this.loadRefundDetail(refundNo, orderNo);
  },

  onShow() {
    if (this.data.refundNo) {
      this.loadRefundDetail(this.data.refundNo);
    }
  },

  onHide() {
    // 页面隐藏时清除自动刷新定时器
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  },

  onUnload() {
    // 页面卸载时清除自动刷新定时器
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    if (this.data.refundNo) {
      await this.loadRefundDetail(this.data.refundNo);
    }
    wx.stopPullDownRefresh();
  },

  // 开启自动刷新（退款中状态时）
  startAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
    }
    
    // 每5秒刷新一次状态
    this.autoRefreshTimer = setTimeout(async () => {
      if (this.data.refund && this.data.refund.status === '退款中') {
        console.log('自动刷新退款状态...');
        await this.loadRefundDetail(this.data.refundNo);
        
        // 如果还是退款中，继续自动刷新
        if (this.data.refund && this.data.refund.status === '退款中') {
          this.startAutoRefresh();
        }
      }
    }, 5000);
  },

  // 加载退款详情
  async loadRefundDetail(refundNo, orderNo) {
    try {
      wx.showLoading({ title: '加载中' });

      const result = await util.callCf('refund_detail', {
        refundNo,
        orderNo
      });

      if (result && result.success && result.data) {
        const refund = result.data;
        
        // 格式化时间
        refund.createdAtText = this.formatTime(refund.createdAt);
        refund.refundedAtText = refund.refundedAt ? this.formatTime(refund.refundedAt) : '';
        
        // 格式化状态记录时间
        if (refund.statusLogs) {
          refund.statusLogs = refund.statusLogs.map(log => ({
            ...log,
            timeText: this.formatTime(log.time)
          })).reverse(); // 最新的在前面
        }

        // 设置步骤条
        const { steps, activeStep } = this.getStepsConfig(refund);
        
        // 设置状态样式
        const { statusIcon, statusClass, statusDesc } = this.getStatusConfig(refund);
        
        // 是否显示取消按钮
        const showCancelBtn = refund.status === '待审核';

        this.setData({
          refundNo: refund.refundNo,
          refund,
          orderInfo: result.data.orderInfo || null,
          steps,
          activeStep,
          statusIcon,
          statusClass,
          statusDesc,
          showCancelBtn
        });
        
        // 如果状态是"退款中"，启动自动刷新
        if (refund.status === '退款中') {
          this.startAutoRefresh();
        }
      } else {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('加载退款详情失败:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 获取步骤条配置
  getStepsConfig(refund) {
    const isReturnRefund = refund.refundType === 'return_refund';
    
    let steps, activeStep;
    
    if (isReturnRefund) {
      // 退货退款：商家处理 → 寄回商品 → 退款结束
      steps = [
        { text: '商家处理' },
        { text: '寄回商品' },
        { text: '退款结束' }
      ];
      
      switch (refund.status) {
        case '待审核':
        case '已同意':
          activeStep = 0;
          break;
        case '待寄回':
        case '待确认收货':
          activeStep = 1;
          break;
        case '退款中':
        case '已退款':
        case '退款失败':
          activeStep = 2;
          break;
        default:
          activeStep = 0;
      }
    } else {
      // 仅退款：商家处理 → 退款结束
      steps = [
        { text: '商家处理' },
        { text: '退款结束' }
      ];
      
      switch (refund.status) {
        case '待审核':
        case '已同意':
          activeStep = 0;
          break;
        case '退款中':
        case '已退款':
        case '退款失败':
          activeStep = 1;
          break;
        default:
          activeStep = 0;
      }
    }

    return { steps, activeStep };
  },

  // 获取状态配置
  getStatusConfig(refund) {
    const statusMap = {
      '待审核': {
        icon: 'clock-o',
        class: 'pending',
        desc: '您的退款申请已提交，请等待商家处理（预计48小时内）'
      },
      '已同意': {
        icon: 'passed',
        class: 'processing',
        desc: refund.refundType === 'return_refund' ? '商家已同意退货，请等待商家提供收货地址' : '商家已同意退款，正在处理中'
      },
      '已拒绝': {
        icon: 'close',
        class: 'failed',
        desc: '商家已拒绝您的退款申请，您可以重新申请'
      },
      '待寄回': {
        icon: 'logistics',
        class: 'processing',
        desc: '请与商家沟通获取收货地址，寄回商品后等待商家确认'
      },
      '待确认收货': {
        icon: 'logistics',
        class: 'processing',
        desc: '商家正在确认收货，请耐心等待'
      },
      '退款中': {
        icon: 'gold-coin-o',
        class: 'processing',
        desc: '退款正在处理中，预计1-3个工作日到账'
      },
      '已退款': {
        icon: 'success',
        class: 'success',
        desc: '退款已成功，金额将原路退回'
      },
      '退款失败': {
        icon: 'warning-o',
        class: 'failed',
        desc: '退款失败，系统将自动重试'
      },
      '已取消': {
        icon: 'close',
        class: 'failed',
        desc: '您已取消本次退款申请'
      }
    };

    const config = statusMap[refund.status] || statusMap['待审核'];
    return {
      statusIcon: config.icon,
      statusClass: config.class,
      statusDesc: config.desc
    };
  },

  // 格式化时间
  formatTime(time) {
    if (!time) return '';
    try {
      const d = new Date(typeof time === 'number' ? time : time);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    } catch (e) {
      return '';
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.refund.images || [];
    wx.previewImage({ current, urls });
  },

  // 取消退款申请
  onCancelRefund() {
    console.log('===== 点击取消申请按钮 =====');
    console.log('refundNo:', this.data.refundNo);
    
    wx.showModal({
      title: '取消申请',
      content: '确定要取消本次退款申请吗？',
      success: async (res) => {
        console.log('showModal result:', res);
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中' });
            const result = await util.callCf('refund_cancel', {
              refundNo: this.data.refundNo
            });
            
            if (result && result.success) {
              wx.showToast({ title: '已取消', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            } else {
              wx.showToast({ title: result?.message || '取消失败', icon: 'none' });
            }
          } catch (e) {
            console.error('取消退款失败:', e);
            wx.showToast({ title: '取消失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 重新申请
  onReapply() {
    const { refund } = this.data;
    if (!refund || !refund.orderNo) return;
    
    wx.navigateTo({
      url: `/pages/refund/apply/apply?orderNo=${refund.orderNo}&type=${refund.refundType}`
    });
  }
});

