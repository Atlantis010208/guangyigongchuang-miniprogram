/**
 * 微信支付V3 - JSAPI下单
 * 接收前端传入的订单信息，调用微信支付V3 API创建预付单
 * 
 * 入参：
 * - orderNo: 商户订单号（必填）
 * - totalAmount: 订单金额-元（可选，从数据库读取更安全）
 * - description: 商品描述（可选）
 * 
 * 返回：
 * - code: 0成功，其他失败
 * - message: 提示信息
 * - data: 支付参数（timeStamp, nonceStr, packageVal, signType, paySign）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { jsapiOrder, generatePayParams } = require('../utils/wechatpay');

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { APPID } = wxContext;
  
  // 从前端或调用方接收参数
  const { 
    orderNo,        // 商户订单号
    description,    // 商品描述（可选）
    openid          // 用户OpenID（可选，云函数内部调用时传入）
  } = event;

  // 优先使用传入的 openid，否则从 wxContext 获取
  const OPENID = openid || wxContext.OPENID;

  console.log('===== 微信支付V3下单 =====');
  console.log('订单号:', orderNo);
  console.log('用户OpenID:', OPENID ? `${OPENID.substring(0, 10)}***` : '未获取');
  console.log('OpenID来源:', openid ? '调用方传入' : 'wxContext');
  console.log('AppID:', APPID);

  // 1. 参数验证
  if (!orderNo) {
    return { 
      code: -1, 
      message: '缺少订单号参数',
      data: null 
    };
  }

  if (!OPENID) {
    return { 
      code: -1, 
      message: '无法获取用户身份',
      data: null 
    };
  }

  try {
    // 2. 验证订单是否存在且属于当前用户
    const orderResult = await db.collection('orders')
      .where({ 
        orderNo: orderNo,
        userId: OPENID
      })
      .get();
    
    if (orderResult.data.length === 0) {
      console.error('订单不存在或无权限:', orderNo);
      return { 
        code: -2, 
        message: '订单不存在或无权限',
        data: null 
      };
    }

    const order = orderResult.data[0];
    console.log('订单信息:', {
      _id: order._id,
      orderNo: order.orderNo,
      status: order.status,
      paid: order.paid,
      totalAmount: order.params?.totalAmount
    });

    // 3. 检查订单状态
    if (order.paid === true) {
      return { 
        code: -3, 
        message: '订单已支付',
        data: null 
      };
    }

    if (order.status === 'closed' || order.status === 'cancelled') {
      return { 
        code: -4, 
        message: '订单已关闭，请重新下单',
        data: null 
      };
    }

    // 4. 从数据库获取订单金额（安全：不信任前端传入金额）
    const totalAmount = order.params?.totalAmount;
    if (!totalAmount || totalAmount <= 0) {
      console.error('订单金额无效:', totalAmount);
      return { 
        code: -5, 
        message: '订单金额无效',
        data: null 
      };
    }

    // 5. 计算金额（转换为分，微信支付金额单位为分）
    const totalFee = Math.round(totalAmount * 100);
    
    // 6. 生成商品描述
    let goodsDescription = description || '光乙共创平台-商品订单';
    // 微信支付描述限制128字节
    if (goodsDescription.length > 40) {
      goodsDescription = goodsDescription.substring(0, 40);
    }

    console.log('下单参数:', { 
      orderNo, 
      totalFee, 
      goodsDescription 
    });

    // 7. 调用微信支付V3 JSAPI下单
    // 使用订单中的 attach 字段（如果有），否则使用默认值
    // 这样押金订单可以传递 type: 'deposit' 标识
    const attachData = order.attach || JSON.stringify({ orderId: order._id });
    
    const orderResult2 = await jsapiOrder({
      orderNo: orderNo,
      totalFee: totalFee,
      description: goodsDescription,
      openid: OPENID,
      attach: attachData
    });

    console.log('下单结果:', orderResult2);

    // 8. 处理下单结果
    if (!orderResult2.success) {
      console.error('微信支付下单失败:', orderResult2);
      return {
        code: -6,
        message: orderResult2.message || '支付下单失败',
        data: null,
        detail: {
          code: orderResult2.code,
          message: orderResult2.message
        }
      };
    }

    // 9. 生成小程序支付参数
    const payParams = generatePayParams(orderResult2.prepayId);

    // 10. 保存预付单信息到订单（便于查询和重试）
      await db.collection('orders').doc(order._id).update({
        data: {
        prepayId: orderResult2.prepayId,
        paymentParams: payParams,
        updatedAt: new Date()
        }
      });

    console.log('下单成功，返回支付参数');

      return {
        code: 0,
        message: '下单成功',
        data: {
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        packageVal: payParams.packageVal,
        signType: payParams.signType,
        paySign: payParams.paySign
        }
      };

  } catch (error) {
    console.error('下单异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      error: error.message,
      data: null
    };
  }
};
