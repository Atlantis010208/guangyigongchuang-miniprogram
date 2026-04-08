# 实施计划：设计师个人中心设置功能

## 任务列表

- [ ] 1. 扩展 `designer_settings` 云函数 —— 新增 4 个 action
  - 在 `switch` 中注册 `get_privacy`、`update_privacy`、`get_security_info`、`logout`
  - 新增 `DEFAULT_PRIVACY` 常量和 `ALLOWED_PRIVACY_FIELDS` 白名单
  - 新增 `verifyUser`（只校验 openid，不校验角色，供 `logout` 使用）
  - 实现 `getPrivacy(openid)` 函数
  - 实现 `updatePrivacy(openid, settings)` 函数
  - 实现 `getSecurityInfo(openid)` 函数（手机号脱敏、微信绑定状态、查 designers 集合）
  - 实现 `logout(openid)` 函数（更新 `loginExpireAt`）
  - 更新文件头部注释，说明所有支持的 action
  - _需求: 需求 1、需求 2、需求 3_

- [ ] 2. 部署更新后的 `designer_settings` 云函数
  - 调用 MCP 工具自动部署
  - _需求: 全部_

- [ ] 3. 前端接入 `designer-privacy.js`
  - `onLoad` → 调用 `get_privacy`，回显开关状态
  - `onChangePortfolio` / `onChangeConsult` / `onChangeRating` → 调用 `update_privacy`，失败时回滚开关
  - _需求: 需求 1_

- [ ] 4. 前端接入 `designer-security.js` 和 `designer-security.wxml`
  - `onLoad` → 调用 `get_security_info`，将结果写入 `data`
  - `designer-security.wxml` 替换硬编码：`{{maskedPhone}}`、`{{wechatBound}}`、`{{realNameVerified}}`
  - _需求: 需求 2_

- [ ] 5. 前端接入 `designer-settings.js` 退出登录
  - `onLogout` 中先调用 `logout` action（失败忽略），再清缓存并跳转 splash
  - _需求: 需求 3_
