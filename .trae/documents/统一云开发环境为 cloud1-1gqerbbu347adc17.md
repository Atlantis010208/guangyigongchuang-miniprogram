## 目标
将整个小程序与云函数统一指向云开发环境 `cloud1-1gqerbbu347adc17`，并清理可能残留的旧环境引用，确保调用与资源访问一致。

## 当前定位
- 已匹配到的配置位置：
  - `c:\Users\imac\Desktop\20250925-miniprogram-4\app.js:12` 已为目标环境：`wx.cloud.init({ env: 'cloud1-1gqerbbu347adc17', traceUser: true })`
  - `c:\Users\imac\Desktop\20250925-miniprogram-4\cloudfunctions\getPhoneNumber\index.js:3` 使用旧环境：`cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })`
  - `c:\Users\imac\Desktop\20250925-miniprogram-4\project.config.json` 未包含 `envId` 或 `cloudbase` 环境配置项（无需修改）
- 潜在残留：代码或数据中可能存在 `cloud://cloud1-5gb9c5u2c58ad6d7...`、`@cloud://cloud1-5gb9c5u2c58ad6d7...` 的文件存储引用。

## 修改方案
1. 云函数环境统一
   - 更新 `cloudfunctions/getPhoneNumber/index.js` 的初始化：
     - 将 `cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })` 改为 `cloud.init({ env: 'cloud1-1gqerbbu347adc17' })`
   - 扫描所有 `cloudfunctions/*/**` 中的 `cloud.init({ env: ... })` 与 `tcb.init({ envId: ... })`，若存在旧值统一替换为目标环境。
2. 小程序端核查
   - 保持 `app.js:12` 为目标环境，不改动。
   - 检查是否存在按调用点覆盖环境的写法（例如 `wx.cloud.callFunction({ config: { env: '...' } })`），若命中则统一替换为目标环境。
3. 云存储路径迁移（可选但推荐）
   - 全局检索并替换旧环境前缀：`cloud://cloud1-5gb9c5u2c58ad6d7` 与 `@cloud://cloud1-5gb9c5u2c58ad6d7`
   - 前提：相应文件已在新环境 `cloud1-1gqerbbu347adc17` 中存在且路径一致，否则需先迁移资源或调整引用。

## 验证步骤
- 本地开发者工具预览：
  - 启动小程序，执行一遍涉及云函数的主流程（如手机号获取、登录），确认调用成功且返回数据正常。
- 运行云函数日志检查：
  - 在开发者工具云开发控制台查看 `getPhoneNumber` 等云函数的最新日志，确认来源环境为 `cloud1-1gqerbbu347adc17`。
- 资源访问验证：
  - 打开包含云存储引用的页面，确认图片/文件能正常加载；若失败，检查对应文件是否已迁移至新环境。

## 风险与回滚
- 若新环境未部署对应云函数/数据库集合/存储文件，调用或加载可能失败；建议先对齐新环境的资源与权限。
- 如出现问题，可暂时将单个调用点的 `env` 回退到旧环境以维持功能，待资源迁移完成后再统一切换。

## 执行后续
- 我将按上述方案：
  - 统一更新所有云函数中的环境初始化为目标环境；
  - 核查并替换调用点覆盖的 `env`；
  - 与您确认后，按需执行云存储 `fileID` 前缀替换。
- 请确认是否一并执行“云存储路径迁移”步骤；确认后我将开始具体修改。