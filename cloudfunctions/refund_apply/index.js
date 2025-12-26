/**
 * 用户申请退款云函数
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 生成退款单号
 * @returns {string}
 */
function generateRefundNo() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `RF${timestamp}${random}`;
}

/**
 * 用户申请退款
 * @param {Object} event
 * @param {string} event.orderNo - 订单号
 * @param {string} event.refundType - 退款类型：'refund_only' | 'return_refund'
 * @param {string} event.reason - 退款原因
 * @param {string} [event.reasonDetail] - 详细说明
 * @param {string[]} [event.images] - 凭证图片
 */
exports.main = async (event, context) => {
  console.log('===== 用户申请退款 =====');
  console.log('参数:', event);
  
  const { OPENID } = cloud.getWXContext();
  const { orderNo, refundType, reason, reasonDetail, images } = event;
  
  // 参数验证
  if (!orderNo) {
    return { success: false, message: '缺少订单号' };
  }
  if (!refundType || !['refund_only', 'return_refund'].includes(refundType)) {
    return { success: false, message: '无效的退款类型' };
  }
  if (!reason) {
    return { success: false, message: '请选择退款原因' };
  }
  
  try {
    // 查询订单
    const orderRes = await db.collection('orders').where({ orderNo }).get();
    if (!orderRes.data || orderRes.data.length === 0) {
      return { success: false, message: '订单不存在' };
    }
    
    const order = orderRes.data[0];
    
    // 验证订单归属
    if (order.userId !== OPENID && order._openid !== OPENID) {
      return { success: false, message: '无权操作此订单' };
    }
    
    // 验证订单状态
    // 允许的状态：已支付、退款申请中/退款中（退款失败可重新申请）、退款失败
    const validStatus = ['paid', '已支付', 'refunding', '退款中', '退款失败', 'refund_pending', '退款申请中'];
    if (!validStatus.includes(order.status)) {
      return { success: false, message: `订单状态不支持退款（当前：${order.status}）` };
    }
    
    // 检查是否已有进行中的退款申请（排除已拒绝和退款失败的）
    const existingRefund = await db.collection('refunds').where({
      orderNo,
      status: _.in(['待审核', '已同意', '待寄回', '待确认收货', '退款中'])
    }).get();
    
    if (existingRefund.data && existingRefund.data.length > 0) {
      return { 
        success: false, 
        message: '该订单已有进行中的退款申请',
        data: { refundNo: existingRefund.data[0].refundNo }
      };
    }
    
    // 如果之前有退款失败的记录，将其标记为"已关闭"（允许重新申请）
    await db.collection('refunds').where({
      orderNo,
      status: _.in(['退款失败', '已拒绝'])
    }).update({
      data: {
        status: '已关闭',
        statusLogs: _.push({
          status: '已关闭',
          time: new Date(),
          operator: 'system',
          remark: '用户重新申请退款，原申请已关闭'
        }),
        updatedAt: new Date()
      }
    });
    
    // 获取退款金额
    const refundAmount = (order.params && order.params.totalAmount) || order.totalAmount || 0;
    
    // 生成退款单号
    const refundNo = generateRefundNo();
    
    // 退款类型标签
    const refundTypeLabel = refundType === 'refund_only' ? '仅退款' : '退货退款';
    
    // 创建退款记录
    const now = new Date();
    const refundDoc = {
      refundNo,
      orderNo,
      userId: OPENID,
      refundType,
      refundTypeLabel,
      refundAmount,
      reason,
      reasonDetail: reasonDetail || '',
      images: images || [],
      status: '待审核',
      statusLogs: [{
        status: '待审核',
        time: now,
        operator: 'user',
        remark: '用户提交退款申请'
      }],
      rejectReason: '',
      approvedAt: null,
      returnConfirmedAt: null,
      wxRefundId: '',
      wxRefundStatus: '',
      refundedAt: null,
      retryCount: 0,
      lastRetryAt: null,
      failReason: '',
      createdAt: now,
      updatedAt: now
    };
    
    await db.collection('refunds').add({ data: refundDoc });
    
    // 更新订单状态
    await db.collection('orders').where({ orderNo }).update({
      data: {
        status: '退款申请中',
        afterSaleStatus: '待售后',
        updatedAt: now
      }
    });
    
    // 同步更新 requests 集合（如果存在）
    await db.collection('requests').where({ orderNo }).update({
      data: {
        status: '退款申请中',
        afterSaleStatus: '待售后',
        updatedAt: now
      }
    });
    
    console.log('退款申请创建成功:', refundNo);
    
    return {
      success: true,
      message: '退款申请已提交',
      data: { refundNo }
    };
    
  } catch (error) {
    console.error('申请退款失败:', error);
    return {
      success: false,
      message: error.message || '系统异常'
    };
  }
};

