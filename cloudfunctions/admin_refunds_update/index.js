/**
 * 管理后台 - 退款审核/确认收货
 */
const cloud = require('wx-server-sdk');
const { requireAdmin, getErrorMessage } = require('./admin_auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 延时函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * 处理退款审核
 * @param {Object} event
 * @param {string} event.refundNo - 退款单号
 * @param {string} event.action - 操作类型：'approve' | 'reject' | 'confirm_return'
 * @param {string} [event.rejectReason] - 拒绝原因（action=reject时必填）
 */
exports.main = async (event, context) => {
  console.log('===== 管理后台退款审核 =====');
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
  
  const { refundNo, action, rejectReason } = event;
  
  // 参数验证
  if (!refundNo) {
    return { success: false, errorMessage: '缺少退款单号' };
  }
  if (!action || !['approve', 'reject', 'confirm_return'].includes(action)) {
    return { success: false, errorMessage: '无效的操作类型' };
  }
  if (action === 'reject' && !rejectReason) {
    return { success: false, errorMessage: '请填写拒绝原因' };
  }
  
  try {
    // 查询退款记录
    const refundRes = await db.collection('refunds').where({ refundNo }).get();
    if (!refundRes.data || refundRes.data.length === 0) {
      return { success: false, errorMessage: '退款记录不存在' };
    }
    
    const refund = refundRes.data[0];
    const now = new Date();
    
    // 根据操作类型处理
    switch (action) {
      case 'approve':
        return await handleApprove(refund, now);
      case 'reject':
        return await handleReject(refund, rejectReason, now);
      case 'confirm_return':
        return await handleConfirmReturn(refund, now);
      default:
        return { success: false, errorMessage: '未知操作' };
    }
    
  } catch (error) {
    console.error('退款审核失败:', error);
    return {
      success: false,
      errorMessage: error.message || '系统异常'
    };
  }
};

/**
 * 同意退款
 */
async function handleApprove(refund, now) {
  // 验证状态
  if (refund.status !== '待审核') {
    return { success: false, errorMessage: `当前状态不允许审核（${refund.status}）` };
  }
  
  const isReturnRefund = refund.refundType === 'return_refund';
  
  if (isReturnRefund) {
    // 退货退款：状态变为「待寄回」
    await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
      data: {
        status: '待寄回',
        approvedAt: now,
        statusLogs: db.command.push({
          status: '待寄回',
          time: now,
          operator: 'admin',
          remark: '商家同意退货，请寄回商品'
        }),
        updatedAt: now
      }
    });
    
    return { success: true, message: '已同意退货，等待用户寄回商品' };
    
  } else {
    // 仅退款：直接发起微信退款
    return await initiateWxRefund(refund, now);
  }
}

/**
 * 拒绝退款
 */
async function handleReject(refund, rejectReason, now) {
  // 验证状态
  if (refund.status !== '待审核') {
    return { success: false, errorMessage: `当前状态不允许审核（${refund.status}）` };
  }
  
  // 更新退款记录
  await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
    data: {
      status: '已拒绝',
      rejectReason,
      statusLogs: db.command.push({
        status: '已拒绝',
        time: now,
        operator: 'admin',
        remark: rejectReason
      }),
      updatedAt: now
    }
  });
  
  // 恢复订单状态
  await db.collection('orders').where({ orderNo: refund.orderNo }).update({
    data: {
      status: '已支付',
      afterSaleStatus: '无售后',
      updatedAt: now
    }
  });
  
  await db.collection('requests').where({ orderNo: refund.orderNo }).update({
    data: {
      status: '已支付',
      afterSaleStatus: '无售后',
      updatedAt: now
    }
  });
  
  return { success: true, message: '已拒绝退款申请' };
}

/**
 * 确认收货（退货流程）
 */
async function handleConfirmReturn(refund, now) {
  // 验证状态
  const validStatus = ['待寄回', '待确认收货'];
  if (!validStatus.includes(refund.status)) {
    return { success: false, errorMessage: `当前状态不允许确认收货（${refund.status}）` };
  }
  
  // 更新退款记录
  await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
    data: {
      returnConfirmedAt: now,
      statusLogs: db.command.push({
        status: '商家已确认收货',
        time: now,
        operator: 'admin',
        remark: '商家已确认收货，开始退款'
      }),
      updatedAt: now
    }
  });
  
  // 发起微信退款
  return await initiateWxRefund(refund, now);
}

/**
 * 主动查询退款状态并更新数据库
 */
async function checkRefundStatus(refundNo, merchantRefundNo) {
  console.log('主动查询退款状态:', refundNo, merchantRefundNo);
  
  try {
    // 调用退款查询接口
    const queryResult = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_refund_query',
        outRefundNo: merchantRefundNo
      }
    });
    
    console.log('退款查询结果:', queryResult);
    
    if (queryResult.result && queryResult.result.code === 0) {
      const wxData = queryResult.result.data;
      const status = wxData.status;
      
      if (status === 'SUCCESS') {
        // 退款成功，更新状态
        console.log('退款查询确认成功:', refundNo);
        
        // 先查询退款记录获取 orderNo
        const refundRes = await db.collection('refunds').where({ refundNo }).get();
        if (refundRes.data && refundRes.data.length > 0) {
          const refund = refundRes.data[0];
          const now = new Date();
          
          await db.collection('refunds').where({ refundNo }).update({
            data: {
              status: '已退款',
              wxRefundStatus: 'SUCCESS',
              refundedAt: wxData.successTime ? new Date(wxData.successTime) : now,
              statusLogs: db.command.push({
                status: '已退款',
                time: now,
                operator: 'system',
                remark: `退款成功，金额：¥${refund.refundAmount}`
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
          
          await db.collection('requests').where({ orderNo: refund.orderNo }).update({
            data: {
              status: '已退款',
              afterSaleStatus: '售后完成',
              updatedAt: now
            }
          });
          
          // ✅ 恢复商品库存和减少销量
          await restoreProductStock(refund.orderNo);
          
          console.log('退款状态已更新为已退款');
        }
        
      } else if (status === 'CLOSED' || status === 'ABNORMAL') {
        // 退款失败
        console.log('退款查询确认失败:', refundNo, status);
        
        await db.collection('refunds').where({ refundNo }).update({
          data: {
            status: '退款失败',
            wxRefundStatus: status,
            failReason: status === 'ABNORMAL' ? '退款异常' : '退款已关闭',
            statusLogs: db.command.push({
              status: '退款失败',
              time: new Date(),
              operator: 'system',
              remark: status === 'ABNORMAL' ? '退款异常，请联系客服' : '退款已关闭'
            }),
            updatedAt: new Date()
          }
        });
      }
      // PROCESSING 状态则不做处理，等待后续回调或再次查询
    }
  } catch (error) {
    console.error('查询退款状态失败:', error);
  }
}

/**
 * 发起微信退款
 */
async function initiateWxRefund(refund, now) {
  try {
    // 查询原订单获取交易信息
    const orderRes = await db.collection('orders').where({ orderNo: refund.orderNo }).get();
    if (!orderRes.data || orderRes.data.length === 0) {
      return { success: false, errorMessage: '原订单不存在' };
    }
    
    const order = orderRes.data[0];
    const totalAmount = Math.round((order.params?.totalAmount || order.totalAmount || 0) * 100); // 转换为分
    const refundAmount = Math.round(refund.refundAmount * 100); // 转换为分
    
    // 生成商户退款单号
    const merchantRefundNo = `MR${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
    
    // 更新状态为退款中
    await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
      data: {
        status: '退款中',
        merchantRefundNo,
        statusLogs: db.command.push({
          status: '退款中',
          time: now,
          operator: 'system',
          remark: '正在处理微信退款'
        }),
        updatedAt: now
      }
    });
    
    // 更新订单状态
    await db.collection('orders').where({ orderNo: refund.orderNo }).update({
      data: {
        status: '退款中',
        updatedAt: now
      }
    });
    
    // 调用微信退款接口
    const wxpayResult = await cloud.callFunction({
      name: 'wxpayFunctions',
      data: {
        type: 'wxpay_refund',
        outTradeNo: refund.orderNo,
        outRefundNo: merchantRefundNo,
        refundAmount: refundAmount,
        totalAmount: totalAmount,
        reason: refund.reason || '用户申请退款'
      }
    });
    
    console.log('微信退款接口返回:', wxpayResult);
    
    if (wxpayResult.result && wxpayResult.result.code === 0) {
      // 退款请求成功
      const wxData = wxpayResult.result.data;
      const wxRefundStatus = wxData.status || 'PROCESSING';
      
      // 微信退款可能同步返回 SUCCESS（小额退款通常立即成功）
      if (wxRefundStatus === 'SUCCESS') {
        // 退款已成功，直接更新状态
        console.log('退款同步成功:', refund.refundNo);
        
        await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
          data: {
            status: '已退款',
            wxRefundId: wxData.refundId || '',
            wxRefundStatus: 'SUCCESS',
            refundedAt: wxData.successTime ? new Date(wxData.successTime) : new Date(),
            statusLogs: db.command.push({
              status: '已退款',
              time: new Date(),
              operator: 'system',
              remark: `退款成功，金额：¥${refund.refundAmount}`
            }),
            updatedAt: new Date()
          }
        });
        
        // 更新订单状态
        await db.collection('orders').where({ orderNo: refund.orderNo }).update({
          data: {
            status: '已退款',
            afterSaleStatus: '售后完成',
            updatedAt: new Date()
          }
        });
        
        // 更新 requests 状态
        await db.collection('requests').where({ orderNo: refund.orderNo }).update({
          data: {
            status: '已退款',
            afterSaleStatus: '售后完成',
            updatedAt: new Date()
          }
        });
        
        // ✅ 恢复商品库存和减少销量
        await restoreProductStock(refund.orderNo);
        
        return { success: true, message: '退款成功' };
        
      } else {
        // 退款处理中，等待回调或后续查询
        console.log('退款处理中:', refund.refundNo, wxRefundStatus);
        
        await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
          data: {
            wxRefundId: wxData.refundId || '',
            wxRefundStatus: wxRefundStatus,
            updatedAt: new Date()
          }
        });
        
        // 如果是 PROCESSING 状态，进行多次轮询查询退款状态
        // 因为小额退款通常会很快成功，但API可能返回PROCESSING
        let retryCount = 0;
        const maxRetry = 3;
        
        while (retryCount < maxRetry) {
          await sleep(2000); // 每次等待2秒
          retryCount++;
          console.log(`轮询查询退款状态 (${retryCount}/${maxRetry})...`);
          
          await checkRefundStatus(refund.refundNo, merchantRefundNo);
          
          // 检查数据库中的状态是否已更新
          const checkRes = await db.collection('refunds').where({ refundNo: refund.refundNo }).get();
          if (checkRes.data && checkRes.data.length > 0) {
            const currentStatus = checkRes.data[0].status;
            if (currentStatus === '已退款' || currentStatus === '退款失败') {
              console.log(`退款状态已更新为: ${currentStatus}`);
              break;
            }
          }
        }
        
        // 最终检查状态并返回相应消息
        const finalRes = await db.collection('refunds').where({ refundNo: refund.refundNo }).get();
        if (finalRes.data && finalRes.data.length > 0 && finalRes.data[0].status === '已退款') {
          return { success: true, message: '退款成功' };
        }
        
        return { success: true, message: '退款申请已提交，请等待处理' };
      }
    } else {
      // 退款请求失败
      const errorMsg = wxpayResult.result?.message || '退款接口调用失败';
      
      await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
        data: {
          status: '退款失败',
          failReason: errorMsg,
          retryCount: db.command.inc(1),
          lastRetryAt: now,
          statusLogs: db.command.push({
            status: '退款失败',
            time: now,
            operator: 'system',
            remark: errorMsg
          }),
          updatedAt: now
        }
      });
      
      return { success: false, errorMessage: errorMsg };
    }
    
  } catch (error) {
    console.error('发起微信退款失败:', error);
    
    // 记录失败
    await db.collection('refunds').where({ refundNo: refund.refundNo }).update({
      data: {
        status: '退款失败',
        failReason: error.message || '系统异常',
        retryCount: db.command.inc(1),
        lastRetryAt: now,
        statusLogs: db.command.push({
          status: '退款失败',
          time: now,
          operator: 'system',
          remark: error.message || '系统异常'
        }),
        updatedAt: now
      }
    });
    
    return { success: false, errorMessage: error.message || '退款失败' };
  }
}

