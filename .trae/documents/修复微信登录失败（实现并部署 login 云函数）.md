## 问题定位
- 失败来源：前端在 `pages/auth/login/login.js:39-41` 调用 `wx.cloud.callFunction({ name: 'login' })`，若 `result.success !== true` 会抛错并在 `:53` 弹出“登录失败，请重试”。
- 关键证据：`cloudfunctions/login/index.js` 为空文件（0 行），导致云函数调用没有有效返回，从而触发失败。
- 云环境：小程序端 `app.js:11-14` 已 `wx.cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })`，云函数端 `getPhoneNumber` 也用同一 `env`，说明期望使用云开发登录路径。

## 修复方案
1. 实现 `login` 云函数（`cloudfunctions/login/index.js`）：
   - `cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })`
   - `const { OPENID } = cloud.getWXContext()` 获取 `openid`
   - 访问数据库 `cloud.database().collection('users')`
   - 根据 `openid` 查找用户；不存在则插入（使用前端传入的 `event.profile` 中的 `nickName/avatarUrl` 等）；存在则更新基础资料
   - 返回 `{ success: true, openid: OPENID, user: <用户文档> }`
2. 部署云函数到同一环境：在微信开发者工具中选择 `cloud1-5gb9c5u2c58ad6d7`，上传并部署 `login`。
3. 前端无需改动逻辑，但需确保返回结构匹配 `login.js:44-47`（写入 `openid` 与 `userDoc`）。
4. 增强错误信息：云函数统一返回 `{ success: false, errorMessage }`；前端 `catch` 时优先显示具体 `errorMessage`，便于排障。

## 验证步骤
- 打开登录页，点击“授权并登录”，观察：
  - 成功 toast；本地存在 `openid` 与 `userDoc`（`Storage` 面板可见）
  - 跳转到 `/pages/auth/profile-edit/profile-edit`；手机号获取云函数可正常调用
- 在云开发数据库中检查 `users` 集合是否产生/更新对应记录
- 断网与拒绝授权场景下是否显示明确提示

## 备选路径（如不使用云开发）
- 前端使用 `wx.login` 获取 `code`（`app.js:215-235` 已封装），请求自建后端换取会话并保存 `token`；前端目前未实现该流，需要新增 `wx.request` 与存储 `user_token`。

确认后，我将补全 `login` 云函数并部署，同步完善前端错误提示与验收步骤。