/**
 * 押金支付确认云函数（兜底机制）
 * 
 * 功能：
 * 1. 用户支付完成后主动调用，确认支付状态
 * 2. 查询微信支付订单状态
 * 3. 如果已支付，更新 deposits 和 users 集合
 * 4. 解决回调延迟或失败的问题
 * 
 * 入参：
 * - depositNo: 押金单号
 * 
 * 返回：
 * - code: 0成功，其他失败
 * - message: 提示信息
 * - data: { status, confirmed }
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
  const { depositNo } = event;

  console.log('===== 押金支付确认（兜底） =====');
  console.log('用户 OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');
  console.log('押金单号:', depositNo);

  // 1. 验证用户身份
  if (!OPENID) {
    return {
      code: -1,
      message: '无法获取用户身份',
      data: null
    };
  }

  if (!depositNo) {
    return {
      code: -2,
      message: '缺少押金单号',
      data: null
    };
  }

  try {
    // 2. 查询押金记录
    const depositResult = await db.collection('deposits')
      .where({
        depositNo: depositNo,
        userId: OPENID
      })
      .limit(1)
      .get();

    if (!depositResult.data || depositResult.data.length === 0) {
      console.error('押金记录不存在:', depositNo);
      return {
        code: -3,
        message: '押金记录不存在',
        data: null
      };
    }

    const deposit = depositResult.data[0];
    console.log('押金记录状态:', deposit.status);

    // 3. 如果已经是 paid 状态，直接返回
    if (deposit.status === 'paid') {
      console.log('押金已支付，无需确认');
      return {
        code: 0,
        message: '押金已支付',
        data: { status: 'paid', confirmed: false }
      };
    }

    // 4. 查询临时 orders 记录，获取支付信息
    const orderResult = await db.collection('orders')
      .where({
        orderNo: depositNo,
        type: 'deposit'
      })
      .limit(1)
      .get();

    if (!orderResult.data || orderResult.data.length === 0) {
      console.error('临时订单不存在:', depositNo);
      return {
        code: -4,
        message: '订单记录不存在',
        data: null
      };
    }

    const order = orderResult.data[0];
    console.log('订单状态:', order.status, '已支付:', order.paid);

    // 5. 如果订单已支付（回调已处理），但押金状态未更新，进行补偿更新
    if (order.paid === true && order.transactionId) {
      console.log('订单已支付，补偿更新押金状态');
      
      const now = new Date();
      
      // 更新 deposits 集合
      await db.collection('deposits').doc(deposit._id).update({
        data: {
          status: 'paid',
          paidAt: order.paidAt || now,
          transactionId: order.transactionId,
          updatedAt: now,
          statusLogs: db.command.push({
            status: 'paid',
            time: now,
            operator: 'system',
            remark: '支付确认（兜底机制）'
          })
        }
      });

      // 更新 users 集合
      const userResult = await db.collection('users')
        .where({ _openid: OPENID })
        .limit(1)
        .get();

      let userDocId = null;
      if (userResult.data && userResult.data.length > 0) {
        userDocId = userResult.data[0]._id;
        await db.collection('users').doc(userDocId).update({
          data: {
            depositPaid: true,
            depositNo: depositNo,
            depositId: deposit._id,
            updatedAt: now
          }
        });
        console.log('用户押金状态已更新，userDocId:', userDocId);
      }

      // 🔥 批量更新用户所有进行中的需求为"优先"
      // 注意：requests 集合中 userId 存储的是 users 的 _id，不是 OPENID
      if (userDocId) {
        const requestsUpdateResult = await db.collection('requests')
          .where({
            userId: userDocId,
            status: db.command.nin(['completed', 'cancelled', 'refunded'])  // 非完成/取消/退款的需求
          })
          .update({
            data: {
              priority: true,
              updatedAt: now
            }
          });
        console.log('✅ 用户需求已标记为优先，影响', requestsUpdateResult.stats?.updated || 0, '条记录');
      } else {
        console.warn('⚠️ 无法获取用户文档 ID，跳过需求优先标记');
      }

      console.log('押金状态已补偿更新为 paid');
      return {
        code: 0,
        message: '押金支付已确认',
        data: { status: 'paid', confirmed: true }
      };
    }

    // 6. 如果订单未支付，调用微信支付查询接口确认
    console.log('订单状态不确定，查询微信支付订单状态...');
    
    try {
      const queryResult = await cloud.callFunction({
        name: 'wxpayFunctions',
        data: {
          type: 'wxpay_query_order_by_out_trade_no',
          orderNo: depositNo  // 参数名必须是 orderNo
        }
      });

      console.log('微信支付查询结果:', queryResult.result);

      if (queryResult.result && queryResult.result.code === 0) {
        const payData = queryResult.result.data;
        
        if (payData.tradeState === 'SUCCESS') {
          console.log('微信支付已成功，补偿更新状态');
          
          const now = new Date();
          const transactionId = payData.transactionId;
          const paidAt = payData.successTime ? new Date(payData.successTime) : now;

          // 更新 orders 集合
          await db.collection('orders').where({ orderNo: depositNo }).update({
            data: {
              status: 'paid',
              paid: true,
              paidAt: paidAt,
              transactionId: transactionId,
              updatedAt: now
            }
          });

          // 更新 deposits 集合
          await db.collection('deposits').doc(deposit._id).update({
            data: {
              status: 'paid',
              paidAt: paidAt,
              transactionId: transactionId,
              updatedAt: now,
              statusLogs: db.command.push({
                status: 'paid',
                time: now,
                operator: 'system',
                remark: `支付确认（微信查询），交易号: ${transactionId}`
              })
            }
          });

          // 更新 users 集合
          const userResult = await db.collection('users')
            .where({ _openid: OPENID })
            .limit(1)
            .get();

          let userDocId2 = null;
          if (userResult.data && userResult.data.length > 0) {
            userDocId2 = userResult.data[0]._id;
            await db.collection('users').doc(userDocId2).update({
              data: {
                depositPaid: true,
                depositNo: depositNo,
                depositId: deposit._id,
                updatedAt: now
              }
            });
          }

          // 🔥 批量更新用户所有进行中的需求为"优先"
          // 注意：requests 集合中 userId 存储的是 users 的 _id，不是 OPENID
          if (userDocId2) {
            const requestsUpdateResult = await db.collection('requests')
              .where({
                userId: userDocId2,
                status: db.command.nin(['completed', 'cancelled', 'refunded'])
              })
              .update({
                data: {
                  priority: true,
                  updatedAt: now
                }
              });
            console.log('✅ 用户需求已标记为优先，影响', requestsUpdateResult.stats?.updated || 0, '条记录');
          } else {
            console.warn('⚠️ 无法获取用户文档 ID，跳过需求优先标记');
          }

          console.log('押金状态已通过微信查询确认为 paid');
          return {
            code: 0,
            message: '押金支付已确认',
            data: { status: 'paid', confirmed: true }
          };
        } else if (payData.tradeState === 'NOTPAY' || payData.tradeState === 'USERPAYING') {
          console.log('用户尚未完成支付:', payData.tradeState);
          return {
            code: 1,
            message: '支付尚未完成，请完成支付',
            data: { status: 'pending', confirmed: false }
          };
        } else {
          console.log('支付状态异常:', payData.tradeState);
          return {
            code: 2,
            message: `支付状态: ${payData.tradeStateDesc || payData.tradeState}`,
            data: { status: payData.tradeState, confirmed: false }
          };
        }
      } else {
        console.warn('查询微信支付失败:', queryResult.result);
        return {
          code: -5,
          message: '查询支付状态失败，请稍后重试',
          data: null
        };
      }

    } catch (queryError) {
      console.error('查询微信支付异常:', queryError);
      return {
        code: -6,
        message: '查询支付状态异常，请稍后重试',
        data: null
      };
    }

  } catch (error) {
    console.error('押金确认异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      data: null
    };
  }
};

