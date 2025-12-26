# 押金缴纳功能技术设计文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              小程序前端                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  押金页面    │  │ 发布需求页   │  │ 方案订单列表  │  │ 订单详情页   │ │
│  │ deposit.js  │  │ publish.js   │  │ requests.js  │  │ progress.js  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│        │                  │                 │                │          │
│        └──────────────────┴─────────────────┴────────────────┘          │
│                                    │                                     │
│                       wx.cloud.callFunction                              │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                              云函数层                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │deposit_create│  │deposit_query │  │deposit_refund│  │wxpayFunctions│ │
│  │ (创建押金)   │  │ (查询状态)   │  │ (申请退款)   │  │ (支付接口)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                                    │               │          │
│         ▼                                    │               ▼          │
│  ┌────────────────────┐              ┌──────────────┐  ┌──────────────┐ │
│  │wxpayDepositCallback│ ←────────────│ 微信支付V3   │  │wxpayRefund   │ │
│  │   (押金支付回调)   │              │ 支付通知     │  │  Callback    │ │
│  └────────────────────┘              └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                            云数据库                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   deposits   │  │    users     │  │   requests   │  │    orders    │ │
│  │  (押金记录)  │  │ (用户信息)   │  │  (设计请求)  │  │  (商品订单)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                            管理后台 (React)                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      RequestList.tsx                              │   │
│  │  改造：优先级标签显示 "优先/普通"                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      DepositList.tsx (新增)                       │   │
│  │  押金管理页面：列表 + 筛选 + 手动退款                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                          cloudbase.callFunction                          │
│                                    ▼                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │admin_deposits│  │admin_deposits│  │admin_deposits│                   │
│  │    _list     │  │   _refund    │  │   _detail    │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 押金支付流程时序图

```
用户        小程序前端        deposit_create   wxpayFunctions    微信支付V3   wxpayDepositCallback   数据库
 │              │                 │                 │                │                │              │
 │ 1.点击缴纳   │                 │                 │                │                │              │
 │─────────────>│                 │                 │                │                │              │
 │              │ 2.检查登录状态   │                 │                │                │              │
 │              │─────────────────>                 │                │                │              │
 │              │                 │ 3.查询是否有押金 │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │ 4.无活跃押金     │                │                │              │
 │              │                 │<─────────────────────────────────────────────────────────────────│
 │              │                 │ 5.创建押金记录   │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │ 6.调用下单API    │                │                │              │
 │              │                 │────────────────>│                │                │              │
 │              │                 │                 │ 7.JSAPI下单    │                │              │
 │              │                 │                 │───────────────>│                │              │
 │              │                 │                 │<───────────────│ prepay_id     │              │
 │              │<────────────────│ 返回支付参数     │                │                │              │
 │              │                 │                 │                │                │              │
 │ 8.唤起支付   │                 │                 │                │                │              │
 │<─────────────│                 │                 │                │                │              │
 │ 9.确认支付   │                 │                 │                │                │              │
 │─────────────>│                 │                 │                │                │              │
 │              │                 │                 │                │ 10.支付成功    │              │
 │              │                 │                 │                │───────────────>│              │
 │              │                 │                 │                │                │ 11.更新押金  │
 │              │                 │                 │                │                │    status    │
 │              │                 │                 │                │                │─────────────>│
 │              │                 │                 │                │                │ 12.更新用户  │
 │              │                 │                 │                │                │ depositPaid  │
 │              │                 │                 │                │                │─────────────>│
 │<─────────────│ 支付成功，刷新   │                 │                │                │              │
 │              │                 │                 │                │                │              │
```

### 1.3 押金退款流程时序图

```
用户/管理员    前端/后台        deposit_refund   wxpayFunctions    微信支付V3   wxpayRefundCallback   数据库
 │              │                 │                 │                │                │              │
 │ 1.申请退款   │                 │                 │                │                │              │
 │─────────────>│                 │                 │                │                │              │
 │              │ 2.检查退款条件   │                 │                │                │              │
 │              │────────────────>│                 │                │                │              │
 │              │                 │ 3.查询进行中需求 │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │ 4.验证通过      │                │                │              │
 │              │                 │ 5.更新押金状态   │                │                │              │
 │              │                 │   =refunding    │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │ 6.调用退款API   │                │                │              │
 │              │                 │────────────────>│                │                │              │
 │              │                 │                 │ 7.申请退款     │                │              │
 │              │                 │                 │───────────────>│                │              │
 │              │                 │                 │<───────────────│ 受理成功       │              │
 │              │<────────────────│ 返回成功        │                │                │              │
 │<─────────────│ 显示退款中      │                 │                │                │              │
 │              │                 │                 │                │                │              │
 │              │                 │                 │                │ 8.退款成功     │              │
 │              │                 │                 │                │───────────────>│              │
 │              │                 │                 │                │                │ 9.更新押金   │
 │              │                 │                 │                │                │   =refunded  │
 │              │                 │                 │                │                │─────────────>│
 │              │                 │                 │                │                │ 10.更新用户  │
 │              │                 │                 │                │                │ depositPaid  │
 │              │                 │                 │                │                │   =false     │
 │              │                 │                 │                │                │─────────────>│
 │              │                 │                 │                │                │              │
```

---

## 2. 技术选型

| 层级 | 技术方案 | 说明 |
|------|----------|------|
| 小程序前端 | 微信小程序原生 | 复用现有页面，改造 deposit.js |
| 云函数 | Node.js + wx-server-sdk | 复用 wxpayFunctions 支付能力 |
| 数据库 | 云开发 MongoDB | 新增 deposits 集合 |
| 管理后台 | React + Ant Design | 新增 DepositList.tsx 页面 |
| 支付 | 微信支付V3 | 复用现有 wxpayFunctions |
| 退款 | 微信支付V3 | 复用现有 wxpay_refund |

---

## 3. 数据库设计

### 3.1 deposits 集合（新增）

```javascript
{
  "_id": "ObjectId",              // 文档ID
  "depositNo": "string",          // 押金单号（唯一），格式: DEP + 时间戳
  "userId": "string",             // 用户openid
  "userInfo": {                   // 用户信息快照
    "nickname": "string",
    "avatarUrl": "string",
    "phoneNumber": "string"
  },
  "amount": "number",             // 押金金额（元），如 0.01
  "amountFen": "number",          // 押金金额（分），如 1
  "status": "string",             // 状态：pending/paid/refunding/refunded
  "transactionId": "string",      // 微信支付订单号（支付成功后）
  "prepayId": "string",           // 预付单ID
  "paidAt": "Date",               // 支付成功时间
  
  // 退款信息
  "refundNo": "string",           // 退款单号（退款时生成）
  "refundId": "string",           // 微信退款单号
  "refundReason": "string",       // 退款原因
  "refundOperator": "string",     // 退款操作人：user/admin/system
  "refundedAt": "Date",           // 退款成功时间
  
  // 状态日志
  "statusLogs": [{
    "status": "string",           // 状态
    "time": "Date",               // 时间
    "operator": "string",         // 操作人：user/admin/system
    "remark": "string"            // 备注
  }],
  
  "createdAt": "Date",            // 创建时间
  "updatedAt": "Date"             // 更新时间
}
```

**索引设计：**
- `userId` - 单字段索引，查询用户押金
- `status` - 单字段索引，筛选状态
- `depositNo` - 唯一索引
- `createdAt` - 单字段索引，按时间排序

**押金状态枚举：**
| 状态 | 说明 |
|------|------|
| pending | 待支付 |
| paid | 已支付 |
| refunding | 退款中 |
| refunded | 已退款 |

### 3.2 users 集合扩展

在现有 users 集合中新增字段：

```javascript
{
  // ... 现有字段
  "depositPaid": "boolean",       // 是否已缴纳押金（用于快速判断优先服务）
  "depositId": "string"           // 当前活跃押金记录ID
}
```

### 3.3 requests 集合（现有字段确认）

确认已有 `priority` 字段：
```javascript
{
  // ... 现有字段
  "priority": "boolean"           // 是否优先（true=优先，false=普通）
}
```

---

## 4. 云函数设计

### 4.1 deposit_create（新增）

**功能**：创建押金订单并发起支付

**入参**：
```javascript
{
  // 无需参数，从 wxContext 获取用户信息
}
```

**出参**：
```javascript
{
  "code": 0,                      // 0成功，其他失败
  "message": "string",
  "data": {
    "depositNo": "string",        // 押金单号
    "timeStamp": "string",        // 支付时间戳
    "nonceStr": "string",         // 随机字符串
    "packageVal": "string",       // 订单详情扩展字符串
    "signType": "string",         // 签名方式
    "paySign": "string"           // 签名
  }
}
```

**核心逻辑**：
1. 获取用户 openid
2. 查询用户是否有活跃押金（status=paid）
3. 若有，返回错误"已缴纳押金"
4. 创建 deposits 记录（status=pending）
5. 调用 wxpayFunctions 下单
6. 返回支付参数

### 4.2 deposit_query（新增）

**功能**：查询用户押金状态

**入参**：
```javascript
{
  // 无需参数，从 wxContext 获取用户
}
```

**出参**：
```javascript
{
  "code": 0,
  "message": "string",
  "data": {
    "hasPaid": "boolean",         // 是否已缴纳
    "deposit": {                  // 押金详情（若有）
      "depositNo": "string",
      "amount": "number",
      "status": "string",
      "paidAt": "Date"
    }
  }
}
```

### 4.3 deposit_refund（新增）

**功能**：用户/管理员申请押金退款

**入参**：
```javascript
{
  "depositNo": "string",          // 押金单号（管理员用）
  "reason": "string",             // 退款原因
  "isAdmin": "boolean"            // 是否管理员操作
}
```

**出参**：
```javascript
{
  "code": 0,
  "message": "string",
  "data": {
    "refundNo": "string"          // 退款单号
  }
}
```

**核心逻辑**：
1. 验证押金记录存在且状态为 paid
2. 若非管理员，检查用户是否有进行中的需求
3. 生成退款单号
4. 更新押金状态为 refunding
5. 调用 wxpay_refund 发起退款
6. 记录状态日志

### 4.4 admin_deposits_list（新增）

**功能**：管理后台查询押金列表

**入参**：
```javascript
{
  "limit": 10,
  "offset": 0,
  "status": "string",             // 筛选状态
  "keyword": "string"             // 搜索关键词
}
```

**出参**：
```javascript
{
  "code": 0,
  "data": [{
    // deposit 记录
  }],
  "total": "number"
}
```

### 4.5 wxpayDepositCallback（复用/扩展）

**方案**：复用现有 `wxpayOrderCallback`，通过 `attach` 字段区分押金订单

在下单时传入 `attach: JSON.stringify({ type: 'deposit', depositId: xxx })`，回调时根据 type 分发处理。

**押金支付成功处理逻辑**：
1. 更新 deposits 表：status=paid, transactionId, paidAt
2. 更新 users 表：depositPaid=true, depositId
3. 记录状态日志

---

## 5. 小程序前端改造

### 5.1 押金页面改造 (deposit.js)

**改造点**：

1. **onLoad**：调用 deposit_query 查询真实押金状态
2. **onPayDeposit**：调用 deposit_create 获取支付参数，调用 wx.requestPayment
3. **onRefundDeposit**：调用 deposit_refund 申请退款
4. **状态展示**：根据 status 显示不同 UI

**代码结构**：

```javascript
Page({
  data: {
    amount: 0.01,
    status: 'unknown',  // unknown/unpaid/paid/refunding/refunded
    deposit: null,
    loading: true
  },

  async onLoad() {
    await this.fetchDepositStatus();
  },

  async fetchDepositStatus() {
    // 调用 deposit_query 云函数
  },

  async onPayDeposit() {
    // 1. 调用 deposit_create 获取支付参数
    // 2. 调用 wx.requestPayment
    // 3. 支付成功后刷新状态
  },

  async onRefundDeposit() {
    // 1. 二次确认
    // 2. 调用 deposit_refund
    // 3. 刷新状态
  }
});
```

### 5.2 发布需求页改造 (publish.js)

**现有逻辑**：已有 `priority: depositPaid` 字段

**改造点**：改为从云端查询用户的 depositPaid 状态，而非本地存储

```javascript
// 改造前
const depositPaid = !!wx.getStorageSync('deposit_paid');

// 改造后
const userDoc = wx.getStorageSync('userDoc') || {};
const depositPaid = userDoc.depositPaid === true;
```

### 5.3 方案订单列表改造 (requests.js)

**改造点**：在订单卡片上显示"优先"标签

```html
<!-- 在卡片标题区域添加 -->
<view wx:if="{{item.priority}}" class="priority-tag">优先</view>
```

```css
.priority-tag {
  display: inline-block;
  padding: 2rpx 12rpx;
  background: #F97316;
  color: #fff;
  font-size: 20rpx;
  border-radius: 4rpx;
  margin-left: 8rpx;
}
```

### 5.4 订单详情页改造 (progress.js)

**改造点**：在详情头部显示"优先"标签

---

## 6. 管理后台改造

### 6.1 RequestList.tsx 改造

**改造点**：优先级列显示"优先/普通"标签

```tsx
// 修改优先级列
{
  title: '优先级',
  dataIndex: 'priority',
  key: 'priority',
  width: 80,
  render: (priority) => (
    <Tag color={priority ? 'orange' : 'default'}>
      {priority ? '优先' : '普通'}
    </Tag>
  ),
}
```

### 6.2 DepositList.tsx（新增）

**页面结构**：

1. **统计卡片**：全部押金、已支付、退款中、已退款
2. **筛选栏**：状态筛选、关键词搜索
3. **数据表格**：
   - 押金单号
   - 用户信息（头像、昵称、手机）
   - 金额
   - 状态（标签）
   - 支付时间
   - 操作（详情、退款）
4. **详情弹窗**：押金信息 + 状态日志
5. **退款弹窗**：填写退款原因、确认

**核心接口调用**：
- 列表：`admin_deposits_list`
- 退款：`deposit_refund` (isAdmin=true)

### 6.3 路由配置

在 `App.tsx` 中添加押金管理路由：

```tsx
{ path: '/business/deposits', element: <DepositList /> }
```

在侧边栏菜单中添加入口。

---

## 7. 配置常量

### 7.1 押金金额配置

```javascript
// cloudfunctions/deposit_create/config.js
module.exports = {
  DEPOSIT_AMOUNT: 0.01,           // 押金金额（元），测试环境
  // DEPOSIT_AMOUNT: 100,         // 正式环境
  DEPOSIT_DESCRIPTION: '光乙共创平台-押金'
};
```

---

## 8. 安全设计

1. **金额安全**：押金金额从云函数配置读取，不信任前端传参
2. **身份验证**：所有云函数通过 wxContext 获取用户身份
3. **幂等性**：支付回调和退款回调需保证幂等
4. **权限控制**：管理员操作需验证管理员身份
5. **日志审计**：所有状态变更记录 statusLogs

---

## 9. 错误处理

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| -1 | 参数错误 | 提示用户检查输入 |
| -2 | 用户已有活跃押金 | 提示"您已缴纳押金" |
| -3 | 押金记录不存在 | 提示"押金记录不存在" |
| -4 | 有进行中的需求 | 提示"订单完成后自动退回" |
| -5 | 支付下单失败 | 提示"支付失败，请重试" |
| -6 | 退款申请失败 | 提示"退款失败，请联系客服" |
| -99 | 系统异常 | 提示"系统繁忙，请稍后重试" |

---

## 10. 测试要点

### 10.1 功能测试
- [ ] 首次缴纳押金成功
- [ ] 重复缴纳押金被拦截
- [ ] 支付取消后可重新支付
- [ ] 支付成功后状态更新
- [ ] 发布需求自动标记优先
- [ ] 用户手动退款（无进行中需求）
- [ ] 用户手动退款（有进行中需求被拦截）
- [ ] 管理员手动退款
- [ ] 退款成功后状态更新

### 10.2 边界测试
- [ ] 并发支付（防止创建多笔押金）
- [ ] 网络异常重试
- [ ] 回调重复调用（幂等性）

### 10.3 UI 测试
- [ ] 小程序押金页面各状态显示
- [ ] 方案订单"优先"标签显示
- [ ] 后台请求列表"优先/普通"显示
- [ ] 后台押金管理页面功能

---

## 11. 部署清单

### 11.1 云函数部署
1. `deposit_create` - 新增
2. `deposit_query` - 新增
3. `deposit_refund` - 新增
4. `admin_deposits_list` - 新增
5. `wxpayOrderCallback` - 扩展（支持押金回调）
6. `wxpayRefundCallback` - 扩展（支持押金退款回调）

### 11.2 数据库
1. 创建 `deposits` 集合
2. 创建索引
3. 扩展 `users` 集合字段

### 11.3 小程序
1. 更新 `pages/profile/deposit/deposit.js`
2. 更新 `pages/profile/deposit/deposit.wxml`
3. 更新 `pages/flows/publish/publish.js`
4. 更新 `pages/profile/requests/requests.wxml`

### 11.4 管理后台
1. 新增 `DepositList.tsx`
2. 更新 `RequestList.tsx`
3. 更新路由和菜单

