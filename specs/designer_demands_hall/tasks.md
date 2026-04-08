# 实施计划：设计师端需求大厅云函数功能完善

## 任务总览

共 8 个任务，分 3 个模块：
- **模块 A**：`designer_demands` 云函数修复与扩展（任务 1-3）
- **模块 B**：`designer_projects` 云函数修复（任务 4）
- **模块 C**：前端页面修复（任务 5-7）
- **模块 D**：部署（任务 8）

---

## 模块 A：designer_demands 云函数

- [x] 1. 修复 `enrichDemand` — 补充 `timeText` 与 `budget` 格式化
  - 在 `enrichDemand` 函数中计算相对时间字段 `timeText`（刚刚 / X分钟前 / X小时前 / X天前发布）
  - 对 `budget` 字段做格式化：number 类型加 "¥" 前缀，string 原样返回
  - _需求：需求1_

- [x] 2. 修复 `list` action — `spaceType='other'` 筛选逻辑
  - 当 `spaceType === 'other'` 时，使用 `_.nin(['住宅','商业','办公'])` 过滤 `space` 字段
  - 当 `spaceType` 为 null/undefined 时不加过滤（全部）
  - _需求：需求4_

- [x] 3. 扩展 `accept` action — 增加 `ALREADY_MINE` 防重复接单检测
  - 在条件更新前，增加判断：若 `demand.designerId === designer._id` 则返回 `ALREADY_MINE`
  - _需求：需求6.5_

- [x] 4. 新增 `collect` / `uncollect` / `check_collect` action
  - `collect`：幂等插入 `designer_favorites`（先查重，存在则直接返回成功）
  - `uncollect`：删除 `designer_favorites` 中对应记录
  - `check_collect`：查询 count，返回 `{ isCollected: boolean }`
  - _需求：需求3_

---

## 模块 B：designer_projects 云函数

- [x] 5. 修复 `STATUS_FILTER_MAP` — 补充 `pending` 状态映射
  - `STATUS_FILTER_MAP` 中增加 `pending: 'pending'`
  - `STATUS_TEXT_MAP` 中增加 `pending: '待确认'`
  - _需求：需求5_

---

## 模块 C：前端页面

- [x] 6. `designer-demands` 列表页 — 快速接单
  - `designer-demands.js`：新增 `onAcceptInList(e)` 方法，读取 `data-id` / `data-title`，调用 accept，处理 ALREADY_TAKEN（弹窗 + 刷新）
  - `designer-demands.js`：修复 `CATEGORY_SPACE_MAP`，将 `'其他'` 的值由 `null` 改为 `'other'`
  - `designer-demands.wxml`：为"立即接单"按钮添加 `bindtap="onAcceptInList"` 和 `data-id`/`data-title`
  - _需求：需求2、需求4_

- [x] 7. `designer-demand-detail` 详情页 — 收藏持久化 + 抢单失败优化
  - `designer-demand-detail.js`：`loadDemandDetail` 成功后调用 `check_collect` 初始化 `isCollected` 状态
  - `designer-demand-detail.js`：`onToggleCollect` 改为调用云函数 `collect`/`uncollect`，失败时回滚本地状态
  - `designer-demand-detail.js`：`onTakeOrder` 失败分支增加 `ALREADY_TAKEN` 专属弹窗（"手慢了，该需求已被其他设计师接单"）+ 调用 `onBack()` 返回列表
  - _需求：需求3、需求6.4_

---

## 模块 D：部署

- [x] 8. 部署云函数到云开发环境
  - 部署 `designer_demands`（含所有修改）
  - 部署 `designer_projects`（含 pending 修复）
  - _环境：cloud1-5gb9c5u2c58ad6d7_
