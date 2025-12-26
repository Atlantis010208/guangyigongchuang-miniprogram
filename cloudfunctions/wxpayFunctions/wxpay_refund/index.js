/**
 * 微信支付V3 - 申请退款
 */
const cloud = require('wx-server-sdk');
const { createRefund } = require('../utils/wechatpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 申请退款
 * @param {Object} event
 * @param {string} event.outTradeNo - 原商户订单号
 * @param {string} event.outRefundNo - 商户退款单号
 * @param {number} event.refundAmount - 退款金额（分）
 * @param {number} event.totalAmount - 原订单金额（分）
 * @param {string} [event.reason] - 退款原因
 */
exports.main = async (event, context) => {
  console.log('===== 微信支付V3退款 =====');
  console.log('参数:', event);
  
  const { outTradeNo, outRefundNo, refundAmount, totalAmount, reason } = event;
  
  // 参数验证
  if (!outTradeNo) {
    return { code: -1, message: '缺少原订单号', data: null };
  }
  if (!outRefundNo) {
    return { code: -2, message: '缺少退款单号', data: null };
  }
  if (!refundAmount || refundAmount <= 0) {
    return { code: -3, message: '退款金额无效', data: null };
  }
  if (!totalAmount || totalAmount <= 0) {
    return { code: -4, message: '原订单金额无效', data: null };
  }
  
  try {
    // 调用微信退款API
    const result = await createRefund({
      outTradeNo,
      outRefundNo,
      refundAmount,
      totalAmount,
      reason
    });
    
    console.log('退款API返回:', result);
    
    if (result.success) {
      return {
        code: 0,
        message: '退款申请已提交',
        data: result.data
      };
    } else {
      return {
        code: -5,
        message: result.message || '退款失败',
        data: null,
        detail: {
          code: result.code,
          message: result.message
        }
      };
    }
  } catch (error) {
    console.error('退款异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常',
      data: null
    };
  }
};
