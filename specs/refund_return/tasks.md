# 退款退货功能 - 任务拆分

## 任务概览

| 阶段 | 任务数 | 预估时间 |
|------|--------|----------|
| T1. 基础设施 | 3 | 15分钟 |
| T2. 数据库设计 | 2 | 10分钟 |
| T3. 云函数开发 | 8 | 60分钟 |
| T4. 小程序页面 | 4 | 45分钟 |
| T5. 管理后台改造 | 3 | 30分钟 |
| T6. 测试与部署 | 2 | 15分钟 |
| **总计** | **22** | **约3小时** |

---

## T1. 基础设施（依赖：无）

### T1.1 安装 Vant Weapp 组件库
- **描述**：安装并配置 Vant Weapp，引入 Steps、ActionSheet、Uploader 组件
- **文件**：`package.json`、`app.json`、`miniprogram_npm/`
- **预估**：5分钟

### T1.2 创建小程序页面目录结构
- **描述**：创建 `pages/refund/apply/` 和 `pages/refund/detail/` 目录及基础文件
- **文件**：新建页面目录
- **预估**：5分钟

### T1.3 更新小程序路由配置
- **描述**：在 `app.json` 中注册新页面路由
- **文件**：`app.json`
- **预估**：5分钟

---

## T2. 数据库设计（依赖：无）

### T2.1 创建 refunds 集合
- **描述**：在云数据库创建 refunds 集合，设置索引
- **操作**：使用 MCP 工具创建集合
- **预估**：5分钟

### T2.2 扩展 orders 集合字段
- **描述**：为 orders 集合的文档添加 afterSaleStatus 字段支持
- **说明**：无需修改现有文档结构，在代码中处理默认值
- **预估**：5分钟

---

## T3. 云函数开发（依赖：T2）

### T3.1 wxpayFunctions 扩展 - 退款 API
- **描述**：在 `utils/wechatpay.js` 新增 `createRefund`、`queryRefund` 方法
- **文件**：
  - `cloudfunctions/wxpayFunctions/utils/wechatpay.js`
  - `cloudfunctions/wxpayFunctions/wxpay_refund/index.js`
  - `cloudfunctions/wxpayFunctions/wxpay_refund_query/index.js`
  - `cloudfunctions/wxpayFunctions/index.js`（添加路由）
- **预估**：15分钟

### T3.2 refund_apply 云函数
- **描述**：用户提交退款申请，创建退款记录，更新订单状态
- **文件**：新建 `cloudfunctions/refund_apply/`
- **预估**：10分钟

### T3.3 refund_detail 云函数
- **描述**：查询退款详情，关联订单信息
- **文件**：新建 `cloudfunctions/refund_detail/`
- **预估**：5分钟

### T3.4 refund_cancel 云函数
- **描述**：用户取消退款申请
- **文件**：新建 `cloudfunctions/refund_cancel/`
- **预估**：5分钟

### T3.5 admin_refunds_list 云函数
- **描述**：商家查询退款列表，支持分页和筛选
- **文件**：新建 `cloudfunctions/admin_refunds_list/`
- **预估**：5分钟

### T3.6 admin_refunds_update 云函数
- **描述**：商家审核、确认收货，触发微信退款
- **文件**：新建 `cloudfunctions/admin_refunds_update/`
- **预估**：10分钟

### T3.7 wxpayRefundCallback 云函数
- **描述**：接收微信支付退款回调，更新退款状态
- **文件**：新建 `cloudfunctions/wxpayRefundCallback/`
- **预估**：10分钟

### T3.8 部署所有云函数
- **描述**：将所有新建和修改的云函数部署到云端
- **操作**：使用 MCP 工具部署
- **预估**：5分钟

---

## T4. 小程序页面开发（依赖：T1、T3）

### T4.1 订单详情页改造
- **描述**：
  - 将「撤销」按钮改为「申请退货」
  - 添加 ActionSheet 选择退款类型
  - 根据订单状态控制按钮显示
- **文件**：
  - `pages/order/detail/detail.wxml`
  - `pages/order/detail/detail.js`
  - `pages/order/detail/detail.wxss`
  - `pages/order/detail/detail.json`
- **预估**：15分钟

### T4.2 退款申请页开发
- **描述**：
  - 显示订单信息
  - 退款原因选择（6个预设选项）
  - 详细说明文本框
  - 图片上传（最多9张）
  - 提交申请
- **文件**：
  - `pages/refund/apply/apply.wxml`
  - `pages/refund/apply/apply.js`
  - `pages/refund/apply/apply.wxss`
  - `pages/refund/apply/apply.json`
- **预估**：15分钟

### T4.3 退款详情页开发
- **描述**：
  - Vant Steps 步骤条展示进度
  - 当前状态卡片
  - 退款信息展示
  - 凭证图片预览
  - 取消申请按钮（待审核时）
- **文件**：
  - `pages/refund/detail/detail.wxml`
  - `pages/refund/detail/detail.js`
  - `pages/refund/detail/detail.wxss`
  - `pages/refund/detail/detail.json`
- **预估**：15分钟

### T4.4 我的订单页改造
- **描述**：
  - 显示售后状态标签
  - 添加「查看退款」入口
- **文件**：
  - `pages/order/orders/orders.wxml`
  - `pages/order/orders/orders.js`
- **预估**：5分钟

---

## T5. 管理后台改造（依赖：T3）

### T5.1 TypeScript 类型定义
- **描述**：新增 Refund、RefundStatus、AfterSaleStatus 类型
- **文件**：`Backend-management/guangyi-admin/src/types/index.ts`
- **预估**：5分钟

### T5.2 API 服务扩展
- **描述**：新增 refundApi（list、review、confirmReturn）
- **文件**：`Backend-management/guangyi-admin/src/services/api.ts`
- **预估**：5分钟

### T5.3 OrderList.tsx 改造
- **描述**：
  - 新增「售后状态」列
  - 新增售后状态筛选器
  - 新增退款详情弹窗
  - 新增审核操作按钮（同意/拒绝/确认收货）
- **文件**：`Backend-management/guangyi-admin/src/pages/business/OrderList.tsx`
- **预估**：20分钟

---

## T6. 测试与部署（依赖：T4、T5）

### T6.1 功能测试
- **描述**：
  - 测试仅退款全流程
  - 测试退货退款全流程
  - 测试商家拒绝后重新申请
  - 测试退款回调处理
- **预估**：10分钟

### T6.2 文档更新
- **描述**：更新 README.md，补充退款退货功能说明
- **文件**：`README.md`
- **预估**：5分钟

---

## 任务依赖关系图

```
                    ┌─────────┐
                    │  开始   │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │   T1    │    │   T2    │    │  (并行)  │
    │基础设施 │    │数据库   │    │         │
    └────┬────┘    └────┬────┘    └─────────┘
         │               │
         │               ▼
         │         ┌─────────┐
         │         │   T3    │
         │         │云函数   │
         │         └────┬────┘
         │               │
         └───────┬───────┘
                 ▼
    ┌────────────────────────┐
    │          T4            │
    │    小程序页面开发       │
    └───────────┬────────────┘
                │
    ┌───────────┴────────────┐
    │          T5            │
    │    管理后台改造        │
    └───────────┬────────────┘
                │
                ▼
    ┌────────────────────────┐
    │          T6            │
    │      测试与部署        │
    └────────────────────────┘
```

---

## 执行顺序

1. **批次1（并行）**：T1 + T2
2. **批次2**：T3（依赖 T2）
3. **批次3**：T4（依赖 T1、T3）
4. **批次4**：T5（依赖 T3）
5. **批次5**：T6（依赖 T4、T5）

---

## 状态追踪

| 任务ID | 任务名称 | 状态 | 完成时间 |
|--------|----------|------|----------|
| T1.1 | 安装 Vant Weapp | ✅ 已完成 | 2025-12-26 |
| T1.2 | 创建页面目录 | ✅ 已完成 | 2025-12-26 |
| T1.3 | 更新路由配置 | ✅ 已完成 | 2025-12-26 |
| T2.1 | 创建 refunds 集合 | ✅ 已完成 | 2025-12-26 |
| T2.2 | 扩展 orders 字段 | ✅ 已完成 | 2025-12-26 |
| T3.1 | wxpayFunctions 扩展 | ✅ 已完成 | 2025-12-26 |
| T3.2 | refund_apply 云函数 | ✅ 已完成 | 2025-12-26 |
| T3.3 | refund_detail 云函数 | ✅ 已完成 | 2025-12-26 |
| T3.4 | refund_cancel 云函数 | ✅ 已完成 | 2025-12-26 |
| T3.5 | admin_refunds_list | ✅ 已完成 | 2025-12-26 |
| T3.6 | admin_refunds_update | ✅ 已完成 | 2025-12-26 |
| T3.7 | wxpayRefundCallback | ✅ 已完成 | 2025-12-26 |
| T3.8 | 部署云函数 | ✅ 已完成 | 2025-12-26 |
| T4.1 | 订单详情页改造 | ✅ 已完成 | 2025-12-26 |
| T4.2 | 退款申请页开发 | ✅ 已完成 | 2025-12-26 |
| T4.3 | 退款详情页开发 | ✅ 已完成 | 2025-12-26 |
| T4.4 | 我的订单页改造 | ✅ 已完成 | 2025-12-26 |
| T5.1 | TypeScript 类型 | ✅ 已完成 | 2025-12-26 |
| T5.2 | API 服务扩展 | ✅ 已完成 | 2025-12-26 |
| T5.3 | OrderList 改造 | ✅ 已完成 | 2025-12-26 |
| T6.1 | 功能测试 | ✅ 已完成 | 2025-12-26 |
| T6.2 | 文档更新 | ✅ 已完成 | 2025-12-26 |

---

## 版本信息

- 文档版本：v1.0
- 创建时间：2025-12-19
- 作者：AI Assistant

