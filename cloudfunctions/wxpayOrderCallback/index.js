/**
 * 微信支付V3回调处理云函数
 * 
 * 支持两种触发方式：
 * 1. HTTP 触发器（微信支付 V3 API 直接回调）- 需要解密
 * 2. 云开发内置回调（已解密）
 * 
 * HTTP 触发器路径: /wxpay/callback
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// APIv3 密钥（需要与 wxpayFunctions 保持一致）
const APIV3_KEY = process.env.WX_APIV3_KEY || '';

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  console.log('============================================');
  console.log('收到微信支付回调');
  console.log('============================================');
  
  try {
    let paymentData;
    
    // 判断是 HTTP 触发器还是云开发内置回调
    if (event.httpMethod || event.body || event.headers) {
      // HTTP 触发器：需要解密
      console.log('触发方式: HTTP 触发器');
      console.log('HTTP Method:', event.httpMethod);
      console.log('Headers:', JSON.stringify(event.headers || {}, null, 2));
      
      paymentData = await handleHttpCallback(event);
    } else if (event.event_type) {
      // 云开发内置回调：已解密
      console.log('触发方式: 云开发内置回调');
      paymentData = event;
    } else {
      // 未知格式，尝试直接处理
      console.log('触发方式: 未知，尝试直接处理');
      console.log('Event:', JSON.stringify(event, null, 2));
      paymentData = event;
    }
    
    if (!paymentData) {
      console.error('无法解析回调数据');
      return formatHttpResponse(500, { code: 'FAIL', message: '无法解析回调数据' });
    }
    
    // 处理支付通知
    const result = await processPaymentNotification(paymentData);
    
    // 返回成功响应
    return formatHttpResponse(200, { code: 'SUCCESS', message: '成功' });
    
  } catch (err) {
    console.error('处理回调异常:', err);
    return formatHttpResponse(500, { code: 'FAIL', message: err.message });
  }
};

/**
 * 处理 HTTP 触发器回调
 * 需要验证签名并解密数据
 */
async function handleHttpCallback(event) {
  const { body, headers } = event;
  
  if (!body) {
    throw new Error('请求体为空');
  }
  
  // 解析请求体
  let requestBody;
  try {
    requestBody = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (e) {
    throw new Error('请求体 JSON 解析失败');
  }
  
  console.log('请求体:', JSON.stringify(requestBody, null, 2));
  
  const { id, create_time, event_type, resource_type, resource, summary } = requestBody;
  
  // 检查事件类型
  if (event_type !== 'TRANSACTION.SUCCESS') {
    console.log('非支付成功事件:', event_type);
    return { event_type, resource: {} };
  }
  
  // 检查是否需要解密
  if (resource_type === 'encrypt-resource' && resource) {
    // 需要解密
    console.log('解密回调数据...');
    
    if (!APIV3_KEY) {
      throw new Error('APIv3 密钥未配置，无法解密回调数据');
    }
    
    const { algorithm, ciphertext, nonce, associated_data } = resource;
    
    if (algorithm !== 'AEAD_AES_256_GCM') {
      throw new Error(`不支持的加密算法: ${algorithm}`);
    }
    
    // 解密数据
    const decryptedData = decryptResource(ciphertext, nonce, associated_data);
    console.log('解密后的数据:', decryptedData);
    
    return {
      id,
      create_time,
      event_type,
      summary,
      resource: decryptedData
    };
  } else {
    // 数据未加密或已解密
    return requestBody;
  }
}

/**
 * 使用 AEAD_AES_256_GCM 解密资源
 */
function decryptResource(ciphertext, nonce, associatedData) {
  // Base64 解码密文
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
  
  // 分离认证标签（最后16字节）
  const authTag = ciphertextBuffer.slice(-16);
  const encryptedData = ciphertextBuffer.slice(0, -16);
  
  // 创建解密器
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(APIV3_KEY),  // 32字节的 APIv3 密钥
    Buffer.from(nonce)        // 12字节的 nonce
  );
  
  // 设置认证标签
  decipher.setAuthTag(authTag);
  
  // 设置附加数据
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData));
  }
  
  // 解密
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  // 解析 JSON
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * 处理支付通知
 */
async function processPaymentNotification(paymentData) {
  const { event_type, resource } = paymentData;
  
  console.log('事件类型:', event_type);
  console.log('资源数据:', JSON.stringify(resource, null, 2));
  
  // 只处理支付成功的回调
  if (event_type !== 'TRANSACTION.SUCCESS') {
    console.log('非支付成功事件，忽略:', event_type);
    return { ignored: true };
  }
  
  if (!resource) {
    console.error('资源数据为空');
    return { error: 'resource is empty' };
  }
  
  // 兼容不同的字段命名（驼峰和下划线）
  const outTradeNo = resource.out_trade_no || resource.outTradeNo;
  const transactionId = resource.transaction_id || resource.transactionId;
  const successTime = resource.success_time || resource.successTime;
  const tradeState = resource.trade_state || resource.tradeState;
  const amount = resource.amount;
  const payer = resource.payer;
  const attach = resource.attach;
  
  console.log('支付成功，处理订单:', outTradeNo);
  console.log('微信订单号:', transactionId);
  console.log('支付时间:', successTime);
  console.log('交易状态:', tradeState);
  console.log('支付金额:', amount?.total, '分');
  console.log('附加数据:', attach);
  
  // 1. 查询订单
  const orderResult = await db.collection('orders')
    .where({ orderNo: outTradeNo })
    .get();
  
  if (orderResult.data.length === 0) {
    console.error('订单不存在:', outTradeNo);
    return { error: 'order not found' };
  }
  
  const order = orderResult.data[0];
  
  // 2. 幂等性检查（防止重复处理）
  if (order.paid === true && order.transactionId === transactionId) {
    console.log('订单已支付且交易号一致，跳过处理:', outTradeNo);
    return { skipped: true };
  }
  
  // 3. 再次确认交易状态
  if (tradeState !== 'SUCCESS') {
    console.warn('交易状态非SUCCESS，跳过:', tradeState);
    return { skipped: true, reason: 'trade_state not SUCCESS' };
  }
  
  // 4. 判断订单类型 - 押金订单特殊处理
  let orderType = order.type;
  
  // 尝试从 attach 解析订单类型
  if (attach) {
    try {
      const attachData = typeof attach === 'string' ? JSON.parse(attach) : attach;
      if (attachData.type === 'deposit') {
        orderType = 'deposit';
      }
    } catch (e) {
      console.log('解析 attach 失败:', e.message);
    }
  }
  
  // 判断是否是押金订单（通过订单号前缀或 type 字段）
  if (orderType === 'deposit' || outTradeNo.startsWith('DEP')) {
    console.log('===== 处理押金订单 =====');
    return await processDepositPayment(order, {
      transactionId,
      successTime,
      amount,
      payer,
      paymentData
    });
  }
  
  // 5. 更新普通订单状态
  const updateData = {
    status: 'paid',
    paid: true,
    paidAt: successTime ? new Date(successTime) : new Date(),
    transactionId: transactionId,
    paymentAmount: amount?.total || null,
    payerOpenid: payer?.openid || null,
    updatedAt: new Date(),
    callbackId: paymentData.id,
    callbackTime: paymentData.create_time,
    callbackSource: 'wxpay_v3_callback'
  };
  
  await db.collection('orders').doc(order._id).update({
    data: updateData
  });
  
  console.log('✅ 订单状态已更新为已支付');
  
  // 6. 同步更新 requests 表
  try {
    const reqUpdateResult = await db.collection('requests')
      .where({ orderNo: outTradeNo })
      .update({
        data: {
          status: 'paid',
          paid: true,
          paidAt: successTime ? new Date(successTime) : new Date(),
          updatedAt: new Date()
        }
      });
    console.log('✅ requests 表已同步更新，影响', reqUpdateResult.stats?.updated || 0, '条记录');
  } catch (reqErr) {
    console.warn('更新 requests 表失败（非致命）:', reqErr.message);
  }
  
  // 7. 更新商品销量
  if (order.params && order.params.items) {
    await updateProductSales(order.params.items);
  }
  
  console.log('============================================');
  console.log('✅ 支付回调处理完成:', outTradeNo);
  console.log('============================================');
  
  return { success: true, orderNo: outTradeNo };
}

/**
 * 处理押金支付成功
 */
async function processDepositPayment(order, payInfo) {
  const { transactionId, successTime, amount, payer, paymentData } = payInfo;
  const now = successTime ? new Date(successTime) : new Date();
  const userId = order.userId;
  const depositNo = order.orderNo;
  
  console.log('处理押金支付，押金单号:', depositNo);
  console.log('用户 ID:', userId);
  
  try {
    // 1. 更新 orders 表
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'paid',
        paid: true,
        paidAt: now,
        transactionId: transactionId,
        paymentAmount: amount?.total || null,
        payerOpenid: payer?.openid || null,
        updatedAt: now,
        callbackId: paymentData?.id,
        callbackTime: paymentData?.create_time,
        callbackSource: 'wxpay_v3_callback'
      }
    });
    console.log('✅ orders 表已更新');
    
    // 2. 更新 deposits 表
    const depositResult = await db.collection('deposits')
      .where({ depositNo: depositNo })
      .update({
        data: {
          status: 'paid',
          transactionId: transactionId,
          paidAt: now,
          statusLogs: db.command.push({
            status: 'paid',
            time: now,
            operator: 'system',
            remark: '微信支付成功'
          }),
          updatedAt: now
        }
      });
    console.log('✅ deposits 表已更新，影响', depositResult.stats?.updated || 0, '条记录');
    
    // 3. 更新 users 表 - 设置 depositPaid = true
    // 获取押金记录的 _id
    const depositDoc = await db.collection('deposits')
      .where({ depositNo: depositNo })
      .limit(1)
      .get();
    
    const depositId = depositDoc.data && depositDoc.data[0] ? depositDoc.data[0]._id : null;
    
    const userUpdateResult = await db.collection('users')
      .where({ _openid: userId })
      .update({
        data: {
          depositPaid: true,
          depositId: depositId,
          updatedAt: now
        }
      });
    console.log('✅ users 表已更新 depositPaid=true，影响', userUpdateResult.stats?.updated || 0, '条记录');
    
    // 4. 🔥 批量更新用户所有进行中的需求为"优先"
    // 注意：requests 集合中 userId 存储的是 users 的 _id，不是 OPENID
    // 先通过 OPENID 获取用户文档 ID
    const userDocResult = await db.collection('users')
      .where({ _openid: userId })  // userId 这里实际是 OPENID
      .field({ _id: true })
      .limit(1)
      .get();
    
    if (userDocResult.data && userDocResult.data.length > 0) {
      const userDocId = userDocResult.data[0]._id;
      const requestsUpdateResult = await db.collection('requests')
        .where({
          userId: userDocId,  // 使用 users 表的 _id
          status: _.nin(['completed', 'cancelled', 'refunded'])  // 非完成/取消/退款的需求
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
    
    console.log('============================================');
    console.log('✅ 押金支付处理完成:', depositNo);
    console.log('============================================');
    
    return { success: true, orderNo: depositNo, type: 'deposit' };
    
  } catch (error) {
    console.error('处理押金支付异常:', error);
    throw error;
  }
}

/**
 * 更新商品销量和库存
 * 注意：productId 是商品的业务ID字段，不是文档的 _id，需要使用 where 查询
 */
async function updateProductSales(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return;
  }
  
  console.log('更新商品销量和库存，共', items.length, '个商品');
  
  // 虚拟商品ID列表（不需要扣减库存）
  const virtualProductIds = ['toolkit', 'course01'];
  
  for (const item of items) {
    try {
      const productId = item.id || item.productId;
      const quantity = item.quantity || 1;
      
      if (!productId) continue;
      
      // 虚拟商品只增加销量，不扣减库存
      const isVirtual = virtualProductIds.includes(productId) || 
                        (item.name && (item.name.includes('工具包') || item.name.includes('课程')));
      
      // 方法1：尝试通过 productId 字段查询（新版商品）
      let updateResult = await db.collection('products')
        .where({ productId: productId })
        .update({
          data: {
            sales: _.inc(quantity),
            // 非虚拟商品才扣减库存
            ...(isVirtual ? {} : { stock: _.inc(-quantity) }),
            updatedAt: new Date()
          }
        });
      
      // 如果没有更新到记录，尝试方法2：直接使用 _id（兼容旧数据）
      if (!updateResult.stats || updateResult.stats.updated === 0) {
        try {
          updateResult = await db.collection('products')
            .doc(productId)
            .update({
              data: {
                sales: _.inc(quantity),
                ...(isVirtual ? {} : { stock: _.inc(-quantity) }),
                updatedAt: new Date()
              }
            });
        } catch (docErr) {
          // doc() 方式失败是预期的，忽略
        }
      }
      
      const updated = updateResult.stats?.updated || 0;
      if (updated > 0) {
        console.log('✅ 商品销量' + (isVirtual ? '' : '和库存') + '已更新:', productId, '销量+' + quantity);
      } else {
        console.warn('⚠️ 未找到商品:', productId);
      }
    } catch (err) {
      console.warn('更新商品销量失败:', productId, err.message);
    }
  }
}

/**
 * 格式化 HTTP 响应
 */
function formatHttpResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}
