/**
 * 用户取消退款申请云函数
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 取消退款申请
 * @param {Object} event
 * @param {string} event.refundNo - 退款单号
 */
exports.main = async (event, context) => {
  console.log('===== 用户取消退款申请 =====');
  console.log('参数:', event);
  
  const { OPENID } = cloud.getWXContext();
  const { refundNo } = event;
  
  if (!refundNo) {
    return { success: false, message: '缺少退款单号' };
  }
  
  try {
    // 查询退款记录
    const refundRes = await db.collection('refunds').where({ refundNo }).get();
    if (!refundRes.data || refundRes.data.length === 0) {
      return { success: false, message: '退款记录不存在' };
    }
    
    const refund = refundRes.data[0];
    
    // 验证权限
    if (refund.userId !== OPENID) {
      return { success: false, message: '无权操作此退款' };
    }
    
    // 验证状态：只有待审核状态可以取消
    if (refund.status !== '待审核') {
      return { success: false, message: `当前状态不允许取消（${refund.status}）` };
    }
    
    const now = new Date();
    
    // 更新退款记录
    await db.collection('refunds').where({ refundNo }).update({
      data: {
        status: '已取消',
        statusLogs: db.command.push({
          status: '已取消',
          time: now,
          operator: 'user',
          remark: '用户取消退款申请'
        }),
        updatedAt: now
      }
    });
    
    // 恢复订单状态
    await db.collection('orders').where({ orderNo: refund.orderNo }).update({
      data: {
        status: '已支付',
        afterSaleStatus: '无售后',
        updatedAt: now
      }
    });
    
    // 恢复 requests 状态
    await db.collection('requests').where({ orderNo: refund.orderNo }).update({
      data: {
        status: '已支付',
        afterSaleStatus: '无售后',
        updatedAt: now
      }
    });
    
    console.log('退款申请已取消:', refundNo);
    
    return {
      success: true,
      message: '退款申请已取消'
    };
    
  } catch (error) {
    console.error('取消退款申请失败:', error);
    return {
      success: false,
      message: error.message || '系统异常'
    };
  }
};

