# 需求文档：设计师端需求大厅云函数功能完善

## 背景介绍

设计师端「需求大厅」是设计师发现并承接业主照明设计需求的核心入口。业主通过前端表单发布设计需求（存入 `requests` 集合，status='submitted'），设计师在需求大厅浏览、筛选、查看详情并**抢单**。

核心业务模型参照滴滴顺风车接单逻辑：**先到先得，原子竞争**——同一时刻多个已认证设计师看到同一条需求，谁先点"接单"且服务端原子更新成功，订单就归谁，其余人得到"已被抢单"的明确反馈并刷新列表。

### 现状分析

**已实现的云函数（`designer_demands`）：**
- `list` action：按 spaceType 筛选、分页获取可接单需求
- `detail` action：获取需求详情（隐藏联系方式）
- `accept` action：原子性接单（条件更新防并发），创建 `designer_orders` 记录

**已发现的缺陷：**
1. `enrichDemand` 函数未生成 `timeText` 字段，但前端需要展示相对时间（如"2天前"）
2. `designer-demands` 列表页"立即接单"按钮无 `bindtap` 事件绑定
3. 收藏功能仅本地状态切换，无云函数支持、无持久化
4. `designer_projects` 云函数 `STATUS_FILTER_MAP` 中 `pending` 状态未映射（前端"待确认"tab 无效）
5. 需求列表筛选"其他"分类与"全部"的 spaceType 同为 null，无法区分

---

## 需求列表

### 需求 1 - 需求列表字段完整性

**User Story：** 作为设计师，我希望在需求大厅看到每条需求的时间信息，以便判断需求的紧迫性。

#### 验收标准

1. When 设计师调用 `designer_demands` 云函数 `list` action 时，the system shall 在每条需求数据中返回 `timeText` 字段，格式为相对时间（如"刚刚"、"3小时前"、"2天前"、"5天前发布"）。
2. When `createdAt` 距今不足1小时，the system shall 返回 `timeText` 为"X分钟前"。
3. When `createdAt` 距今1小时至24小时内，the system shall 返回 `timeText` 为"X小时前"。
4. When `createdAt` 距今超过24小时，the system shall 返回 `timeText` 为"X天前发布"。
5. When `budget` 字段为数字时，the system shall 格式化为"¥X"；当为字符串时原样返回。

---

### 需求 2 - 列表页快速接单

**User Story：** 作为设计师，我希望在需求大厅列表页直接点击"立即接单"快速接单，不必每次都跳转到详情页。

#### 验收标准

1. When 设计师在 `designer-demands` 列表页点击"立即接单"按钮，the system shall 弹出确认弹窗，内容包含需求标题。
2. When 设计师确认接单后，the system shall 调用 `designer_demands` 云函数 `accept` action 完成接单。
3. When 接单成功后，the system shall 跳转至 `designer-order-success` 页面，并显示项目名称。
4. When 接单失败（需求已被抢占）时，the system shall 显示"该需求刚刚被接单，请选择其他需求"提示，并刷新列表。

---

### 需求 3 - 收藏需求功能

**User Story：** 作为设计师，我希望收藏感兴趣的需求，方便后续跟进，即使关闭小程序后收藏状态也能保留。

#### 验收标准

1. When 设计师在需求详情页点击"收藏"按钮，the system shall 调用 `designer_demands` 云函数 `collect` action，将需求 ID 记录到数据库。
2. When 已收藏的需求再次点击"收藏"按钮，the system shall 调用 `uncollect` action，取消收藏并更新图标状态。
3. When 设计师进入需求详情页时，the system shall 调用 `check_collect` action 查询当前需求的收藏状态，并同步显示正确的收藏图标。
4. While 设计师已登录，when 重新进入小程序，the system shall 保持需求收藏记录不丢失。
5. The system shall 将收藏记录存储到 `designer_favorites` 集合，字段包含：`designerId`、`requestId`、`createdAt`。

---

### 需求 4 - 需求筛选分类完善

**User Story：** 作为设计师，我希望筛选"其他"类型的需求（不含住宅/商铺/办公室的），以便接到更多样的订单。

#### 验收标准

1. When 设计师选择"其他"分类时，the system shall 筛选出 `space` 字段不属于 `['住宅', '商业', '办公']` 的需求。
2. When 设计师选择"全部"分类时，the system shall 不添加 spaceType 过滤条件，返回所有可接单需求。
3. The system shall 在云函数入参中通过新增 `spaceType: 'other'` 标识"其他"分类，与 `null`（全部）区分。

---

### 需求 5 - 设计师项目"待确认"状态修复

**User Story：** 作为设计师，我希望在"我的项目"中看到"待确认"tab 的项目列表，以便跟进待业主确认的设计方案。

#### 验收标准

1. When 设计师在"我的项目"点击"待确认"tab，the system shall 通过 `designer_projects` 云函数 `list` action 查询 `status='pending'` 的记录并返回。
2. The system shall 在 `STATUS_FILTER_MAP` 中补充映射 `pending: 'pending'`，对应 requests 集合中 status='pending' 的记录。
3. When `status='pending'` 的项目列表为空时，the system shall 返回空数组，不报错。

---

### 需求 6 - 实时竞争抢单机制（核心）

**User Story：** 作为已认证的设计师，我希望在需求大厅与其他设计师实时竞争抢单，谁先点接单谁得到订单，公平透明，类似滴滴顺风车的抢单体验。

#### 业务流程

```
业主发布需求
    ↓ status = 'submitted'，designerId 不存在
所有已认证设计师看到此需求
    ↓ 多人同时点击"立即接单"
服务端原子条件更新（仅 status='submitted' AND designerId 不存在 才成功）
    ↓ 第一个请求成功
先抢到的设计师 → status='review'，designerId 写入
其余设计师    → 返回 ALREADY_TAKEN，提示"已被抢单"
    ↓
需求从公共大厅消失，进入设计师"我的项目"
```

#### 验收标准

1. **资质前置验证**：When 设计师点击接单时，the system shall 验证该用户的 `users.roles === 2`（设计师身份），非设计师返回 `NOT_DESIGNER` 错误。
2. **原子抢单**：When 多个设计师同时发起 `accept` 请求，the system shall 使用数据库条件更新（`status='submitted' AND designerId 不存在`），确保只有一人接单成功，其余全部失败。
3. **抢单成功反馈**：When 设计师接单成功时，the system shall 返回成功结果，前端跳转 `designer-order-success` 页面，并传递项目名称参数。
4. **抢单失败反馈**：When 设计师接单时需求已被他人抢占，the system shall 返回 `ALREADY_TAKEN` 错误码，前端显示弹窗"手慢了，该需求已被其他设计师接单"并自动刷新列表移除该需求。
5. **防重复接单**：When 同一设计师对同一需求发起第二次 `accept` 请求，the system shall 检测 `requests.designerId === 当前设计师ID`，返回 `ALREADY_MINE` 错误码，提示"您已接过此单"。
6. **接单记录**：When 接单成功时，the system shall 在 `designer_orders` 集合写入接单记录，包含 `designerId`、`requestId`、`clientOpenid`、`status: 'active'`、`acceptedAt`。
7. **需求列表实时剔除**：When 设计师的需求列表页重新拉取（下拉刷新或重新进入页面）时，the system shall 仅返回 `status='submitted' AND designerId 不存在` 的需求，已被接单的需求不再出现。
8. **并发压力**：The system shall 在至少 10 个设计师同时抢单的场景下，确保只有 1 条接单成功记录，不出现重复接单。
