# 微信支付功能技术设计文档

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
│  │  (路由器)     │    │  Callback    │    │  Check       │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
│         │                   ▲                    │                   │
│         │ 调用云模板        │ 微信回调           │ 定时触发          │
│         ▼                   │                    ▼                   │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ cloud.callFunction('cloudbase_module')
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      微信支付云模板 (cloudbase_module)                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │ wxpay_order  │    │ wxpay_query  │    │ wxpay_refund │           │
│  │ (下单接口)    │    │ (查询接口)    │    │ (退款接口)   │           │
│  └──────────────┘    └──────────────┘    └──────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ 调用微信支付 API
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         微信支付平台                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 支付流程时序图

```
用户        小程序前端       wxpayFunctions    云模板          微信支付      数据库
 │              │                 │              │              │           │
 │ 1.点击支付    │                 │              │              │           │
 │─────────────>│                 │              │              │           │
 │              │ 2.创建订单       │              │              │           │
 │              │────────────────────────────────────────────────────────>│
 │              │                 │              │              │     存储  │
 │              │ 3.调用下单       │              │              │           │
 │              │────────────────>│              │              │           │
 │              │                 │ 4.调用云模板  │              │           │
 │              │                 │─────────────>│              │           │
 │              │                 │              │ 5.统一下单    │           │
 │              │                 │              │─────────────>│           │
 │              │                 │              │<─────────────│           │
 │              │                 │<─────────────│ prepay_id    │           │
 │              │<────────────────│ 支付参数      │              │           │
 │              │                 │              │              │           │
 │              │ 6.唤起支付       │              │              │           │
 │<─────────────│ wx.requestPayment               │              │           │
 │              │                 │              │              │           │
 │ 7.输入密码    │                 │              │              │           │
 │─────────────────────────────────────────────────────────────>│           │
 │<─────────────────────────────────────────────────────────────│ 支付结果  │
 │              │                 │              │              │           │
 │              │                 │              │ 8.支付回调    │           │
 │              │                 │              │<─────────────│           │
 │              │                 │ 9.回调处理    │              │           │
 │              │                 │<─────────────│              │           │
 │              │                 │ 10.更新订单   │              │           │
 │              │                 │────────────────────────────────────────>│
 │              │                 │              │              │     更新  │
 │              │ 11.跳转结果页   │              │              │           │
 │              │<────────────────│              │              │           │
 │<─────────────│ 显示成功        │              │              │           │
 │              │                 │              │              │           │
```

## 2. 数据模型设计

### 2.1 订单数据结构 (orders 集合)

```javascript
{
  _id: String,              // 云数据库自动生成
  orderNo: String,          // 商户订单号 (out_trade_no)
  type: 'goods',            // 订单类型
  category: 'mall',         // 订单分类
  userId: String,           // 用户ID
  
  // 订单参数
  params: {
    items: [{               // 商品列表
      id: String,           // 商品ID
      name: String,         // 商品名称
      specs: Object,        // 规格信息
      quantity: Number,     // 数量
      amount: Number        // 单价
    }],
    totalAmount: Number,    // 订单总金额 (元)
    address: Object,        // 收货地址
    addressText: String,    // 地址文本
    note: String            // 备注
  },
  
  // 支付相关
  status: String,           // 订单状态: pending_payment | paid | closed | cancelled
  paid: Boolean,            // 是否已支付
  paidAt: Date,             // 支付时间
  transactionId: String,    // 微信支付订单号
  paymentParams: Object,    // 支付参数 (用于重新支付)
  
  // 时间戳
  createdAt: Date,          // 创建时间
  updatedAt: Date,          // 更新时间
  expireAt: Date,           // 过期时间 (创建时间 + 30分钟)
  
  // 标记
  isDelete: Number          // 删除标记: 0=正常, 1=已删除
}
```

### 2.2 订单状态流转

```
                    ┌──────────────┐
                    │   创建订单    │
                    │ (前端提交)    │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
            ┌──────│pending_payment│──────┐
            │      │   待支付      │      │
            │      └──────────────┘      │
            │             │               │
     超时30分钟           │ 支付成功       │ 用户取消
            │             │               │
            ▼             ▼               ▼
     ┌──────────┐  ┌──────────┐   ┌──────────┐
     │  closed  │  │   paid   │   │ 保持待支付│
     │  已关闭   │  │  已支付   │   │ 可重新支付│
     └──────────┘  └──────────┘   └──────────┘
```

## 3. 接口设计

### 3.1 下单接口 (wxpayFunctions - wxpay_order)

**请求参数**:
```javascript
{
  type: 'wxpay_order',
  orderNo: String,        // 商户订单号
  totalAmount: Number,    // 订单金额 (元)
  description: String,    // 商品描述
  attach: String          // 附加数据 (可选)
}
```

**返回参数**:
```javascript
{
  code: Number,           // 0=成功, 其他=失败
  message: String,        // 错误信息
  data: {
    timeStamp: String,    // 时间戳
    nonceStr: String,     // 随机字符串
    packageVal: String,   // prepay_id
    signType: String,     // 签名类型
    paySign: String       // 签名
  }
}
```

### 3.2 支付回调接口 (wxpayOrderCallback)

**微信回调参数**:
```javascript
{
  event_type: 'TRANSACTION.SUCCESS',  // 事件类型
  resource: {
    out_trade_no: String,             // 商户订单号
    transaction_id: String,           // 微信支付订单号
    trade_state: String,              // 交易状态
    success_time: String,             // 支付成功时间
    amount: {
      total: Number,                  // 订单金额 (分)
      payer_total: Number             // 用户支付金额 (分)
    },
    payer: {
      openid: String                  // 支付者 OpenID
    }
  }
}
```

### 3.3 查询订单接口 (wxpayFunctions - wxpay_query_order_by_out_trade_no)

**请求参数**:
```javascript
{
  type: 'wxpay_query_order_by_out_trade_no',
  orderNo: String         // 商户订单号
}
```

## 4. 云函数设计

### 4.1 wxpay_order/index.js (修改)

```javascript
/**
 * 微信支付 - 下单
 * 接收前端传入的订单信息，调用云模板创建预付单
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { orderNo, totalAmount, description, attach } = event;

  // 1. 参数验证
  if (!orderNo || !totalAmount) {
    return { code: -1, message: '缺少必要参数' };
  }

  // 2. 验证订单是否存在
  const orderResult = await db.collection('orders')
    .where({ orderNo, userId: wxContext.OPENID })
    .get();
  
  if (orderResult.data.length === 0) {
    return { code: -2, message: '订单不存在' };
  }

  // 3. 调用云模板下单
  const res = await cloud.callFunction({
    name: 'cloudbase_module',
    data: {
      name: 'wxpay_order',
      data: {
        description: description || '光乙共创平台-商品订单',
        amount: {
          total: Math.round(totalAmount * 100), // 转换为分
          currency: 'CNY',
        },
        out_trade_no: orderNo,
        payer: { openid: wxContext.OPENID },
        attach: attach || ''
      },
    },
  });

  return res.result;
};
```

### 4.2 wxpayOrderCallback/index.js (新增)

```javascript
/**
 * 微信支付回调处理
 * 接收微信支付通知，更新订单状态、商品销量、发送通知
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  console.log('收到微信支付回调:', JSON.stringify(event));
  
  const { event_type, resource } = event;
  
  if (event_type === 'TRANSACTION.SUCCESS') {
    const { out_trade_no, transaction_id, success_time, amount, payer } = resource;
    
    try {
      // 1. 更新订单状态
      const orderResult = await db.collection('orders')
        .where({ orderNo: out_trade_no })
        .update({
          data: {
            status: 'paid',
            paid: true,
            paidAt: new Date(success_time),
            transactionId: transaction_id,
            updatedAt: db.serverDate()
          }
        });
      
      // 2. 同步更新 requests 表
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
      
      // 3. 获取订单详情，更新商品销量
      const orderDoc = await db.collection('orders')
        .where({ orderNo: out_trade_no })
        .get();
      
      if (orderDoc.data.length > 0) {
        const order = orderDoc.data[0];
        await updateProductSales(order.params.items);
        
        // 4. 发送订阅消息通知
        await sendPaymentSuccessNotice(payer.openid, order);
      }
      
      console.log('订单支付状态已更新:', out_trade_no);
      return { code: 0, message: 'success' };
      
    } catch (err) {
      console.error('处理支付回调失败:', err);
      return { code: -1, message: err.message };
    }
  }
  
  return { code: 0, message: 'ignored' };
};

// 更新商品销量
async function updateProductSales(items) {
  if (!items || !Array.isArray(items)) return;
  
  for (const item of items) {
    try {
      await db.collection('products').doc(item.id).update({
        data: {
          sales: db.command.inc(item.quantity),
          updatedAt: db.serverDate()
        }
      });
    } catch (err) {
      console.warn('更新商品销量失败:', item.id, err);
    }
  }
}

// 发送支付成功订阅消息
async function sendPaymentSuccessNotice(openid, order) {
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: '<订阅消息模板ID>', // 需要在小程序后台配置
      page: `/pages/profile/orders/orders`,
      data: {
        thing1: { value: order.params.items[0]?.name || '商品订单' },
        amount2: { value: `${order.params.totalAmount}元` },
        time3: { value: new Date().toLocaleString('zh-CN') }
      }
    });
  } catch (err) {
    console.warn('发送订阅消息失败:', err);
  }
}
```

### 4.3 orderTimeoutCheck/index.js (新增)

```javascript
/**
 * 订单超时检查
 * 通过定时触发器，每分钟检查并关闭超时未支付的订单
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30分钟
  const expireTime = new Date(now.getTime() - timeout);
  
  try {
    // 查找超时未支付的订单
    const result = await db.collection('orders')
      .where({
        status: 'pending_payment',
        paid: false,
        createdAt: _.lt(expireTime)
      })
      .get();
    
    console.log(`找到 ${result.data.length} 个超时订单`);
    
    // 批量关闭订单
    for (const order of result.data) {
      await db.collection('orders').doc(order._id).update({
        data: {
          status: 'closed',
          updatedAt: db.serverDate()
        }
      });
      
      // 同步更新 requests
      await db.collection('requests')
        .where({ orderNo: order.orderNo })
        .update({
          data: {
            status: 'closed',
            updatedAt: db.serverDate()
          }
        });
      
      console.log('已关闭订单:', order.orderNo);
    }
    
    return {
      success: true,
      closedCount: result.data.length
    };
    
  } catch (err) {
    console.error('订单超时检查失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
```

## 5. 前端改造设计

### 5.1 订单确认页 (confirm.js)

**主要改动**:
1. `onSubmit` 方法改为异步调用真实支付
2. 订单状态改为 `pending_payment`
3. 添加支付失败处理逻辑

### 5.2 订单结果页 (result.js)

**主要改动**:
1. 添加订单状态查询逻辑
2. 支持重新支付功能

### 5.3 订单列表页 (orders.js)

**主要改动**:
1. 添加"去支付"按钮
2. 显示订单过期倒计时

## 6. 错误处理设计

### 6.1 错误码定义

| 错误码 | 描述 | 处理方式 |
|--------|------|----------|
| 0 | 成功 | - |
| -1 | 参数错误 | 提示用户检查订单信息 |
| -2 | 订单不存在 | 提示用户重新下单 |
| -3 | 订单已支付 | 跳转到订单详情 |
| -4 | 订单已关闭 | 提示用户重新下单 |
| -5 | 支付创建失败 | 提示用户稍后重试 |
| FAIL | 微信支付失败 | 显示具体错误信息 |

### 6.2 重试策略

- 支付回调处理失败：云模板自动重试
- 前端调用失败：提示用户重试，最多 3 次

## 7. 测试要点

### 7.1 功能测试
- 正常支付流程
- 取消支付流程
- 重新支付流程
- 订单超时关闭

### 7.2 边界测试
- 最小金额支付 (0.01 元)
- 网络断开重连
- 重复支付请求

### 7.3 安全测试
- 金额篡改验证
- 订单号重复验证
- 回调签名验证

## 8. 部署注意事项

1. **云函数部署顺序**:
   - 先部署 `wxpayOrderCallback`
   - 在云模板配置中设置回调函数名
   - 部署 `wxpayFunctions`
   - 部署 `orderTimeoutCheck` 并配置定时触发器

2. **定时触发器配置**:
   - 函数名: `orderTimeoutCheck`
   - 触发周期: 每分钟 (`0 * * * * * *`)

3. **订阅消息模板**:
   - 需要在小程序后台申请支付成功通知模板
   - 记录模板ID并更新到回调云函数中

