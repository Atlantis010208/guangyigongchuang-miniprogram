# 微信支付V3 API重构需求文档

## 介绍

本需求是对现有微信支付功能的重构，将原有的 `cloudPay.unifiedOrder`（服务商模式）替换为**微信支付V3 API**（直连商户模式），解决"受理关系不存在"的问题，使商户号 `1734489422` 可以直接进行收款。

## 背景

### 当前问题
- 原方案使用 `cloud.cloudPay.unifiedOrder` API，强制使用服务商模式
- 商户号 `1734489422` 是直连商户，无法作为子商户绑定到云开发服务商
- 导致错误：`errCodeDes: '受理关系不存在'`

### 解决方案
- 参考 `wx-pay-v2` 模板，使用微信支付V3 API 直接调用
- 支持直连商户模式，无需绑定服务商

## 配置信息

| 配置项 | 值 | 说明 |
|--------|-----|------|
| AppID | wxe8b6b3aed51577e0 | 小程序AppID |
| 商户号 | 1734489422 | 直连商户号 |
| 云环境ID | cloud1-5gb9c5u2c58ad6d7 | 云开发环境 |
| API版本 | V3 | 微信支付API版本 |
| 签名方式 | RSA | 使用商户私钥签名 |

---

## 需求

### 需求 1 - 微信支付V3下单

**用户故事：** 作为用户，我希望在订单确认页点击"提交订单"后，系统能够调用微信支付V3 API创建预付单并唤起微信支付，以便我完成商品购买。

#### 验收标准

1. When 用户在订单确认页点击"提交订单"按钮时，the 系统 shall 调用云函数 `wxpayFunctions` 发起微信支付V3 JSAPI下单请求。

2. When 云函数收到下单请求时，the 云函数 shall 使用商户私钥对请求进行RSA签名，并调用微信支付V3统一下单接口。

3. When 微信支付V3接口返回成功（prepay_id有效）时，the 云函数 shall 返回用于唤起支付的参数（timeStamp、nonceStr、package、signType、paySign）。

4. When 前端收到支付参数时，the 小程序 shall 调用 `wx.requestPayment` 唤起微信支付组件。

5. When 微信支付V3接口返回失败时，the 云函数 shall 返回详细的错误信息（错误码和错误描述）。

---

### 需求 2 - 支付回调处理

**用户故事：** 作为系统，我需要接收微信支付的异步通知，以便及时更新订单状态和处理后续业务逻辑。

#### 回调参数说明

云开发已自动处理V3回调的解密，云函数 `wxpayOrderCallback` 直接接收解密后的参数：

```javascript
{
  "id": "EV-2018022511223320873",           // 回调通知的唯一编号
  "create_time": "2015-05-20T13:29:35+08:00", // 回调通知创建时间
  "resource_type": "encrypt-resource",       // 资源数据类型
  "event_type": "TRANSACTION.SUCCESS",       // 通知类型，支付成功为此值
  "summary": "支付成功",                      // 摘要备注
  "resource": {
    "out_trade_no": "8206022981401",         // 商户订单号
    "transaction_id": "4200002...5762",      // 微信支付订单号
    "trade_state": "SUCCESS",                // 交易状态
    "success_time": "2025-03-21T17:27:37+08:00", // 支付成功时间
    "amount": { "total": 1, "payer_total": 1 },  // 金额（分）
    "payer": { "openid": "ou...3zM" }        // 支付者信息
  }
}
```

#### 验收标准

1. When 用户完成支付后，the 微信支付服务器 shall 向云函数 `wxpayOrderCallback` 发送支付通知（云开发自动路由）。

2. When 云函数收到支付通知时，the 云函数 shall 通过 `event.event_type === "TRANSACTION.SUCCESS"` 判断支付是否成功。

3. When 支付状态为成功时，the 云函数 shall 从 `event.resource.out_trade_no` 获取商户订单号，并将订单状态更新为 `paid`（已支付）。

4. When 订单状态更新成功后，the 云函数 shall 同步更新 `requests` 集合中对应记录的状态。

5. When 订单状态更新成功后，the 云函数 shall 更新对应商品的销量（sales字段）。

6. When 回调处理完成后，the 云函数 shall 返回 `event` 对象表示处理成功。

---

### 需求 3 - 支付结果查询

**用户故事：** 作为用户，我希望在支付完成后能够查询订单的支付状态，以便确认支付是否成功。

#### 验收标准

1. When 前端需要查询订单支付状态时，the 系统 shall 支持通过商户订单号调用微信支付V3查询接口。

2. When 查询返回支付成功时，the 系统 shall 同步更新本地订单状态（如果尚未更新）。

3. When 查询返回未支付或已关闭时，the 系统 shall 返回对应的状态信息。

---

### 需求 4 - 支付取消处理

**用户故事：** 作为用户，我希望在取消支付后订单能够保留，以便我稍后可以重新支付。

#### 验收标准

1. When 用户在支付界面取消支付时，the 订单 shall 保持 `pending_payment`（待支付）状态。

2. When 用户从订单列表选择待支付订单时，the 系统 shall 允许重新发起支付流程。

3. While 订单处于待支付状态且未超过30分钟，when 用户请求重新支付时，the 系统 shall 使用原订单号重新创建预付单。

---

### 需求 5 - 订单超时关闭

**用户故事：** 作为系统，我需要自动关闭超时未支付的订单，以便释放库存和保持数据整洁。

#### 验收标准

1. When 订单创建超过30分钟仍未支付时，the 系统 shall 自动将订单状态更新为 `closed`（已关闭）。

2. When 订单状态变为已关闭后，the 系统 shall 拒绝该订单的任何支付请求。

3. When 订单关闭时，the 系统 shall 同步更新 `requests` 集合中对应记录的状态。

---

### 需求 6 - 安全性要求

**用户故事：** 作为系统，我需要确保支付流程的安全性，防止金额篡改和重复支付等安全问题。

#### 验收标准

1. When 云函数收到下单请求时，the 云函数 shall 从数据库读取订单金额，不信任前端传入的金额参数。

2. When 云函数调用微信支付API时，the 云函数 shall 使用商户私钥对请求进行RSA签名。

3. When 云函数收到支付回调时，the 云函数 shall 使用APIv3密钥验证通知的签名。

4. When 收到重复的支付回调时，the 云函数 shall 保证幂等性，不重复更新订单状态。

5. The 商户私钥和APIv3密钥 shall 存储在云函数的环境变量中，不硬编码在代码里。

---

## 非功能需求

### NFR-001 性能要求
- 预付单创建响应时间应小于 3 秒
- 支付回调处理响应时间应小于 1 秒

### NFR-002 可靠性要求
- 支付回调处理失败时，应支持微信的重试机制
- 支付流程应支持断线重连和状态恢复

### NFR-003 安全性要求
- 商户私钥和密钥应安全存储
- 所有敏感操作应有日志记录

---

## 影响范围

### 需要修改的文件
- `cloudfunctions/wxpayFunctions/wxpay_order/index.js` - 重写为V3 API调用
- `cloudfunctions/wxpayFunctions/wxpay_query_order_by_out_trade_no/index.js` - 重写查询接口
- `cloudfunctions/wxpayOrderCallback/index.js` - 修改回调处理逻辑

### 需要新增的文件
- `cloudfunctions/wxpayFunctions/utils/wechatpay.js` - 微信支付V3工具类
- `cloudfunctions/wxpayFunctions/config/index.js` - 配置管理

### 需要配置的云开发功能
- 云函数 HTTP 触发：为 `wxpayOrderCallback` 配置公网可访问的URL

---

## 排除范围

本次开发**不包含**以下功能：
- 退款功能（后续迭代实现）
- 多商户支持
- 分账功能
- 代金券/优惠券支付

---

## 术语定义

| 术语 | 定义 |
|------|------|
| V3 API | 微信支付V3版本API，使用JSON格式和RSA签名 |
| 直连商户 | 直接与微信支付签约的商户，拥有独立商户号 |
| prepay_id | 预支付交易会话标识，用于唤起支付组件 |
| RSA签名 | 使用商户私钥进行的非对称加密签名 |
| APIv3密钥 | 用于解密支付通知的32位密钥 |


