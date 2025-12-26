/**
 * 微信支付V3工具类
 * 使用原生 HTTP 请求实现，无需平台证书公钥
 * 
 * 功能：
 * - JSAPI下单
 * - 生成小程序支付参数
 * - 查询订单
 * - 关闭订单
 */

const crypto = require('crypto');
const https = require('https');
const { config, validateConfig, printConfigSummary } = require('../config/index');

// API 基础 URL
const API_BASE = 'api.mch.weixin.qq.com';

/**
 * 生成随机字符串
 * @param {number} length - 长度
 * @returns {string}
 */
function generateNonceStr(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成请求签名
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求路径
 * @param {number} timestamp - 时间戳
 * @param {string} nonceStr - 随机字符串
 * @param {string} body - 请求体
 * @returns {string} 签名
 */
function generateSignature(method, url, timestamp, nonceStr, body = '') {
  // 构建签名串
  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  
  // 使用商户私钥进行 RSA-SHA256 签名
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  return sign.sign(config.privateKey, 'base64');
}

/**
 * 生成 Authorization 头
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求路径
 * @param {string} body - 请求体
 * @returns {string}
 */
function generateAuthHeader(method, url, body = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceStr = generateNonceStr();
  const signature = generateSignature(method, url, timestamp, nonceStr, body);
  
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.serialNo}"`;
}

/**
 * 发送 HTTPS 请求
 * @param {string} method - HTTP 方法
 * @param {string} path - 请求路径
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>}
 */
function httpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const authorization = generateAuthHeader(method, path, body);
    
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization,
        'User-Agent': 'CloudBase-WxPay-V3/1.0'
      }
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = responseData ? JSON.parse(responseData) : {};
          resolve({
            status: res.statusCode,
            data: result
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (body) {
      req.write(body);
    }
    
    req.end();
  });
}

/**
 * JSAPI下单 - 创建预付单
 * @param {Object} params 下单参数
 * @param {string} params.orderNo - 商户订单号
 * @param {number} params.totalFee - 金额（单位：分）
 * @param {string} params.description - 商品描述
 * @param {string} params.openid - 用户OpenID
 * @param {string} [params.attach] - 附加数据
 * @returns {Promise<{ success: boolean, prepayId?: string, code?: string, message?: string }>}
 */
const jsapiOrder = async ({ orderNo, totalFee, description, openid, attach }) => {
  // 验证配置
  const validation = validateConfig();
  if (!validation.valid) {
    printConfigSummary();
    throw new Error(`微信支付配置不完整，缺少: ${validation.missing.join(', ')}`);
  }
  
  // 使用 HTTP 触发器的回调 URL
  const notifyUrl = config.callbackUrl;
  
  console.log('JSAPI下单参数:', {
    out_trade_no: orderNo,
    total: totalFee,
    description,
    openid: openid ? `${openid.substring(0, 10)}***` : '未提供',
    notify_url: notifyUrl
  });
  
  // 构建请求数据
  const requestData = {
    appid: config.appid,
    mchid: config.mchid,
    description: description,
    out_trade_no: orderNo,
    notify_url: notifyUrl,
    amount: {
      total: totalFee,
      currency: 'CNY'
    },
    payer: {
      openid: openid
    }
  };
  
  if (attach) {
    requestData.attach = attach;
  }
  
  try {
    const result = await httpRequest('POST', '/v3/pay/transactions/jsapi', requestData);
    
    console.log('JSAPI下单结果:', result);
    
    // 处理返回结果
    if (result.status === 200 && result.data && result.data.prepay_id) {
      return {
        success: true,
        prepayId: result.data.prepay_id
      };
    } else {
      // 失败情况
      console.error('JSAPI下单失败:', result);
      return {
        success: false,
        code: result.data?.code || 'FAIL',
        message: result.data?.message || '下单失败'
      };
    }
  } catch (error) {
    console.error('JSAPI下单异常:', error);
    return {
      success: false,
      code: 'EXCEPTION',
      message: error.message || '下单异常'
    };
  }
};

/**
 * 生成小程序支付参数
 * 用于前端 wx.requestPayment 调用
 * @param {string} prepayId - 预付单ID
 * @returns {Object} 支付参数
 */
const generatePayParams = (prepayId) => {
  // 时间戳（秒）
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  
  // 随机字符串
  const nonceStr = generateNonceStr(32);
  
  // package
  const packageVal = `prepay_id=${prepayId}`;
  
  // 签名类型（V3固定为RSA）
  const signType = 'RSA';
  
  // 生成签名
  // 待签名字符串: appid\n时间戳\n随机字符串\npackage\n
  const message = `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageVal}\n`;
  
  // 使用私钥进行RSA-SHA256签名
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  const paySign = sign.sign(config.privateKey, 'base64');
  
  console.log('生成支付参数:', {
    timeStamp,
    nonceStr,
    packageVal,
    signType,
    paySign: paySign ? '已生成' : '生成失败'
  });
  
  return {
    timeStamp,
    nonceStr,
    packageVal,
    signType,
    paySign
  };
};

/**
 * 根据商户订单号查询订单
 * @param {string} outTradeNo - 商户订单号
 * @returns {Promise<Object>} 查询结果
 */
const queryOrderByOutTradeNo = async (outTradeNo) => {
  // 验证配置
  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`微信支付配置不完整，缺少: ${validation.missing.join(', ')}`);
  }
  
  console.log('查询订单:', outTradeNo);
  
  try {
    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${config.mchid}`;
    const result = await httpRequest('GET', path);
    
    console.log('查询订单结果:', result);
    
    if (result.status === 200 && result.data) {
      const data = result.data;
      return {
        success: true,
        data: {
          tradeState: data.trade_state,
          tradeStateDesc: data.trade_state_desc,
          transactionId: data.transaction_id,
          outTradeNo: data.out_trade_no,
          successTime: data.success_time,
          amount: data.amount
        }
      };
    } else {
      return {
        success: false,
        code: result.data?.code || 'FAIL',
        message: result.data?.message || '查询失败'
      };
    }
  } catch (error) {
    console.error('查询订单异常:', error);
    return {
      success: false,
      code: 'EXCEPTION',
      message: error.message || '查询异常'
    };
  }
};

/**
 * 申请退款
 * @param {Object} params 退款参数
 * @param {string} params.outTradeNo - 原商户订单号
 * @param {string} params.outRefundNo - 商户退款单号
 * @param {number} params.refundAmount - 退款金额（单位：分）
 * @param {number} params.totalAmount - 原订单金额（单位：分）
 * @param {string} [params.reason] - 退款原因
 * @returns {Promise<Object>} 退款结果
 */
const createRefund = async ({ outTradeNo, outRefundNo, refundAmount, totalAmount, reason }) => {
  // 验证配置
  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`微信支付配置不完整，缺少: ${validation.missing.join(', ')}`);
  }
  
  console.log('申请退款参数:', {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    refund_amount: refundAmount,
    total_amount: totalAmount,
    reason
  });
  
  // 构建请求数据
  const requestData = {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: reason || '用户申请退款',
    notify_url: config.refundCallbackUrl,
    amount: {
      refund: refundAmount,
      total: totalAmount,
      currency: 'CNY'
    }
  };
  
  try {
    const result = await httpRequest('POST', '/v3/refund/domestic/refunds', requestData);
    
    console.log('申请退款结果:', result);
    
    if (result.status === 200 && result.data) {
      const data = result.data;
      return {
        success: true,
        data: {
          refundId: data.refund_id,
          outRefundNo: data.out_refund_no,
          transactionId: data.transaction_id,
          outTradeNo: data.out_trade_no,
          status: data.status, // SUCCESS, CLOSED, PROCESSING, ABNORMAL
          successTime: data.success_time,
          amount: data.amount
        }
      };
    } else {
      console.error('申请退款失败:', result);
      return {
        success: false,
        code: result.data?.code || 'FAIL',
        message: result.data?.message || '退款失败'
      };
    }
  } catch (error) {
    console.error('申请退款异常:', error);
    return {
      success: false,
      code: 'EXCEPTION',
      message: error.message || '退款异常'
    };
  }
};

/**
 * 查询退款
 * @param {string} outRefundNo - 商户退款单号
 * @returns {Promise<Object>} 查询结果
 */
const queryRefund = async (outRefundNo) => {
  // 验证配置
  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`微信支付配置不完整，缺少: ${validation.missing.join(', ')}`);
  }
  
  console.log('查询退款:', outRefundNo);
  
  try {
    const path = `/v3/refund/domestic/refunds/${outRefundNo}`;
    const result = await httpRequest('GET', path);
    
    console.log('查询退款结果:', result);
    
    if (result.status === 200 && result.data) {
      const data = result.data;
      return {
        success: true,
        data: {
          refundId: data.refund_id,
          outRefundNo: data.out_refund_no,
          transactionId: data.transaction_id,
          outTradeNo: data.out_trade_no,
          status: data.status, // SUCCESS, CLOSED, PROCESSING, ABNORMAL
          successTime: data.success_time,
          amount: data.amount,
          channel: data.channel,
          userReceivedAccount: data.user_received_account
        }
      };
    } else {
      return {
        success: false,
        code: result.data?.code || 'FAIL',
        message: result.data?.message || '查询失败'
      };
    }
  } catch (error) {
    console.error('查询退款异常:', error);
    return {
      success: false,
      code: 'EXCEPTION',
      message: error.message || '查询异常'
    };
  }
};

/**
 * 关闭订单
 * @param {string} outTradeNo - 商户订单号
 * @returns {Promise<Object>} 关闭结果
 */
const closeOrder = async (outTradeNo) => {
  // 验证配置
  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`微信支付配置不完整，缺少: ${validation.missing.join(', ')}`);
  }
  
  console.log('关闭订单:', outTradeNo);
  
  try {
    const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
    const requestData = {
      mchid: config.mchid
    };
    
    const result = await httpRequest('POST', path, requestData);
    
    console.log('关闭订单结果:', result);
    
    // 关闭订单成功返回204 No Content
    if (result.status === 204 || result.status === 200) {
      return {
        success: true,
        message: '订单已关闭'
      };
    } else {
      return {
        success: false,
        code: result.data?.code || 'FAIL',
        message: result.data?.message || '关闭失败'
      };
    }
  } catch (error) {
    console.error('关闭订单异常:', error);
    return {
      success: false,
      code: 'EXCEPTION',
      message: error.message || '关闭订单异常'
    };
  }
};

module.exports = {
  jsapiOrder,
  generatePayParams,
  queryOrderByOutTradeNo,
  closeOrder,
  createRefund,
  queryRefund,
  generateNonceStr
};
