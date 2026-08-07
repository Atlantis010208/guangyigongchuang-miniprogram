# UI V2 零影响联调与灰度上线 Runbook

## 当前保护点

- 回滚 Tag：`pre-ui-v2-20260805`
- 集成分支：`codex/ui-backend-integration`
- `develop`、`trial` 只接受独立测试环境；缺少配置时前端直接终止云请求。
- `release` 才解析生产环境 `cloud1-5gb9c5u2c58ad6d7`。
- `cloudbaserc.json` 不设置真实默认环境，所有部署必须显式传 `--env-id`。
- 部署脚本只允许三个 V2 云函数，无法部署 `admin_cases` 等旧函数。
- V2 灰度查询失败、超时、缺配置时，客户端一律回旧 UI。

## 1. 创建隔离测试环境（控制台一次性操作）

CloudBase 控制台新建环境，例如 `guangyi-ui-v2-test`。不要复用任何生产环境。复制环境 ID 后创建本机文件：

```powershell
Copy-Item config/cloud-env.example.js config/cloud-env.local.js
```

把 `TEST_ENV_ID` 改为新环境 ID。`config/cloud-env.local.js` 已被 Git 忽略；开发版和体验版未配置时会 fail closed。

## 2. 本地门禁

```powershell
npm run verify:v2
node scripts/seed-ui-v2-test-data.js --env-id <TEST_ENV_ID>
npm run gate:v2
node scripts/deploy-ui-v2-functions.js --env-id <TEST_ENV_ID> --include-test-support --dry-run
```

`seed:v2-test` 只在 `dist/ui-v2-test-seed` 生成匿名化 JSON，不连接云端。用 CloudBase 控制台导入测试环境对应集合，再将 `dist/ui-v2-gate/miniprogram_ui_v2.json` 导入测试环境集合 `ui_release_config`。

## 3. 仅部署 V2 云函数到测试环境

```powershell
node scripts/deploy-ui-v2-functions.js --env-id <TEST_ENV_ID> --include-test-support
```

脚本白名单固定为 `ui_release_gate`、`owner_portal_v2`、`designer_portal_v2`。

## 4. 白名单联调

先保持 `enabled=false`、全部比例 `0`。需要白名单时生成 OpenID SHA-256，明文 OpenID 不写入配置：

```powershell
node scripts/create-ui-v2-gate-config.js --owner-openids <OWNER_OPENID> --designer-openids <DESIGNER_OPENID>
```

导入测试环境后设置 `enabled=true`、对应角色开关为 `true`、百分比仍为 `0`，仅白名单账号验证十个 V2 页面、新旧切换、角色切换和旧链接。

## 5. 真机与业务检查

- iOS、Android 各跑一遍业主端与设计师端。
- 收集表：草稿、提交、重复提交。
- 虚拟商城：分类、浏览、购买、订单。
- 设计师：接单并发、进度、完成与结算展示。
- `npm run check:package` 主包估算必须小于 2MB。
- 旧 UI 全链路回归通过。

## 6. 生产灰度（联调全部通过后才执行）

先在生产环境新增集合 `ui_release_config`，导入默认关闭配置，并部署三个新函数：

```powershell
node scripts/deploy-ui-v2-functions.js --env-id cloud1-5gb9c5u2c58ad6d7 --allow-production --confirm-zero-percent
```

确认旧线上版本无回归后再发布含新旧 UI 的客户端。初始全部旧 UI。按白名单、业主端 `5% -> 20% -> 50% -> 100%`，业主稳定后再对设计师端执行相同流程。

异常时立即把对应角色开关设为 `false`，客户端下次进入页面会回旧 UI。

## 7. 严重故障回滚

```powershell
git switch -c codex/ui-v2-rollback pre-ui-v2-20260805
```

同时在微信公众平台执行版本回滚。V2 只新增函数/action，不删除或改写旧语义。
