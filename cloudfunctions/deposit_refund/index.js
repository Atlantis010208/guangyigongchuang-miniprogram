/**
 * 押金退款云函数
 * 功能：用户或管理员申请押金退款
 * 
 * 入参：
 * - depositNo: 押金单号（管理员操作时必传）
 * - reason: 退款原因
 * - isAdmin: 是否管理员操作
 * 
 * 出参：
 * - code: 0成功，其他失败
 * - message: 提示信息
 * - data: { refundNo }
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 生成退款单号
 * 格式：DEP_REF_ + 时间戳 + 4位随机数
 */
function generateRefundNo() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DEP_REF_${timestamp}${random}`;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;

  const { depositNo, reason, isAdmin } = event;

  console.log('===== 申请押金退款 =====');
  console.log('用户 OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');
  console.log('押金单号:', depositNo);
  console.log('是否管理员:', isAdmin);
  console.log('退款原因:', reason);

  // 验证用户身份（管理员操作时跳过 OPENID 验证）
  if (!isAdmin && !OPENID) {
    return {
      code: -1,
      message: '无法获取用户身份',
      data: null
    };
  }
  
  // 管理员操作必须提供押金单号
  if (isAdmin && !depositNo) {
    return {
      code: -2,
      message: '管理员操作需要提供押金单号',
      data: null
    };
  }

  try {
    // 1. 查询押金记录
    let depositQuery = db.collection('deposits');
    
    if (isAdmin && depositNo) {
      // 管理员通过押金单号查询
      depositQuery = depositQuery.where({ depositNo: depositNo });
    } else {
      // 用户查询自己的押金
      depositQuery = depositQuery.where({
        userId: OPENID,
        status: 'paid'
      });
    }

    const depositResult = await depositQuery.limit(1).get();

    if (!depositResult.data || depositResult.data.length === 0) {
      return {
        code: -3,
        message: '押金记录不存在',
        data: null
      };
    }

    const deposit = depositResult.data[0];

    // 2. 验证押金状态
    // - 管理员可以对 paid（直接退款）或 pending_refund（审批退款）状态操作
    // - 用户只能对 paid 状态申请退款
    const allowedStatus = isAdmin ? ['paid', 'pending_refund'] : ['paid'];
    
    if (!allowedStatus.includes(deposit.status)) {
      const statusText = {
        'pending': '待支付',
        'pending_refund': '待审批',
        'refunding': '退款中',
        'refunded': '已退款',
        'refund_failed': '退款失败'
      };
      return {
        code: -3,
        message: `押金当前状态为"${statusText[deposit.status] || deposit.status}"，无法退款`,
        data: null
      };
    }

    // 3. 非管理员需要检查是否有进行中的需求
    if (!isAdmin) {
      const ongoingRequests = await db.collection('requests')
        .where({
          userId: deposit.userId,
          stage: _.neq('commission'),  // 不是"调试验收"阶段的都算进行中
          status: _.nin(['cancelled', 'closed', 'refunded'])  // 排除已取消/关闭/退款的
        })
        .count();

      if (ongoingRequests.total > 0) {
        return {
          code: -4,
          message: '您有进行中的需求，订单完成后押金将自动退回',
          data: null
        };
      }
    }

    const now = new Date();

    // 4. 区分用户申请和管理员执行
    if (isAdmin) {
      // 管理员操作：直接执行退款
      console.log('管理员执行退款');
      
      // 生成退款单号
      const refundNo = generateRefundNo();

      // 更新押金状态为退款中
      await db.collection('deposits').doc(deposit._id).update({
        data: {
          status: 'refunding',
          refundNo: refundNo,
          refundReason: reason || '管理员执行退款',
          refundOperator: 'admin',
          statusLogs: _.push({
            status: 'refunding',
            time: now,
            operator: 'admin',
            remark: reason || '管理员执行退款'
          }),
          updatedAt: now
        }
      });

      // 调用微信退款 API
      try {
        const refundResult = await cloud.callFunction({
          name: 'wxpayFunctions',
          data: {
            type: 'wxpay_refund',
            outTradeNo: deposit.depositNo,
            outRefundNo: refundNo,
            refundAmount: deposit.amountFen,
            totalAmount: deposit.amountFen,
            reason: reason || '押金退款'
          }
        });

        console.log('微信退款结果:', refundResult.result);

        if (!refundResult.result || refundResult.result.code !== 0) {
          console.error('微信退款API调用失败:', refundResult.result);
          
          await db.collection('deposits').doc(deposit._id).update({
            data: {
              statusLogs: _.push({
                status: 'refund_failed',
                time: new Date(),
                operator: 'system',
                remark: refundResult.result?.message || '微信退款API调用失败'
              }),
              updatedAt: new Date()
            }
          });

          return {
            code: -6,
            message: refundResult.result?.message || '退款申请失败',
            data: null
          };
        }

        return {
          code: 0,
          message: '退款已发起，预计1-3个工作日到账',
          data: { refundNo: refundNo }
        };

      } catch (refundError) {
        console.error('调用退款API异常:', refundError);
        
        await db.collection('deposits').doc(deposit._id).update({
          data: {
            statusLogs: _.push({
              status: 'refund_error',
              time: new Date(),
              operator: 'system',
              remark: refundError.message || '退款API异常'
            }),
            updatedAt: new Date()
          }
        });

        return {
          code: -6,
          message: '退款失败，请稍后重试',
          data: null
        };
      }
      
    } else {
      // 用户操作：仅提交退款申请，等待管理员审批
      console.log('用户提交退款申请，等待管理员审批');

      // 更新押金状态为待审批
      await db.collection('deposits').doc(deposit._id).update({
        data: {
          status: 'pending_refund',  // 待审批状态
          refundReason: reason || '用户申请退款',
          refundOperator: 'user',
          refundApplyAt: now,
          statusLogs: _.push({
            status: 'pending_refund',
            time: now,
            operator: 'user',
            remark: reason || '用户申请退款，等待管理员审批'
          }),
          updatedAt: now
        }
      });

      console.log('押金状态已更新为待审批:', deposit.depositNo);

      return {
        code: 0,
        message: '退款申请已提交，请等待管理员审核',
        data: {
          status: 'pending_refund'
        }
      };
    }

  } catch (error) {
    console.error('申请押金退款异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      data: null
    };
  }
};

