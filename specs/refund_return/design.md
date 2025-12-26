# 退款退货功能技术设计文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              小程序前端                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ 订单详情页   │→ │ 退款申请页   │→ │ 退款详情页   │  │ 我的订单页   │ │
│  │ detail.js   │  │ apply.js     │  │ refund.js    │  │ orders.js    │ │
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
│  │refund_apply  │  │refund_detail │  │admin_refunds │  │wxpayFunctions│ │
│  │ (用户申请)   │  │ (查询详情)   │  │ (商家审核)   │  │ (退款接口)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                    │                           │         │
│                                    │                           ▼         │
│                           ┌────────────────────┐     ┌──────────────┐   │
│                           │wxpayRefundCallback │ ←── │ 微信支付V3   │   │
│                           │   (退款回调)       │     │ 退款通知     │   │
│                           └────────────────────┘     └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                            云数据库                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   refunds    │  │    orders    │  │   requests   │                   │
│  │  (退款记录)  │  │   (订单表)   │  │  (请求表)    │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                            管理后台 (React)                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      OrderList.tsx                                 │   │
│  │  新增：售后状态列 + 退款详情弹窗 + 审核操作                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                          cloudbase.callFunction                          │
│                                    ▼                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │admin_refunds │  │admin_refunds │  │admin_orders  │                   │
│  │   _list      │  │   _update    │  │   _update    │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 退款流程时序图

```
用户        小程序前端        refund_apply     wxpayFunctions    微信支付V3    wxpayRefundCallback   数据库
 │              │                 │                 │                │                │              │
 │ 1.点击申请   │                 │                 │                │                │              │
 │─────────────>│                 │                 │                │                │              │
 │              │ 2.选择类型/填写 │                 │                │                │              │
 │<─────────────│                 │                 │                │                │              │
 │ 3.提交申请   │                 │                 │                │                │              │
 │─────────────>│                 │                 │                │                │              │
 │              │ 4.创建退款记录   │                 │                │                │              │
 │              │────────────────>│                 │                │                │              │
 │              │                 │ 5.写入refunds   │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │ 6.更新订单状态   │                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │<────────────────│ 返回成功        │                │                │              │
 │<─────────────│ 跳转退款详情    │                 │                │                │              │
 │              │                 │                 │                │                │              │
 ═══════════════════════════════  商家审核同意  ═══════════════════════════════════════════════════
 │              │                 │                 │                │                │              │
 │              │                 │ 7.商家同意       │                │                │              │
 │              │                 │ (admin_refunds) │                │                │              │
 │              │                 │─────────────────>                │                │              │
 │              │                 │                 │ 8.调用退款API   │                │              │
 │              │                 │                 │────────────────>│                │              │
 │              │                 │                 │<────────────────│ 受理成功       │              │
 │              │                 │ 9.更新状态=退款中│                │                │              │
 │              │                 │─────────────────────────────────────────────────────────────────>│
 │              │                 │                 │                │                │              │
 │              │                 │                 │                │ 10.退款成功    │              │
 │              │                 │                 │                │───────────────>│              │
 │              │                 │                 │                │                │ 11.更新状态  │
 │              │                 │                 │                │                │─────────────>│
 │              │                 │                 │<───────────────────────────────│ 返回SUCCESS  │
 │              │                 │                 │                │                │              │
```

---

## 2. 技术选型

### 2.1 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| 微信小程序 | latest | 原生开发框架 |
| Vant Weapp | ^1.11.x | UI组件库（Steps、ActionSheet、Uploader） |
| WXSS | - | 样式（苹果风格） |

### 2.2 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| wx-server-sdk | latest | 云开发服务端SDK |
| Node.js | 18.x | 云函数运行时 |
| 微信支付V3 | - | 退款API（复用现有工具类） |

### 2.3 管理后台技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | 前端框架 |
| Ant Design | 5.x | UI组件库 |
| TypeScript | 5.x | 类型安全 |
| CloudBase JS SDK | latest | 调用云函数 |

---

## 3. 数据库设计

### 3.1 refunds 集合（退款记录）

```javascript
{
  _id: String,                    // 文档ID（自动生成）
  refundNo: String,               // 退款单号（唯一，格式：RF+时间戳+随机数）
  orderNo: String,                // 关联订单号
  userId: String,                 // 用户OpenID
  
  // 退款类型
  refundType: String,             // 'refund_only' | 'return_refund'
  refundTypeLabel: String,        // '仅退款' | '退货退款'
  
  // 退款金额
  refundAmount: Number,           // 退款金额（元）
  
  // 退款原因
  reason: String,                 // 退款原因（预设选项）
  reasonDetail: String,           // 详细说明（其他原因时填写）
  images: [String],               // 凭证图片（云存储fileID数组，最多9张）
  
  // 状态（中文）
  status: String,                 // '待审核' | '已同意' | '已拒绝' | '待寄回' | 
                                  // '待确认收货' | '退款中' | '已退款' | '退款失败' | '已取消'
  
  // 状态变更日志
  statusLogs: [{
    status: String,               // 状态值
    time: Date,                   // 变更时间
    operator: String,             // 操作人（'user' | 'admin' | 'system'）
    remark: String                // 备注
  }],
  
  // 商家处理
  rejectReason: String,           // 拒绝原因（商家拒绝时填写）
  approvedAt: Date,               // 审核通过时间
  
  // 退货信息（仅退货流程）
  returnConfirmedAt: Date,        // 商家确认收货时间
  
  // 微信退款信息
  wxRefundId: String,             // 微信退款单号
  wxRefundStatus: String,         // 微信退款状态
  refundedAt: Date,               // 退款成功时间
  
  // 重试机制
  retryCount: Number,             // 退款重试次数（默认0，最大3）
  lastRetryAt: Date,              // 最后重试时间
  failReason: String,             // 失败原因
  
  // 时间戳
  createdAt: Date,                // 创建时间
  updatedAt: Date                 // 更新时间
}
```

**索引设计：**
```javascript
// 按订单号查询
{ orderNo: 1 }

// 按用户查询
{ userId: 1, createdAt: -1 }

// 按状态查询（商家后台）
{ status: 1, createdAt: -1 }

// 退款单号唯一索引
{ refundNo: 1 }, { unique: true }
```

### 3.2 orders 集合扩展

新增字段：
```javascript
{
  // ... 现有字段 ...
  
  // 售后状态（新增）
  afterSaleStatus: String,        // '无售后' | '待售后' | '售后完成'
  
  // 扩展订单状态（中文）
  status: String,                 // 新增：'退款申请中' | '退款中' | '已退款'
}
```

### 3.3 状态映射表

**退款状态 → 订单售后状态映射：**

| 退款状态 | 订单售后状态 | 订单状态变化 |
|----------|-------------|-------------|
| 待审核 | 待售后 | 退款申请中 |
| 已同意 | 待售后 | 退款申请中 |
| 已拒绝 | 无售后 | 恢复为已支付 |
| 待寄回 | 待售后 | 退款申请中 |
| 待确认收货 | 待售后 | 退款申请中 |
| 退款中 | 待售后 | 退款中 |
| 已退款 | 售后完成 | 已退款 |
| 退款失败 | 待售后 | 退款中 |
| 已取消 | 无售后 | 恢复为已支付 |

---

## 4. 云函数设计

### 4.1 新增云函数列表

| 云函数名 | 功能 | 调用方 |
|----------|------|--------|
| `refund_apply` | 用户提交退款申请 | 小程序 |
| `refund_detail` | 查询退款详情 | 小程序 |
| `refund_cancel` | 用户取消退款申请 | 小程序 |
| `admin_refunds_list` | 退款列表查询 | 管理后台 |
| `admin_refunds_update` | 退款审核/确认收货 | 管理后台 |
| `wxpayRefundCallback` | 退款结果回调 | 微信支付 |

### 4.2 wxpayFunctions 扩展

在 `wxpayFunctions/index.js` 路由中新增：

```javascript
case 'wxpay_refund':
    return await refund.main(event, context);
case 'wxpay_refund_query':
    return await refundQuery.main(event, context);
```

### 4.3 接口设计

#### 4.3.1 refund_apply（用户申请退款）

**请求参数：**
```javascript
{
  orderNo: String,           // 订单号
  refundType: String,        // 'refund_only' | 'return_refund'
  reason: String,            // 退款原因
  reasonDetail: String,      // 详细说明（可选）
  images: [String]           // 凭证图片fileID数组（可选，最多9张）
}
```

**返回参数：**
```javascript
{
  success: true,
  data: {
    refundNo: String         // 退款单号
  }
}
```

#### 4.3.2 refund_detail（查询退款详情）

**请求参数：**
```javascript
{
  refundNo: String           // 退款单号
  // 或
  orderNo: String            // 订单号（查询最新一条）
}
```

**返回参数：**
```javascript
{
  success: true,
  data: {
    refundNo: String,
    orderNo: String,
    refundType: String,
    refundTypeLabel: String,
    refundAmount: Number,
    reason: String,
    reasonDetail: String,
    images: [String],
    status: String,
    statusLogs: [...],
    rejectReason: String,
    createdAt: Date,
    // 订单信息
    orderInfo: {
      items: [...],
      totalAmount: Number
    }
  }
}
```

#### 4.3.3 admin_refunds_update（商家审核）

**请求参数：**
```javascript
{
  refundNo: String,          // 退款单号
  action: String,            // 'approve' | 'reject' | 'confirm_return'
  rejectReason: String       // 拒绝原因（action=reject时必填）
}
```

**业务逻辑：**
- `approve`：同意退款
  - 仅退款：直接调用微信退款API
  - 退货：状态变更为「待寄回」
- `reject`：拒绝退款，记录拒绝原因
- `confirm_return`：确认收货，调用微信退款API

#### 4.3.4 wxpay_refund（调用微信退款API）

复用现有 `utils/wechatpay.js`，新增方法：

```javascript
/**
 * 申请退款
 * @param {Object} params
 * @param {string} params.outTradeNo - 原商户订单号
 * @param {string} params.outRefundNo - 商户退款单号
 * @param {number} params.refundAmount - 退款金额（分）
 * @param {number} params.totalAmount - 原订单金额（分）
 * @param {string} params.reason - 退款原因
 */
const createRefund = async ({ outTradeNo, outRefundNo, refundAmount, totalAmount, reason }) => {
  // 调用 /v3/refund/domestic/refunds
}

/**
 * 查询退款
 * @param {string} outRefundNo - 商户退款单号
 */
const queryRefund = async (outRefundNo) => {
  // 调用 /v3/refund/domestic/refunds/{out_refund_no}
}
```

---

## 5. 小程序页面设计

### 5.1 新增页面

| 页面路径 | 功能 | 组件依赖 |
|----------|------|----------|
| `pages/refund/apply/apply` | 退款申请页 | Uploader |
| `pages/refund/detail/detail` | 退款详情页 | Steps |

### 5.2 页面结构

#### 5.2.1 退款申请页 (apply)

```
┌─────────────────────────────────────┐
│ 申请退款                       返回  │  ← 导航栏
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 订单信息                         │ │  ← 订单卡片
│ │ 订单号：xxx                      │ │
│ │ 商品：xxx × 1                    │ │
│ │ 金额：¥99.00                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 退款类型                         │ │  ← 展示已选类型
│ │ ○ 仅退款 / ○ 退货退款            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 退款原因 *                       │ │  ← Picker选择
│ │ 请选择退款原因              ▼    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 详细说明                         │ │  ← 文本域（可选）
│ │ ┌─────────────────────────────┐ │ │
│ │ │                             │ │ │
│ │ └─────────────────────────────┘ │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 上传凭证（最多9张）               │ │  ← Vant Uploader
│ │ ┌────┐ ┌────┐ ┌────┐           │ │
│ │ │ +  │ │    │ │    │           │ │
│ │ └────┘ └────┘ └────┘           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │         提 交 申 请              │ │  ← 主按钮
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### 5.2.2 退款详情页 (detail)

```
┌─────────────────────────────────────┐
│ 退款详情                       返回  │  ← 导航栏
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ ●────────●────────○             │ │  ← Vant Steps
│ │ 商家处理   寄回商品   退款结束    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 当前状态                         │ │  ← 状态卡片
│ │ 待审核                           │ │
│ │ 您的退款申请已提交，请等待商家处理  │ │
│ │ 预计48小时内处理                  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 退款信息                         │ │
│ │ 退款单号：RF2025121900001        │ │
│ │ 退款类型：退货退款                │ │
│ │ 退款金额：¥99.00                 │ │
│ │ 退款原因：商品质量问题            │ │
│ │ 申请时间：2025-12-19 12:00       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 凭证图片                         │ │  ← 图片预览
│ │ ┌────┐ ┌────┐ ┌────┐           │ │
│ │ │    │ │    │ │    │           │ │
│ │ └────┘ └────┘ └────┘           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │         取 消 申 请              │ │  ← 待审核时显示
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 5.3 Vant Weapp 组件配置

在 `app.json` 中添加：

```json
{
  "usingComponents": {
    "van-steps": "@vant/weapp/steps/index",
    "van-action-sheet": "@vant/weapp/action-sheet/index",
    "van-uploader": "@vant/weapp/uploader/index",
    "van-picker": "@vant/weapp/picker/index",
    "van-popup": "@vant/weapp/popup/index"
  }
}
```

---

## 6. 管理后台改造

### 6.1 类型定义扩展

在 `src/types/index.ts` 新增：

```typescript
// 售后状态
export type AfterSaleStatus = '无售后' | '待售后' | '售后完成';

// 退款类型
export type RefundType = 'refund_only' | 'return_refund';

// 退款状态
export type RefundStatus = 
  | '待审核' | '已同意' | '已拒绝' 
  | '待寄回' | '待确认收货' 
  | '退款中' | '已退款' | '退款失败' | '已取消';

// 退款记录
export interface Refund {
  _id: string;
  refundNo: string;
  orderNo: string;
  userId: string;
  refundType: RefundType;
  refundTypeLabel: string;
  refundAmount: number;
  reason: string;
  reasonDetail?: string;
  images: string[];
  status: RefundStatus;
  statusLogs: StatusLog[];
  rejectReason?: string;
  wxRefundId?: string;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusLog {
  status: string;
  time: Date;
  operator: string;
  remark?: string;
}

// 扩展 Order 类型
export interface Order {
  // ... 现有字段
  afterSaleStatus?: AfterSaleStatus;
}
```

### 6.2 OrderList.tsx 改造

1. **新增「售后状态」列**
2. **新增售后状态筛选器**
3. **新增退款详情弹窗**
4. **新增审核操作按钮**

### 6.3 API 扩展

在 `src/services/api.ts` 新增：

```typescript
export const refundApi = {
  // 获取退款列表
  async list(params: { orderNo?: string; status?: RefundStatus }): Promise<PaginatedResponse<Refund>> {
    return callFunction('admin_refunds_list', params);
  },
  
  // 审核退款
  async review(refundNo: string, action: 'approve' | 'reject', rejectReason?: string): Promise<CloudResponse> {
    return callFunction('admin_refunds_update', { refundNo, action, rejectReason });
  },
  
  // 确认收货
  async confirmReturn(refundNo: string): Promise<CloudResponse> {
    return callFunction('admin_refunds_update', { refundNo, action: 'confirm_return' });
  }
};
```

---

## 7. 微信支付退款

### 7.1 退款 API 接口

**接口地址：** `POST /v3/refund/domestic/refunds`

**请求参数：**
```json
{
  "out_trade_no": "原商户订单号",
  "out_refund_no": "商户退款单号",
  "reason": "退款原因",
  "notify_url": "退款回调地址",
  "amount": {
    "refund": 100,
    "total": 100,
    "currency": "CNY"
  }
}
```

**回调通知格式：**
```json
{
  "id": "通知ID",
  "create_time": "2025-12-19T12:00:00+08:00",
  "event_type": "REFUND.SUCCESS",
  "resource": {
    "ciphertext": "加密数据",
    "nonce": "随机串",
    "associated_data": "refund"
  }
}
```

### 7.2 wxpayRefundCallback 云函数

复用现有 `wxpayOrderCallback` 的解密逻辑，处理退款回调：

```javascript
// 解密后的数据格式
{
  "mchid": "商户号",
  "out_trade_no": "原订单号",
  "transaction_id": "微信订单号",
  "out_refund_no": "商户退款单号",
  "refund_id": "微信退款单号",
  "refund_status": "SUCCESS",
  "success_time": "2025-12-19T12:00:00+08:00",
  "amount": {
    "total": 100,
    "refund": 100,
    "payer_total": 100,
    "payer_refund": 100
  }
}
```

---

## 8. 安全设计

### 8.1 权限控制

| 操作 | 小程序用户 | 管理员 |
|------|-----------|--------|
| 提交退款申请 | ✅ 仅限自己的订单 | ❌ |
| 查看退款详情 | ✅ 仅限自己的申请 | ✅ 全部 |
| 取消退款申请 | ✅ 仅待审核状态 | ❌ |
| 审核退款 | ❌ | ✅ |
| 确认收货 | ❌ | ✅ |

### 8.2 数据安全

1. **金额校验**：退款金额从数据库订单读取，不信任前端
2. **状态校验**：每次操作前验证当前状态是否允许
3. **幂等处理**：回调处理前检查退款是否已处理
4. **操作日志**：所有状态变更记录操作人和时间

### 8.3 防重复提交

1. 前端按钮点击后禁用
2. 云函数检查订单是否已有进行中的退款申请
3. 退款单号使用唯一索引

---

## 9. 错误处理

### 9.1 错误码定义

| 错误码 | 描述 | 处理方式 |
|--------|------|----------|
| -1 | 参数错误 | 提示用户检查输入 |
| -2 | 订单不存在 | 提示用户 |
| -3 | 订单状态不允许退款 | 提示当前状态 |
| -4 | 已有进行中的退款申请 | 跳转到退款详情 |
| -5 | 退款申请不存在 | 提示用户 |
| -6 | 当前状态不允许该操作 | 提示当前状态 |
| -7 | 微信退款失败 | 显示失败原因 |
| -99 | 系统异常 | 提示稍后重试 |

---

## 10. 文件结构

### 10.1 小程序新增文件

```
pages/
├── refund/
│   ├── apply/
│   │   ├── apply.wxml
│   │   ├── apply.wxss
│   │   ├── apply.js
│   │   └── apply.json
│   └── detail/
│       ├── detail.wxml
│       ├── detail.wxss
│       ├── detail.js
│       └── detail.json
```

### 10.2 云函数新增文件

```
cloudfunctions/
├── refund_apply/
│   ├── index.js
│   └── package.json
├── refund_detail/
│   ├── index.js
│   └── package.json
├── refund_cancel/
│   ├── index.js
│   └── package.json
├── admin_refunds_list/
│   ├── index.js
│   ├── admin_auth.js
│   └── package.json
├── admin_refunds_update/
│   ├── index.js
│   ├── admin_auth.js
│   └── package.json
├── wxpayRefundCallback/
│   ├── index.js
│   └── package.json
└── wxpayFunctions/
    └── utils/
        └── wechatpay.js    # 新增 createRefund、queryRefund 方法
```

### 10.3 管理后台修改文件

```
src/
├── types/
│   └── index.ts            # 新增 Refund 类型定义
├── services/
│   └── api.ts              # 新增 refundApi
└── pages/
    └── business/
        └── OrderList.tsx   # 改造：新增售后状态列和审核功能
```

---

## 版本信息

- 文档版本：v1.0
- 创建时间：2025-12-19
- 作者：AI Assistant

