/**
 * 押金查询云函数
 * 功能：查询用户押金状态
 * 
 * 入参：无（从 wxContext 获取用户信息）
 * 
 * 出参：
 * - code: 0成功
 * - message: 提示信息
 * - data: { hasPaid, deposit }
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;

  console.log('===== 查询押金状态 =====');
  console.log('用户 OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');

  // 验证用户身份
  if (!OPENID) {
    return {
      code: -1,
      message: '无法获取用户身份',
      data: null
    };
  }

  try {
    // 查询用户最新的押金记录（按创建时间倒序）
    const depositResult = await db.collection('deposits')
      .where({
        userId: OPENID
      })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!depositResult.data || depositResult.data.length === 0) {
      // 用户从未缴纳过押金
      return {
        code: 0,
        message: '查询成功',
        data: {
          hasPaid: false,
          status: 'unpaid',
          deposit: null
        }
      };
    }

    const deposit = depositResult.data[0];
    
    // 根据押金状态返回
    const statusMap = {
      'pending': 'unpaid',            // 待支付
      'paid': 'paid',                 // 已支付
      'pending_refund': 'pending_refund',  // 退款待审批
      'refunding': 'refunding',       // 退款中（微信处理中）
      'refunded': 'refunded',         // 已退款
      'refund_failed': 'refund_failed'    // 退款失败
    };

    let hasPaid = deposit.status === 'paid';
    let currentStatus = deposit.status;
    
    // 🔥 兜底机制1：如果押金状态为"退款中"且有退款单号，查询微信退款状态进行同步
    if (deposit.status === 'refunding' && deposit.refundNo) {
      console.log('检测到退款中状态，进行兜底查询...');
      try {
        const queryResult = await cloud.callFunction({
          name: 'wxpayFunctions',
          data: {
            type: 'wxpay_refund_query',
            outTradeNo: deposit.depositNo,
            outRefundNo: deposit.refundNo
          }
        });

        console.log('微信退款查询结果:', queryResult.result);

        if (queryResult.result && queryResult.result.code === 0) {
          const refundData = queryResult.result.data;
          const refundStatus = refundData.status;
          const now = new Date();

          if (refundStatus === 'SUCCESS') {
            // 退款成功，更新状态
            console.log('✅ 微信退款已成功，补偿更新状态');
            
            await db.collection('deposits').doc(deposit._id).update({
              data: {
                status: 'refunded',
                wxRefundId: refundData.refund_id,
                refundedAt: refundData.success_time ? new Date(refundData.success_time) : now,
                statusLogs: db.command.push({
                  status: 'refunded',
                  time: now,
                  operator: 'system',
                  remark: '退款成功（兜底确认）'
                }),
                updatedAt: now
              }
            });

            // 获取用户文档 ID
            const refundUserResult = await db.collection('users')
              .where({ _openid: OPENID })
              .field({ _id: true })
              .limit(1)
              .get();
            
            const refundUserDocId = refundUserResult.data && refundUserResult.data.length > 0 
              ? refundUserResult.data[0]._id 
              : null;

            // 清除用户押金状态
            await db.collection('users').where({ _openid: OPENID }).update({
              data: {
                depositPaid: false,
                depositId: null,
                updatedAt: now
              }
            });

            // 移除用户需求的优先标记
            // 注意：requests 集合中 userId 存储的是 users 的 _id，不是 OPENID
            if (refundUserDocId) {
              await db.collection('requests')
                .where({
                  userId: refundUserDocId,
                  priority: true,
                  status: db.command.nin(['completed', 'cancelled', 'refunded'])
                })
                .update({
                  data: {
                    priority: false,
                    updatedAt: now
                  }
                });
              console.log('✅ 已移除用户需求的优先标记');
            }

            currentStatus = 'refunded';
            hasPaid = false;
            console.log('✅ 押金退款状态已同步');
          }
        }
      } catch (queryError) {
        console.warn('退款状态兜底查询失败:', queryError.message);
      }
    }
    
    // 🔥 兜底机制2：如果用户已支付押金，确保其所有进行中的需求标记为"优先"
    if (hasPaid) {
      // 先获取用户的 _id（requests 集合中 userId 存储的是 users 的 _id，不是 OPENID）
      const userResult = await db.collection('users')
        .where({ _openid: OPENID })
        .field({ _id: true })
        .limit(1)
        .get();
      
      if (userResult.data && userResult.data.length > 0) {
        const userDocId = userResult.data[0]._id;
        const requestsUpdateResult = await db.collection('requests')
          .where({
            userId: userDocId,
            priority: db.command.neq(true),  // 只更新未标记为优先的
            status: db.command.nin(['completed', 'cancelled', 'refunded'])
          })
          .update({
            data: {
              priority: true,
              updatedAt: new Date()
            }
          });
        
        const updatedCount = requestsUpdateResult.stats?.updated || 0;
        if (updatedCount > 0) {
          console.log('✅ 兜底同步：已将', updatedCount, '条需求标记为优先');
        }
      } else {
        console.warn('⚠️ 无法获取用户文档 ID，跳过需求优先标记');
      }
    }
    
    return {
      code: 0,
      message: '查询成功',
      data: {
        hasPaid: hasPaid,
        status: statusMap[currentStatus] || 'unknown',
        deposit: {
          depositNo: deposit.depositNo,
          amount: deposit.amount,
          status: currentStatus,  // 使用可能被兜底更新的状态
          paidAt: deposit.paidAt || null,
          refundedAt: deposit.refundedAt || null,
          createdAt: deposit.createdAt
        }
      }
    };

  } catch (error) {
    console.error('查询押金状态异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      data: null
    };
  }
};

