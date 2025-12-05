## 变更范围
- AppID：将全项目的 AppID 统一为 `wxe8b6b3aed51577e0`（权威来源：`project.config.json`）。
- 云环境 ID：将所有 `wx.cloud.init` 与云函数 `cloud.init` 的 `env` 统一为 `cloud1-5gb9c5u2c58ad6d7`。

## 具体修改
- 更新 AppID：
  - `project.config.json`：将 `"appid"` 从 `wx72bebce8dc750eb6` 修改为 `wxe8b6b3aed51577e0`。
  - 同步文档说明：更新 `CLAUDE.md` 中的 AppID 引用；在 `DEPLOYMENT_GUIDE.md` 补充默认 AppID 说明。
- 更新云环境 ID（硬编码处）：
  - 小程序端：`app.js:12` → `env: 'cloud1-5gb9c5u2c58ad6d7'`。
  - 云函数入口：将以下文件首行初始化统一改为 `env: 'cloud1-5gb9c5u2c58ad6d7'`：
    - `cloudfunctions\requests_create\index.js:3`
    - `cloudfunctions\users_set_role\index.js:3`
    - `cloudfunctions\users_migrate_roles\index.js:3`
    - `cloudfunctions\initCollections\index.js:3`
    - `cloudfunctions\login\index.js:3`
    - `cloudfunctions\admin_list_orders\index.js:3`
    - `cloudfunctions\requests_remove\index.js:3`
    - `cloudfunctions\requests_update\index.js:3`
    - `cloudfunctions\orders_remove\index.js:3`
    - `cloudfunctions\orders_update\index.js:3`
    - `cloudfunctions\orders_create\index.js:3`
    - `cloudfunctions\setup_indexes\index.js:4`
    - `cloudfunctions\getPhoneNumber\index.js:3`
    - `cloudfunctions\appointments_create\index.js:3`
    - `cloudfunctions\designer_detail\index.js:3`
    - `cloudfunctions\designers_list\index.js:3`
- 动态 env 处理：
  - `cloudfunctions\setup_indexes\index.js` 中后续使用 `process.env.ENV_ID` 的位置保持不变；如需统一行为，新增默认值逻辑：当环境变量缺失时使用 `cloud1-5gb9c5u2c58ad6d7`。

## 验证步骤
- 在微信开发者工具中打开项目：确认顶部显示 AppID 为 `wxe8b6b3aed51577e0`，项目可正常预览。
- 云环境绑定检查：在云开发控制台确认 `cloud1-5gb9c5u2c58ad6d7` 已对该小程序 AppID 授权/绑定，否则会报权限错误。
- 部署与冒烟测试：
  - 重新上传并部署所有云函数到新环境。
  - 在小程序端调用关键云函数（如 `login`、`orders_create`）验证数据库读写正常。
- 索引与集合：执行一次 `setup_indexes` 与 `initCollections`，确认在新环境下成功创建需要的集合与索引。

## 风险与注意
- 权限与绑定：更换 AppID 与环境 ID 后需确保账号具备新环境的读写权限；未绑定会导致 `unauthorized` 或 `no permission`。
- 数据隔离：新环境与旧环境数据完全隔离；迁移需提前导出/导入数据库数据。
- 团队差异：成员本地可能存在 `project.private.config.json` 覆盖；需统一更新或移除覆盖项。

## 回滚方案
- 将 `project.config.json` 的 `"appid"` 改回 `wx72bebce8dc750eb6`。
- 将上述所有 `cloud.init`/`wx.cloud.init` 的 `env` 改回 `cloud1-1gqerbbu347adc17`。
- 如文档已同步，恢复到之前描述以避免误导。