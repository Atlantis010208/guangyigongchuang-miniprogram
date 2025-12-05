## 目标

* 在 `users` 集合为当前开发账号创建管理员（`roles: 0`），用于后续受控初始化与运维。

## 实施方案

### 方案 A（推荐）：新增一次性引导云函数

* 新增云函数：`cloudfunctions/bootstrap_make_me_admin`

* 逻辑：

  1. `cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })`
  2. 检查是否已有管理员：`db.collection('users').where({ roles: 0 }).limit(1).get()`；若存在，返回 `FORBIDDEN`。
  3. 通过 `cloud.getWXContext()` 获取当前调用者 `OPENID`；查询/创建对应 `users` 文档（按 `_openid`），将 `roles: 0`，并更新 `updatedAt`。
  4. 返回 `{ success: true, user }`。

* 部署与调用：

  * 在微信开发者工具中“上传并部署（云端安装依赖）”该函数

  * 在云函数面板直接调用一次即可完成提权

* 后续：完成后可保留函数（仅首管控）或删除避免误用

<br />

## 验证步骤

* 调用后在云数据库 `users` 集合查看：应出现你的账号记录且 `roles: 0`

* 使用管理员权限调用：

  * `initCollections`：应不再被权限阻塞，可创建所有集合

  * `setup_indexes`：可在设置 `ENV_ID` 与 `CLOUDBASE_ACCESS_TOKEN` 后创建索引

## 风险与注意

* 自举权限仅在“无管理员”时启用，防止重复提权与越权操作

* 建议把引导函数命名明显并仅使用一次；完成后可删除或加开关变量控制

* 如果当前账号尚未在 `users` 集合，函数会自动创建基础档案后再设为管理员

## 回滚

* 如需撤销管理员：使用 `users_set_role`（由现有管理员调用）将你的 `roles` 改回 `1`

