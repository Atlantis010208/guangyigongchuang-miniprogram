/**
 * 押金页面
 * 支持押金缴纳和退款
 */

/**
 * 格式化时间为友好格式
 * @param {string} isoString - ISO 8601 格式时间字符串
 * @returns {string} 格式化后的时间，如 "2025-12-20 11:28:06"
 */
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

Page({
  data: {
    amount: 0.01,              // 押金金额（测试环境 0.01 元）
    serviceWeChat: 'kevin55819',
    servicePhone: '17728117703',
    loading: true,             // 加载状态
    paying: false,             // 支付中
    refunding: false,          // 退款中
    status: 'unpaid',          // 押金状态: unpaid/paid/pending_refund/refunding/refunded/refund_failed
    deposit: null,             // 押金详情
    statusText: {
      'unpaid': '未缴纳',
      'paid': '已缴纳',
      'pending_refund': '退款待审批',
      'refunding': '退款中',
      'refunded': '已退款',
      'refund_failed': '退款失败'
    }
  },

  onLoad() {
    this.queryDepositStatus();
  },

  onShow() {
    // 每次显示页面时刷新状态
    this.queryDepositStatus();
  },

  /**
   * 查询押金状态
   */
  async queryDepositStatus() {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'deposit_query'
      });

      console.log('押金状态查询结果:', res.result);

      if (res.result && res.result.code === 0) {
        const { hasPaid, status, deposit } = res.result.data;
        // 格式化支付时间为友好格式
        if (deposit && deposit.paidAt) {
          deposit.paidAt = formatTime(deposit.paidAt);
        }
        this.setData({
          status: status,
          deposit: deposit,
          loading: false
        });
      } else {
        console.error('查询押金状态失败:', res.result);
        this.setData({ loading: false });
        wx.showToast({
          title: res.result?.message || '查询失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('查询押金状态异常:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '网络异常，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 主按钮点击
   */
  onPrimaryTap() {
    const { status } = this.data;
    
    if (status === 'paid') {
      this.onRefundDeposit();
    } else if (status === 'unpaid' || status === 'refunded' || status === 'refund_failed') {
      this.onPayDeposit();
    } else if (status === 'pending_refund') {
      wx.showToast({
        title: '退款申请待审核',
        icon: 'none'
      });
    } else if (status === 'refunding') {
      wx.showToast({
        title: '退款处理中，请稍候',
        icon: 'none'
      });
    }
  },

  /**
   * 支付押金
   */
  async onPayDeposit() {
    const { amount, paying } = this.data;
    
    if (paying) return;

    const confirmResult = await new Promise(resolve => {
    wx.showModal({
        title: '确认支付押金',
        content: `需要支付押金 ¥${amount}，用于发布需求时享受优先服务。订单完成后将自动原路退回。是否继续？`,
        success: resolve
      });
    });

    if (!confirmResult.confirm) return;

    this.setData({ paying: true });
    wx.showLoading({ title: '正在下单...' });

    try {
      // 1. 调用云函数创建押金订单
      const orderRes = await wx.cloud.callFunction({
        name: 'deposit_create'
      });

      console.log('创建押金订单结果:', orderRes.result);

      if (!orderRes.result || orderRes.result.code !== 0) {
        throw new Error(orderRes.result?.message || '下单失败');
      }

      const payParams = orderRes.result.data;

      wx.hideLoading();

      // 2. 调起微信支付
      try {
        await wx.requestPayment({
          timeStamp: payParams.timeStamp,
          nonceStr: payParams.nonceStr,
          package: payParams.packageVal,
          signType: payParams.signType,
          paySign: payParams.paySign
        });

        // 支付成功，调用兜底确认机制
        console.log('微信支付完成，确认押金状态...');
        wx.showLoading({ title: '确认中...' });

        try {
          const confirmRes = await wx.cloud.callFunction({
            name: 'deposit_confirm',
            data: { depositNo: payParams.depositNo }
          });

          console.log('押金确认结果:', confirmRes.result);
          wx.hideLoading();

          if (confirmRes.result && confirmRes.result.code === 0) {
            wx.showToast({ title: '支付成功', icon: 'success' });
          } else {
            // 即使确认失败，也提示支付成功（回调会处理）
            wx.showToast({ title: '支付成功', icon: 'success' });
          }
        } catch (confirmError) {
          console.warn('押金确认异常:', confirmError);
          wx.hideLoading();
          // 确认失败不影响用户体验，回调会处理
          wx.showToast({ title: '支付成功', icon: 'success' });
        }
        
        // 刷新状态
        setTimeout(() => {
          this.queryDepositStatus();
        }, 1500);

      } catch (payError) {
        // 用户取消或支付失败
        console.log('支付取消或失败:', payError);
        if (payError.errMsg && payError.errMsg.includes('cancel')) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          wx.showToast({ title: '支付失败，请重试', icon: 'none' });
        }
      }

    } catch (error) {
      console.error('支付押金异常:', error);
      wx.hideLoading();
      wx.showToast({
        title: error.message || '系统异常，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ paying: false });
    }
  },

  /**
   * 申请退款
   */
  async onRefundDeposit() {
    const { refunding, deposit } = this.data;
    
    if (refunding) return;

    const confirmResult = await new Promise(resolve => {
      wx.showModal({
        title: '确认申请退回押金',
        content: '订单完成后押金将自动退回。若您没有进行中的需求，可以申请退回押金。是否继续？',
        success: resolve
      });
    });

    if (!confirmResult.confirm) return;

    this.setData({ refunding: true });
    wx.showLoading({ title: '正在申请...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'deposit_refund',
        data: {
          depositNo: deposit?.depositNo,
          reason: '用户主动申请退款'
      }
      });

      console.log('申请退款结果:', res.result);

      wx.hideLoading();

      if (res.result && res.result.code === 0) {
        wx.showToast({
          title: '退款申请已提交',
          icon: 'success'
        });
        
        // 刷新状态
        setTimeout(() => {
          this.queryDepositStatus();
        }, 1500);
      } else {
    wx.showModal({
          title: '提示',
          content: res.result?.message || '退款申请失败，请稍后重试',
          showCancel: false
        });
      }

    } catch (error) {
      console.error('申请退款异常:', error);
      wx.hideLoading();
      wx.showToast({
        title: '网络异常，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ refunding: false });
    }
  },

  /**
   * 打开押金规则
   */
  onOpenRules() {
    wx.showModal({
      title: '押金规则',
      content: '（1）收取与可选：押金为可选支付，不缴纳亦可发布需求。\n（2）优先服务：若已缴押金，您的需求将标记为"优先"，可享受优先处理、客服优先对接等服务。\n（3）退回时机：订单完成后，系统自动原路退回。\n（4）用途说明：用于减少恶意提交、保障服务资源并提升优先客户体验。\n（5）退款路径：原路退回为主，如遇异常请联系人工客服处理。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  /**
   * 复制微信号
   */
  copyWeChat() {
    wx.setClipboardData({
      data: this.data.serviceWeChat,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  /**
   * 拨打电话
   */
  callPhone() {
    wx.makePhoneCall({ phoneNumber: this.data.servicePhone });
  }
});
