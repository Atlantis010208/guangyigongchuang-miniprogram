# 案例沉浸演示部署与回滚

本功能由三个云函数、管理后台和小程序页面共同组成。部署顺序必须先数据/接口、再界面，避免新版客户端先于公开接口上线。

## 1. 部署前配置

### 云环境与 AppID

- 小程序 AppID 以 `project.config.json` 为准，并确认该 AppID 已关联目标 CloudBase 环境。
- `cloudbaserc.json.envId` 在部署前替换为明确的目标环境；禁止沿用占位值。
- 管理后台和小程序必须访问同一套 `lighting_cases` 数据。

### AI 云函数环境变量

在 `admin_case_presentation` 的云函数配置中设置：

| 变量 | 建议值 | 说明 |
| --- | --- | --- |
| `CASE_PRESENTATION_AI_PROVIDER` | `custom-minimax-m3` | CloudBase AI 自定义模型组 |
| `CASE_PRESENTATION_AI_MODEL` | `MiniMax-M3` | MiniMax M3 模型 ID，大小写必须一致 |
| `CASE_PRESENTATION_AI_TIMEOUT_MS` | `180000` | 单次图片理解或故事板调用超时，同时用于 Node SDK HTTP 超时 |
| `CASE_PRESENTATION_PROMPT_VERSION` | `case-deck-v1` | 写入草稿，便于追踪生成规则 |
| `CASE_PRESENTATION_PREVIEW_TTL_MS` | `900000` | 真机预览凭证 15 分钟有效 |
| `WX_APPID` | 当前小程序 AppID | Web 管理后台生成真机预览码 |
| `WX_APPSECRET` | 当前小程序 AppSecret | 微信 HTTP API 凭证，只保存在云函数环境变量中 |

`admin_case_presentation` 云函数总超时设置为 600 秒，并配置 `case_presentation_generation_worker` 定时触发器，Cron 为 `*/10 * * * * * *`。图片理解按每批 3 张并行执行，故事板在图片理解全部完成后生成。管理后台发起任务后每 2 秒短轮询一次，最长等待 10 分钟；浏览器不再保持长时间的单次云函数请求。

管理后台属于 Web 调用链，无法依赖小程序侧注入的微信 OpenAPI token。真机预览在 `cloud.openapi.wxacode.getUnlimited` 返回 `INVALID_WX_ACCESS_TOKEN` 时会自动改用 `WX_APPID/WX_APPSECRET` 获取微信 access token，并调用 `wxa/getwxacodeunlimit`。部署时确认函数目录 `config.json` 已声明 `wxacode.getUnlimited` 权限。

在 CloudBase AI 模型管理中创建 `custom-minimax-m3`，协议选择 OpenAI 兼容，国内 Base URL 使用 `https://api.minimaxi.com/v1`，模型填写 `MiniMax-M3`。MiniMax API Key 只写入该模型组的密钥配置，不得提交到仓库、前端或云函数环境变量。

### 预览 token 集合

创建 `case_presentation_preview_tokens`：

1. 客户端读权限：关闭。
2. 客户端写权限：关闭。
3. `tokenHash`：唯一升序索引，用于按哈希查找，数据库不保存明文 scene。
4. `expiresAt`：普通升序索引，用于机会式清理过期记录。

`lighting_cases` 无需批量迁移。旧记录在第一次管理端读取/保存时兼容计算 source hash；原有详情不受影响。

## 2. 字体资产

页面优先使用 `Noto Serif SC` 与 `Noto Sans SC`，字体不可用时立即回退到 `Songti SC/PingFang SC/Microsoft YaHei`，不会阻塞首屏。

1. 从 Noto 官方字体制作仅含案例演示常用字符的 WOFF2 子集。
2. 上传为：
   - `fonts/noto-serif-sc-case-deck-subset.woff2`
   - `fonts/noto-sans-sc-case-deck-subset.woff2`
3. 使用长期有效的 Cloud Storage/CDN HTTPS 地址，不使用会在短时间内过期的临时下载地址。
4. 将域名加入微信公众平台“小程序 → 开发管理 → 开发设置 → 服务器域名”的 `downloadFile` 合法域名。
5. 复制 `config/case-presentation.example.js` 中的结构到 `config/case-presentation.js`，填入两个真实地址。
6. 在真机清缓存后进入演示页，确认标题为衬线体、正文为无衬线体；断网重进时应正常使用系统字体。

仓库默认将 URL 留空，防止测试包请求不存在或过期的外部字体。字体部署是发布到真实微信环境前唯一需要绑定具体云域名的资产步骤。

## 3. 兼容式部署顺序

在 `20250925-miniprogram-4` 目录执行，以下 `<env-id>` 必须替换为明确环境：

```powershell
npx.cmd tcb fn deploy admin_cases -e <env-id> --dir cloudfunctions/admin_cases --force
npx.cmd tcb fn deploy admin_case_presentation -e <env-id> --dir cloudfunctions/admin_case_presentation --force
npx.cmd tcb fn deploy lighting_cases_list -e <env-id> --dir cloudfunctions/lighting_cases_list --force
```

部署后检查 `admin_case_presentation` 的触发器列表，必须存在并启用 `case_presentation_generation_worker`。如果只更新了函数代码而未同步 `cloudbaserc.json`，需在控制台补建每 10 秒触发一次的 timer。

随后：

1. 部署 `Backend-management/guangyi-admin` 的管理后台构建产物。
2. 在后台选择一条至少 3 图的案例，生成、编辑、保存、扫码预览、发布。
3. 上传小程序体验版，验证详情入口、竖向翻页、分享直达和咨询跳转。
4. 验收通过后再提交小程序审核/发布。

旧小程序只读取原详情字段；新增公开 action 不改变列表和详情的既有结构。未发布演示的案例仍显示原两按钮布局。

## 4. 发布检查

- 3 图生成 5 幕、5 图生成 7 幕、9 图生成 6–12 幕。
- 策略页始终是 70% 图片 / 30% 文案。
- 普通 `presentation` action 永远不返回 draft；预览 scene 只读取绑定 revision。
- 案例内容变化后状态为“内容已变更”，旧 published 仍可浏览，直到新版本原子发布。
- 最后一幕不循环，唯一主按钮进入 `/pages/support/contact/contact`。
- 分享链接不含预览 token；草稿预览隐藏分享菜单。

## 5. 回滚

1. 先回滚/撤回小程序体验版或正式版入口，使用户不再产生新演示请求。
2. 回滚管理后台的演示入口；不要删除 `presentation.draft` 或 `presentation.published`。
3. 云函数可保持向后兼容版本运行；若必须回滚，顺序为 `lighting_cases_list` → `admin_case_presentation` → `admin_cases`。
4. 不删除 `lighting_cases.presentation` 字段，恢复功能时可继续使用旧发布版本与草稿。
5. `case_presentation_preview_tokens` 可在所有预览码过期后清空，但不属于回滚必需动作。

这样回滚只撤回入口和调用面，既有案例详情、图片和已保存演示数据均可恢复。
