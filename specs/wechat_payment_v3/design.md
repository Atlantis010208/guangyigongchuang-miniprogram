# 微信支付V3 API重构技术设计文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           小程序前端                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ 订单确认页   │ -> │ 支付结果页   │ <- │ 订单列表页   │           │
│  │ confirm.js   │    │ result.js    │    │ orders.js    │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   ▲                    │                   │
│         │ 调用云函数        │ 跳转               │ 重新支付          │
│         ▼                   │                    ▼                   │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ wx.cloud.callFunction
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           云函数层                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │wxpayFunctions│    │wxpayOrder    │    │orderTimeout  │           │
│  │  (V3 API)    │    │  Callback    │    │  Check       │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   ▲                    │                   │
│         │ HTTPS请求         │ 支付回调           │ 定时触发          │
│         ▼                   │                    ▼                   │
└─────────────────────────────────────────────────────────────────────┘
          │                   │
          │                   │ 云开发自动路由
          ▼                   │
┌─────────────────────────────────────────────────────────────────────┐
│                      微信支付V3 API (直连商户模式)                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ JSAPI下单    │    │ 订单查询     │    │ 支付通知     │           │
│  │ /v3/pay/     │    │ /v3/pay/     │    │ 回调通知     │           │
│  │ transactions │    │ transactions │    │              │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 支付流程时序图

```
用户        小程序前端       wxpayFunctions     微信支付V3     wxpayOrderCallback  数据库
 │              │                 │                 │                 │           │
 │ 1.点击支付    │                 │                 │                 │           │
 │─────────────>│                 │                 │                 │           │
 │              │ 2.创建订单       │                 │                 │           │
 │              │────────────────────────────────────────────────────────────────>│
 │              │                 │                 │                 │     存储  │
 │              │ 3.调用下单       │                 │                 │           │
 │              │────────────────>│                 │                 │           │
 │              │                 │ 4.V3 JSAPI下单   │                 │           │
 │              │                 │────────────────>│                 │           │
 │              │                 │<────────────────│ prepay_id       │           │
 │              │                 │ 5.生成支付签名   │                 │           │
 │              │<────────────────│ 支付参数        │                 │           │
 │              │                 │                 │                 │           │
 │              │ 6.唤起支付       │                 │                 │           │
 │<─────────────│ wx.requestPayment                 │                 │           │
 │              │                 │                 │                 │           │
 │ 7.输入密码    │                 │                 │                 │           │
 │─────────────────────────────────────────────────>│                 │           │
 │<─────────────────────────────────────────────────│ 支付结果        │           │
 │              │                 │                 │                 │           │
 │              │                 │                 │ 8.支付回调       │           │
 │              │                 │                 │────────────────>│           │
 │              │                 │                 │                 │ 9.更新订单│
 │              │                 │                 │                 │──────────>│
 │              │                 │                 │<────────────────│ return    │
 │              │ 10.跳转结果页   │                 │                 │           │
 │<─────────────│ 显示成功        │                 │                 │           │
 │              │                 │                 │                 │           │
```

## 2. 技术选型

### 2.1 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| wechatpay-node-v3 | ^2.x | 微信支付V3 SDK，处理签名和API调用 |
| wx-server-sdk | latest | 云开发服务端SDK |

### 2.2 为什么选择 wechatpay-node-v3

1. **官方推荐**：微信支付V3 API的Node.js实现
2. **自动签名**：内置RSA签名和验签逻辑
3. **类型完整**：支持TypeScript类型定义
4. **维护活跃**：持续更新，兼容最新API

## 3. 接口设计

### 3.1 下单接口 (wxpayFunctions - wxpay_order)

**请求参数**:
```javascript
{
  type: 'wxpay_order',
  orderNo: String,        // 商户订单号
  totalAmount: Number,    // 订单金额 (元) - 仅用于日志，实际金额从数据库读取
  description: String     // 商品描述
}
```

**返回参数**:
```javascript
// 成功
{
  code: 0,
  message: '下单成功',
  data: {
    timeStamp: String,    // 时间戳
    nonceStr: String,     // 随机字符串
    packageVal: String,   // prepay_id=xxx
    signType: 'RSA',      // 签名类型（V3固定为RSA）
    paySign: String       // 支付签名
  }
}

// 失败
{
  code: Number,           // 错误码
  message: String,        // 错误信息
  data: null
}
```

### 3.2 支付回调接口 (wxpayOrderCallback)

**微信回调参数**（云开发已解密）:
```javascript
{
  id: String,                    // 回调通知ID
  create_time: String,           // 通知创建时间
  event_type: String,            // 通知类型 "TRANSACTION.SUCCESS"
  resource: {
    out_trade_no: String,        // 商户订单号
    transaction_id: String,      // 微信支付订单号
    trade_state: String,         // 交易状态
    success_time: String,        // 支付成功时间
    amount: {
      total: Number,             // 订单金额 (分)
      payer_total: Number        // 用户支付金额 (分)
    },
    payer: {
      openid: String             // 支付者 OpenID
    }
  }
}
```

**返回参数**:
```javascript
// 返回 event 对象表示处理成功
return event;
```

### 3.3 查询订单接口 (wxpayFunctions - wxpay_query_order_by_out_trade_no)

**请求参数**:
```javascript
{
  type: 'wxpay_query_order_by_out_trade_no',
  orderNo: String         // 商户订单号
}
```

**返回参数**:
```javascript
{
  code: 0,
  message: 'success',
  data: {
    trade_state: String,         // SUCCESS/NOTPAY/CLOSED/REFUND等
    trade_state_desc: String,    // 状态描述
    transaction_id: String,      // 微信支付订单号（支付成功时有值）
    success_time: String         // 支付成功时间
  }
}
```

## 4. 云函数设计

### 4.1 wxpayFunctions 目录结构

```
cloudfunctions/wxpayFunctions/
├── index.js                    # 入口路由
├── package.json                # 依赖配置
├── config/
│   └── index.js                # 配置管理（从环境变量读取）
├── utils/
│   └── wechatpay.js            # 微信支付V3工具类
├── wxpay_order/
│   └── index.js                # 下单接口
├── wxpay_query_order_by_out_trade_no/
│   └── index.js                # 按商户订单号查询
├── wxpay_query_order_by_transaction_id/
│   └── index.js                # 按微信订单号查询
├── wxpay_refund/
│   └── index.js                # 退款（保留，暂不实现）
└── wxpay_refund_query/
    └── index.js                # 退款查询（保留，暂不实现）
```

### 4.2 配置管理 (config/index.js)

```javascript
/**
 * 微信支付V3配置
 * 敏感信息从环境变量读取
 */
module.exports = {
  // 小程序AppID
  appid: process.env.WX_APPID || 'wxe8b6b3aed51577e0',
  
  // 商户号
  mchid: process.env.WX_MCHID || '1734489422',
  
  // 商户API私钥（PEM格式）
  privateKey: process.env.WX_PRIVATE_KEY,
  
  // 商户API证书序列号
  serialNo: process.env.WX_SERIAL_NO,
  
  // APIv3密钥
  apiV3Key: process.env.WX_APIV3_KEY,
  
  // 支付回调地址（由云开发自动处理，此处仅作记录）
  notifyUrl: process.env.WX_NOTIFY_URL || ''
};
```

### 4.3 微信支付V3工具类 (utils/wechatpay.js)

```javascript
/**
 * 微信支付V3工具类
 * 封装签名、API调用等功能
 */
const WxPay = require('wechatpay-node-v3');
const config = require('../config');

let payInstance = null;

/**
 * 获取支付实例（单例）
 */
function getPayInstance() {
  if (!payInstance) {
    payInstance = new WxPay({
      appid: config.appid,
      mchid: config.mchid,
      privateKey: config.privateKey,
      serial_no: config.serialNo,
      apiv3_key: config.apiV3Key
    });
  }
  return payInstance;
}

/**
 * JSAPI下单
 * @param {Object} params 下单参数
 * @returns {Object} 返回prepay_id和支付参数
 */
async function jsapiOrder(params) {
  const pay = getPayInstance();
  
  const orderParams = {
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: config.notifyUrl,
    amount: {
      total: params.totalFee,  // 单位：分
      currency: 'CNY'
    },
    payer: {
      openid: params.openid
    }
  };
  
  const result = await pay.transactions_jsapi(orderParams);
  return result;
}

/**
 * 生成小程序支付参数
 * @param {String} prepayId 预支付ID
 * @returns {Object} 支付参数
 */
function generatePayParams(prepayId) {
  const pay = getPayInstance();
  return pay.combine_paysign({
    prepay_id: prepayId
  });
}

/**
 * 查询订单（按商户订单号）
 * @param {String} outTradeNo 商户订单号
 * @returns {Object} 订单信息
 */
async function queryOrderByOutTradeNo(outTradeNo) {
  const pay = getPayInstance();
  const result = await pay.query({
    out_trade_no: outTradeNo
  });
  return result;
}

module.exports = {
  getPayInstance,
  jsapiOrder,
  generatePayParams,
  queryOrderByOutTradeNo
};
```

### 4.4 下单接口 (wxpay_order/index.js)

```javascript
/**
 * 微信支付V3 - JSAPI下单
 */
const cloud = require('wx-server-sdk');
const wechatpay = require('../utils/wechatpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID, APPID } = wxContext;
  const { orderNo, description } = event;

  console.log('收到V3下单请求:', { orderNo, openid: OPENID });

  // 1. 参数验证
  if (!orderNo) {
    return { code: -1, message: '缺少订单号参数', data: null };
  }

  try {
    // 2. 从数据库读取订单信息（安全：不信任前端金额）
    const orderResult = await db.collection('orders')
      .where({ orderNo, userId: OPENID })
      .get();
    
    if (orderResult.data.length === 0) {
      return { code: -2, message: '订单不存在或无权限', data: null };
    }

    const order = orderResult.data[0];

    // 3. 检查订单状态
    if (order.paid === true) {
      return { code: -3, message: '订单已支付', data: null };
    }
    if (order.status === 'closed') {
      return { code: -4, message: '订单已关闭，请重新下单', data: null };
    }

    // 4. 从数据库读取真实金额（分）
    const totalFee = Math.round((order.params?.totalAmount || 0) * 100);
    if (totalFee <= 0) {
      return { code: -1, message: '订单金额无效', data: null };
    }

    const goodsDescription = description || '光乙共创平台-商品订单';

    console.log('调用微信支付V3下单:', { orderNo, totalFee, goodsDescription });

    // 5. 调用V3 JSAPI下单
    const result = await wechatpay.jsapiOrder({
      description: goodsDescription,
      outTradeNo: orderNo,
      totalFee: totalFee,
      openid: OPENID
    });

    console.log('微信支付V3返回:', result);

    // 6. 检查返回结果
    if (result.status === 200 && result.data?.prepay_id) {
      const prepayId = result.data.prepay_id;
      
      // 7. 生成小程序支付参数
      const payParams = wechatpay.generatePayParams(prepayId);
      
      // 8. 保存支付参数到订单
      await db.collection('orders').doc(order._id).update({
        data: {
          prepayId: prepayId,
          updatedAt: db.serverDate()
        }
      });

      return {
        code: 0,
        message: '下单成功',
        data: {
          timeStamp: payParams.timeStamp,
          nonceStr: payParams.nonceStr,
          packageVal: payParams.package,
          signType: payParams.signType,
          paySign: payParams.paySign
        }
      };
    } else {
      // 下单失败
      console.error('微信支付V3下单失败:', result);
      return {
        code: -5,
        message: result.data?.message || '支付下单失败',
        data: null
      };
    }

  } catch (error) {
    console.error('下单异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常，请稍后重试',
      data: null
    };
  }
};
```

### 4.5 支付回调处理 (wxpayOrderCallback/index.js)

```javascript
/**
 * 微信支付V3 - 支付回调处理
 * 云开发已自动解密，直接接收解密后的参数
 */
'use strict';
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  console.log('收到微信支付回调:', JSON.stringify(event));
  
  const { event_type, resource } = event;
  
  // 1. 判断支付是否成功
  if (event_type === 'TRANSACTION.SUCCESS') {
    const {
      out_trade_no,      // 商户订单号
      transaction_id,    // 微信支付订单号
      success_time,      // 支付成功时间
      amount,            // 金额信息
      payer              // 支付者信息
    } = resource;
    
    console.log('支付成功，订单号:', out_trade_no);
    
    try {
      // 2. 查询订单是否已处理（幂等性检查）
      const orderResult = await db.collection('orders')
        .where({ orderNo: out_trade_no })
        .get();
      
      if (orderResult.data.length === 0) {
        console.warn('订单不存在:', out_trade_no);
        return event;
      }
      
      const order = orderResult.data[0];
      
      // 3. 幂等性检查：已支付则跳过
      if (order.paid === true) {
        console.log('订单已处理，跳过:', out_trade_no);
        return event;
      }
      
      // 4. 更新订单状态
      await db.collection('orders').doc(order._id).update({
        data: {
          status: 'paid',
          paid: true,
          paidAt: new Date(success_time),
          transactionId: transaction_id,
          paymentAmount: amount?.total || 0,
          updatedAt: db.serverDate()
        }
      });
      
      console.log('订单状态已更新:', out_trade_no);
      
      // 5. 同步更新 requests 表
      await db.collection('requests')
        .where({ orderNo: out_trade_no })
        .update({
          data: {
            status: 'paid',
            paid: true,
            paidAt: new Date(success_time),
            updatedAt: db.serverDate()
          }
        });
      
      // 6. 更新商品销量
      await updateProductSales(order.params?.items);
      
      console.log('支付回调处理完成:', out_trade_no);
      
    } catch (err) {
      console.error('处理支付回调失败:', err);
      // 返回event让微信重试
    }
  }
  
  // 返回event表示处理成功
  return event;
};

/**
 * 更新商品销量
 */
async function updateProductSales(items) {
  if (!items || !Array.isArray(items)) return;
  
  for (const item of items) {
    try {
      await db.collection('products').doc(item.id).update({
        data: {
          sales: db.command.inc(item.quantity || 1),
          updatedAt: db.serverDate()
        }
      });
      console.log('商品销量已更新:', item.id);
    } catch (err) {
      console.warn('更新商品销量失败:', item.id, err.message);
    }
  }
}
```

### 4.6 查询订单接口 (wxpay_query_order_by_out_trade_no/index.js)

```javascript
/**
 * 微信支付V3 - 查询订单（按商户订单号）
 */
const cloud = require('wx-server-sdk');
const wechatpay = require('../utils/wechatpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { orderNo } = event;

  if (!orderNo) {
    return { code: -1, message: '缺少订单号参数', data: null };
  }

  try {
    // 调用V3查询接口
    const result = await wechatpay.queryOrderByOutTradeNo(orderNo);
    
    console.log('查询订单结果:', result);

    if (result.status === 200 && result.data) {
      const data = result.data;
      
      // 如果支付成功但本地未更新，则同步更新
      if (data.trade_state === 'SUCCESS') {
        await syncOrderStatus(orderNo, data);
      }
      
      return {
        code: 0,
        message: 'success',
        data: {
          trade_state: data.trade_state,
          trade_state_desc: data.trade_state_desc,
          transaction_id: data.transaction_id,
          success_time: data.success_time
        }
      };
    } else {
      return {
        code: -5,
        message: result.data?.message || '查询失败',
        data: null
      };
    }
  } catch (error) {
    console.error('查询订单异常:', error);
    return {
      code: -99,
      message: error.message || '系统异常',
      data: null
    };
  }
};

/**
 * 同步订单状态（兜底逻辑）
 */
async function syncOrderStatus(orderNo, payResult) {
  try {
    const orderResult = await db.collection('orders')
      .where({ orderNo })
      .get();
    
    if (orderResult.data.length > 0) {
      const order = orderResult.data[0];
      if (!order.paid) {
        await db.collection('orders').doc(order._id).update({
          data: {
            status: 'paid',
            paid: true,
            paidAt: new Date(payResult.success_time),
            transactionId: payResult.transaction_id,
            updatedAt: db.serverDate()
          }
        });
        console.log('订单状态已同步:', orderNo);
      }
    }
  } catch (err) {
    console.warn('同步订单状态失败:', err);
  }
}
```

## 5. 环境变量配置

云函数需要配置以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| WX_APPID | 小程序AppID | wxe8b6b3aed51577e0 |
| WX_MCHID | 商户号 | 1734489422 |
| WX_SERIAL_NO | 商户API证书序列号 | 3A5B... |
| WX_PRIVATE_KEY | 商户API私钥（PEM格式） | -----BEGIN PRIVATE KEY-----\n... |
| WX_APIV3_KEY | APIv3密钥 | 32位字符串 |
| WX_NOTIFY_URL | 支付回调地址 | 由云开发自动配置 |

## 6. 部署配置

### 6.1 package.json

```json
{
  "name": "wxpayFunctions",
  "version": "2.0.0",
  "description": "微信支付V3云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest",
    "wechatpay-node-v3": "^2.1.5"
  }
}
```

### 6.2 云函数配置

在微信开发者工具中配置 `wxpayOrderCallback` 为支付回调函数：

1. 云开发控制台 → 设置 → 支付配置
2. 设置支付回调云函数为 `wxpayOrderCallback`

### 6.3 环境变量配置步骤

1. 云开发控制台 → 云函数 → wxpayFunctions
2. 点击"配置" → "环境变量"
3. 添加上述环境变量

## 7. 错误处理

### 7.1 错误码定义

| 错误码 | 描述 | 处理方式 |
|--------|------|----------|
| 0 | 成功 | - |
| -1 | 参数错误 | 提示用户检查订单信息 |
| -2 | 订单不存在 | 提示用户重新下单 |
| -3 | 订单已支付 | 跳转到订单详情 |
| -4 | 订单已关闭 | 提示用户重新下单 |
| -5 | 微信支付调用失败 | 显示具体错误信息 |
| -99 | 系统异常 | 提示用户稍后重试 |

## 8. 安全设计

### 8.1 金额安全
- 下单时从数据库读取订单金额，不信任前端传入的金额
- 回调处理时记录实际支付金额

### 8.2 密钥安全
- 商户私钥、APIv3密钥存储在环境变量中
- 不在代码中硬编码敏感信息
- 日志中不打印完整密钥

### 8.3 幂等性
- 回调处理前检查订单是否已处理
- 避免重复更新订单状态和商品销量

## 9. 测试要点

### 9.1 功能测试
- [ ] 正常支付流程（0.01元测试）
- [ ] 取消支付后重新支付
- [ ] 订单超时自动关闭
- [ ] 支付回调正确处理
- [ ] 商品销量正确更新

### 9.2 异常测试
- [ ] 网络超时处理
- [ ] 重复回调处理（幂等性）
- [ ] 无效订单号处理
- [ ] 环境变量缺失处理


