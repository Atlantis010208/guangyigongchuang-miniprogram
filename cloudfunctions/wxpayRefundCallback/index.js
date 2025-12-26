/**
 * 微信支付V3退款回调云函数
 * 接收微信支付的退款结果通知
 * 
 * 需要配置 HTTP 触发器：
 * 路径：/wxpay/refund-callback
 * 方法：POST
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 获取 APIv3 密钥
const API_V3_KEY = process.env.WX_APIV3_KEY || '';

/**
 * 解密退款通知数据
 * @param {string} ciphertext - 密文（Base64）
 * @param {string} nonce - 随机串
 * @param {string} associatedData - 附加数据
 * @returns {Object} 解密后的数据
 */
function decryptResource(ciphertext, nonce, associatedData) {
  if (!API_V3_KEY) {
    throw new Error('APIv3密钥未配置');
  }
  
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
  
  // AEAD_AES_256_GCM 解密
  // 密文最后16字节是认证标签
  const authTag = ciphertextBuffer.slice(-16);
  const encryptedData = ciphertextBuffer.slice(0, -16);
  
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(API_V3_KEY),
    Buffer.from(nonce)
  );
  
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData));
  
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  console.log('===== 微信支付退款回调 =====');
  console.log('event:', JSON.stringify(event, null, 2));
  
  try {
    // HTTP 触发器模式：event 包含 body、headers 等
    let notifyData;
    
    if (event.body) {
      // HTTP 触发器调用
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      
      // 验证通知类型
      if (body.event_type !== 'REFUND.SUCCESS' && 
          body.event_type !== 'REFUND.ABNORMAL' && 
          body.event_type !== 'REFUND.CLOSED') {
        console.log('非退款通知，忽略:', body.event_type);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'SUCCESS', message: '成功' })
        };
      }
      
      // 解密数据
      const { ciphertext, nonce, associated_data } = body.resource;
      notifyData = decryptResource(ciphertext, nonce, associated_data);
      
    } else if (event.event_type) {
      // 云开发内置模式：event 已经是解密后的数据
      notifyData = event.resource || event;
    } else {
      console.error('未知的回调格式');
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 'FAIL', message: '格式错误' })
      };
    }
    
    console.log('退款通知数据:', notifyData);
    
    const {
      refund_id,
      out_refund_no,
      out_trade_no,
      refund_status,
      success_time,
      amount
    } = notifyData;
    
    // 判断是否是押金退款（通过退款单号前缀）
    const isDepositRefund = out_refund_no && out_refund_no.startsWith('DEP_REF_');
    
    if (isDepositRefund) {
      // 押金退款处理
      console.log('===== 处理押金退款 =====');
      await processDepositRefund(out_refund_no, out_trade_no, refund_status, refund_id, success_time, amount);
    } else {
      // 普通退款处理
      await processNormalRefund(out_refund_no, out_trade_no, refund_status, refund_id, success_time, amount);
    }
    
    // 返回成功响应
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SUCCESS', message: '成功' })
    };
    
  } catch (error) {
    console.error('处理退款回调失败:', error);
    
    // 即使处理失败也返回成功，避免微信重复通知
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SUCCESS', message: '成功' })
    };
  }
};

/**
 * 处理押金退款回调
 */
async function processDepositRefund(outRefundNo, outTradeNo, refundStatus, refundId, successTime, amount) {
  const now = new Date();
  
  // 查询押金记录
  const depositRes = await db.collection('deposits').where({
    depositNo: outTradeNo
  }).get();
  
  if (!depositRes.data || depositRes.data.length === 0) {
    console.error('押金记录不存在:', outTradeNo);
    return;
  }
  
  const deposit = depositRes.data[0];
  
  // 幂等性检查
  if (deposit.status === 'refunded' || deposit.status === 'refund_failed') {
    console.log('押金退款已处理，跳过:', deposit.depositNo);
    return;
  }
  
  if (refundStatus === 'SUCCESS') {
    // 退款成功
    console.log('押金退款成功:', deposit.depositNo);
    
    // 更新押金记录
    await db.collection('deposits').where({ depositNo: outTradeNo }).update({
      data: {
        status: 'refunded',
        wxRefundId: refundId,
        refundedAt: successTime ? new Date(successTime) : now,
        statusLogs: db.command.push({
          status: 'refunded',
          time: now,
          operator: 'system',
          remark: `退款成功，金额：¥${(amount?.refund || 0) / 100}`
        }),
        updatedAt: now
      }
    });
    
    // 更新 users 表 - 设置 depositPaid = false
    await db.collection('users').where({ _openid: deposit.userId }).update({
      data: {
        depositPaid: false,
        depositId: null,
        updatedAt: now
      }
    });
    console.log('✅ 用户押金状态已清除:', deposit.userId);
    
    // 更新临时订单记录（如果有）
    await db.collection('orders').where({ orderNo: outTradeNo }).update({
      data: {
        status: 'refunded',
        updatedAt: now
      }
    });
    
  } else if (refundStatus === 'ABNORMAL' || refundStatus === 'CLOSED') {
    // 退款异常或关闭
    console.log('押金退款异常/关闭:', deposit.depositNo, refundStatus);
    
    await db.collection('deposits').where({ depositNo: outTradeNo }).update({
      data: {
        status: 'refund_failed',
        wxRefundId: refundId,
        failReason: refundStatus === 'ABNORMAL' ? '退款异常' : '退款已关闭',
        statusLogs: db.command.push({
          status: 'refund_failed',
          time: now,
          operator: 'system',
          remark: refundStatus === 'ABNORMAL' ? '退款异常，请联系客服' : '退款已关闭'
        }),
        updatedAt: now
      }
    });
  }
}

/**
 * 恢复商品库存和减少销量（退款成功时调用）
 * @param {string} orderNo - 订单号
 */
async function restoreProductStock(orderNo) {
  try {
    // 查询订单获取商品信息
    const orderRes = await db.collection('orders').where({ orderNo }).get();
    if (!orderRes.data || orderRes.data.length === 0) {
      console.warn('订单不存在，无法恢复库存:', orderNo);
      return;
    }
    
    const order = orderRes.data[0];
    const items = order.items || order.params?.items || [];
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log('订单无商品信息，跳过恢复库存');
      return;
    }
    
    const _ = db.command;
    console.log('恢复商品库存，共', items.length, '个商品');
    
    for (const item of items) {
      try {
        const productId = item.id || item.productId || item._id;
        const quantity = item.quantity || item.count || 1;
        
        if (!productId) {
          console.warn('商品缺少ID，跳过:', item);
          continue;
        }
        
        // 使用 where 查询商品
        const productQuery = await db.collection('products')
          .where(db.command.or([
            { _id: productId },
            { productId: productId }
          ]))
          .get();
        
        if (productQuery.data && productQuery.data.length > 0) {
          const product = productQuery.data[0];
          const currentSales = product.sales || 0;
          const newSales = Math.max(0, currentSales - quantity);
          
          await db.collection('products').doc(product._id).update({
            data: {
              stock: _.inc(quantity),  // 恢复库存
              sales: newSales,          // 减少销量
              updatedAt: new Date()
            }
          });
          
          console.log('✅ 商品库存已恢复:', product._id, '库存+', quantity, '销量-', quantity);
        } else {
          // 尝试直接用 doc 查询
          try {
            const docResult = await db.collection('products').doc(productId).get();
            if (docResult.data) {
              const currentSales = docResult.data.sales || 0;
              const newSales = Math.max(0, currentSales - quantity);
              
              await db.collection('products').doc(productId).update({
                data: {
                  stock: _.inc(quantity),
                  sales: newSales,
                  updatedAt: new Date()
                }
              });
              console.log('✅ 商品库存已恢复(doc):', productId, '库存+', quantity, '销量-', quantity);
            }
          } catch (docErr) {
            console.warn('doc查询失败:', docErr.message);
          }
        }
      } catch (err) {
        console.warn('恢复商品库存失败:', err.message);
      }
    }
  } catch (error) {
    console.error('恢复库存异常:', error);
  }
}

/**
 * 处理普通退款回调
 */
async function processNormalRefund(outRefundNo, outTradeNo, refundStatus, refundId, successTime, amount) {
  // 查询退款记录
  const refundRes = await db.collection('refunds').where({
    merchantRefundNo: outRefundNo
  }).get();
  
  if (!refundRes.data || refundRes.data.length === 0) {
    console.error('退款记录不存在:', outRefundNo);
    return;
  }
  
  const refund = refundRes.data[0];
  
  // 幂等性检查
  if (refund.status === '已退款' || refund.status === '退款失败') {
    console.log('退款已处理，跳过:', refund.refundNo);
    return;
  }
  
  const now = new Date();
  
  if (refundStatus === 'SUCCESS') {
    // 退款成功
    console.log('退款成功:', refund.refundNo);
    
    // 更新退款记录
    await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
      data: {
        status: '已退款',
        wxRefundId: refundId,
        wxRefundStatus: refundStatus,
        refundedAt: successTime ? new Date(successTime) : now,
        statusLogs: db.command.push({
          status: '已退款',
          time: now,
          operator: 'system',
          remark: `退款成功，金额：¥${(amount?.refund || 0) / 100}`
        }),
        updatedAt: now
      }
    });
    
    // 更新订单状态
    await db.collection('orders').where({ orderNo: refund.orderNo }).update({
      data: {
        status: '已退款',
        afterSaleStatus: '售后完成',
        updatedAt: now
      }
    });
    
    // 更新 requests 状态
    await db.collection('requests').where({ orderNo: refund.orderNo }).update({
      data: {
        status: '已退款',
        afterSaleStatus: '售后完成',
        updatedAt: now
      }
    });
    
    // ✅ 恢复商品库存和减少销量
    await restoreProductStock(refund.orderNo);
    
  } else if (refundStatus === 'ABNORMAL' || refundStatus === 'CLOSED') {
    // 退款异常或关闭
    console.log('退款异常/关闭:', refund.refundNo, refundStatus);
    
    await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
      data: {
        status: '退款失败',
        wxRefundId: refundId,
        wxRefundStatus: refundStatus,
        failReason: refundStatus === 'ABNORMAL' ? '退款异常' : '退款已关闭',
        statusLogs: db.command.push({
          status: '退款失败',
          time: now,
          operator: 'system',
          remark: refundStatus === 'ABNORMAL' ? '退款异常，请联系客服' : '退款已关闭'
        }),
        updatedAt: now
      }
    });
  }
}

