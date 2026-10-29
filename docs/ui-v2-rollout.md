# UI V2 生产双 UI 发布 Runbook

> 当前策略：release 使用旧版 UI；develop/trial 使用新版 UI。三种版本统一连接生产 CloudBase，禁止使用测试环境。下方历史测试环境章节仅作存档，不属于当前发布路径。

## 当前保护点

- 回滚 Tag：`pre-ui-v2-20260805`
- 集成分支：`feat/ui-v2`，为叠在正式分支之上的**纯增量**，不含任何非 V2 改动
- 正式分支基线：`fix/split-out-ui-v2`
- `develop`、`trial` 只接受独立测试环境；缺少配置时前端直接终止云请求并弹窗引导。
- `release` 才解析生产环境 `cloud1-5gb9c5u2c58ad6d7`。
- `cloudbaserc.json` 不设置真实默认环境，所有部署必须显式传 `--env-id`。
- 部署脚本按白名单放行：默认只有三个 V2 云函数，`--include-test-support` 才追加联调所需的主流程函数；生产部署一律拒绝 test-support 名单。
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

不带参数时只部署 `ui_release_gate`、`owner_portal_v2`、`designer_portal_v2`；`--include-test-support` 会追加登录、内容、订单等主流程函数（不含微信支付链路）。

单独重新部署某个函数用 `--functions`：

```powershell
node scripts/deploy-ui-v2-functions.js --env-id <TEST_ENV_ID> --functions lighting_cases_list
```

已存在且运行时为 Nodejs18.15 的函数，CLI 会因为默认配置想改回 Nodejs10.15 而报
`UpdateFunctionConfiguration 函数Runtime不支持修改`，此时改用 MCP `manageFunctions`
的 `updateFunctionCode` 更新代码即可。

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

## 5.5 合并回正式分支（联调通过后、生产部署之前）

`feat/ui-v2` 是叠在正式分支之上的纯增量，合并应当无冲突：

```powershell
git switch fix/split-out-ui-v2
git merge --no-ff feat/ui-v2
npm run verify:v2
```

合并后 `pages/v2` 进入正式分支，`project.private.config.json` 中的十条 V2 自定义编译条件不再指向不存在的页面，联调期间"切分支要改编译模式"的摩擦随之消失。

合并后需同步确认：

- 新克隆仓库的同学必须按 README「本地开发环境配置」创建 `config/cloud-env.local.js`，否则开发版云能力全部不可用。
- `cloudbaserc.json` 不含默认环境，所有 CLI 部署必须显式传 `--env-id`。
- 主包体积仍有余量（当前约 1724KB / 2048KB）。

## 5.6 联调遗留（上线前需逐条确认）

- **后台与 V2 不在同一环境**：管理后台 `guangyi-admin` 硬编码生产环境
  `cloud1-5gb9c5u2c58ad6d7`，V2 跑在独立测试环境，因此"后台填写 → 小程序展示"
  无法端到端联调，测试环境的案例字段是直接写库补的。合并上生产后该链路才自然连通。
- **案例配图普遍偏少**：7 条案例中 5 条只有 1 张图，详情页的"空间亮点"取封面之后的
  第 2–5 张，因此这些案例不会渲染该区块。需要运营补图。
- **案例分类筛选失效**：列表页按 `category` 过滤，但后台从不写 `category`/`spaceType`。
- **公众号文章入口未接**：`officialAccountUrl` 后台可填、云函数已返回，但小程序缺
  web-view 页面，且需小程序后台完成同主体公众号关联。
- **测试环境云函数配额 50 已满**，17 个旧版页面函数装不下，仅影响旧页面联调。
- **设计师端联调账号**：测试环境已把手机号 `19854562428` 写入 `designer_whitelist`，
  并将该 openid 的 `users.roles` 置为 `2`（设计师）。联调结束后若要继续验业主端，
  需把 `roles` 改回 `1`。
- **设计师端种子数据**：`requests`（进行中/已完成/可接单）、`designer_portfolios`、
  `designer_favorites` 集合已建；数据挂在设计师档案
  `df30f3766a75668c0576f06c6a34cf47` 下，仅供测试环境使用。

## 6. 生产灰度（联调全部通过后才执行）

先在生产环境新增集合 `ui_release_config`，导入默认关闭配置，并部署三个新函数：

```powershell
node scripts/deploy-ui-v2-functions.js --env-id cloud1-5gb9c5u2c58ad6d7 --allow-production --confirm-zero-percent
```

**另有两个既有函数被改动，必须一并部署到生产，否则案例详情页拿不到数据、
后台也存不下新字段**（它们在 test-support 名单里，部署脚本会拒绝，需用
MCP `manageFunctions` 或开发者工具手动部署）：

| 函数 | 改动 | 漏部署的后果 |
| --- | --- | --- |
| `lighting_cases_list` | 新增 `action=detail`，返回 `city/area/style` | 详情页始终空态 |
| `admin_cases` | `add/update` 支持 `city/area/style` | 后台三个字段填了存不进去 |

两处改动都只增字段、不改旧语义，可以先于客户端发布单独部署。

确认旧线上版本无回归后再发布含新旧 UI 的客户端。初始全部旧 UI。按白名单、业主端 `5% -> 20% -> 50% -> 100%`，业主稳定后再对设计师端执行相同流程。

异常时立即把对应角色开关设为 `false`，客户端下次进入页面会回旧 UI。

## 7. 严重故障回滚

```powershell
git switch -c codex/ui-v2-rollback pre-ui-v2-20260805
```

同时在微信公众平台执行版本回滚。V2 只新增函数/action，不删除或改写旧语义。
