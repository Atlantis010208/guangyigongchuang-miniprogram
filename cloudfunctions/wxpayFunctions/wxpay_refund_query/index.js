/**
 * 微信支付V3 - 查询退款
 */
const cloud = require('wx-server-sdk');
const { queryRefund } = require('../utils/wechatpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 查询退款状态
 * @param {Object} event
 * @param {string} event.outRefundNo - 商户退款单号
 */
exports.main = async (event, context) => {
  console.log('===== 微信支付V3查询退款 =====');
  console.log('参数:', event);
  
  const { outRefundNo } = event;
  
  if (!outRefundNo) {
    return { code: -1, message: '缺少退款单号', data: null };
  }
  
  try {
    const result = await queryRefund(outRefundNo);
    
    console.log('查询退款结果:', result);
    
    if (result.success) {
      return {
        code: 0,
        message: '查询成功',
        data: result.data
      };
    } else {
      return {
        code: -2,
        message: result.message || '查询失败',
        data: null
      };
    }
  } catch (error) {
    console.error('查询退款异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常',
      data: null
    };
  }
};
