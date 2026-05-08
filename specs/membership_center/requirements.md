# 会员中心需求文档（membership_center）

## 介绍

本需求是光乙共创小程序「会员体系第一期」的范围，目标是搭建会员中心的 UI 框架与基础数据模型，为后续逐步替换零散的解锁逻辑（计算器 Pro UI、灵感图分级、报告署名、课程双向赋权、邀请奖励等）提供统一入口。

本期产出：
1. 个人中心新增「我的会员」入口
2. 会员中心首页（用户状态 + 邀请卡 + 开通入口 + 购买记录）
3. 会员开通独立页（ChatGPT 风格 Tab + 对比表 + CTA）
4. 数据模型扩展（`users` 集合新增会员字段）
5. 会员状态查询云函数（`membership_status`）
6. 微信支付接入（复用 `wxpayFunctions`）

后续按"一个一个慢慢添加"的节奏，再补完邀请奖励、老用户迁移、报告署名、灵感图分级、课程双向赋权等业务规则。

---

## 背景分析

### 现状问题

- 用户解锁逻辑分散：计算器 Pro 通过工具包订单解锁、课程通过课程订单解锁、灵感图统一开放、邀请未实现
- 缺少统一的「会员中心」入口
- `users` 表无会员字段，无法支撑会员到期、试用期、邀请奖励等业务

### 已有资源

- 数据库集合：`users`、`orders`、`courses`
- 云函数：`wxpayFunctions`（V3 微信支付，已可用）、`course_purchase_check`（购课判定）
- 子包路径：`pages/profile/`（已有 home、orders、invitations 等页面）
- 全局样式：`app.wxss` 提供 Apple 风格 design tokens

### 已确认的会员体系规则（A/B/C/D/H 系列定稿）

| 项 | 规则 |
|---|---|
| 三档身份 | 免费用户 / 普通会员 ¥69/年 / 高级会员 ¥399/年 |
| 工具包商品 | 仍在商城展示（一次性买断 ¥69，永久 Pro UI + 资料 + 1 年普通会员） |
| 课程 | ¥399 单买，与高级会员双向赋权 |
| 普通会员权益 | 计算器 Pro UI、工具包资料、PDF 报告导出（含署名） |
| 高级会员权益 | + 灵感图库下载（不限次、无水印）+ 课程畅看 |
| 邀请试用 | 每邀 2 人 +7 天普通会员试用，无上限叠加 |
| 邀请码 | 注册即生成 6 位字符，终身唯一不可改 |

> 上述规则为最终业务规则。本期 spec 仅实现「会员中心 UI 框架 + 数据模型 + 状态查询 + 购买流程」，其他业务规则（试用期发放、老用户迁移、署名、灵感图分级等）后续 spec 单独实现。

---

## 设计风格与色板（基于 web-design-engineer skill 提取）

本期 UI 严格沿用项目 Apple 风格，**不引入新颜色**，**不使用 emoji 当图标**，缺图标位置用 `[icon]` 占位待后续补真实资源。

### 颜色 Token

| Token | 值 | 用途 |
|---|---|---|
| `--brand-blue` | `#007aff` | 主色 / CTA 按钮 / 选中态 / 勾选 |
| `--brand-blue-pressed` | `#0056cc` | CTA 按下态 |
| `--brand-blue-tint` | `rgba(0,122,255,0.1)` | 标签底色 |
| `--accent-red` | `#ff3b30` | 价格强调 |
| `--bg-page` | `#f2f2f7` | 页面背景 |
| `--bg-card` | `#ffffff` | 卡片底 |
| `--text-primary` | `#1d1d1f` | 主文本 |
| `--text-secondary` | `#8e8e93` | 次文本 |
| `--text-tertiary` | `#86868b` | 描述文本 |
| `--text-disabled` | `#c7c7cc` | 占位 / 禁用 |
| `--divider` | `#e5e5ea` | 分割线 |
| `--hover` | `#f8f8f8` | 卡片按下态 |

### 字体（沿用系统字体栈）

`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif`

### 圆角

- 主卡片 40rpx（profile 风格）/ 50rpx（products 风格）
- 标签 12rpx
- 按钮 999rpx 胶囊

### 阴影

默认 `box-shadow: none`（项目极简风），仅特殊浮层用极淡阴影。

### 运动

按下 `transform: scale(0.96)` + `transition: 0.2s ease`

---

## 范围声明

### 本期范围（P0/P1）

1. ✅ 数据模型扩展（`users` 集合新增会员字段）
2. ✅ 个人中心新增「我的会员」入口
3. ✅ 会员中心首页（4 区块）
4. ✅ 会员开通独立页（ChatGPT 风格）
5. ✅ 会员状态查询云函数 `membership_status`
6. ✅ 微信支付接入（复用 `wxpayFunctions`）
7. ✅ 工具包用户在会员中心的展示

### 不在本期范围（后续 spec）

- ❌ 邀请码生成与使用的完整后端逻辑
- ❌ 邀请奖励试用期 +7 天的自动发放
- ❌ 老用户迁移（已购工具包/课程自动赠会员）的批量脚本
- ❌ 报告导出 PDF + 署名功能
- ❌ 灵感图库分级（缩略 vs 高清下载）
- ❌ 课程与高级会员的双向赋权逻辑
- ❌ 计算器 Pro UI / 工具包资料下载的会员级限制

> 本期会员开通后**仅写入会员等级与到期日**，业务功能限制（如灵感图下载拦截）等后续 spec 实现。

---

## 需求

### 需求 1 - 数据模型扩展（users 集合）

**用户故事：** 作为系统，需要在 `users` 集合中新增会员字段，以便支撑会员等级、到期日、邀请码等基础业务。

#### 验收标准

1. **When** 系统首次加载用户文档时，**the** 系统 **shall** 容忍 `vipLevel` 等新字段不存在的情况，并按"免费用户"处理。

2. **When** 用户开通普通会员或高级会员后，**the** 系统 **shall** 在 `users` 文档中写入 `vipLevel`、`vipExpireAt`、`vipUpdatedAt` 三个字段。

3. **When** 用户首次进入会员中心或个人中心时，**the** 系统 **shall** 检查 `users.inviteCode` 是否存在，不存在则生成 6 位唯一邀请码（仅本期负责生成与持久化，使用与回调逻辑后续 spec 实现）。

4. **While** 邀请码生成时，**the** 系统 **shall** 使用大写字母 + 数字组合，去除易混字符（O/0/I/1），通过云函数原子化生成确保全局唯一。

5. **When** 用户购买了工具包商品时，**the** 系统 **shall** 在 `users.toolkitPerpetual` 标记永久权益（用于会员中心展示），与 `vipLevel` 解耦。

---

### 需求 2 - 个人中心新增「我的会员」入口

**用户故事：** 作为已登录用户，我希望在个人中心顶部用户信息下方看到「我的会员」入口，以便快速进入会员中心查看会员状态。

#### 验收标准

1. **When** 用户进入 `pages/profile/home/home` 页面且已登录时，**the** 页面 **shall** 在 `profile-card.unified` 内 `cells.inline` 的**最顶部**展示一行「我的会员」cell（位于「订单」cell 之上）。

2. **While** 渲染「我的会员」入口时，**the** 入口 **shall** 完全沿用现有 `.cell` 类样式（左侧文字 + 右侧 `〉` 箭头 + `cell-hover` 按下态），与「订单」「我的邀请」等同级 cell 视觉**无法区分**。

3. **When** 用户点击「我的会员」cell 时，**the** 页面 **shall** 跳转到 `/pages/profile/membership/membership`。

4. **When** 用户未登录时，**the** 页面 **shall** 不展示「我的会员」入口（与现有 cell 行为一致）。

---

### 需求 3 - 会员中心首页 · 用户状态卡片

**用户故事：** 作为用户，我希望进入会员中心后能立即看到自己当前的会员状态（档位 + 到期日），以便了解自己拥有的权益。

#### 验收标准

1. **When** 用户进入 `pages/profile/membership/membership` 时，**the** 页面 **shall** 在顶部展示用户状态卡片，包含：头像、昵称、当前会员档位徽标、到期信息（如适用）。

2. **When** 用户为免费用户时，**the** 卡片 **shall** 显示「普通用户」+ 副标「开通会员，解锁更多功能」。

3. **When** 用户为普通会员（`vipLevel = 'normal'` 且未过期）时，**the** 卡片 **shall** 显示「普通会员」+ 副标「会员有效期至 YYYY.MM.DD · 剩 N 天」。

4. **When** 用户为高级会员（`vipLevel = 'premium'` 且未过期）时，**the** 卡片 **shall** 显示「高级会员」+ 副标「会员有效期至 YYYY.MM.DD · 剩 N 天」。

5. **When** 用户拥有工具包永久权益（`toolkitPerpetual = true`）时，**the** 卡片 **shall** 在主标下方加一行小字「含工具包永久权益」（24rpx 灰色 `#86868b`）。

6. **When** 用户为试用中状态（本期暂不实现试用激活，但 UI 须支持该状态）时，**the** 卡片 **shall** 显示「普通会员（试用中）· 剩 N 天 · 转正享原价 ¥69」。

7. **While** 渲染卡片时，**the** 卡片 **shall** 使用 40rpx 圆角白卡，无阴影，与 `pages/profile/home/home` 的 `profile-card.unified` 视觉一致。

8. **When** 用户点击状态卡片时，**the** 页面 **shall** 不触发跳转（仅展示用，避免误操作）。

---

### 需求 4 - 会员中心首页 · 邀请卡片（UI 框架）

**用户故事：** 作为用户，我希望在会员中心看到自己的邀请码与邀请进度，以便了解可以通过邀请获得多少天试用。

#### 验收标准

1. **When** 用户进入会员中心首页时，**the** 页面 **shall** 在用户状态卡片下方展示邀请卡片，包含：标题「邀请好友 · 免费试用」、邀请码 + 复制按钮、邀请进度条 + 文案、邀请按钮、查看邀请记录链接。

2. **When** 用户的 `users.inviteCode` 不存在时，**the** 页面 **shall** 触发云函数生成邀请码并刷新展示。

3. **When** 用户点击「复制」按钮时，**the** 页面 **shall** 调用 `wx.setClipboardData` 复制邀请码到剪贴板并 toast「已复制」。

4. **When** 用户点击「邀请好友」按钮时，**the** 页面 **shall** 触发 `onShareAppMessage`（小程序分享卡片），分享路径携带邀请码参数。

5. **When** 用户点击「查看邀请记录」时，**the** 页面 **shall** 跳转到 `/pages/profile/invitations/invitations`（已有页面，本期不修改）。

6. **While** 邀请进度展示时，**the** 页面 **shall** 显示「累计邀请 N 人 / 已得 M 天试用 / 再邀 X 人即可再得 7 天」格式文案；进度条显示 `(N % 2)/2` 的小段进度（即每 2 人为一个周期）。

7. **While** 本期邀请奖励发放逻辑未实现时，**the** 页面 **shall** 仍能正常展示邀请码、复制功能、分享功能；累计人数与已得天数从 `users.inviteStats` 字段读取（不存在则显示为 0）。

---

### 需求 5 - 会员中心首页 · 开通会员入口卡片

**用户故事：** 作为未开通或想升级的用户，我希望在会员中心首页看到醒目的「开通会员」入口，以便进入开通页购买。

#### 验收标准

1. **When** 用户为免费用户、试用中、或普通会员时，**the** 页面 **shall** 在邀请卡片下方展示一张「开通会员」入口卡片，标题随身份变化：
   - 免费用户：标题「开通会员，解锁全部功能」+ 副标「最低 ¥69/年」
   - 普通会员：标题「升级到高级会员」+ 副标「解锁灵感图库与全部课程」
   - 试用中：标题「开通会员，永久解锁」+ 副标「不再担心试用过期」

2. **When** 用户为高级会员（已是最高档）时，**the** 页面 **shall** 不展示开通入口卡片，改为展示「高级会员有效期至 YYYY.MM.DD · 续费」简版卡片。

3. **When** 用户点击开通入口卡片时，**the** 页面 **shall** 跳转到 `/pages/profile/membership/upgrade/upgrade` 独立开通页。

4. **While** 渲染入口卡片时，**the** 卡片 **shall** 使用白底 40rpx 圆角，主标 32rpx/600 + 副标 24rpx 灰色 + 右侧 `〉` 箭头，与个人中心其他 cell 风格一致。

---

### 需求 6 - 会员中心首页 · 购买记录列表

**用户故事：** 作为有购买记录的用户，我希望能在会员中心看到自己的会员购买历史，以便回顾消费情况。

#### 验收标准

1. **When** 用户存在至少 1 条会员相关订单（`orders.category = 'membership'`）时，**the** 页面 **shall** 在底部展示「我的购买记录」卡片。

2. **While** 展示购买记录时，**the** 卡片 **shall** 仅展示**最近 3 条**记录，每条显示：商品名（普通会员 / 高级会员）+ 订单创建时间（YYYY.MM.DD）。

3. **When** 实际购买记录超过 3 条时，**the** 卡片 **shall** 在底部显示「查看全部 〉」链接，点击后跳转到 `/pages/profile/orders/orders` 并预筛选 `category=membership`。

4. **When** 用户没有任何会员订单时，**the** 页面 **shall** 不展示购买记录卡片（避免空状态视觉负担）。

---

### 需求 7 - 会员开通独立页（ChatGPT 风格）

**用户故事：** 作为用户，我希望进入一个干净独立的开通页，能在普通会员与高级会员之间切换对比，并直接完成购买。

#### 验收标准

1. **When** 用户进入 `pages/profile/membership/upgrade/upgrade` 时，**the** 页面 **shall** 自上而下展示：右上角关闭按钮 → 品牌图标占位 → 大标题「开通光乙会员」→ 副标题 → 两段 Tab 切换器 → 价格 → 权益对比表 → CTA 按钮 → 协议说明。

2. **While** 渲染 Tab 切换器时，**the** Tab **shall** 使用灰底胶囊容器（`#f2f2f7`） + 选中态白底 + 蓝色文字（`#007aff`），共两段：「普通会员」「高级会员」。

3. **When** 页面加载时，**the** 页面 **shall** 根据用户当前会员状态动态推荐默认 Tab：
   - 免费用户、试用中 → 默认「普通会员」Tab
   - 普通会员（已开通） → 默认「高级会员」Tab
   - 高级会员（已开通） → 不应进入此页（首页应提供续费简版入口）

4. **While** 渲染权益对比表时，**the** 表格 **shall** 为白底 30rpx 圆角卡片，三列结构：「功能」「免费」「[当前 Tab 档位]」。

5. **While** 对比表的勾选符号渲染时，**the** 系统 **shall** 使用蓝色 ✓（`#007aff`）表示拥有，灰色 — （`#c7c7cc`）表示未拥有。

6. **When** 用户切换 Tab 时，**the** 页面 **shall** 同步更新：价格显示、对比表右列、CTA 按钮文案与价格。

7. **While** 渲染 CTA 按钮时，**the** 按钮 **shall** 满宽胶囊（999rpx）、主色 `#007aff` 实心、白字，文案随档位与状态变化：
   - 当前用户未开通该档位：「开通普通会员 ¥69/年」/「开通高级会员 ¥399/年」
   - 当前用户已开通该档位：按钮变灰禁用「已开通」+ 下方蓝链「续费 〉」

8. **When** 用户点击 CTA 按钮时，**the** 页面 **shall** 触发购买流程（详见需求 8）。

9. **While** 顶部品牌图标位渲染时，**the** 页面 **shall** 使用占位符 `[icon]` 视觉（无图标资源时不放任何 emoji），后续补充真实 PNG/SVG 资源放置在 `images/membership-icon.png` 路径。

10. **When** 用户点击右上角关闭按钮 × 时，**the** 页面 **shall** 调用 `wx.navigateBack` 返回上级页面。

11. **While** 对比表的权益项排序时，**the** 表格 **shall** 按以下顺序展示（共 7 行）：
    1. 计算器免费版
    2. 计算器 Pro UI
    3. 工具包资料下载
    4. PDF 报告导出
    5. 报告自定义署名
    6. 灵感图库下载
    7. 课程畅看

12. **While** 普通会员档位渲染对比表时，**the** 表格 **shall** 为「灵感图库下载」「课程畅看」两行的右列显示 — （灰）；高级会员档位则全部显示 ✓（蓝）。

---

### 需求 8 - 微信支付接入

**用户故事：** 作为用户，我希望点击 CTA 按钮后能直接完成微信支付，开通成功后立即看到会员状态生效。

#### 验收标准

1. **When** 用户在开通页点击 CTA 按钮时，**the** 页面 **shall** 调用云函数 `wxpayFunctions` 创建会员订单（`orders.category = 'membership'`、`orders.skuId = 'vip_normal_year' / 'vip_premium_year'`、`orders.amount = 6900 / 39900`，单位为分）。

2. **While** 创建会员订单时，**the** 系统 **shall** 不允许前端传入价格，价格仅从云函数读取的硬编码 SKU 表中取值（防止篡改）。

3. **When** 微信支付预下单成功后，**the** 页面 **shall** 调用 `wx.requestPayment` 唤起支付。

4. **When** 微信支付成功（用户在 wx.requestPayment 的 success 回调）后，**the** 页面 **shall** 显示 loading 并轮询订单状态（`wxpay_query_order_by_out_trade_no`）确认 `status = paid`。

5. **When** 订单状态确认为 `paid` 时，**the** `wxpayOrderCallback` 云函数 **shall** 同步写入 `users.vipLevel = 'normal' / 'premium'`、`users.vipExpireAt = now + 1 年`（如已是会员则在原到期日基础上 +1 年，不覆盖剩余天数）、`users.vipUpdatedAt = now`。

6. **When** 会员激活完成后，**the** 页面 **shall** toast「开通成功！」并 1.5 秒后 `wx.navigateBack` 返回会员中心首页，首页应自动刷新展示新状态。

7. **When** 用户取消支付或支付失败时，**the** 页面 **shall** toast 错误原因并保留在开通页，订单保持 `pending_payment` 状态。

8. **While** SKU 表本期定义如下：
   | skuId | 商品名 | 金额（分） | 时长 |
   |---|---|---|---|
   | `vip_normal_year` | 普通会员（年） | 6900 | 365 天 |
   | `vip_premium_year` | 高级会员（年） | 39900 | 365 天 |

---

### 需求 9 - 会员状态查询云函数（membership_status）

**用户故事：** 作为前端，需要一个统一的接口来查询当前用户的会员状态，以便在会员中心、首页、各业务页面统一判断。

#### 验收标准

1. **When** 调用 `membership_status` 云函数时，**the** 云函数 **shall** 根据用户 `_openid` 从 `users` 集合读取并返回会员状态对象。

2. **While** 计算会员等级时，**the** 云函数 **shall** 按以下规则判定 `effectiveLevel`：
   - `users.vipExpireAt > now` 且 `users.vipLevel = 'premium'` → `'premium'`
   - `users.vipExpireAt > now` 且 `users.vipLevel = 'normal'` → `'normal'`
   - 否则 → `'free'`

3. **While** 返回数据时，**the** 云函数 **shall** 包含字段：`effectiveLevel`、`vipLevel`、`vipExpireAt`、`remainingDays`、`toolkitPerpetual`、`inviteCode`、`inviteStats`。

4. **When** 用户未登录时，**the** 云函数 **shall** 返回 `effectiveLevel = 'free'` 且其他字段为空，不抛错。

5. **When** 用户首次调用此函数且无 `inviteCode` 字段时，**the** 云函数 **shall** 自动生成 6 位唯一邀请码并写入。

6. **While** 生成邀请码时，**the** 云函数 **shall** 使用大写字母 + 数字组合（去除易混字符），最多重试 5 次，若仍冲突则报错日志（极小概率）。

---

### 需求 10 - 工具包用户的会员中心展示

**用户故事：** 作为已购工具包的用户，我希望在会员中心看到我拥有的永久权益的标识，以便了解自己的完整权益清单。

#### 验收标准

1. **When** 用户的 `users.toolkitPerpetual = true` 时，**the** 用户状态卡片 **shall** 在主标下方加一行小字「含工具包永久权益」（24rpx，颜色 `#86868b`）。

2. **When** 用户的 `toolkitPerpetual = true` 且 `vipLevel = 'normal'`（即工具包赠送的 1 年普通会员）时，**the** 状态卡片主标 **shall** 显示「普通会员（赠送）」（与正常普通会员视觉一致，仅文字变化）。

3. **While** 工具包永久权益的写入逻辑为后续 spec 范围（购买工具包时由 `wxpayOrderCallback` 写入），**the** 本期 **shall** 仅保证 UI 能正确读取并展示该字段。

---

### 需求 11 - 会员中心首页 · 整体布局与响应

**用户故事：** 作为用户，我希望会员中心整体页面流畅、克制、不臃肿。

#### 验收标准

1. **While** 渲染会员中心首页时，**the** 页面 **shall** 自上而下展示：导航栏标题「我的会员」→ 用户状态卡片 → 邀请卡片 → 开通入口卡片（或续费简版） → 购买记录卡片（如有）。

2. **While** 卡片之间间距时，**the** 页面 **shall** 使用 30rpx 垂直 `margin-bottom`，与 `pages/profile/home/home` 一致。

3. **While** 页面背景时，**the** 页面 **shall** 使用 `#f2f2f7` 与 `app.wxss` 全局背景一致。

4. **When** 用户下拉刷新时，**the** 页面 **shall** 重新调用 `membership_status` 刷新数据。

5. **When** 用户从开通页 `navigateBack` 返回会员中心首页时，**the** 页面 **shall** 在 `onShow` 自动刷新数据（确保新购买的会员立即可见）。

6. **When** 用户未登录时，**the** 页面 **shall** 显示「登录后查看会员信息」占位卡片 + 登录按钮（与 `pages/profile/home/home` 的 `login-prompt-card` 风格一致）。

---

## 接口规范

### membership_status 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| 无 | - | - | 通过 `event.userInfo.openId` 自动获取 |

### membership_status 返回结构

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "effectiveLevel": "normal",
    "vipLevel": "normal",
    "vipExpireAt": 1764950400000,
    "remainingDays": 365,
    "toolkitPerpetual": false,
    "inviteCode": "K7Y2X9",
    "inviteStats": {
      "invitedCount": 3,
      "trialDaysGranted": 7
    },
    "isLoggedIn": true
  }
}
```

### 未登录返回

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "effectiveLevel": "free",
    "isLoggedIn": false
  }
}
```

---

## 数据库字段补充

### users 集合需新增字段

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `vipLevel` | string | `null` | 会员档位：`'normal'` / `'premium'` / `null`（无） |
| `vipExpireAt` | number | `null` | 会员到期时间戳（毫秒），过期判断按 `vipExpireAt > now` |
| `vipUpdatedAt` | number | `null` | 最近一次会员状态变更时间戳 |
| `toolkitPerpetual` | boolean | `false` | 是否拥有工具包永久权益（购买工具包时由回调写入） |
| `signature` | string | `''` | 报告自定义署名（本期不使用，预埋字段） |
| `inviteCode` | string | `''` | 6 位唯一邀请码 |
| `inviteStats` | object | `{}` | 邀请统计：`{ invitedCount, trialDaysGranted }` |

### orders 集合需扩展使用

复用现有 `orders` 集合，新增 `category: 'membership'` 类型，`skuId` 字段使用 `vip_normal_year` / `vip_premium_year`。

---

## 页面路由

| 路径 | 说明 | 子包 |
|---|---|---|
| `/pages/profile/membership/membership` | 会员中心首页 | `pages/profile/` |
| `/pages/profile/membership/upgrade/upgrade` | 会员开通独立页 | `pages/profile/` |

需在 `app.json` 的 `pages/profile/` 子包 pages 数组中追加：
- `membership/membership`
- `membership/upgrade/upgrade`

---

## 优先级

1. 🔴 **P0** - 数据模型扩展（`users` 集合字段）
2. 🔴 **P0** - 个人中心入口（`pages/profile/home/home`）
3. 🔴 **P0** - 会员中心首页 UI（4 区块）
4. 🔴 **P0** - 会员开通独立页 UI（ChatGPT 风格）
5. 🔴 **P0** - `membership_status` 云函数
6. 🟡 **P1** - 微信支付接入（订单创建 + 回调写入会员状态）
7. 🟡 **P1** - 邀请码生成（仅生成与持久化，使用逻辑不在本期）
8. 🟢 **P2** - 工具包用户副标展示（依赖 `toolkitPerpetual` 字段）

---

## 排除范围

本期开发**不包含**以下功能（已在「范围声明」明确列出，此处再次强调）：

- ❌ 邀请奖励试用期 +7 天的自动发放（需独立 spec）
- ❌ 邀请码扫码识别 + 注册时绑定逻辑（需独立 spec）
- ❌ 老用户迁移（已购工具包/课程自动赠会员）批量脚本
- ❌ 报告导出 PDF 功能 + 自定义署名
- ❌ 灵感图库分级（缩略图 vs 高清下载）
- ❌ 课程与高级会员的双向赋权
- ❌ 计算器 Pro UI 的会员级限制（前端拦截）
- ❌ 工具包资料下载的会员级限制
- ❌ 会员中心首页的"会员等级有效期到期"通知/提醒

---

## 术语定义

| 术语 | 定义 |
|---|---|
| 普通会员 | 年付 ¥69，享 PDF 报告导出、Pro UI、工具包资料 |
| 高级会员 | 年付 ¥399，享普通会员全部权益 + 灵感图库下载 + 课程畅看 |
| 工具包永久权益 | 一次性买断 ¥69，永久 Pro UI + 资料 + 1 年普通会员 |
| 试用期 | 通过邀请获得的免费普通会员体验，每邀 2 人 +7 天，无上限叠加 |
| 邀请码 | 6 位字母数字组合（去 O/0/I/1），终身唯一不可改 |
| effectiveLevel | 后端综合 `vipLevel` 与 `vipExpireAt` 实时计算的有效会员等级 |

---

## 变更记录

- 2026-05-07 v1：首版需求文档，定义会员中心 UI 框架、数据模型、状态查询、支付接入

