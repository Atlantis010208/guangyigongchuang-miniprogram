/**
 * 管理后台 - 退款列表查询
 */
const cloud = require('wx-server-sdk');
const { requireAdmin, getErrorMessage } = require('./admin_auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 查询退款列表
 * @param {Object} event
 * @param {number} [event.limit] - 每页数量
 * @param {number} [event.offset] - 偏移量
 * @param {string} [event.orderNo] - 订单号筛选
 * @param {string} [event.status] - 状态筛选
 * @param {string} [event.refundType] - 类型筛选
 */
exports.main = async (event, context) => {
  console.log('===== 管理后台查询退款列表 =====');
  console.log('参数:', event);
  
  // 验证管理员权限
  const authResult = await requireAdmin(db, _);
  if (!authResult.ok) {
    return {
      success: false,
      errorCode: authResult.errorCode,
      errorMessage: getErrorMessage(authResult.errorCode)
    };
  }
  
  const { 
    limit = 10, 
    offset = 0, 
    orderNo, 
    status, 
    refundType,
    keyword 
  } = event;
  
  try {
    // 构建查询条件
    const where = {};
    
    if (orderNo) {
      where.orderNo = orderNo;
    }
    if (status) {
      where.status = status;
    }
    if (refundType) {
      where.refundType = refundType;
    }
    if (keyword) {
      // 支持按退款单号或订单号模糊搜索
      where.refundNo = db.RegExp({
        regexp: keyword,
        options: 'i'
      });
    }
    
    // 查询总数
    const countRes = await db.collection('refunds').where(where).count();
    const total = countRes.total || 0;
    
    // 查询列表
    const listRes = await db.collection('refunds')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();
    
    const list = listRes.data || [];
    
    // 批量查询关联订单信息
    if (list.length > 0) {
      const orderNos = [...new Set(list.map(r => r.orderNo))];
      const ordersRes = await db.collection('orders')
        .where({ orderNo: _.in(orderNos) })
        .get();
      
      const ordersMap = {};
      (ordersRes.data || []).forEach(order => {
        ordersMap[order.orderNo] = {
          totalAmount: (order.params && order.params.totalAmount) || order.totalAmount,
          items: (order.params && order.params.items) || []
        };
      });
      
      // 合并订单信息
      list.forEach(refund => {
        refund.orderInfo = ordersMap[refund.orderNo] || null;
      });
    }
    
    return {
      success: true,
      data: list,
      total,
      limit,
      offset
    };
    
  } catch (error) {
    console.error('查询退款列表失败:', error);
    return {
      success: false,
      errorMessage: error.message || '系统异常'
    };
  }
};

