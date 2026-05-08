# 邀请好友机制后端部署结论（invite_reward_backend）

> 配套需求：`requirements.md` ｜ 设计：`design.md` ｜ 任务：`tasks.md`

## 一、本期改动文件清单

| 类型 | 路径 | 改动 |
|---|---|---|
| 改造 | `cloudfunctions/login/index.js` | 抽出常量 / 工具函数；重构 `applyInviteReward` 用 `db.runTransaction` + 唯一索引幂等；规范 `inviteReward` 返回结构 |
| 改造 | `cloudfunctions/membership_status/index.js` | 邀请码生成日志统一 `[membership_status][inviteCode]` 前缀 |
| 改造 | `cloudfunctions/setup_indexes/index.js` | 增加 `member_invitations` 集合 ensure；声明 3 个索引 |
| 新增 | `cloudfunctions/invitations_query/{index.js,package.json}` | 用户侧 `action=listMine`，分页 + 字段脱敏 |
| 新增 | `cloudfunctions/admin_invitations_list/{index.js,package.json,admin_auth.js}` | 后台侧关键词 + 时间区间 + 是否发奖筛选；admin_auth 错误码映射为 UNAUTHORIZED/FORBIDDEN |
| 改造 | `pages/profile/membership/invite-history/invite-history.js` | 接入 `invitations_query`；返回值同时兼容 `inviteeName/acceptedLabel/rewarded/id` 等 WXML 已用字段名 |

## 二、数据库变更

- 集合：新建 `member_invitations`（独立于设计师工单 `invitations`，避免语义冲突）
- 索引：
  - `member_invitations.idx_invitedUserId_unique`（unique）
  - `member_invitations.idx_inviter_createdAt`（inviterUserId ASC + createdAt DESC）
  - `member_invitations.idx_createdAt_desc`（createdAt DESC）
- `users.idx_inviteCode_unique` 维持现状

## 三、云函数部署结果（环境 `cloud1-5gb9c5u2c58ad6d7`）

| 函数 | 状态 | 最近 ModTime | 简单调用结果 |
|---|---|---|---|
| `login` | Active | 2026-05-08 16:14:43 | — |
| `membership_status` | Active | 2026-05-08 16:12:18 | — |
| `setup_indexes` | Active | 2026-05-08 16:14:43 | invokeFunction 返回 `{ canUpdate: false }`，因当前环境无 `CLOUDBASE_ACCESS_TOKEN`，已通过 cloudbase MCP `writeNoSqlDatabaseStructure` 直接建索引 |
| `invitations_query` | Active | 2026-05-08 16:14:43 | invokeFunction 返回 `UNAUTHORIZED`（无 OPENID 时的预期返回，符合需求 3.4） |
| `admin_invitations_list` | Active | 2026-05-08 16:15:35（错误码映射版） | invokeFunction 返回 `UNAUTHORIZED`（admin_auth `MISSING_IDENTITY` → `UNAUTHORIZED` 映射，符合需求 6.2） |

## 四、需求覆盖矩阵

| 需求 | 验证方式 | 状态 |
|---|---|---|
| 1 邀请记录持久化 | `applyInviteReward` Step 2 写入 `member_invitations`；唯一索引保证 1 invitee 1 record | ✅ 后端完成 / 真机回归待用户执行 |
| 2 邀请奖励并发安全 | `db.runTransaction` 包裹"读邀请人 → 算阈值 → 写邀请人 + 写邀请记录"；`lastRewardCount` 字段判定阈值 | ✅ 后端完成 |
| 3 用户侧邀请记录查询 | `invitations_query.listMine`：脱敏 + 游标分页；未登录返回 `UNAUTHORIZED` | ✅ 后端完成 |
| 4 后台邀请记录管理 | `admin_invitations_list`：requireAdmin + 关键词 + 时间区间 + rewardGranted；批量加载 users 摘要 | ✅ 后端完成 |
| 5 邀请码唯一性兜底 | `member_invitations` 唯一索引已建；`users.idx_inviteCode_unique` 已存在；`membership_status` 重试 | ✅ 完成 |
| 6 错误码与返回规范 | `INVITE_*` 错误码集；admin_auth 高位映射为 `UNAUTHORIZED` / `FORBIDDEN`；`[login][invite]` 等日志前缀 | ✅ 完成 |

## 五、真机回归 Checklist（交付给用户执行）

1. **基础链路**
   - 用 A 账号在小程序内点击邀请分享 → 复制路径里的 `inviteCode`
   - 用 B 全新微信号扫码 / 通过分享卡片进入 → 完成手机号授权 + 资料填写
   - 检查云开发数据库 `member_invitations`：应有 1 条 `{ inviterUserId: A, invitedUserId: B, rewardGranted: false, rewardDays: 0 }` 的记录
   - 检查 A 用户：`inviteStats.invitedCount` = 1

2. **跨阈值奖励**
   - 用 C 全新微信号再走一次邀请流程
   - 此时 A 的 `member_invitations` 应该有 2 条记录，最新一条 `rewardGranted: true`、`rewardDays: 7`、`rewardSnapshot.afterVipExpireAt` 与 `afterGalleryTrialExpireAt` 比 `before*` 各多 7 天
   - A 用户的 `vipExpireAt` 和 `galleryTrialExpireAt` 同步 +7 天；若 A 此前是 `free`，`vipLevel` 变成 `normal`；若 A 已是未过期 `premium`，`vipLevel` 仍为 `premium`

3. **边缘场景**
   - 自邀（A 用自己的邀请码注册其他设备）→ `inviteReward.code === 'INVITE_SELF_FORBIDDEN'`
   - 不存在的邀请码（手动改链接里的 `inviteCode` 为乱码）→ `inviteReward.code === 'INVITE_CODE_NOT_FOUND'`
   - 被邀请人在 B 上已是注册用户后再次清缓存登录 → `inviteReward.code === 'INVITE_ALREADY_BOUND'`，无重复计数

4. **前端展示**
   - A 进入「会员邀请历史」页 → 列表展示真实邀请记录（昵称 / 时间 / 是否发奖 / 7 天）

5. **后台联调（可选）**
   - 用管理员账号在 Web 后台调 `admin_invitations_list`，应返回真实数据；非管理员调用应返回 `UNAUTHORIZED` / `FORBIDDEN`

## 六、自动化验证（admin_invite_test）

> **⚠️ 已下线 · 2026-05-08 16:50**
>
> 6 个场景全部跑通后，按用户要求**已删除**云端函数 `admin_invite_test` 与本地目录 `cloudfunctions/admin_invite_test/`，释放小程序 200 个云函数配额中的 1 个。本节内容保留作为复盘资料；下方所有"调用方式"指引在删除后**不再可用**。
>
> **如何恢复**（任何时候想再跑一次回归验证都可以）：
>
> 1. 在 `git log -- cloudfunctions/admin_invite_test/` 中找到删除前的提交，`git show <commit>:cloudfunctions/admin_invite_test/index.js > cloudfunctions/admin_invite_test/index.js`（同样恢复 `admin_auth.js`、`package.json`）
> 2. 用 `mcp0_manageFunctions(action='createFunction', force=true, envVariables={ INVITE_TEST_KEY: 'invite_reward_test_2026_05_08' })` 重新部署
> 3. 调用 `invokeFunction({ name: 'admin_invite_test', data: { action: 'runAll', testKey: '<INVITE_TEST_KEY>' } })`
> 4. 验证完成后按本节末尾的删除步骤再次清理
>
> **删除步骤**（当前已执行；写在这里以便下次重复）：
> ```
> # 1. 删云端
> mcp0_callCloudApi(service='scf', action='DeleteFunction',
>   params={ FunctionName: 'admin_invite_test', Namespace: 'cloud1-5gb9c5u2c58ad6d7' })
> # 2. 删本地（PowerShell）
> Remove-Item -Path "cloudfunctions\admin_invite_test" -Recurse -Force
> ```
>
> **保留 vs 删除的权衡**：本测试不属于运行时链路，删除不影响生产；唯一代价是下次回归需要 ~1 分钟从 git 恢复 + 重新部署（且 `applyInviteRewardMirror` 必须再次手工与 `cloudfunctions/login/index.js` 中的 `applyInviteReward` 对齐）。

为减少真机回归对手机/扫码的依赖，曾新增 `cloudfunctions/admin_invite_test`，可在云开发控制台或后台直接 invokeFunction 跑全套场景。

### 6.1 函数信息

| 项 | 值 |
|---|---|
| 函数名 | `admin_invite_test` |
| 鉴权 | **双重鉴权**（任一即可）：`event.testKey === process.env.INVITE_TEST_KEY` 或 admin_auth `requireAdmin` |
| 环境变量 | `INVITE_TEST_KEY=invite_reward_test_2026_05_08`（已在部署时配置；如需更换请用 `manageFunctions(action='updateFunctionConfig')` 同步） |
| 测试镜像 | `applyInviteRewardMirror` 是 `cloudfunctions/login/index.js` 中 `applyInviteReward` 的逐字镜像；任何修改 login 的改动**必须同步**此函数 |

### 6.2 接口

```jsonc
// runAll（推荐）：清理 → 创建测试用户 → 跑 6 场景 → 清理
{ "action": "runAll", "testKey": "invite_reward_test_2026_05_08" }

// 仅清理（用于排查残留）
{ "action": "cleanup", "testKey": "invite_reward_test_2026_05_08" }

// 仅创建测试用户并保留
{ "action": "setup", "testKey": "invite_reward_test_2026_05_08" }

// 跑场景（不清理，用于人工再校验数据库）
{ "action": "run", "testKey": "invite_reward_test_2026_05_08" }
```

返回结构：

```jsonc
{
  "success": true,
  "code": "OK",                   // 6 个场景全过；否则 SCENARIOS_FAILED
  "authVia": "testKey",
  "action": "runAll",
  "total": 6,
  "passed": 6,
  "failed": 0,
  "scenarios": [
    { "name": "A_basic_no_reward", "pass": true, "fails": [] },
    { "name": "B_cross_threshold_reward", "pass": true, "fails": [] },
    { "name": "C_self_invite_forbidden", "pass": true, "fails": [] },
    { "name": "D_invite_code_not_found", "pass": true, "fails": [] },
    { "name": "E_duplicate_bind_idempotent", "pass": true, "fails": [] },
    { "name": "F_premium_level_protected", "pass": true, "fails": [] }
  ],
  "cleanupBefore": { "usersRemoved": 0, "invitationsRemoved": 0 },
  "cleanupAfter":  { "usersRemoved": 7, "invitationsRemoved": 3 }
}
```

### 6.3 6 个测试场景含义

| 场景 | 含义 | 关键断言 |
|---|---|---|
| A_basic_no_reward | 第 1 个被邀请人（B）：写记录、计数 +1，但不发奖 | `member_invitations.count=1`、`invitedCount=1`、`rewardGranted=false` |
| B_cross_threshold_reward | 第 2 个被邀请人（C）：跨阈值发奖，VIP/试用 +7 天 | `rewardDays=7`、`vipLevel='normal'`、`vipExpireAt/galleryTrialExpireAt` 各 `now+7d`、`lastRewardCount=2`、`trialDaysGranted=7` |
| C_self_invite_forbidden | 用 A 自己的 openid + 自己的邀请码 | `code='INVITE_SELF_FORBIDDEN'`、记录数不变 |
| D_invite_code_not_found | 用不存在的邀请码 `NOSUCH99` | `code='INVITE_CODE_NOT_FOUND'`、记录数不变 |
| E_duplicate_bind_idempotent | 再次用 B 的 openid+_id 触发奖励（依赖 `idx_invitedUserId_unique`） | `code='INVITE_ALREADY_BOUND'`、记录数与 invitedCount 都不变 |
| F_premium_level_protected | 设 A 为未过期 premium、`invitedCount=1`/`lastRewardCount=0`，再邀请 1 人触发跨阈值 | `vipLevel` 仍为 `'premium'`（不被覆盖为 normal）、`vipExpireAt` 在原到期时间基础上 +7 天 |

### 6.4 测试数据约束

测试用户 `_openid` 全部以 `test_invite_` 开头，`cleanupTestData()` 通过 `db.RegExp({ regexp: '^test_invite_' })` 批量删除。即使 runAll 中途崩溃，再次调用 `runAll` 或 `cleanup` 也能完全清理，不会污染真实数据。

### 6.5 已修复的真实 bug（来自本次自动化验证）

> 自动化测试帮助发现并修复了一个**生产 bug**：

- **症状**：B / F 场景跑出 `INVITE_REWARD_FAILED`，错误信息：
  > `document.update:fail -502001 [PathNotViable] Cannot create field 'afterGalleryTrialExpireAt' in element {rewardSnapshot: null}`
- **根因**：`buildInvitationDoc` 中初始 `rewardSnapshot: null`，事务里 `update({ data: { rewardSnapshot: { ... } } })` 时 wx-server-sdk 把对象按点号路径展开，无法在 `null` 元素上创建子字段，事务整体回滚 → 邀请奖励失败、`invitedCount` 不增。
- **修复**：把 `buildInvitationDoc` 中 `rewardSnapshot` 初始值从 `null` 改为 `{}`（`cloudfunctions/login/index.js`、`cloudfunctions/admin_invite_test/index.js` 同步），事务里嵌套字段写入即按 merge 行为合并到空对象上。
- **影响**：仅影响"跨阈值发奖"路径，非跨阈值场景未触发 `rewardSnapshot` 写入故未暴露。**修复前的所有真机回归都会发奖失败**——本次自动化验证将"上线即翻车"问题在部署前就拦下来了。

### 6.6 在新分支 / 新环境跑全套验证

```powershell
# 在仓库根目录执行；环境 ID 在 .mcp.json / 云开发控制台已固定
# 1) 部署/更新四个相关函数（已经部署过则可跳过）
#    setup_indexes / login / admin_invite_test 必须最新
# 2) 通过 cloudbase MCP 或 manageFunctions invokeFunction 调用：
#    name: admin_invite_test
#    data: { "action": "runAll", "testKey": "<INVITE_TEST_KEY>" }
# 3) 检查响应 success === true 且 passed === total === 6
```

如果 `passed < 6`，每个失败场景的 `returned.message` 会带上 `applyInviteRewardMirror` 的原始报错，便于直接定位 wx-server-sdk / 数据库报错。

---

## 七、已知遗留

- **存量数据未回填**：之前 `applyInviteReward` 已运行过的用户，已有 `users.invitedBy` 但没有 `member_invitations` 记录。如运营要展示历史，可后续单独写一次性运维脚本
- **`setup_indexes` 索引部署降级**：当前环境没有 `CLOUDBASE_ACCESS_TOKEN`，`setup_indexes` 自动建索引未生效；改用 cloudbase MCP `writeNoSqlDatabaseStructure` 已直接建好。如需迁移环境，需要在新环境补 token 并跑一次 `setup_indexes`
- **`@cloudbase/node-sdk` 依赖**：`admin_invitations_list` 需要该包；首次部署后 `installDependency: true` 已自动装好

## 八、回滚方式

- 云函数：所有改动都通过 git 跟踪，必要时回滚 git 提交后重新 `manageFunctions(action='createFunction', force=true)`
- 数据库：`member_invitations` 集合保留即可，不会污染其他业务；如要清空可运维删除
