## 问题定位
- 报错：`functions execute fail | errMsg: handler not found`，来源 `wx.cloud.callFunction({ name: 'login' })`（`pages/auth/login/login.js:39`）。
- 根因：`c:\Users\imac\Desktop\20250925-miniprogram-4\cloudfunctions\login\index.js` 文件存在但为空，未导出 `exports.main` 处理函数；`package.json` 指向 `main: index.js`。

## 修复方案
1. 实现登录云函数 `cloudfunctions/login/index.js`
   - 初始化云环境到 `cloud1-1gqerbbu347adc17`：`cloud.init({ env: 'cloud1-1gqerbbu347adc17' })`
   - 使用 `cloud.getWXContext()` 取得 `openid`
   - 访问数据库 `users` 集合：按 `_openid` 查找用户
   - 若存在，返回用户文档；若不存在，创建新文档（字段：`nickname`/`avatarUrl`/`phoneNumber`，以及 `createdAt`）
   - 返回结构：`{ success: true, openid, user }`；异常返回 `{ success: false, errorMessage }`
2. 校验小程序端契约
   - `pages/auth/login/login.js` 期望 `result.success/openid/user`；`home.js` 与 `profile-edit.js` 读取 `nickname/phoneNumber/avatarUrl`，兼容 `nickName`。
3. 环境一致性
   - 云函数内的 `cloud.init` 使用目标环境 `cloud1-1gqerbbu347adc17`，与 `app.js:12` 保持一致。
4. 集合准备
   - 确认新环境数据库存在 `users` 集合；如未创建，先在云开发控制台创建（否则 `add` 可能失败）。

## 验证步骤
- 在开发者工具运行登录流程：点击登录，弹出头像授权后调用云函数；成功应显示“登录成功”，并跳转到资料编辑页。
- 检查本地缓存：`openid` 与 `userDoc` 已写入；`home` 页面能读取到 `users` 文档。
- 云函数日志：在云开发控制台确认 `login` 云函数执行成功，环境为 `cloud1-1gqerbbu347adc17`。

## 后续可选
- 若需要，把已有用户的 `nickName` 统一迁移到 `nickname` 字段；当前代码已兼容读取两者。
- 旧环境的 `fileID` 引用已扫描出 18 处，不影响登录；资源迁移后我可批量替换为新环境前缀。

## 执行
- 获批后：我将补充并提交 `cloudfunctions/login/index.js` 的实现，保持无注释、与现有风格一致，并立即回归验证登录流程。