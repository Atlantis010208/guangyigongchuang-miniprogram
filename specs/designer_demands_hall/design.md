# 技术方案设计：设计师端需求大厅云函数功能完善

## 1. 技术架构

```
前端小程序
├── pages/designer-demands/       需求大厅列表页
├── pages/designer-demand-detail/ 需求详情 + 抢单 + 收藏
└── pages/designer-projects/      我的项目（含待确认tab）

           ↕ wx.cloud.callFunction

云函数层
├── designer_demands (扩展)       list / detail / accept / collect / uncollect / check_collect
└── designer_projects (修复)      list / detail / update_step

           ↕ 云数据库 SDK

数据库集合
├── requests          业主需求（主数据）
├── designer_orders   接单记录
├── designer_favorites 设计师收藏记录（新增）
└── designers         设计师档案（验证用）
```

**技术栈：** 微信云开发，`wx-server-sdk ~2.6.3`，云数据库原子操作

---

## 2. 数据库设计

### 2.1 `requests` 集合（已有，关键字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 文档ID |
| `status` | string | `submitted`→`review`→`pending`→`done`→`cancelled` |
| `space` | string | 空间类型：住宅 / 商业 / 办公 / 其他 |
| `area` | number/string | 设计面积 |
| `budget` | string/number | 设计预算 |
| `service` | string | 服务需求描述 |
| `stage` | string | 装修阶段（硬装/精装等，业主填写） |
| `designerId` | string | 接单设计师ID（接单后写入，未接单时不存在） |
| `designerOpenid` | string | 接单设计师openid |
| `acceptedAt` | number | 接单时间戳 |
| `priority` | string | 优先级：`urgent` 加急 |
| `isUrgent` | boolean | 是否加急（兼容旧字段） |
| `isDelete` | number | 软删除：0正常，1删除 |
| `createdAt` | number | 创建时间戳（毫秒） |
| `_openid` | string | 业主openid |

### 2.2 `designer_orders` 集合（已有，关键字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | string | 设计师openid |
| `designerId` | string | 设计师档案ID |
| `requestId` | string | 需求ID |
| `clientOpenid` | string | 业主openid |
| `status` | string | `active` / `completed` / `cancelled` |
| `acceptedAt` | number | 接单时间戳 |

### 2.3 `designer_favorites` 集合（**新增**）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | string | 设计师openid（云数据库自动写入） |
| `designerId` | string | 设计师档案ID |
| `requestId` | string | 被收藏的需求ID |
| `createdAt` | number | 收藏时间戳 |

**索引建议：** `{ designerId: 1, requestId: 1 }` 唯一索引（防重复收藏）

---

## 3. 云函数 API 设计

### 3.1 `designer_demands` 云函数（扩展现有）

#### 统一入参/出参格式

```
入参：{ action, ...params }
出参：{ success: boolean, code: string, message: string, data: any }
```

#### Action 列表

| action | 说明 | 关键入参 | 关键出参 |
|--------|------|----------|----------|
| `list` | 需求列表（修复timeText、budget格式化、other筛选） | `page`, `pageSize`, `spaceType` | `{ list, total, hasMore }` |
| `detail` | 需求详情（不含联系方式） | `requestId` | 需求对象 |
| `accept` | **原子抢单**（防重复、ALREADY_MINE检测） | `requestId` | `{ requestId, designerId, acceptedAt }` |
| `collect` | 收藏需求 | `requestId` | `{ requestId }` |
| `uncollect` | 取消收藏 | `requestId` | `{ requestId }` |
| `check_collect` | 查询是否已收藏 | `requestId` | `{ isCollected: boolean }` |

#### `list` action 详细设计

```
spaceType 入参处理：
  null / undefined → 不加空间过滤（全部）
  'other'          → space NOT IN ['住宅', '商业', '办公']（新增）
  其他字符串        → space === spaceType

enrichDemand 新增字段：
  timeText: 相对时间
    < 1min  → "刚刚"
    < 1h    → "X分钟前"
    < 24h   → "X小时前"
    >= 24h  → "X天前发布"
  
  budget: 格式化
    number → "¥" + 数字.toLocaleString()
    string → 原样返回（业主可能已填"3000-5000元"）
```

#### `accept` action 详细设计（原子抢单核心）

```
Step 1: verifyDesigner(openid) → 获取 user & designer
        user.roles !== 2 && user.roles !== 0 → throw NOT_DESIGNER
        designer 不存在 → return NOT_FOUND（档案未完善）

Step 2: db.collection('requests').doc(requestId).get()
        记录不存在    → return NOT_FOUND
        isDelete===1  → return NOT_FOUND
        status !== 'submitted' → 
          designerId === designer._id → return ALREADY_MINE（自己已接）
          else                        → return ALREADY_TAKEN（他人已接）
        designerId 存在且 !== designer._id → return ALREADY_TAKEN

Step 3: 条件更新（原子操作）
        db.collection('requests')
          .where({ _id: requestId, status: 'submitted', designerId: _.exists(false) })
          .update({ status: 'review', designerId, designerOpenid, acceptedAt, updatedAt })
        stats.updated === 0 → return ALREADY_TAKEN（并发场景下被抢占）

Step 4: 写入 designer_orders（try-catch，失败不影响主流程）

Step 5: return { success: true, data: { requestId, designerId, acceptedAt } }
```

#### `collect` / `uncollect` / `check_collect` 设计

```javascript
// collect: 幂等插入（已存在则不报错）
designer_favorites.where({ designerId, requestId }).get()
  → count > 0 → 直接返回成功（幂等）
  → count = 0 → add({ _openid, designerId, requestId, createdAt })

// uncollect: 删除记录
designer_favorites.where({ designerId, requestId }).remove()

// check_collect: 查询存在性
designer_favorites.where({ designerId, requestId }).count()
  → { isCollected: total > 0 }
```

### 3.2 `designer_projects` 云函数（修复）

```javascript
// 修复 STATUS_FILTER_MAP，补充 pending 映射
const STATUS_FILTER_MAP = {
  all:       null,
  ongoing:  'review',
  pending:  'pending',   // ← 新增
  design:   'design',
  completed: 'done'
}

// STATUS_TEXT_MAP 补充
const STATUS_TEXT_MAP = {
  ...
  pending: '待确认',     // ← 新增
}
```

---

## 4. 前端改动设计

### 4.1 `designer-demands.js` — 列表页

```javascript
// 新增：列表页"立即接单"快速接单
onAcceptInList(e) {
  const { id, title } = e.currentTarget.dataset
  // 1. showModal 确认
  // 2. callFunction accept
  // 3. 成功 → navigateTo order-success
  //    ALREADY_TAKEN → showModal "手慢了" + loadDemands(true) 刷新
}
```

### 4.2 `designer-demands.wxml` — 列表页

```xml
<!-- 绑定 data-id 和 data-title，添加 bindtap -->
<button class="btn-primary" bindtap="onAcceptInList" 
        data-id="{{item._id}}" data-title="{{item.title}}">
  立即接单
</button>
```

### 4.3 `designer-demand-detail.js` — 详情页

```javascript
// onLoad 时同步调用 check_collect 初始化收藏状态
// onToggleCollect 改为真实调用云函数 collect/uncollect
// onTakeOrder 失败时增加 ALREADY_TAKEN 弹窗 + 刷新逻辑
```

### 4.4 `designer-demands.js` — 分类映射修复

```javascript
const CATEGORY_SPACE_MAP = {
  '全部':   null,
  '住宅':   '住宅',
  '商铺':   '商业',
  '办公室': '办公',
  '其他':   'other'   // ← 修复：由 null 改为 'other'
}
```

---

## 5. 并发安全方案

微信云数据库的 `.where().update()` 是**原子操作**，底层基于 MongoDB 的原子写操作，天然保证：

- 10 个设计师并发发起 `accept` → 数据库序列化执行条件更新
- 只有第一个满足 `status='submitted' AND designerId 不存在` 的请求成功更新
- 其余 9 个 `stats.updated === 0` → 返回 `ALREADY_TAKEN`
- **无需 Redis、无需分布式锁**

---

## 6. 测试策略

| 场景 | 验证方法 |
|------|---------|
| timeText 格式化 | 手动修改 createdAt 为不同时间，检查返回值 |
| 正常接单流程 | 单设计师接单 → 检查 requests.status 变为 review |
| 并发抢单 | 模拟工具同时调用 accept × 5，检查只有 1 条 designer_orders |
| ALREADY_TAKEN | 第一次接单成功后，再次调用 accept，检查返回 ALREADY_TAKEN |
| ALREADY_MINE | 同一设计师对已接订单再次 accept，检查返回 ALREADY_MINE |
| 收藏幂等 | 连续调用 collect 两次，检查 designer_favorites 只有 1 条 |
| 取消收藏 | collect → uncollect → check_collect 返回 false |
| 其他分类筛选 | spaceType='other'，检查返回结果不含住宅/商业/办公 |
| pending tab | designer_projects list statusFilter='pending'，检查不报错 |
