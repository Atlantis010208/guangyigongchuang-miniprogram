/**
 * 调试云函数：查询和删除购买记录
 * 用于排查"删除白名单后仍可观看课程"的问题
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { phone, courseId, action = 'query' } = event;
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;

  console.log('[debug_purchase_records] 开始调试');
  console.log('[debug_purchase_records] 手机号:', phone);
  console.log('[debug_purchase_records] 课程ID:', courseId);
  console.log('[debug_purchase_records] 操作:', action);
  console.log('[debug_purchase_records] OPENID:', OPENID);

  try {
    // ===== 查询操作 =====
    if (action === 'query') {
      // 1. 查询白名单记录
      const whitelistRes = await db.collection('course_whitelist')
        .where({
          phone: phone,
          courseId: courseId
        })
        .get();

      console.log('[debug_purchase_records] 白名单记录:', whitelistRes.data.length, '条');

      // 2. 查询订单记录（通过手机号）
      const ordersRes = await db.collection('orders')
        .where({
          'contact.phone': phone
        })
        .get();

      console.log('[debug_purchase_records] 订单记录:', ordersRes.data.length, '条');

      // 过滤出包含该课程的订单
      const courseOrders = ordersRes.data.filter(order => {
        if (!order.items || !Array.isArray(order.items)) return false;
        return order.items.some(item => item.id === courseId);
      });

      console.log('[debug_purchase_records] 相关课程订单:', courseOrders.length, '条');

      // 3. 查询学习进度记录
      const progressRes = await db.collection('user_course_progress')
        .where({
          _openid: OPENID,
          courseId: courseId
        })
        .get();

      console.log('[debug_purchase_records] 学习进度记录:', progressRes.data.length, '条');

      // 4. 查询用户记录
      const userRes = await db.collection('users')
        .where({
          _openid: OPENID
        })
        .get();

      console.log('[debug_purchase_records] 用户记录:', userRes.data.length, '条');

      return {
        success: true,
        data: {
          whitelist: whitelistRes.data,
          orders: courseOrders,
          allOrders: ordersRes.data,
          progress: progressRes.data,
          user: userRes.data[0] || null,
          openid: OPENID
        }
      };
    }

    // ===== 删除操作 =====
    if (action === 'delete') {
      let deletedWhitelist = 0;
      let deletedOrders = 0;
      let deletedProgress = 0;

      // 1. 删除白名单记录
      const whitelistRes = await db.collection('course_whitelist')
        .where({
          phone: phone,
          courseId: courseId
        })
        .remove();

      deletedWhitelist = whitelistRes.stats.removed;
      console.log('[debug_purchase_records] 删除白名单记录:', deletedWhitelist, '条');

      // 2. 查询并删除相关订单
      const ordersRes = await db.collection('orders')
        .where({
          'contact.phone': phone
        })
        .get();

      // 过滤出包含该课程的订单
      const courseOrderIds = ordersRes.data
        .filter(order => {
          if (!order.items || !Array.isArray(order.items)) return false;
          return order.items.some(item => item.id === courseId);
        })
        .map(order => order._id);

      // 逐个删除订单
      for (const orderId of courseOrderIds) {
        await db.collection('orders').doc(orderId).remove();
        deletedOrders++;
      }

      console.log('[debug_purchase_records] 删除订单记录:', deletedOrders, '条');

      // 3. 删除学习进度记录
      const progressRes = await db.collection('user_course_progress')
        .where({
          _openid: OPENID,
          courseId: courseId
        })
        .remove();

      deletedProgress = progressRes.stats.removed;
      console.log('[debug_purchase_records] 删除学习进度记录:', deletedProgress, '条');

      console.log('[debug_purchase_records] 删除完成');

      return {
        success: true,
        deletedWhitelist,
        deletedOrders,
        deletedProgress,
        message: '删除成功'
      };
    }

    // 无效操作
    return {
      success: false,
      message: '无效的操作类型'
    };

  } catch (err) {
    console.error('[debug_purchase_records] 错误:', err);
    return {
      success: false,
      error: err.message
    };
  }
};

