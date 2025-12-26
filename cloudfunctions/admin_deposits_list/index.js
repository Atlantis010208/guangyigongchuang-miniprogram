/**
 * 管理后台押金列表查询云函数
 * 功能：分页查询押金记录列表
 * 
 * 入参：
 * - limit: 每页数量（默认10）
 * - offset: 偏移量（默认0）
 * - status: 状态筛选（pending/paid/refunding/refunded）
 * - keyword: 关键词搜索（押金单号、用户昵称、手机号）
 * 
 * 出参：
 * - code: 0成功
 * - data: 押金列表
 * - total: 总数
 */
const cloud = require('wx-server-sdk');
const { requireAdmin, getErrorMessage } = require('./admin_auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  console.log('===== 管理后台押金列表 =====');
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

  const { limit = 10, offset = 0, status, keyword } = event;

  try {
    // 构建查询条件
    const conditions = {};

    // 状态筛选
    if (status) {
      conditions.status = status;
    }

    // 关键词搜索
    if (keyword) {
      // 支持押金单号、用户昵称、手机号搜索
      conditions.$or = [
        { depositNo: db.RegExp({ regexp: keyword, options: 'i' }) },
        { 'userInfo.nickname': db.RegExp({ regexp: keyword, options: 'i' }) },
        { 'userInfo.phoneNumber': db.RegExp({ regexp: keyword, options: 'i' }) }
      ];
    }

    // 查询总数
    const countResult = await db.collection('deposits')
      .where(conditions)
      .count();

    const total = countResult.total;

    // 查询列表
    const listResult = await db.collection('deposits')
      .where(conditions)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    // 获取所有用户的 openid，批量查询最新用户信息
    // 注意：userId 存储的是 openid，不是 _id
    const openids = [...new Set(listResult.data.map(item => item.userId).filter(Boolean))];
    console.log('[deposits_list] 需要查询的 openids:', openids);
    let userMap = {};
    
    if (openids.length > 0) {
      try {
        const usersResult = await db.collection('users')
          .where({ _openid: _.in(openids) })
          .get();
        
        console.log('[deposits_list] 用户查询结果:', usersResult.data.length, '个用户');
        
        // 使用 openid 作为 key
        usersResult.data.forEach(user => {
          console.log('[deposits_list] 用户头像:', user._openid, '->', user.avatarUrl);
          userMap[user._openid] = user;
        });
      } catch (e) {
        console.error('[deposits_list] 获取用户信息失败:', e);
      }
    }

    // 处理返回数据，合并最新用户信息
    const deposits = listResult.data.map(item => {
      const latestUser = userMap[item.userId] || {};
      const userInfo = item.userInfo || {};
      
      return {
        _id: item._id,
        depositNo: item.depositNo,
        userId: item.userId,
        userInfo: {
          ...userInfo,
          // 优先使用最新的用户头像
          avatarUrl: latestUser.avatarUrl || userInfo.avatarUrl,
          nickname: latestUser.nickname || userInfo.nickname,
          phoneNumber: latestUser.phoneNumber || userInfo.phoneNumber,
        },
        amount: item.amount,
        status: item.status,
        paidAt: item.paidAt,
        refundNo: item.refundNo,
        refundReason: item.refundReason,
        refundOperator: item.refundOperator,
        refundedAt: item.refundedAt,
        statusLogs: item.statusLogs || [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    });

    return {
      success: true,
      data: deposits,
      total: total,
      limit: limit,
      offset: offset
    };

  } catch (error) {
    console.error('查询押金列表异常:', error);
    return {
      success: false,
      errorCode: 'SYSTEM_ERROR',
      errorMessage: error.message || '系统异常'
    };
  }
};

