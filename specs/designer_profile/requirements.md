# 需求文档：设计师端个人中心后端云函数开发

## 介绍

**光乙共创平台**的设计师端目前有完整的前端 UI 界面，但所有页面均使用静态 mock 数据，没有任何真实云函数支持。本次开发目标是为设计师端个人中心体系补全全部后端云函数，实现数据的云端存储、读取与操作，使设计师能够管理个人资料、展示作品集、接单管理项目、配置通知偏好。

**涉及页面**：
- `pages/designer-profile` — 个人资料展示
- `pages/designer-profile-edit` — 编辑个人资料
- `pages/designer-portfolios` — 作品集管理
- `pages/designer-portfolio-add` — 添加作品
- `pages/designer-home` — 需求大厅（首页）
- `pages/designer-demands` — 全部需求列表
- `pages/designer-demand-detail` — 需求详情与接单
- `pages/designer-projects` — 我的项目
- `pages/designer-notifications` — 消息通知设置

**用户角色**：设计师（`roles: 2`），通过白名单审核后获得身份

---

## 需求列表

### 需求 1 — 设计师档案管理

**User Story**：作为一名设计师，我希望能查看和编辑自己的专业档案，包括姓名、简介、从业年限、擅长风格、联系方式，以便向客户展示专业形象。

#### 验收标准

1. When 设计师进入个人资料页，the 系统 shall 从 `designers` 集合加载当前设计师的完整档案数据，并渲染到页面；若档案不存在则从 `users` 集合初始化基础字段。
2. When 设计师提交编辑表单，the 系统 shall 验证字段合法性（姓名1-20字、简介不超过200字、年限为正整数），通过验证后更新 `designers` 集合对应文档，并返回更新后的完整档案。
3. When 设计师选择更换头像并确认上传，the 系统 shall 将图片上传至云存储路径 `designer-avatars/{openid}/{timestamp}.jpg`，获取 fileID 后更新档案，并返回临时访问链接。
4. While 设计师档案存在，when 其他用户查询该设计师详情，the 系统 shall 返回档案中非敏感信息（不含手机号和微信号），敏感信息仅在预约确认后对预约方可见。
5. When 设计师档案更新成功，the 系统 shall 同步更新 `users` 集合中对应的 `nickname` 和 `avatarUrl` 字段，保持两个集合的基础信息一致。

---

### 需求 2 — 作品集管理

**User Story**：作为一名设计师，我希望能管理自己的设计作品集，包括上传项目封面、添加多张项目图、填写设计说明，以便展示设计能力并吸引客户。

#### 验收标准

1. When 设计师进入作品集页面，the 系统 shall 从 `designer_portfolios` 集合查询属于该设计师的全部作品，按创建时间降序返回，支持按空间类型筛选。
2. When 设计师提交新作品表单，the 系统 shall 将封面图和项目图集批量上传至云存储路径 `portfolios/{designerId}/{portfolioId}/`，保存记录到 `designer_portfolios` 集合，并返回新建作品文档。
3. The 系统 shall 对单个作品的图片数量进行验证：封面图必须1张，项目图集1-9张，超出则返回错误。
4. When 设计师删除作品，the 系统 shall 执行软删除（设置 `isDelete: 1`），同时从 `designers` 集合的 `portfolioCount` 字段中减去1。
5. When 作品集发生增减变化，the 系统 shall 更新 `designers` 集合中 `portfolioCount` 字段，保持统计数据准确。

---

### 需求 3 — 需求大厅（客户需求浏览与接单）

**User Story**：作为一名设计师，我希望能浏览客户发布的设计需求，按空间类型筛选，查看需求详情后决定是否接单，以便高效匹配适合自己的项目。

#### 验收标准

1. When 设计师进入需求大厅，the 系统 shall 从 `requests` 集合查询 `status: 'submitted'`、`isDelete` 不为1、且未被其他设计师接单的需求，按 `priority` 降序、`createdAt` 降序排列，支持分页（每页20条）。
2. When 设计师按空间类型筛选，the 系统 shall 在查询条件中增加 `space` 字段过滤，返回对应分类的需求列表。
3. When 设计师查看需求详情，the 系统 shall 返回该需求的完整信息，包括空间类型、服务类型、面积、预算、项目阶段、是否加急；但不返回客户手机号等敏感信息。
4. When 设计师点击接单并确认，the 系统 shall 验证该设计师角色为2，检查需求未被其他设计师接单，然后将 `requests` 集合该文档的 `status` 更新为 `'review'`，写入 `designerId` 字段，并在 `designer_orders` 集合创建设计师订单记录，返回操作结果。
5. While 设计师接单成功，when 同一需求被其他设计师并发请求，the 系统 shall 返回错误"该需求已被接单"，防止重复接单（使用事务或条件更新）。
6. When 需求已超过30天仍为 `submitted` 状态，the 系统 shall 在列表中标记为"即将过期"（前端展示，后端返回 `isExpiringSoon: true`）。

---

### 需求 4 — 我的项目管理

**User Story**：作为一名设计师，我希望能查看自己已接单的所有项目，按状态分类（进行中/待确认/已完成），并能查看每个项目的详细信息，以便跟踪项目进度。

#### 验收标准

1. When 设计师进入"我的项目"页面，the 系统 shall 从 `requests` 集合查询 `designerId` 等于当前设计师ID的文档，按创建时间降序返回，支持按 `status` 筛选（`all`/`review`/`design`/`done`）。
2. The 系统 shall 将项目状态映射为前端可显示文本：`submitted`→"待接单"，`review`→"进行中"，`design`→"设计中"，`done`→"已完成"。
3. When 设计师查看项目详情，the 系统 shall 返回该请求的完整信息，包括客户联系方式、8阶段工作流状态 `steps` 数组、项目参数。
4. When 设计师更新项目工作流阶段，the 系统 shall 更新 `requests` 集合中对应文档的 `steps` 数组和 `status` 字段，记录操作时间。

---

### 需求 5 — 消息通知设置

**User Story**：作为一名设计师，我希望能自定义各类消息通知的开关（新需求通知、订单进度通知、系统通知、免打扰模式），以便控制接收信息的频率。

#### 验收标准

1. When 设计师进入通知设置页，the 系统 shall 从 `users` 集合中的 `notificationSettings` 字段（或默认值）加载当前通知偏好。
2. When 设计师切换某通知开关，the 系统 shall 立即将更改保存到 `users` 集合的 `notificationSettings` 字段，返回保存成功状态。
3. The 系统 shall 定义通知设置默认值：`notifyNewDemand: true`，`notifyOrderProgress: true`，`notifySystem: false`，`dndMode: false`。
4. When 设置保存成功后页面重新进入，the 系统 shall 加载并展示上次保存的通知设置状态（持久化，非 session 级别）。

---

### 需求 6 — 设计师统计数据

**User Story**：作为一名设计师，我希望在个人资料页看到真实的统计数据（已完成项目数、平均评分、从业年限），以增强对客户的信任感。

#### 验收标准

1. When 个人资料页加载，the 系统 shall 从 `designers` 集合读取 `projects`（完成项目数）、`rating`（平均评分）、`experience`（从业年限）字段，若为初始设计师则返回默认值（projects:0, rating:5.0, experience:0）。
2. When 设计师成功完成一个项目（`status` 更新为 `done`），the 系统 shall 自动将 `designers` 集合中该设计师的 `projects` 计数加1。
3. The 系统 shall 在 `designers` 集合中维护 `portfolioCount` 字段，随作品集增减自动更新，无需前端计算。

---

## 数据集合说明

本次开发涉及以下数据集合：

| 集合名 | 用途 | 状态 |
|--------|------|------|
| `users` | 用户基础信息（含通知设置） | 已存在 |
| `designers` | 设计师专业档案 | 已存在（需扩展字段） |
| `requests` | 客户设计需求 | 已存在 |
| `appointments` | 预约记录 | 已存在 |
| `designer_portfolios` | 设计师作品集 | **需新建** |
| `designer_orders` | 设计师接单记录 | **需新建** |
