/**
 * 订单超时检查云函数
 * 通过定时触发器，定期检查并关闭超时未支付的订单
 * 
 * 配置说明：
 * 1. 在云开发控制台部署此云函数
 * 2. 添加定时触发器，Cron 表达式: 0 *\/5 * * * * * (每5分钟执行一次)
 *    或者: 0 * * * * * * (每分钟执行一次)
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 订单超时时间（毫秒）: 10分钟
const ORDER_TIMEOUT_MS = 10 * 60 * 1000;

// 每次最多处理的订单数
const BATCH_SIZE = 100;

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('============================================');
  console.log('开始执行订单超时检查');
  console.log('当前时间:', new Date().toISOString());
  console.log('超时时间设置:', ORDER_TIMEOUT_MS / 1000 / 60, '分钟');
  console.log('============================================');
  
  const now = new Date();
  const expireTime = new Date(now.getTime() - ORDER_TIMEOUT_MS);
  
  console.log('过期时间阈值:', expireTime.toISOString());
  
  try {
    // 1. 查找超时未支付的订单
    const result = await db.collection('orders')
      .where({
        status: _.or(_.eq('pending_payment'), _.eq('pending')),
        paid: _.or(_.eq(false), _.exists(false)),
        createdAt: _.lt(expireTime),
        isDelete: _.or(_.eq(0), _.exists(false))
      })
      .limit(BATCH_SIZE)
      .get();
    
    const timeoutOrders = result.data;
    console.log(`找到 ${timeoutOrders.length} 个超时订单`);
    
    if (timeoutOrders.length === 0) {
      return {
        success: true,
        message: '没有超时订单需要处理',
        closedCount: 0,
        timestamp: now.toISOString()
      };
    }
    
    // 2. 批量关闭订单
    let closedCount = 0;
    let failedCount = 0;
    const closedOrderNos = [];
    
    for (const order of timeoutOrders) {
      try {
        // 更新订单状态为已关闭
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'closed',
            closedAt: db.serverDate(),
            closedReason: '订单超时未支付',
            updatedAt: db.serverDate()
          }
        });
        
        // 同步更新 requests 表
        try {
          await db.collection('requests')
            .where({ orderNo: order.orderNo })
            .update({
              data: {
                status: 'closed',
                closedAt: db.serverDate(),
                closedReason: '订单超时未支付',
                updatedAt: db.serverDate()
              }
            });
        } catch (reqErr) {
          console.warn('更新 requests 表失败:', order.orderNo, reqErr.message);
        }
        
        closedCount++;
        closedOrderNos.push(order.orderNo);
        console.log('已关闭订单:', order.orderNo);
        
      } catch (err) {
        failedCount++;
        console.error('关闭订单失败:', order.orderNo, err.message);
      }
    }
    
    console.log('============================================');
    console.log('订单超时检查完成');
    console.log('成功关闭:', closedCount, '个订单');
    console.log('失败:', failedCount, '个订单');
    console.log('============================================');
    
    return {
      success: true,
      message: '订单超时检查完成',
      closedCount,
      failedCount,
      closedOrderNos,
      timestamp: now.toISOString()
    };
    
  } catch (err) {
    console.error('订单超时检查失败:', err);
    return {
      success: false,
      message: '订单超时检查失败',
      error: err.message,
      timestamp: now.toISOString()
    };
  }
};

