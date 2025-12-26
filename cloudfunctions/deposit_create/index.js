/**
 * 押金创建云函数
 * 功能：创建押金订单并发起微信支付
 * 
 * 入参：无（从 wxContext 获取用户信息）
 * 
 * 出参：
 * - code: 0成功，其他失败
 * - message: 提示信息
 * - data: 支付参数（timeStamp, nonceStr, packageVal, signType, paySign）
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 押金配置
const DEPOSIT_CONFIG = {
  amount: 0.01,           // 押金金额（元），测试环境
  // amount: 100,         // 正式环境
  description: '光乙共创平台-押金'
};

/**
 * 生成押金单号
 * 格式：DEP + 时间戳 + 4位随机数
 */
function generateDepositNo() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DEP${timestamp}${random}`;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;

  console.log('===== 创建押金订单 =====');
  console.log('用户 OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');

  // 1. 验证用户身份
  if (!OPENID) {
    return {
      code: -1,
      message: '无法获取用户身份',
      data: null
    };
  }

  try {
    // 2. 检查用户是否已有活跃押金（status=paid）
    const existingDeposit = await db.collection('deposits')
      .where({
        userId: OPENID,
        status: 'paid'
      })
      .limit(1)
      .get();

    if (existingDeposit.data && existingDeposit.data.length > 0) {
      console.log('用户已有活跃押金:', existingDeposit.data[0].depositNo);
      return {
        code: -2,
        message: '您已缴纳押金，无需重复缴纳',
        data: null
      };
    }

    // 3. 检查是否有待支付的押金（可复用）
    const pendingDeposit = await db.collection('deposits')
      .where({
        userId: OPENID,
        status: 'pending'
      })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    let depositNo;
    let depositId;

    if (pendingDeposit.data && pendingDeposit.data.length > 0) {
      // 复用现有待支付押金
      depositNo = pendingDeposit.data[0].depositNo;
      depositId = pendingDeposit.data[0]._id;
      console.log('复用待支付押金:', depositNo);
    } else {
      // 4. 获取用户信息快照
      let userInfo = {};
      try {
        const userResult = await db.collection('users')
          .where({ _openid: OPENID })
          .limit(1)
          .get();
        if (userResult.data && userResult.data.length > 0) {
          const user = userResult.data[0];
          userInfo = {
            nickname: user.nickname || user.nickName || '',
            avatarUrl: user.avatarUrl || '',
            phoneNumber: user.phoneNumber || ''
          };
        }
      } catch (err) {
        console.warn('获取用户信息失败:', err.message);
      }

      // 5. 创建新的押金记录
      depositNo = generateDepositNo();
      const now = new Date();
      const amountFen = Math.round(DEPOSIT_CONFIG.amount * 100);

      const depositData = {
        depositNo: depositNo,
        userId: OPENID,
        userInfo: userInfo,
        amount: DEPOSIT_CONFIG.amount,
        amountFen: amountFen,
        status: 'pending',
        statusLogs: [{
          status: 'pending',
          time: now,
          operator: 'user',
          remark: '创建押金订单'
        }],
        createdAt: now,
        updatedAt: now
      };

      const createResult = await db.collection('deposits').add({
        data: depositData
      });

      depositId = createResult._id;
      console.log('押金记录创建成功:', depositNo, depositId);
    }

    // 6. 调用 wxpayFunctions 下单
    // 创建临时 orders 记录用于支付
    const amountFen = Math.round(DEPOSIT_CONFIG.amount * 100);
    
    // 先创建一个临时订单记录用于微信支付
    const tempOrderResult = await db.collection('orders').add({
      data: {
        orderNo: depositNo,
        type: 'deposit',
        userId: OPENID,
        status: 'pending_payment',
        paid: false,
        params: {
          totalAmount: DEPOSIT_CONFIG.amount,
          depositId: depositId
        },
        attach: JSON.stringify({ type: 'deposit', depositId: depositId }),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log('临时订单创建成功:', tempOrderResult._id);

    // 7. 调用 wxpayFunctions 获取支付参数
    // 注意：云函数内部调用时，需要手动传入 openid，因为 getWXContext() 无法获取原始用户身份
    const payResult = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_order',
        orderNo: depositNo,
        description: DEPOSIT_CONFIG.description,
        openid: OPENID  // 传入用户 OpenID，解决云函数内部调用时无法获取身份的问题
      }
    });

    console.log('支付下单结果:', payResult.result);

    if (!payResult.result || payResult.result.code !== 0) {
      console.error('支付下单失败:', payResult.result);
      return {
        code: -5,
        message: payResult.result?.message || '支付下单失败，请重试',
        data: null
      };
    }

    // 8. 返回支付参数
    return {
      code: 0,
      message: '下单成功',
      data: {
        depositNo: depositNo,
        timeStamp: payResult.result.data.timeStamp,
        nonceStr: payResult.result.data.nonceStr,
        packageVal: payResult.result.data.packageVal,
        signType: payResult.result.data.signType,
        paySign: payResult.result.data.paySign
      }
    };

  } catch (error) {
    console.error('创建押金订单异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      data: null
    };
  }
};

