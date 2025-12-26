// pages/refund/apply/apply.js
const util = require('../../../utils/util');
const api = require('../../../utils/api');

Page({
  data: {
    orderNo: '',
    orderItems: [],
    refundAmount: 0,
    refundType: 'refund_only', // 'refund_only' | 'return_refund'
    selectedReason: '',
    reasonDetail: '',
    imageList: [],
    showReasonPicker: false,
    submitting: false,
    canSubmit: false,
    reasonOptions: [
      { name: '商品质量问题' },
      { name: '商品与描述不符' },
      { name: '收到商品损坏' },
      { name: '发错货/漏发货' },
      { name: '不想要了/拍多了' },
      { name: '其他原因' }
    ]
  },

  onLoad(options) {
    const { orderNo, type } = options;
    if (!orderNo) {
      wx.showToast({ title: '订单信息异常', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    this.setData({
      orderNo,
      refundType: type || 'refund_only'
    });
    
    this.loadOrderInfo(orderNo);
  },

  // 加载订单信息
  async loadOrderInfo(orderNo) {
    try {
      wx.showLoading({ title: '加载中' });
      const db = api.dbInit();
      if (!db) return;
      
      const Orders = api.getOrdersRepo(db);
      const order = await Orders.getByOrderNo(orderNo);
      
      if (!order) {
        wx.showToast({ title: '订单不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      // 检查订单状态是否允许退款
      // 允许的状态：已支付、退款中（退款失败可重新申请）、退款失败
      const allowedStatus = ['paid', '已支付', 'refunding', '退款中', '退款失败', 'refund_pending', '退款申请中']
      if (!allowedStatus.includes(order.status)) {
        wx.showToast({ title: '该订单状态不支持退款', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const items = ((order.params && order.params.items) || []).map(item => {
        const specs = item.specs || {};
        const specsText = Object.keys(specs).map(k => `${k}: ${specs[k]}`).join(' ');
        return {
          id: item.id,
          name: item.name,
          image: item.image || '/images/placeholder.txt',
          quantity: item.quantity || 1,
          price: item.amount || item.price || 0,
          specsText
        };
      });

      const refundAmount = (order.params && order.params.totalAmount) || order.totalAmount || 0;

      this.setData({
        orderItems: items,
        refundAmount
      });
    } catch (e) {
      console.error('加载订单信息失败:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 选择退款类型
  onSelectType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ refundType: type });
    this.checkCanSubmit();
  },

  // 显示退款原因选择器
  onShowReasonPicker() {
    this.setData({ showReasonPicker: true });
  },

  // 关闭退款原因选择器
  onCloseReasonPicker() {
    this.setData({ showReasonPicker: false });
  },

  // 选择退款原因
  onSelectReason(e) {
    const { name } = e.detail;
    this.setData({
      selectedReason: name,
      showReasonPicker: false
    });
    this.checkCanSubmit();
  },

  // 详细说明变更
  onReasonDetailChange(e) {
    this.setData({ reasonDetail: e.detail });
  },

  // 上传图片后
  onAfterRead(e) {
    const { file } = e.detail;
    const files = Array.isArray(file) ? file : [file];
    
    files.forEach(f => {
      this.uploadImage(f);
    });
  },

  // 上传图片到云存储
  async uploadImage(file) {
    try {
      const cloudPath = `refund-images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${file.url.split('.').pop()}`;
      
      const result = await wx.cloud.uploadFile({
        cloudPath,
        filePath: file.url
      });

      const imageList = this.data.imageList.concat({
        url: file.url,
        fileID: result.fileID,
        status: 'done'
      });

      this.setData({ imageList });
    } catch (e) {
      console.error('上传图片失败:', e);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    }
  },

  // 删除图片
  onDeleteImage(e) {
    const { index } = e.detail;
    const imageList = this.data.imageList.filter((_, i) => i !== index);
    this.setData({ imageList });
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const { refundType, selectedReason } = this.data;
    const canSubmit = !!refundType && !!selectedReason;
    this.setData({ canSubmit });
  },

  // 提交申请
  async onSubmit() {
    const { orderNo, refundType, selectedReason, reasonDetail, imageList, refundAmount } = this.data;

    if (!selectedReason) {
      wx.showToast({ title: '请选择退款原因', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const images = imageList.map(img => img.fileID).filter(Boolean);

      const result = await util.callCf('refund_apply', {
        orderNo,
        refundType,
        reason: selectedReason,
        reasonDetail,
        images,
        refundAmount
      });

      if (result && result.success) {
        wx.showToast({ title: '申请已提交', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/refund/detail/detail?refundNo=${result.data.refundNo}`
          });
        }, 1500);
      } else {
        wx.showToast({ title: result?.message || '申请失败', icon: 'none' });
      }
    } catch (e) {
      console.error('提交退款申请失败:', e);
      wx.showToast({ title: '申请失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

