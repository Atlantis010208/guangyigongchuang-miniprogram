/**
 * 查询退款详情云函数
 * 带兜底机制：如果状态是"退款中"，主动查询微信退款状态并同步数据库
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 兜底机制：主动同步微信退款状态
 * 当状态是"退款中"且有 merchantRefundNo 时，查询微信退款状态并更新数据库
 */
async function syncRefundStatusFromWechat(refund) {
  // 只有"退款中"状态且有商户退款单号时才需要同步
  if (refund.status !== '退款中' || !refund.merchantRefundNo) {
    return refund;
  }
  
  console.log('兜底机制：检查微信退款状态', refund.refundNo, refund.merchantRefundNo);
  
  try {
    // 调用微信退款查询接口
    const queryResult = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_refund_query',
        outRefundNo: refund.merchantRefundNo
      }
    });
    
    console.log('微信退款查询结果:', queryResult);
    
    if (queryResult.result && queryResult.result.code === 0) {
      const wxData = queryResult.result.data;
      const wxStatus = wxData.status;
      
      if (wxStatus === 'SUCCESS') {
        // 退款已成功，更新数据库
        console.log('兜底机制：检测到退款成功，更新数据库', refund.refundNo);
        
        const now = new Date();
        
        // 更新 refunds 集合
        await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
          data: {
            status: '已退款',
            wxRefundStatus: 'SUCCESS',
            refundedAt: wxData.successTime ? new Date(wxData.successTime) : now,
            statusLogs: db.command.push({
              status: '已退款',
              time: now,
              operator: 'system',
              remark: `退款成功，金额：¥${refund.refundAmount}`
            }),
            updatedAt: now
          }
        });
        
        // 更新 orders 集合
        await db.collection('orders').where({ orderNo: refund.orderNo }).update({
          data: {
            status: '已退款',
            afterSaleStatus: '售后完成',
            updatedAt: now
          }
        });
        
        // 更新 requests 集合
        await db.collection('requests').where({ orderNo: refund.orderNo }).update({
          data: {
            status: '已退款',
            afterSaleStatus: '售后完成',
            updatedAt: now
          }
        });
        
        // 返回更新后的状态
        return {
          ...refund,
          status: '已退款',
          wxRefundStatus: 'SUCCESS',
          refundedAt: wxData.successTime ? new Date(wxData.successTime) : now,
          statusLogs: [
            ...(refund.statusLogs || []),
            {
              status: '已退款',
              time: now,
              operator: 'system',
              remark: `退款成功，金额：¥${refund.refundAmount}`
            }
          ]
        };
        
      } else if (wxStatus === 'CLOSED' || wxStatus === 'ABNORMAL') {
        // 退款失败，更新数据库
        console.log('兜底机制：检测到退款失败，更新数据库', refund.refundNo, wxStatus);
        
        const now = new Date();
        const failReason = wxStatus === 'ABNORMAL' ? '退款异常' : '退款已关闭';
        
        await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
          data: {
            status: '退款失败',
            wxRefundStatus: wxStatus,
            failReason: failReason,
            statusLogs: db.command.push({
              status: '退款失败',
              time: now,
              operator: 'system',
              remark: failReason
            }),
            updatedAt: now
          }
        });
        
        // 返回更新后的状态
        return {
          ...refund,
          status: '退款失败',
          wxRefundStatus: wxStatus,
          failReason: failReason,
          statusLogs: [
            ...(refund.statusLogs || []),
            {
              status: '退款失败',
              time: now,
              operator: 'system',
              remark: failReason
            }
          ]
        };
      }
      // PROCESSING 状态则保持原样
    }
  } catch (error) {
    console.error('兜底机制：查询微信退款状态失败', error);
  }
  
  // 返回原始数据
  return refund;
}

/**
 * 查询退款详情
 * @param {Object} event
 * @param {string} [event.refundNo] - 退款单号
 * @param {string} [event.orderNo] - 订单号（查询最新一条）
 */
exports.main = async (event, context) => {
  console.log('===== 查询退款详情 =====');
  console.log('参数:', event);
  
  const { OPENID } = cloud.getWXContext();
  const { refundNo, orderNo } = event;
  
  if (!refundNo && !orderNo) {
    return { success: false, message: '请提供退款单号或订单号' };
  }
  
  try {
    let refund;
    
    if (refundNo) {
      // 按退款单号查询
      const res = await db.collection('refunds').where({ refundNo }).get();
      refund = res.data && res.data[0];
    } else {
      // 按订单号查询最新一条
      const res = await db.collection('refunds')
        .where({ orderNo })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      refund = res.data && res.data[0];
    }
    
    if (!refund) {
      return { success: false, message: '退款记录不存在' };
    }
    
    // 验证权限
    if (refund.userId !== OPENID) {
      return { success: false, message: '无权查看此退款记录' };
    }
    
    // 兜底机制：如果状态是"退款中"，主动检查微信退款状态并同步
    refund = await syncRefundStatusFromWechat(refund);
    
    // 查询订单信息
    let orderInfo = null;
    if (refund.orderNo) {
      const orderRes = await db.collection('orders').where({ orderNo: refund.orderNo }).get();
      if (orderRes.data && orderRes.data.length > 0) {
        const order = orderRes.data[0];
        const items = ((order.params && order.params.items) || []).map(item => ({
          id: item.id,
          name: item.name,
          image: item.image || '',
          quantity: item.quantity || 1,
          price: item.amount || item.price || 0
        }));
        
        orderInfo = {
          orderNo: order.orderNo,
          items,
          totalAmount: (order.params && order.params.totalAmount) || order.totalAmount || 0
        };
      }
    }
    
    // 处理图片临时链接
    let images = refund.images || [];
    if (images.length > 0) {
      try {
        const tempRes = await cloud.getTempFileURL({
          fileList: images
        });
        images = tempRes.fileList.map(f => f.tempFileURL || f.fileID);
      } catch (e) {
        console.warn('获取图片临时链接失败:', e);
      }
    }
    
    return {
      success: true,
      data: {
        ...refund,
        images,
        orderInfo
      }
    };
    
  } catch (error) {
    console.error('查询退款详情失败:', error);
    return {
      success: false,
      message: error.message || '系统异常'
    };
  }
};

