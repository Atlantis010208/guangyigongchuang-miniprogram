# 任务目标
- 为 `designers` 集合填充初始数据（10–20 条），覆盖基础字段与案例/标签，保证列表与详情联通后可正常展示与筛选排序。

# 字段规范
- 基础：`name`,`title`,`avatarUrl`,`heroImage`,`portfolioLayout`
- 指标：`rating(Number)`,`projectCount(Number)`,`pricePerSqm(Number)`,`hasCalcExperience(Boolean)`
- 介绍：`introduction`,`qualifications(Array<String>)`
- 展示：`images(Array<fileID>)` 或 `cases(Array<{title,coverUrl,area,type,span,hasGallery}>)`
- 标签：`specialties(Array<String>)` 或 `tags(Array<String>)`
- 维护：`createdAt(Number)`,`updatedAt(Number)`

# 数据来源与填充方式
- 来源：参考先前模拟数据结构（`pages/designers/list/list.js` 与 `pages/designers/detail/detail.js` 的字段形态）。
- 方式（二选一）：
  1) 控制台手动/批量导入：在云开发控制台 → 数据库 → `designers` → 导入 JSON，批量写入示例数据；图片字段可先用占位 http 链接，后续迁移到 `cloud://`。
  2) 临时云函数播种法：创建一次性 `designers_seed` 云函数批量 `add`；播种完成后删除/停用该函数。

# 验证
- 云函数：调用 `designers_list`（已存在）进行多条件筛选与排序，确保返回非空（`pages/designers/list/list.js:32-42` 触发调用）。
- 页面：在列表页与详情页分别抽样检查展示，确认图片/文本渲染正确，排序稳定（评分、项目数、价格）。

# 文档更新（任务前/任务后）
- 位置：`docs/backend-task-list.md` 末尾追加两段：
  - 任务前：`designers` 为空或缺少规范数据；列出拟写字段清单与示例结构；涉及文件引用（`pages/designers/list/list.js:32`，`pages/designers/detail/detail.js:44`）。
  - 任务后：填充记录数、关键字段覆盖率、调用与页面验证结果（含筛选/排序/分页）；后续图片迁移计划说明。

# 注意事项
- 权限：`designers` 集合保持“仅管理端可写，所有人可读”。
- 索引：数据填充后再验证排序与筛选性能，若需要将建议索引全部启用（`rating(-1)`,`projectCount(-1)`,`pricePerSqm(1)`）。
- 图片：先占位，后在任务 6 进行云存储迁移并统一使用 `getTempFileURL`。

# 执行确认
- 请确认按此方案执行任务 1（数据填充与文档更新）。完成后我会立刻更新 MD 文档，并询问是否继续执行任务 2（列表页联通与筛选分页完善）。