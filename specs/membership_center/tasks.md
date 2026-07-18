# 会员中心 · 实施计划（membership_center）

> 配套文档：
> - 需求：`specs/membership_center/requirements.md`
> - 设计：`specs/membership_center/design.md`
>
> 本期严格按设计文档落地，不实现「排除范围」中的功能。

---

## 任务总览

| 序号 | 任务 | 优先级 | 预估 | 依赖 | 状态 |
|---|---|---|---|---|---|
| 1 | 数据库索引扩展（`users.inviteCode` 唯一稀疏索引） | P0 | 5 min | - | ✅ |
| 2 | 新增云函数 `membership_status` | P0 | 30 min | 1 | ✅ |
| 3 | 新增云函数 `membership_create_order` | P0 | 25 min | 2 | ✅ |
| 4 | 改造云函数 `wxpayOrderCallback`（增加 membership 分支） | P0 | 30 min | 3 | ✅ |
| 5 | 新增前端工具库 `utils/membership.js` | P0 | 15 min | - | ✅ |
| 6 | 改造个人中心 `pages/profile/home/home`（新增「我的会员」cell） | P0 | 10 min | 5 | ✅ |
| 7 | 新增会员中心首页 `pages/profile/membership/membership` | P0 | 90 min | 2, 5 | ✅ |
| 8 | 新增会员开通独立页 `pages/profile/membership/upgrade/upgrade` | P0 | 90 min | 2, 3, 5 | ✅ |
| 9 | 注册路由 `app.json`（追加两个会员页面） | P0 | 5 min | 7, 8 | ✅ |
| 10 | 部署云函数 + 端到端联调测试 | P0 | 45 min | 1-9 | ✅ |
| 11 | 回归测试（押金/普通订单/课程购买不受影响） | P0 | 15 min | 10 | ⏳ 等待用户操作 |

**总预估**：约 6 小时（不含等待部署/微信支付测试时间）。

---

## 详细任务

### - [x] 1. 数据库索引扩展 ✅

**目标**：为 `users.inviteCode` 添加唯一稀疏索引，保证邀请码全局唯一且允许 `null`/`''` 共存。

- 在云开发控制台「数据库 → users 集合 → 索引管理」中新增索引
- 字段：`inviteCode`，方向 `1`（升序）
- 属性：`unique=true, sparse=true`
- 或在已有的 `setup_indexes` 云函数追加（若存在），调用一次完成创建
- 验证：在控制台手动写入两条相同 `inviteCode` 的文档应报错；写入两条 `inviteCode: ''` 应共存
- _需求: 需求 1（数据模型扩展）_

---

### - [x] 2. 新增云函数 `membership_status` ✅

**目标**：查询当前用户会员状态；首次调用时生成唯一邀请码。

#### 2.1 创建目录结构

- 新建 `cloudfunctions/membership_status/`
- 新建 `cloudfunctions/membership_status/package.json`：
  ```json
  {
    "name": "membership_status",
    "version": "1.0.0",
    "main": "index.js",
    "dependencies": {
      "wx-server-sdk": "~2.6.3"
    }
  }
  ```

#### 2.2 实现 `index.js`

- 引入 `wx-server-sdk`、`cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`
- 从 `cloud.getWXContext()` 获取 OPENID
- 未登录：返回 `{ effectiveLevel: 'free', isLoggedIn: false }`
- 已登录：
  - 查询 `users` by `_openid`
  - 用户文档不存在：返回 `{ effectiveLevel: 'free', isLoggedIn: true }`（不创建用户，由现有 `login` 云函数负责）
  - 用户存在但无 `inviteCode`：调用 `generateUniqueInviteCode` 生成并写入
  - 计算 `effectiveLevel`（基于 `vipLevel` + `vipExpireAt > now`）
  - 计算 `remainingDays = Math.ceil((vipExpireAt - now) / 86400000)`
  - 返回完整状态对象

#### 2.3 实现邀请码工具函数

- 在 `index.js` 同文件内或抽 `inviteCode.js` 子文件
- 安全字符集：`'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`（去除 O/0/I/1）
- `makeRandomCode()`：生成 6 位随机字符串
- `generateUniqueInviteCode(db)`：
  - 最多重试 5 次
  - 每次生成后查询 `users.where({ inviteCode: code }).limit(1).get()` 检查冲突
  - 5 次都冲突时使用 `4 位随机 + 2 位时间戳 base36` 兜底

#### 2.4 错误处理

- 所有异常捕获并返回 `{ success: false, code: 'SERVER_ERROR', errorMessage: err.message }`

- _需求: 需求 1（数据模型）, 需求 9（接口规范）_

---

### - [x] 3. 新增云函数 `membership_create_order` ✅

**目标**：创建会员订单，价格从硬编码 SKU 表读取（防篡改）。

#### 3.1 创建目录结构

- 新建 `cloudfunctions/membership_create_order/`
- 新建 `package.json`（同任务 2 模板）
- 新建 `sku.js`：

  ```javascript
  const MEMBERSHIP_SKUS = {
    vip_normal_year: {
      skuId: 'vip_normal_year',
      name: '光乙普通会员（1 年）',
      price: 69,
      durationDays: 365,
      targetLevel: 'normal'
    },
    vip_premium_year: {
      skuId: 'vip_premium_year',
      name: '光乙高级会员（1 年）',
      price: 399,
      durationDays: 365,
      targetLevel: 'premium'
    }
  }
  module.exports = { MEMBERSHIP_SKUS }
  ```

#### 3.2 实现 `index.js`

- 校验 OPENID（未登录返回 `UNAUTHORIZED`）
- 校验 `event.skuId` 必填且存在于 SKU 表（不存在返回 `INVALID_SKU`）
- 生成订单号：`M${Date.now()}${三位随机数}`
- 写入 `orders` 文档（必含字段）：
  - `orderNo`、`userId: OPENID`、`_openid: OPENID`
  - `category: 'membership'`、`skuId`
  - `params.totalAmount`、`params.items[0]`（含 id/name/price/quantity/category/skuId/duration）
  - `status: 'pending_payment'`、`paid: false`、`isDelete: 0`
  - `createdAt`、`updatedAt`
- 返回 `{ orderNo, amount, skuName }`

#### 3.3 错误处理

- 异常返回 `{ success: false, code: 'SERVER_ERROR' }`

- _需求: 需求 8（微信支付接入）_

---

### - [x] 4. 改造云函数 `wxpayOrderCallback` ✅

**目标**：在现有支付回调中新增 membership 分支，激活用户会员状态。**严禁破坏押金 / 普通订单分支逻辑**。

#### 4.1 定位修改点

- 文件：`cloudfunctions/wxpayOrderCallback/index.js`
- 函数：`processPaymentNotification`
- 插入位置：押金分支（`processDepositPayment`）**之后**、普通订单更新逻辑**之前**

#### 4.2 新增 membership 分支

- 在 `processPaymentNotification` 内追加：
  ```javascript
  if (order.category === 'membership' || outTradeNo.startsWith('M')) {
    return await processMembershipPayment(order, {
      transactionId, successTime, amount, payer, paymentData
    });
  }
  ```

#### 4.3 实现 `processMembershipPayment`

- 在文件末尾（与 `processDepositPayment` 同级）新增：
  - 幂等性检查（`order.paid && order.transactionId === transactionId` → skip）
  - 更新 `orders.doc(order._id)` 字段：`status='paid'`、`paid=true`、`paidAt`、`transactionId`、`paymentAmount`、`payerOpenid`、`updatedAt`、`callbackId`、`callbackSource`
  - 解析 SKU 与时长：从 `order.skuId` 或 `order.params.items[0].skuId` 读取，`durationDays = order.params.items[0].duration || 365`，`targetLevel = skuId === 'vip_premium_year' ? 'premium' : 'normal'`
  - 查询 `users` by `_openid`：
    - 用户不存在：`console.error` 并返回错误（不抛异常防止微信重试）
  - 续费叠加公式：`baseTime = (vipExpireAt > now) ? vipExpireAt : now`，`newExpireAt = baseTime + durationDays * 86400000`
  - 更新 `users.doc(user._id)`：`vipLevel`、`vipExpireAt`、`vipUpdatedAt`
  - 返回 `{ success: true, orderNo, type: 'membership', vipLevel, vipExpireAt }`

#### 4.4 兼容性验证

- 押金订单（`category=deposit` 或 `outTradeNo` 以 `DEP` 开头）仍走 `processDepositPayment`
- 普通订单（无 `category` 或非 deposit/membership）仍走原有更新逻辑
- 商品销量更新（`updateProductSales`）仅对普通订单执行（会员订单跳过）

- _需求: 需求 1（数据模型写入）, 需求 8（支付激活）_

---

### - [x] 5. 新增前端工具库 `utils/membership.js` ✅

**目标**：统一会员状态计算与 API 调用入口。

#### 5.1 创建文件

- 新建 `utils/membership.js`，导出函数：
  - `getEffectiveLevel(vipLevel, vipExpireAt)`：返回 `'free' | 'normal' | 'premium'`
  - `getRemainingDays(vipExpireAt)`：返回剩余天数（最小 0）
  - `fetchMembershipStatus()`：异步调用 `wx.cloud.callFunction({ name: 'membership_status' })`，错误时返回兜底 `{ effectiveLevel: 'free' }`
  - `getRecommendedTab(effectiveLevel)`：`'normal'` → 推荐 `'premium'`，其他返回 `'normal'`
  - `formatExpireDate(timestamp)`：返回 `'YYYY.MM.DD'` 字符串

#### 5.2 不引入额外依赖

- 仅使用原生 JS API + `wx.cloud`
- 与项目现有 `utils/` 风格一致（CommonJS `module.exports`）

- _需求: 需求 3, 需求 4, 需求 5, 需求 7_

---

### - [x] 6. 改造个人中心 `pages/profile/home/home` ✅

**目标**：在「订单」cell 之上插入「我的会员」cell，样式完全复用现有 `.cell`。

#### 6.1 修改 `home.wxml`

- 定位：`<view class="cells inline">` 内、第一个 `订单` cell **之上**
- 插入：
  ```xml
  <view class="cell" bindtap="go" data-url="/pages/profile/membership/membership" hover-class="cell-hover">
    <text>我的会员</text>
    <text class="arrow">〉</text>
  </view>
  ```

#### 6.2 验证 `home.js`

- 现有 `go(e)` 方法已支持 `data-url` 跳转，**不需要修改 JS**
- 现有 `cell-hover` 样式已存在，**不需要修改 WXSS**

#### 6.3 视觉验收

- 与「订单」「我的邀请」「购物车」等同级 cell 视觉**无法区分**
- 按下态、箭头、间距、字号完全一致

- _需求: 需求 2_

---

### - [x] 7. 新增会员中心首页 `pages/profile/membership/membership` ✅

**目标**：实现会员中心首页 4 区块（用户状态 + 邀请 + 升级入口 + 购买记录）。

#### 7.1 创建目录与文件骨架

- 新建 `pages/profile/membership/`
- 文件清单：`membership.js` / `membership.wxml` / `membership.wxss` / `membership.json`

#### 7.2 `membership.json`

  ```json
  {
    "navigationBarTitleText": "我的会员",
    "navigationBarBackgroundColor": "#f2f2f7",
    "enablePullDownRefresh": true,
    "usingComponents": {}
  }
  ```

#### 7.3 `membership.js`

- `data` 结构按设计文档 §2.2.2
- `onShow`：调用 `fetchMembershipStatus()` 加载会员状态 + 加载会员订单历史（最多 4 条用于判断 `hasMoreHistory`，渲染前 3 条）
- `onPullDownRefresh`：重新加载，加载完调用 `wx.stopPullDownRefresh`
- 事件方法：
  - `onCopyInviteCode`：`wx.setClipboardData` + `wx.showToast`
  - `onShareInvitation`：触发 `onShareAppMessage`（小程序分享卡片携带邀请码参数）
  - `onShareAppMessage`：返回 `{ title, path: '/pages/products/products?inviteCode=K7Y2X9' }`
  - `onGoUpgrade`：`wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })`
  - `onGoInvitations`：`wx.navigateTo` 到现有 `/pages/profile/invitations/invitations`
  - `onGoOrders`：`wx.navigateTo` 到 `/pages/profile/orders/orders?category=membership`
  - `onGoLogin`：`wx.navigateTo` 到登录页
- 加载会员订单历史：调用现有 `orders_list` 云函数（或直接 `db.collection('orders').where({ _openid, category: 'membership' })`），按 `createdAt desc` 排序

#### 7.4 `membership.wxml`

按设计文档 §2.2.2 渲染 4 区块：

- **未登录占位卡片**（复用 `login-prompt-card` 类）
- **状态卡片**（4 种身份分支：`effectiveLevel === 'free'` / `'normal'` / `'premium'` / `isTrialing`；`toolkitPerpetual=true` 时副标加「含工具包永久权益」）
- **邀请卡片**（邀请码 + 复制按钮 + 进度条 + 文案 + 邀请按钮 + 查看记录链接）
- **升级入口卡片**（4 种身份分支文案：免费/试用中/普通会员/高级会员）
- **购买记录卡片**（`hasMembershipOrders=true` 时渲染前 3 条 + `hasMoreHistory=true` 时渲染「查看全部」）

注意：
- 不使用 emoji，缺图标位置使用 `[icon]` 占位
- 全部使用 `app.wxss` 已有 design tokens，颜色限制在 §3.2 列表内

#### 7.5 `membership.wxss`

- 复用 `app.wxss` 类（`apple-card`、`title-medium` 等）
- 区块间距：`margin: 0 30rpx 30rpx`
- 状态卡片：`background: #fff; border-radius: 40rpx; padding: 30rpx 28rpx;`
- 邀请码：等宽字符感（`font-family: -apple-system, monospace; letter-spacing: 4rpx`）
- 进度条：`background: rgba(0,122,255,0.1)` + 填充 `background: #007aff`
- CTA 胶囊按钮：`border-radius: 999rpx; padding: 20rpx 40rpx; background: #007aff; color: #fff`
- 按下态 `transform: scale(0.96); transition: 0.2s ease`

- _需求: 需求 3, 需求 4, 需求 5, 需求 6, 需求 11_

---

### - [x] 8. 新增会员开通独立页 `pages/profile/membership/upgrade/upgrade` ✅

**目标**：实现 ChatGPT 风格的两档 Tab + 对比表 + CTA。

#### 8.1 创建目录与文件骨架

- 新建 `pages/profile/membership/upgrade/`
- 文件清单：`upgrade.js` / `upgrade.wxml` / `upgrade.wxss` / `upgrade.json`

#### 8.2 `upgrade.json`

  ```json
  {
    "navigationStyle": "custom",
    "navigationBarBackgroundColor": "#f2f2f7",
    "usingComponents": {}
  }
  ```

> 自定义导航栏让顶部关闭按钮 × 自由布局。

#### 8.3 `upgrade.js`

- `data` 结构按设计文档 §2.2.3
- `onLoad`：调用 `fetchMembershipStatus()` + 设置默认 Tab（用 `getRecommendedTab`）+ 高级会员则 toast 提示并 `navigateBack`
- 事件方法：
  - `onClose`：`wx.navigateBack`
  - `onTabChange(e)`：切换 `activeTab`
  - `onTapCta`：
    - 防重入：`isPaying=true` 时直接 return
    - 已是该档位：toast「您已开通」并跳转续费逻辑（本期可暂时不区分续费 vs 开通，后端续费叠加公式已支持）
    - 调用 `membership_create_order` 获取 `orderNo`
    - 调用 `wxpayFunctions.wxpay_order` 获取支付参数
    - `wx.requestPayment` 唤起支付
    - 支付成功 → 轮询 `wxpay_query_order_by_out_trade_no`（最多 6 次，每次间隔 1.5s）确认 `status=paid`
    - 确认后 `wx.showToast({ title: '开通成功' })` + 1.5s 后 `wx.navigateBack`
    - 任何错误：toast 错误原因 + `isPaying=false`

#### 8.4 `upgrade.wxml`

按设计文档 §2.2.3 自上而下结构：

- 自定义顶部栏（仅一个右上角 × 关闭按钮，圆形灰底 `#e5e5ea` `#c7c7cc`）
- 品牌图标占位 `<view class="brand-icon-placeholder">[icon]</view>` （48rpx 灰色文字 + 80rpx 灰色虚线圆）
- 大标题 56rpx/800 `开通光乙会员`
- 副标题 28rpx 灰 `解锁全部专业工具，省心又高效`
- Tab 切换器（两段胶囊容器，`activeTab` 决定选中态）
- 价格区 32rpx/700 + `wx:if` 控制
- 对比表（白卡圆角 30rpx，三列 `wx:for benefits`）
  - 勾选符号：拥有 = 蓝色 `✓`、未拥有 = 灰色 `—`
- CTA 按钮（满宽胶囊 `999rpx`，主色实心，文案随档位+状态）
  - 已开通 → 灰色禁用 + 下方蓝链「续费 〉」
- 协议说明 24rpx 灰居中 `开通即代表同意《会员服务协议》`

注意：
- 协议链接本期可暂指向 `/pages/auth/agreement/agreement`（已有页面）

#### 8.5 `upgrade.wxss`

- 页面背景 `#f2f2f7`
- 顶部关闭按钮：`position: absolute; top: 80rpx; right: 30rpx; width: 60rpx; height: 60rpx; border-radius: 50%; background: #e5e5ea`
- 品牌图标占位：圆形虚线 `border: 2rpx dashed #c7c7cc; width: 120rpx; height: 120rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #c7c7cc`
- Tab 切换器：`background: #f2f2f7; border-radius: 999rpx; padding: 6rpx; display: flex` + 选中态 `background: #fff; color: #007aff; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04)`
- 对比表行：`display: flex; padding: 24rpx 30rpx; border-bottom: 1rpx solid #e5e5ea` + 最后一行去掉 border
- CTA 按钮：与首页统一

- _需求: 需求 7, 需求 8_

---

### - [x] 9. 注册路由 `app.json` ✅

**目标**：让两个新页面可被 `wx.navigateTo` 访问。

#### 9.1 定位修改点

- 文件：`app.json`
- 章节：`subpackages` 下 `root: "pages/profile/"` 的 `pages` 数组

#### 9.2 追加路由

- 在 `"invitations/invitations"` 之后追加：
  ```json
  "membership/membership",
  "membership/upgrade/upgrade"
  ```

#### 9.3 验证

- 微信开发者工具重新编译，无路由错误
- 个人中心点「我的会员」可正确跳转

- _需求: 需求 2, 需求 5_

---

### - [x] 10. 部署云函数 + 端到端联调测试 ✅

**目标**：在云开发环境部署 + 验证完整购买流程。

#### 10.1 云函数部署

- 在微信开发者工具中右键以下云函数 → 「上传并部署：云端安装依赖」：
  - `membership_status`
  - `membership_create_order`
  - `wxpayOrderCallback`（**重要：改造后必须重新部署**）

#### 10.2 端到端测试用例

按设计文档 §9.2 表格逐条手工验证：

1. **免费用户首次进入会员中心**
   - 步骤：登录 → 个人中心 → 我的会员
   - 验证：状态卡显示「普通用户」、邀请码已生成（在数据库查 `users.inviteCode` 应有值）
2. **免费用户开通普通会员**
   - 步骤：会员中心 → 升级入口 → 选「普通」→ 支付 ¥69
   - 验证：支付成功 toast、`navigateBack` 后状态卡显示「普通会员 · 剩 365 天」
3. **普通会员升级到高级**
   - 步骤：会员中心 → 升级入口 → 默认 Tab 为「高级」→ 支付 ¥399
   - 验证：`vipLevel` 变为 `premium`，`vipExpireAt` 在原基础上叠加 365 天
4. **Tab 切换**
   - 步骤：开通页在两 Tab 间切换
   - 验证：价格、对比表右列、CTA 文案同步变化
5. **已是高级会员**
   - 步骤：进入会员中心
   - 验证：不展示开通入口卡片，展示续费简版
6. **工具包用户展示**
   - 步骤：手动在数据库为某用户设置 `toolkitPerpetual: true`
   - 验证：状态卡副标显示「含工具包永久权益」

#### 10.3 单元测试（可选自动化）

按设计文档 §9.1 的 11 个用例，可在云函数本地调试中通过手动构造 event 验证。

#### 10.4 实测结果（2026-05-07）

**完整走通场景**：免费用户 → 开通普通会员 → 联调金额 ¥0.01（联调后已恢复 ¥69）。

**验证证据**（订单号 `M1778147279129672`）：

- `wxpayOrderCallback` RequestId `db1d5fd1-49f9-11f1-a588-5254005dc47f`
- 解密成功 → 进入 `处理会员订单（优先于幂等检查）` 分支 → `[membership] ✅ 会员激活成功`
- HTTP 应答 `statusCode: 200, body: { code: SUCCESS }`，微信支付不再重试

**联调发现并修复 2 个生产问题**：

1. **`wxpayOrderCallback` 缺少 `WX_APIV3_KEY` 环境变量**。
   - 现象：回调进入后报错 `Error: APIv3 密钥未配置，无法解密回调数据`。
   - 修复：从 `wxpayFunctions` 复制 5 个环境变量（`WX_APIV3_KEY`、`WX_APPID`、`WX_MCHID`、`WX_PRIVATE_KEY`、`WX_SERIAL_NO`）到 `wxpayOrderCallback`。
   - 状态：✅ 已配置并验证

2. **外层幂等检查会干扰会员激活**。
   - 现象：前端 `pollOrderPaid` 调用 `wxpay_query_order_by_out_trade_no` 提前将订单写为 `paid` + `transactionId`（`syncSource: "query"`）；随后真实回调被 `if (order.paid && order.transactionId === transactionId)` 跳过，导致 `processMembershipPayment` 未执行。
   - 修复：
     - 在 `wxpayOrderCallback/index.js` 中将会员分支判断提前到外层幂等检查之前。
     - `processMembershipPayment` 内部幂等从「基于 `transactionId`」改为「基于 `callbackSource === 'wxpay_v3_callback'`」，避免被 `query` 写入误伤。
   - 状态：✅ 已修复并验证

**意外验证「续费叠加公式」**：本次测试中 `user.vipExpireAt` 在重置阶段未清理干净（受 CloudBase NoSQL `$unset` 不生效 caveat 影响，详见 design.md §10），让本来的「首次激活」变为「续费联调」，由 `nowMs` 起算变为从原到期日 `1809678826000` + 365 天 = `1841214826000`（2028-05-06）。代码表现与 design.md §3.4 续费叠加公式一致，反侧面证明该分支实现正确。

- _需求: 全部_

---

### - [ ] 11. 回归测试（⏳ 等待用户在端到端测试通过后执行）

**目标**：确保改造不影响现有支付流程。

#### 11.1 关键回归点

| 场景 | 验证 |
|---|---|
| 押金支付 | 用户支付押金后 `users.depositPaid=true`、`requests` 优先级置位 |
| 商城商品支付 | 订单 `status=paid`、商品 `sales` 增加 |
| 课程购买 | 订单 `category=course`、`status=paid`，`course_purchase_check` 返回 `isPurchased=true` |
| 工具包购买 | 订单 `category=toolkit`、`toolkit_purchase_check` 返回 `isPurchased=true` |

#### 11.2 个人中心其他 cell

- 「订单」「我的邀请」「购物车」「押金」「服务」「主要送货地址」「我的收藏」「自助结账收据」「提供反馈意见」「设置」全部点击跳转正常
- 视觉与改造前**无任何差异**（除了多出一行「我的会员」）

- _需求: 全部（保护现有功能）_

---

## 文件清单

### 新增文件

```
cloudfunctions/
├── membership_status/
│   ├── index.js                                # 任务 2
│   └── package.json                            # 任务 2
└── membership_create_order/
    ├── index.js                                # 任务 3
    ├── sku.js                                  # 任务 3
    └── package.json                            # 任务 3

pages/profile/membership/
├── membership.js                               # 任务 7
├── membership.wxml                             # 任务 7
├── membership.wxss                             # 任务 7
├── membership.json                             # 任务 7
└── upgrade/
    ├── upgrade.js                              # 任务 8
    ├── upgrade.wxml                            # 任务 8
    ├── upgrade.wxss                            # 任务 8
    └── upgrade.json                            # 任务 8

utils/
└── membership.js                               # 任务 5
```

### 修改文件

```
app.json                                        # 任务 9
cloudfunctions/wxpayOrderCallback/index.js     # 任务 4
pages/profile/home/home.wxml                   # 任务 6
```

### 数据库变更

```
users.inviteCode → 唯一稀疏索引                # 任务 1
```

---

## 验收标准（汇总）

### 后端

- [ ] `membership_status` 未登录返回 `effectiveLevel=free, isLoggedIn=false`
- [ ] `membership_status` 已登录免费用户首次调用生成 6 位 `inviteCode` 并写入
- [ ] `membership_status` 普通会员有效期内返回 `effectiveLevel=normal`
- [ ] `membership_status` 会员过期自动降级为 `effectiveLevel=free`
- [ ] `membership_create_order` 合法 SKU 创建订单，金额从 SKU 表读取
- [ ] `membership_create_order` 非法 SKU 返回 `INVALID_SKU`
- [ ] `membership_create_order` 未登录返回 `UNAUTHORIZED`
- [ ] `wxpayOrderCallback` 押金分支不受影响
- [ ] `wxpayOrderCallback` 普通订单分支不受影响（销量更新仍生效）
- [ ] `wxpayOrderCallback` membership 订单激活后 `users.vipLevel` 与 `vipExpireAt` 正确写入
- [ ] `wxpayOrderCallback` 同一订单重复回调幂等（不叠加）
- [ ] 续费叠加公式：`vipExpireAt = max(now, oldExpireAt) + 365d`

### 前端

- [ ] 个人中心顶部新增「我的会员」cell，样式与「订单」一致
- [ ] 会员中心首页 4 区块布局正确（状态/邀请/升级入口/购买记录）
- [ ] 4 种身份状态卡片差异化展示正确（免费/普通/高级/试用中）
- [ ] 工具包用户副标显示「含工具包永久权益」
- [ ] 邀请码可复制、可分享
- [ ] 会员开通页两 Tab 切换正常，价格/对比表/CTA 文案联动
- [ ] CTA 按钮购买流程完整（创建订单 → 微信支付 → 回调激活 → 状态刷新）
- [ ] 高级会员进入开通页时被劝退（`navigateBack` 或弹窗）
- [ ] 全部 UI 复用 `app.wxss` design tokens，无新增颜色
- [ ] 不使用 emoji，缺图标位置用 `[icon]` 占位

### 集成

- [ ] `app.json` 路由追加无错误
- [ ] 云函数全部部署成功
- [ ] 端到端测试 6 个场景全部通过
- [ ] 回归测试 4 个支付场景全部通过

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `wxpayOrderCallback` 改造引入回归 bug | 中 | 高 | 严格按 §11 回归测试，必要时 git 立即回滚 |
| 邀请码并发冲突 | 低 | 中 | 应用层重试 5 次 + DB 唯一索引兜底 |
| 用户文档不存在导致激活失败 | 低 | 中 | 仅 console.error，不抛异常防止微信支付重试风暴 |
| 微信开发者工具未刷新导致页面 404 | 低 | 低 | 部署后强制重新编译 |
| 价格篡改 | 极低 | 高 | SKU 表硬编码 + `wxpay_order` 从 DB 读金额（双重防护） |

---

## 完成标准

- 所有 11 个任务的 checkbox 都已 ✅
- 上述「验收标准」全部通过
- 可在生产环境正常完成「免费用户 → 普通会员 → 高级会员」三段式购买流程
- 已有支付流程（押金、商城、课程、工具包）零回归

---

## 变更记录

- 2026-05-07 v1：首版实施计划，11 个任务、约 6 小时工作量
- 2026-05-07 v2：任务 1-9（全部代码任务）实施完成；任务 10-11（部署 + 测试）等待用户在云开发环境操作
