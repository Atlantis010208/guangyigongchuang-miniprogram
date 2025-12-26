/**
 * 押金退款状态兜底确认云函数
 * 功能：查询微信退款状态并同步到数据库
 * 
 * 入参：
 * - depositNo: 押金单号
 * 
 * 出参：
 * - code: 0成功
 * - message: 提示信息
 * - data: { status, confirmed }
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;

  const { depositNo } = event;

  console.log('===== 押金退款状态兜底确认 =====');
  console.log('用户 OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');
  console.log('押金单号:', depositNo);

  try {
    // 1. 查询押金记录
    let depositQuery;
    if (depositNo) {
      depositQuery = db.collection('deposits').where({ depositNo: depositNo });
    } else if (OPENID) {
      // 查询用户最新的退款中押金
      depositQuery = db.collection('deposits').where({
        userId: OPENID,
        status: 'refunding'
      });
    } else {
      return {
        code: -1,
        message: '缺少查询参数',
        data: null
      };
    }

    const depositResult = await depositQuery.orderBy('updatedAt', 'desc').limit(1).get();

    if (!depositResult.data || depositResult.data.length === 0) {
      return {
        code: 0,
        message: '没有退款中的押金记录',
        data: { status: 'none', confirmed: false }
      };
    }

    const deposit = depositResult.data[0];

    // 如果状态已经是 refunded 或 refund_failed，无需处理
    if (deposit.status === 'refunded') {
      console.log('押金已退款，无需确认');
      return {
        code: 0,
        message: '押金已退款',
        data: { status: 'refunded', confirmed: true }
      };
    }

    if (deposit.status !== 'refunding') {
      console.log('押金状态非退款中:', deposit.status);
      return {
        code: 0,
        message: `当前状态: ${deposit.status}`,
        data: { status: deposit.status, confirmed: false }
      };
    }

    // 2. 如果没有退款单号，说明还没发起微信退款
    if (!deposit.refundNo) {
      console.log('押金尚未发起微信退款');
      return {
        code: 0,
        message: '退款申请待审批',
        data: { status: 'pending_approval', confirmed: false }
      };
    }

    // 3. 调用微信退款查询
    console.log('查询微信退款状态，退款单号:', deposit.refundNo);
    
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
        // 退款成功，更新数据库
        console.log('微信退款已成功，补偿更新状态');

        // 更新 deposits 表
        await db.collection('deposits').doc(deposit._id).update({
          data: {
            status: 'refunded',
            wxRefundId: refundData.refund_id,
            refundedAt: refundData.success_time ? new Date(refundData.success_time) : now,
            statusLogs: _.push({
              status: 'refunded',
              time: now,
              operator: 'system',
              remark: `退款成功（兜底确认），金额：¥${deposit.amount}`
            }),
            updatedAt: now
          }
        });

        // 更新 users 表 - 清除押金状态
        await db.collection('users').where({ _openid: deposit.userId }).update({
          data: {
            depositPaid: false,
            depositId: null,
            updatedAt: now
          }
        });
        console.log('✅ 用户押金状态已清除');

        // 更新 orders 表（临时订单）
        await db.collection('orders').where({ orderNo: deposit.depositNo }).update({
          data: {
            status: 'refunded',
            updatedAt: now
          }
        });

        // 更新用户需求的优先状态（押金退款后，移除优先标记）
        // 注意：requests 集合中 userId 存储的是 users 的 _id，不是 OPENID
        const userDocResult = await db.collection('users')
          .where({ _openid: deposit.userId })  // deposit.userId 是 OPENID
          .field({ _id: true })
          .limit(1)
          .get();
        
        if (userDocResult.data && userDocResult.data.length > 0) {
          const userDocId = userDocResult.data[0]._id;
          const requestsUpdateResult = await db.collection('requests')
            .where({
              userId: userDocId,
              priority: true,
              status: _.nin(['completed', 'cancelled', 'refunded'])
            })
            .update({
              data: {
                priority: false,
                updatedAt: now
              }
            });
          console.log('✅ 用户需求优先标记已移除，影响', requestsUpdateResult.stats?.updated || 0, '条记录');
        } else {
          console.warn('⚠️ 无法获取用户文档 ID，跳过移除优先标记');
        }

        return {
          code: 0,
          message: '退款已成功到账',
          data: { status: 'refunded', confirmed: true }
        };

      } else if (refundStatus === 'PROCESSING') {
        // 退款处理中
        console.log('微信退款处理中');
        return {
          code: 0,
          message: '退款处理中，请稍后查询',
          data: { status: 'processing', confirmed: false }
        };

      } else if (refundStatus === 'ABNORMAL' || refundStatus === 'CLOSED') {
        // 退款异常或关闭
        console.log('微信退款异常/关闭:', refundStatus);

        await db.collection('deposits').doc(deposit._id).update({
          data: {
            status: 'refund_failed',
            failReason: refundStatus === 'ABNORMAL' ? '退款异常' : '退款已关闭',
            statusLogs: _.push({
              status: 'refund_failed',
              time: now,
              operator: 'system',
              remark: `退款失败（兜底确认）: ${refundStatus}`
            }),
            updatedAt: now
          }
        });

        return {
          code: 0,
          message: '退款失败，请联系客服',
          data: { status: 'failed', confirmed: true }
        };
      }
    }

    console.log('微信退款查询未获取到明确结果');
    return {
      code: -5,
      message: '查询退款状态失败，请稍后重试',
      data: null
    };

  } catch (error) {
    console.error('押金退款状态确认异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常',
      data: null
    };
  }
};

