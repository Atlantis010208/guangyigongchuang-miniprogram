# 技术方案设计：设计师端个人中心后端云函数

## 1. 技术架构概述

### 1.1 整体架构

```
小程序前端页面
      ↓ wx.cloud.callFunction()
┌─────────────────────────────────────────┐
│           云函数层（5个函数）             │
│  designer_profile  designer_portfolios  │
│  designer_demands  designer_projects    │
│        designer_settings               │
└─────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────┐
│         云数据库（NoSQL）                │
│  users  designers  requests             │
│  designer_portfolios  designer_orders   │
└─────────────────────────────────────────┘
      ↑
┌─────────────────────────────────────────┐
│         云存储                           │
│  designer-avatars/  portfolios/         │
└─────────────────────────────────────────┘
```

### 1.2 技术栈
- **运行时**：Node.js（wx-server-sdk ~2.6.3，与现有云函数一致）
- **数据库**：微信云开发 NoSQL（wx.cloud.database()）
- **存储**：微信云存储（图片文件 fileID 存入数据库）
- **权限模型**：云函数端通过 `cloud.getWXContext().OPENID` 识别身份，查 `users` 集合验证 `roles === 2`

### 1.3 云函数命名规范（沿用项目已有规范）
- 函数名：`designer_` 前缀 + 功能模块
- Action 模式：单函数多操作，通过 `event.action` 分发
- 返回格式：`{ success, code, message, data }`

---

## 2. 云函数详细设计

### 2.1 `designer_profile` — 设计师档案管理

**调用方式**：
```javascript
wx.cloud.callFunction({ name: 'designer_profile', data: { action, ...params } })
```

**支持的 action**：

| action | 说明 | 关键参数 |
|--------|------|---------|
| `get` | 获取当前设计师档案 | 无 |
| `update` | 更新档案字段 | `updateData: object` |

**`get` 流程**：
1. 从 `cloud.getWXContext()` 取 openid
2. 查 `users` 集合验证 roles=2
3. 查 `designers` 集合 `where({ openid })` 或 `where({ _openid: openid })`
4. 若 `designers` 不存在该记录，从 `users` 集合取 nickname/avatarUrl 初始化一条基础档案并插入
5. 处理 avatarUrl：若以 `cloud://` 开头，调用 `cloud.getTempFileURL` 获取临时链接
6. 返回完整档案（含 tempAvatarUrl 字段）

**`update` 流程**：
1. 验证角色为设计师
2. 白名单过滤 updateData（允许：name, bio, experience, styles, phone, wechat, avatarUrl）
3. 字段验证：name(1-20字)、bio(≤200字)、experience(正整数)、avatarUrl(cloud://或https://)
4. 更新 `designers` 集合，同步更新 `users` 集合的 nickname 和 avatarUrl

**允许更新字段白名单**：
```javascript
const ALLOWED_FIELDS = ['name', 'bio', 'experience', 'styles', 'phone', 'wechat', 'avatarUrl']
```

---

### 2.2 `designer_portfolios` — 作品集管理

**支持的 action**：

| action | 说明 | 关键参数 |
|--------|------|---------|
| `list` | 获取作品列表 | `page, pageSize, spaceType` |
| `add` | 添加新作品 | `title, spaceType, description, coverImage(fileID), galleryImages(fileID[])` |
| `delete` | 软删除作品 | `portfolioId` |

> **注**：图片上传由前端直接调用 `wx.cloud.uploadFile()` 完成，云函数只接收并存储 fileID。上传路径规范：
> - 封面图：`portfolios/{designerId}/{portfolioId}/cover.jpg`
> - 项目图集：`portfolios/{designerId}/{portfolioId}/gallery_{n}.jpg`

**`list` 流程**：
1. 验证角色
2. 取该设计师的 designers._id
3. 查 `designer_portfolios` where `{ designerId, isDelete: _.neq(1) }`，支持 spaceType 筛选，按 createdAt 降序，分页
4. 批量将所有 coverImage 的 cloud:// 转为临时链接

**`add` 流程**：
1. 验证角色
2. 校验参数：title非空、spaceType必填、coverImage必须是 cloud:// 开头、galleryImages 1-9张
3. 插入 `designer_portfolios` 集合
4. `designers` 集合中 `portfolioCount` 字段 +1（使用 `_.inc(1)`）

**`delete` 流程**：
1. 验证角色，验证 portfolioId 属于该设计师
2. 软删除：`update({ data: { isDelete: 1, updatedAt: Date.now() } })`
3. `designers` 集合 `portfolioCount` -1（使用 `_.inc(-1)`，最小为0）

---

### 2.3 `designer_demands` — 需求大厅与接单

**支持的 action**：

| action | 说明 | 关键参数 |
|--------|------|---------|
| `list` | 获取可接需求列表 | `page, pageSize, spaceType` |
| `detail` | 获取需求详情 | `requestId` |
| `accept` | 接单 | `requestId` |

**`list` 查询条件**：
```javascript
const query = {
  status: 'submitted',
  isDelete: _.neq(1),
  designerId: _.exists(false)  // 未被接单
}
if (spaceType) query.space = spaceType
```

**`list` 返回字段**（不含客户手机号/联系方式）：
- space, service, budget, area, stage, priority, createdAt
- 计算字段：`isNew`（7天内）、`isExpiringSoon`（30天以上）、`tagType/tagText`

**`detail` 流程**：
1. 验证角色
2. 查 `requests` 集合的需求详情
3. **不返回** contact 字段（客户联系方式），仅在接单成功后通过项目详情接口返回

**`accept`（接单）防并发设计**：
```javascript
// 先读取当前状态
const req = await db.collection('requests').doc(requestId).get()
if (req.data.status !== 'submitted' || req.data.designerId) {
  return { success: false, code: 'ALREADY_TAKEN', message: '该需求已被接单' }
}
// 条件更新（只在 status='submitted' 时才成功）
const result = await db.collection('requests')
  .where({ _id: requestId, status: 'submitted' })
  .update({ data: { status: 'review', designerId, acceptedAt: Date.now() } })
// result.stats.updated === 0 表示并发抢单失败
if (result.stats.updated === 0) {
  return { success: false, code: 'ALREADY_TAKEN', message: '该需求已被接单' }
}
// 在 designer_orders 集合创建接单记录
await db.collection('designer_orders').add({ data: orderRecord })
```

---

### 2.4 `designer_projects` — 我的项目管理

**支持的 action**：

| action | 说明 | 关键参数 |
|--------|------|---------|
| `list` | 获取已接项目列表 | `page, pageSize, statusFilter` |
| `detail` | 获取项目详情（含联系方式） | `requestId` |
| `update_step` | 更新工作流阶段 | `requestId, stepKey, done` |

**状态过滤映射**（前端 tab → 数据库字段）：
```javascript
const STATUS_MAP = {
  'all':       null,                    // 不过滤
  'ongoing':   'review',               // 进行中
  'pending':   'submitted',            // 待确认（理论上接单后不应有此状态）
  'completed': 'done'                  // 已完成
}
```

**`detail` 流程**：
1. 验证角色，验证 designerId 匹配
2. 返回完整请求数据，**包含** contact 字段（已接单的设计师可看）

**`update_step` 流程**：
1. 验证角色和归属
2. 查找 steps 数组中 key === stepKey 的元素，更新 done 状态
3. 若所有 steps.done 均为 true，自动将 status 更新为 `'done'`，同时触发 `designers.projects` +1

---

### 2.5 `designer_settings` — 设计师设置

**支持的 action**：

| action | 说明 | 关键参数 |
|--------|------|---------|
| `get_notifications` | 获取通知设置 | 无 |
| `update_notifications` | 更新通知设置 | `settings: object` |

**通知设置默认值**：
```javascript
const DEFAULT_NOTIFICATIONS = {
  notifyNewDemand: true,
  notifyOrderProgress: true,
  notifySystem: false,
  dndMode: false
}
```

**存储位置**：`users` 集合的 `notificationSettings` 字段（对象类型）

**`update_notifications` 流程**：
1. 验证角色（设计师）
2. 只允许更新 `notifyNewDemand/notifyOrderProgress/notifySystem/dndMode` 四个布尔字段
3. 更新 `users` 集合：`{ 'notificationSettings.xxx': value }`

---

## 3. 数据库集合设计

### 3.1 `designers` 集合（扩展字段）

```javascript
{
  // 已有字段（保持兼容）
  _id: string,
  _openid: string,
  name: string,
  avatar: string,            // 与 users.avatarUrl 保持同步
  rating: number,
  projects: number,
  price: number,
  experience: number,
  specialties: Array,
  hasCalcExp: boolean,
  spaceType: Array,
  isDelete: number,
  createdAt: number,
  updatedAt: number,

  // 新增字段
  openid: string,            // 冗余存储，方便查询（等同 _openid）
  userId: string,            // 关联 users._id
  bio: string,               // 个人简介（≤200字）
  styles: string,            // 擅长风格描述
  phone: string,             // 手机号（仅接单方可见）
  wechat: string,            // 微信号（仅接单方可见）
  portfolioCount: number     // 作品集数量（自动维护）
}
```

### 3.2 `users` 集合（扩展字段）

```javascript
{
  // 已有字段（保持兼容）
  // ...
  
  // 新增字段
  notificationSettings: {
    notifyNewDemand: boolean,
    notifyOrderProgress: boolean,
    notifySystem: boolean,
    dndMode: boolean
  }
}
```

### 3.3 `designer_portfolios` 集合（新建）

```javascript
{
  _id: string,
  _openid: string,           // 设计师微信 openid（数据库权限绑定）
  designerId: string,        // designers._id
  title: string,             // 作品名称（1-30字）
  spaceType: string,         // 空间类型：住宅/商业/办公/艺术装置/景观
  description: string,       // 设计理念说明（≤500字）
  coverImage: string,        // 封面图 fileID（cloud://）
  galleryImages: Array,      // 项目图集 fileID 数组（1-9张）
  isDelete: number,          // 软删除标记（0正常，1已删除）
  createdAt: number,         // 创建时间戳
  updatedAt: number          // 更新时间戳
}
```

### 3.4 `designer_orders` 集合（新建）

```javascript
{
  _id: string,
  _openid: string,           // 设计师 openid
  designerId: string,        // designers._id
  requestId: string,         // requests._id
  requestOrderNo: string,    // 需求编号，冗余存储方便展示
  clientOpenid: string,      // 客户 openid（来自 requests._openid）
  status: string,            // active / completed / cancelled
  acceptedAt: number,        // 接单时间戳
  completedAt: number,       // 完成时间戳（可选）
  createdAt: number,
  updatedAt: number
}
```

---

## 4. 图片上传方案

采用**前端直传 + 云函数存 fileID** 模式，避免图片经过云函数中转：

```
前端页面                    云存储                    云函数/数据库
   │                          │                           │
   │── wx.cloud.uploadFile() ──→ 返回 fileID              │
   │                                                      │
   │── callFunction(designer_profile/designer_portfolios) │
   │   传入 fileID                                        │
   │                          │ ←── 存储 fileID ──────────│
   │                          │                           │
```

**云存储路径规范**：
- 设计师头像：`designer-avatars/{openid}/{timestamp}.jpg`
- 作品集封面：`portfolios/{designerId}/{portfolioId}/cover.jpg`
- 作品集图集：`portfolios/{designerId}/{portfolioId}/gallery_{0-8}.jpg`

**临时链接处理**：
- 列表接口：批量调用 `cloud.getTempFileURL` 转换所有 cloud:// 链接
- 详情接口：逐个转换

---

## 5. 权限与安全设计

### 5.1 统一权限验证流程

每个云函数均调用以下共用校验逻辑：

```javascript
async function verifyDesigner(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!res.data || res.data.length === 0) throw new Error('USER_NOT_FOUND')
  const user = res.data[0]
  if (user.roles !== 2) throw new Error('NOT_DESIGNER')
  return user
}
```

### 5.2 数据归属验证

- 作品集操作：验证 `portfolio.designerId === designer._id`
- 项目操作：验证 `request.designerId === designer._id`
- 接单操作：条件更新（`status === 'submitted'`），防止并发重复接单

### 5.3 敏感字段保护
- 需求列表/详情：不返回 `contact`（客户联系方式）
- 我的项目详情：返回 `contact`（已建立服务关系）
- 设计师档案公开接口（`designers_list`/`designer_detail`）：不返回 `phone`/`wechat`

---

## 6. 数据库索引建议

| 集合 | 索引字段 | 类型 | 原因 |
|------|---------|------|------|
| `requests` | `{ status, designerId }` | 复合 | 需求列表、我的项目查询 |
| `requests` | `{ designerId, createdAt }` | 复合 | 我的项目按时间排序 |
| `designer_portfolios` | `{ designerId, isDelete }` | 复合 | 作品集查询 |
| `designer_portfolios` | `{ designerId, spaceType }` | 复合 | 作品集类型筛选 |
| `designer_orders` | `{ designerId, status }` | 复合 | 接单记录查询 |

---

## 7. 云函数目录结构

```
cloudfunctions/
├── designer_profile/          # 设计师档案管理
│   ├── index.js
│   └── package.json
├── designer_portfolios/       # 作品集管理
│   ├── index.js
│   └── package.json
├── designer_demands/          # 需求大厅与接单
│   ├── index.js
│   └── package.json
├── designer_projects/         # 我的项目管理
│   ├── index.js
│   └── package.json
└── designer_settings/         # 设置管理
    ├── index.js
    └── package.json
```

---

## 8. 前端接入变更点

完成后端开发后，各页面需替换的核心 mock 数据如下：

| 页面 | 替换内容 |
|------|---------|
| `designer-profile` | `loadUserData()` 改调 `designer_profile` get |
| `designer-profile-edit` | `onSave()` 改调 `designer_profile` update |
| `designer-portfolios` | `loadPortfolios()` 改调 `designer_portfolios` list |
| `designer-portfolio-add` | `onSubmit()` 改为先 uploadFile 再调 `designer_portfolios` add |
| `designer-home` | `loadDemands()` 改调 `designer_demands` list |
| `designer-demands` | `loadDemands()` 改调 `designer_demands` list |
| `designer-demand-detail` | `loadDemandDetail()` 改调 `designer_demands` detail；抢单改调 `designer_demands` accept |
| `designer-projects` | 新增数据加载，调 `designer_projects` list |
| `designer-notifications` | `onLoad` 调 `designer_settings` get_notifications；每次 onChange 调 update_notifications |
