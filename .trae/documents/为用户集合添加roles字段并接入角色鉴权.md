## 目标
- 在 `users` 集合新增数值型字段 `roles`：0=管理员，1=普通用户，2=设计师。
- 接入登录/更新流程与云函数权限校验，完成角色鉴权。
- 将 `_id=cc84495d691d142a0416de0b11fe05d7` 的用户设置为管理员（`roles=0`）。

## 数据模型
- 集合：`users`
- 新字段：`roles`（Number），默认 `1`；旧数据缺失视为 `1` 并回填。
- 仅云函数可写 `roles`；客户端不可直接修改。

## 新用户创建与更新
- `cloudfunctions/login/index.js`
  - 新建用户时写入 `roles: 1`；旧用户补全资料时如缺失则补写为 `1`，不覆盖已有值。
- `utils/api.js`
  - `create/update` 保持通用资料写入；`roles` 的赋值由云端统一负责。

## 现有数据迁移
- 新增云函数 `cloudfunctions/users_migrate_roles`：
  - 扫描 `users` 中缺 `roles` 的文档，批量更新为 `roles: 1`（幂等）。
  - 额外执行：将 `_id=cc84495d691d142a0416de0b11fe05d7` 的文档更新为 `roles: 0`，设为管理员。
  - 仅管理员可调用该迁移函数（首次可通过 OpenID 白名单或预置 `_id` 检查放行）。

## 角色鉴权能力
- 公共鉴权模块：
  - 前端 `utils/auth.js`：`isAdmin`,`isDesigner`,`requireRole`（仅用于展示控制）。
  - 云函数 `cloudfunctions/common/auth.js`：使用 `getWXContext().openid` 读用户并校验 `roles`，拒绝不合规请求。

## 云函数权限收敛
- `cloudfunctions/initCollections/index.js`：仅管理员可运行。
- `cloudfunctions/requests_create` 等业务函数：
  - 普通用户可发起；管理员/设计师根据业务进行审核/处理。
  - 在入口统一调用公共鉴权，绝不信任客户端传参。

## 前端展示与控制
- 启动时缓存并使用 `userDoc.roles`；缺失按 `1` 显示并触发回填。
- 管理/设计功能入口按 `roles` 控制显示；资料编辑页不允许修改 `roles`。

## 管理能力
- 新增云函数 `users_set_role`：
  - 仅管理员可调用，入参为目标用户 `_id` 与目标 `roles`（0/1/2）。
  - 支持后续变更角色；首位管理员由迁移函数设定。

## 验证与回滚
- 验证：
  - 迁移后检查 `_id=cc84495d691d142a0416de0b11fe05d7` 的用户为 `roles=0`。
  - 新用户创建为 `roles=1`；不同角色访问受限云函数行为符合预期。
- 回滚：临时放宽鉴权或移除入口校验，确保紧急可用。

## 交付内容
- 数据结构：`users.roles`（默认 1）。
- 云函数：`login` 默认值处理、公共鉴权模块、受限入口接入鉴权。
- 迁移：`users_migrate_roles`（包含将指定 `_id` 设为管理员）。
- 管理：`users_set_role`。
- 前端：`utils/auth.js` 与 UI 显示控制。