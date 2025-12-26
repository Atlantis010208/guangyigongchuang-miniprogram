/**
 * 微信支付V3 - 根据商户订单号查询订单
 * 
 * 入参：
 * - orderNo: 商户订单号（必填）
 * - syncStatus: 是否同步更新本地订单状态（可选，默认true）
 * 
 * 返回：
 * - code: 0成功，其他失败
 * - message: 提示信息
 * - data: 订单信息
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { queryOrderByOutTradeNo } = require('../utils/wechatpay');

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  
  const { 
    orderNo,              // 商户订单号
    syncStatus = true     // 是否同步更新本地状态
  } = event;

  console.log('===== 微信支付V3查询订单 =====');
  console.log('订单号:', orderNo);
  console.log('同步状态:', syncStatus);

  // 1. 参数验证
  if (!orderNo) {
    return { 
      code: -1, 
      message: '缺少订单号参数',
      data: null 
    };
  }

  try {
    // 2. 先查询本地订单
    const localOrderResult = await db.collection('orders')
      .where({ orderNo: orderNo })
      .get();
    
    const localOrder = localOrderResult.data[0];
    
    // 3. 验证权限（如果是用户查询，需要验证归属）
    if (OPENID && localOrder && localOrder.userId !== OPENID) {
      return { 
        code: -2, 
        message: '无权查询此订单',
        data: null 
      };
    }

    // 4. 调用微信支付V3查询订单
    const queryResult = await queryOrderByOutTradeNo(orderNo);

    console.log('微信支付查询结果:', queryResult);

    if (!queryResult.success) {
      // 查询失败，返回本地订单状态
      console.warn('微信支付查询失败:', queryResult.message);
      
      if (localOrder) {
        return {
          code: 0,
          message: '使用本地缓存数据',
          data: {
            orderNo: localOrder.orderNo,
            tradeState: localOrder.paid ? 'SUCCESS' : 'NOTPAY',
            tradeStateDesc: localOrder.paid ? '支付成功' : '未支付',
            transactionId: localOrder.transactionId || null,
            amount: localOrder.params?.totalAmount ? {
              total: Math.round(localOrder.params.totalAmount * 100)
            } : null,
            source: 'local'
          }
        };
      }
      
      return {
        code: -3,
        message: queryResult.message || '查询失败',
        data: null
      };
    }

    // 5. 查询成功，根据需要同步更新本地订单状态
    const wechatOrder = queryResult.data;
    
    if (syncStatus && localOrder) {
      await syncLocalOrderStatus(localOrder, wechatOrder);
    }

    return {
      code: 0,
      message: '查询成功',
      data: {
        orderNo: wechatOrder.outTradeNo,
        tradeState: wechatOrder.tradeState,
        tradeStateDesc: wechatOrder.tradeStateDesc,
        transactionId: wechatOrder.transactionId,
        successTime: wechatOrder.successTime,
        amount: wechatOrder.amount,
        source: 'wechat'
      }
    };

  } catch (error) {
    console.error('查询订单异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常',
      error: error.message,
      data: null
    };
  }
};

/**
 * 同步更新本地订单状态
 * @param {Object} localOrder - 本地订单
 * @param {Object} wechatOrder - 微信支付订单
 */
async function syncLocalOrderStatus(localOrder, wechatOrder) {
  // 只有当微信侧已支付，但本地未更新时才同步
  if (wechatOrder.tradeState === 'SUCCESS' && !localOrder.paid) {
    console.log('同步更新订单状态为已支付:', localOrder.orderNo);
    
    try {
      await db.collection('orders').doc(localOrder._id).update({
        data: {
          status: 'paid',
          paid: true,
          paidAt: wechatOrder.successTime ? new Date(wechatOrder.successTime) : new Date(),
          transactionId: wechatOrder.transactionId,
          paymentAmount: wechatOrder.amount?.total || null,
          updatedAt: new Date(),
          syncSource: 'query'  // 标记是通过查询同步的
        }
      });
      
      // 同步更新 requests 表
      await db.collection('requests')
        .where({ orderNo: localOrder.orderNo })
        .update({
          data: {
            status: 'paid',
            paid: true,
            paidAt: new Date(),
            updatedAt: new Date()
          }
        });
      
      console.log('订单状态同步完成');
      
      // ✅ 更新商品销量和库存
      await updateProductSales(localOrder.items || localOrder.params?.items);
      
    } catch (err) {
      console.error('同步订单状态失败:', err.message);
    }
  }
  
  // 如果微信侧订单已关闭，同步关闭本地订单
  if (wechatOrder.tradeState === 'CLOSED' && localOrder.status !== 'closed') {
    console.log('同步更新订单状态为已关闭:', localOrder.orderNo);
    
    try {
      await db.collection('orders').doc(localOrder._id).update({
            data: {
          status: 'closed',
          closedAt: new Date(),
          updatedAt: new Date(),
          closeReason: '微信支付订单已关闭'
        }
      });
      
      console.log('订单关闭状态同步完成');
      
    } catch (err) {
      console.error('同步订单关闭状态失败:', err.message);
    }
  }
}

/**
 * 更新商品销量和库存
 * @param {Array} items - 订单商品列表
 */
async function updateProductSales(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log('无商品信息，跳过更新销量和库存');
    return;
  }

  const _ = db.command;
  console.log('更新商品销量和库存，共', items.length, '个商品');

  for (const item of items) {
    try {
      // 商品ID可能在 id, productId, _id 等字段
      const productId = item.id || item.productId || item._id;
      const quantity = item.quantity || item.count || 1;

      if (!productId) {
        console.warn('商品缺少ID，跳过:', item);
        continue;
      }

      // 使用 where 查询商品（兼容 productId 作为业务字段的情况）
      const productQuery = await db.collection('products')
        .where(db.command.or([
          { _id: productId },
          { productId: productId }
        ]))
        .get();

      if (!productQuery.data || productQuery.data.length === 0) {
        console.warn('商品未找到，尝试直接使用doc查询:', productId);
        
        // 尝试直接用 doc 查询
        try {
          const docResult = await db.collection('products').doc(productId).get();
          if (docResult.data) {
            const currentStock = docResult.data.stock || docResult.data.inventory || 0;
            const newStock = Math.max(0, currentStock - quantity);
            
            await db.collection('products').doc(productId).update({
              data: {
                sales: _.inc(quantity),
                stock: newStock,
                updatedAt: new Date()
              }
            });
            console.log('✅ 商品销量和库存已更新(doc):', productId, '销量+', quantity, '库存-', quantity);
          }
        } catch (docErr) {
          console.warn('doc查询也失败:', docErr.message);
        }
        continue;
      }

      const product = productQuery.data[0];
      const currentStock = product.stock || product.inventory || 0;
      const newStock = Math.max(0, currentStock - quantity);

      await db.collection('products').doc(product._id).update({
        data: {
          sales: _.inc(quantity),
          stock: newStock,
          updatedAt: new Date()
        }
      });

      console.log('✅ 商品销量和库存已更新:', product._id, '销量+', quantity, '库存-', quantity);
    } catch (err) {
      console.warn('更新商品销量和库存失败:', err.message);
    }
  }
}
