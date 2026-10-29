# admin_case_presentation

案例沉浸演示的管理员云函数。

## Environment variables

- `CASE_PRESENTATION_AI_PROVIDER`：默认 `custom-minimax-m3`
- `CASE_PRESENTATION_AI_MODEL`：默认 `MiniMax-M3`
- `CASE_PRESENTATION_AI_TIMEOUT_MS`：默认 `180000`，同时传入 CloudBase Node SDK 初始化和单次模型调用保护
- `CASE_PRESENTATION_PROMPT_VERSION`：默认 `case-deck-v1`
- `CASE_PRESENTATION_PREVIEW_TTL_MS`：预览 token 有效期，应用默认 15 分钟
- `WX_APPID`：当前小程序 AppID，用于 Web 管理后台生成真机预览码
- `WX_APPSECRET`：当前小程序 AppSecret，只保存在云函数环境变量中，不提交仓库

`custom-minimax-m3` 必须在 CloudBase AI 模型管理中配置为 OpenAI 兼容自定义模型，国内接口地址使用 `https://api.minimaxi.com/v1`。API Key 只保存在 CloudBase 自定义模型密钥配置中，不写入函数环境变量或仓库。

案例图片按每批 3 张拆分，各批图片理解请求并行执行；全部完成后再按原图顺序生成故事板。云函数总超时配置为 600 秒。

生成采用后台任务模式：管理端 `generate` 只把任务写入 `lighting_cases.presentation.generationTask` 并立即返回；`case_presentation_generation_worker` 每 10 秒领取一个待处理任务，完成后管理端通过 `generationStatus` 短轮询取得草稿。这样不会让浏览器请求撞上 CloudBase Web 网关约 65 秒的长连接上限。

真机预览优先调用 `cloud.openapi.wxacode.getUnlimited`；Web 管理后台调用链没有有效微信 OpenAPI token 时，函数会使用 `WX_APPID/WX_APPSECRET` 调用微信官方 HTTP API 生成小程序码。函数目录的 `config.json` 同时声明 `wxacode.getUnlimited` 权限。

## Database

创建集合 `case_presentation_preview_tokens`，客户端权限设为不可读写，仅云函数访问。为 `tokenHash` 建唯一索引，并为 `expiresAt` 建升序索引。云函数也会在创建新预览码时机会式清理过期记录。

完整部署、字体与回滚步骤见 `docs/case-presentation-deployment.md`。

## Actions

- `get`
- `generate`
- `generationStatus`
- `saveDraft`
- `previewCode`
- `publish`
