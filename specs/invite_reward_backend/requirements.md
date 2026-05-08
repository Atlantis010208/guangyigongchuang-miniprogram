# 邀请好友机制后端需求文档（invite_reward_backend）

## 介绍

本需求是光乙共创小程序「会员体系第二期」的范围，目标是把分散在 `login`、`membership_status` 中的邀请相关逻辑沉淀为一套**可审计、可查询、可并发安全**的后端能力，并补齐邀请记录追踪与查询接口，支撑：

- 计算结果页 / 色温结果页 / 灵感图库等付费墙弹窗的邀请入口
- 个人中心「会员邀请历史」页的邀请记录列表
- 后续运营后台对邀请数据的统计与排查

本需求**不**包含：

- 前端付费墙 UI / 分享面板（已在 `pages/gallery/`、`pages/search/calc-result/`、`pages/color-temp/color-temp-result/`、`pages/profile/membership/` 完成）
- 微信支付下单 / 会员激活 / 老用户迁移 / 报告署名等其他会员业务（在 `specs/membership_center/` 范畴）
- 设计师邀请工单系统（`invitations_create` / `invitations_operations`，与本机制完全独立；本期会员邀请记录独立使用 `member_invitations` 集合，不复用 `invitations`）

---

## 背景分析

### 已有资源

- **数据库集合**
  - `users`：已扩展 `inviteCode`、`inviteStats`、`invitedBy`、`invitedByUserId`、`inviteCodeUsed`、`invitedAt`、`galleryTrialExpireAt`、`vipLevel`、`vipExpireAt` 字段
  - `users.inviteCode` 已配置唯一稀疏索引 `idx_inviteCode_unique`（在 `cloudfunctions/setup_indexes/index.js` 中声明）
- **已部署云函数**
  - `login`：新用户创建时调用 `applyInviteReward(db, inviteCode, invitedOpenid, invitedUserId, now)` 完成归因 + 奖励
  - `membership_status`：首次访问为登录用户生成 6 位邀请码，返回 `inviteCode`、`inviteStats`、`galleryTrialExpireAt`
- **前端已就绪**
  - `app.js` / `pages/auth/login/login.js` 在分享路径中捕获 `inviteCode` 并通过 `pendingInviteCode` 透传到 `login` 云函数
  - 计算结果页、色温结果页、灵感图库的付费墙均已接入邀请进度与分享按钮

### 现状问题

| 编号 | 问题 | 影响 |
|---|---|---|
| P1 | 邀请奖励发放使用直接 `update`，不是条件原子更新 | 高并发下同一邀请人可能被多次计数或漏发奖励 |
| P2 | `users.inviteStats` 仅是计数器，没有 `invitations` 集合记录每条邀请关系 | 无法在「邀请历史」页展示具体邀请到了谁、何时、是否发奖 |
| P3 | `pages/profile/membership/invite-history/invite-history.js` 第 50–53 行 `records = []` 永远为空 | 用户看不到自己邀请记录，运营无法核对 |
| P4 | `applyInviteReward` 失败时只在 console 留痕，没有持久化 | 出问题难以排查 |
| P5 | 后台无邀请相关查询接口 | 运营/客服无法查邀请关系、对账 |
| P6 | 边缘场景返回不规范：邀请码不存在、自邀、被邀请人重复触发等 | 排查困难，前端难以做差异化提示 |
| P7 | `idx_inviteCode_unique` 索引依赖 `setup_indexes` 调用部署，未确认线上是否生效 | 极小概率邀请码重复 |

### 已确认的业务规则

| 项 | 规则 |
|---|---|
| 邀请码 | 注册后首次访问 `membership_status` 时生成 6 位字母数字（去除 `O/0/I/1`），全局唯一，终身不可改 |
| 归因时机 | 仅当被邀请人**新建** `users` 文档时绑定，不允许后续追溯绑定 |
| 归因唯一性 | 一个被邀请用户最多归因一次；老用户不能被任何邀请码归因 |
| 自邀禁止 | `inviter._openid === invitedOpenid` 或 `inviter._id === invitedUserId` 时直接拒绝，不增加计数 |
| 奖励规则 | 每邀请 **2** 位新用户，邀请人累加 **7** 天会员试用；无上限叠加 |
| 试用形态 | 奖励同时延长 `vipExpireAt`（用作普通会员权益判定）和 `galleryTrialExpireAt`（用作图库试用判定） |
| 等级保护 | 已过期高级会员不会因邀请奖励被错误续成高级会员，仅按"普通会员试用"叠加 |
| 计费起点 | 已有未过期权益时，从原到期时间叠加；已过期或无权益时，从当前时间叠加 |

---

## 范围声明

### 本期产出

1. 新增 `member_invitations` 集合（名字以避免与现有设计师工单的 `invitations` 冲突），记录每一条邀请关系（含奖励发放快照），并配置必要索引
2. 重构 `cloudfunctions/login/index.js` 中的 `applyInviteReward`，在保留对外行为的前提下：
   - 写入 `member_invitations` 记录
   - 使用条件原子更新邀请人 `inviteStats`，避免并发重复计数
   - 规范化错误码与返回结构
3. 新增云函数 `invitations_query`：供小程序「会员邀请历史」页拉取当前用户的邀请记录列表
4. 新增云函数 `admin_invitations_list`：供后台管理端按邀请人、被邀请人、时间区间查询邀请记录（沿用现有 `admin_*` 鉴权模式）
5. 在 `setup_indexes` 中补齐 `member_invitations` 集合索引，并保证 `users.idx_inviteCode_unique` 索引已部署
6. `membership_status` 邀请码生成路径在唯一索引冲突时进行二次重试，确保最终一定写入有效邀请码
7. `cloudfunctions/login` 在被邀请人为「老用户、自邀、邀请码无效」时返回明确的 `inviteReward.code`，便于前端日志和后续排查

### 非本期产出

- 前端页面调整（仅在邀请历史页消费 `invitations_query` 即可，UI 已就绪）
- 邀请试用与正式会员之间的等级合并、扣减规则
- 邀请奖励上限、排行榜、节日活动倍率等运营玩法

---

## 需求

### 需求 1 — 邀请记录持久化

**User Story:** 作为运营/客服，我希望能查到每一条邀请关系（谁邀请了谁、何时、奖励是否发放），以便排查争议、对账和制定运营策略。

#### Acceptance Criteria

1. When a new user document is created with a valid invite code, the `login` cloud function shall insert a record into the `member_invitations` collection containing: `inviterUserId`, `inviterOpenid`, `inviteCode`, `invitedUserId`, `invitedOpenid`, `createdAt`, `rewardGranted`, `rewardDays`, `rewardSnapshot`.
2. While the invite code is invalid, when `applyInviteReward` is called, the system shall not write any record into the `member_invitations` collection and shall return `code: 'INVITE_CODE_NOT_FOUND'`.
3. While the invitee is the inviter themselves (`inviter._openid === invitedOpenid` or `inviter._id === invitedUserId`), when `applyInviteReward` is called, the system shall not write any record and shall return `code: 'INVITE_SELF_FORBIDDEN'`.
4. When an invitation record is successfully written, the corresponding `users` document of the invitee shall also be updated with `invitedBy`, `invitedByUserId`, `inviteCodeUsed`, `invitedAt`, preserving current behavior.
5. The system shall guarantee that at most one `member_invitations` record exists per `invitedUserId`.

### 需求 2 — 邀请奖励并发安全

**User Story:** 作为系统维护者，我希望邀请奖励发放在并发或重试场景下不会重复扣发或漏发，以保证用户权益数据正确。

#### Acceptance Criteria

1. When `applyInviteReward` updates the inviter's `inviteStats.invitedCount`, the system shall use a database conditional update (`db.command.inc(1)`) so that two concurrent invocations result in two distinct counts.
2. When the post-increment `invitedCount` crosses a multiple of `2` (the reward threshold), the system shall extend `vipExpireAt` and `galleryTrialExpireAt` by `7` days, computed from `max(now, currentExpireAt)`.
3. While the inviter's `vipLevel === 'premium'` and `vipExpireAt > now`, when reward extension is applied, the system shall keep `vipLevel` as `'premium'`; otherwise it shall set `vipLevel` to `'normal'`.
4. While `applyInviteReward` is invoked twice for the same `(inviteCode, invitedUserId)` pair, the system shall apply the reward at most once (idempotent), enforced by the unique-per-invitee constraint defined in 需求 1.
5. When any step inside `applyInviteReward` throws, the `login` cloud function shall still return the user creation result successfully, with `inviteReward = { applied: false, code: 'INVITE_REWARD_FAILED', message: <error> }`.

### 需求 3 — 用户侧邀请记录查询

**User Story:** 作为已登录用户，我希望在「会员邀请历史」页看到我邀请过的所有用户、邀请时间和已获得的试用天数，以便了解自己的进度。

#### Acceptance Criteria

1. When the mini-program calls `invitations_query` with `action: 'listMine'`, the cloud function shall return all `member_invitations` records where `inviterOpenid === wxContext.OPENID`, sorted by `createdAt` descending.
2. The returned record shall include: `_id`, `invitedUserId`, `invitedNickname` (best effort, may be empty), `invitedAvatarUrl` (best effort), `inviteCode`, `createdAt`, `rewardGranted`, `rewardDays`.
3. The returned record shall **not** include `invitedOpenid` or any other field that exposes another user's identity beyond nickname/avatar.
4. While the caller is not logged in, when `invitations_query` is called, the system shall return `code: 'UNAUTHORIZED'` with empty data.
5. The query shall support optional `pageSize` (default `20`, max `50`) and `lastId` cursor for pagination.

### 需求 4 — 后台邀请记录管理

**User Story:** 作为后台管理员，我希望能按邀请人、被邀请人、时间区间检索邀请记录，并查看奖励发放情况，以便支持客服与对账。

#### Acceptance Criteria

1. When a request to `admin_invitations_list` is authenticated as an admin (consistent with existing `admin_*` cloud functions), the system shall return a paginated list of `member_invitations` records.
2. The cloud function shall accept optional filters: `inviterKeyword` (matched against inviter `nickname` / `phoneNumber` / `inviteCode`), `invitedKeyword`, `startAt`, `endAt`, `rewardGranted`.
3. The cloud function shall return `total`, `pageSize`, `pageNum`, `list` — each list item including inviter and invitee summary (`userId`, `nickname`, `phoneNumber`, `avatarUrl`).
4. While the caller is not authenticated as admin, when `admin_invitations_list` is called, the system shall return `code: 'FORBIDDEN'`.
5. The default pagination shall be `pageSize = 20`, `pageNum = 1`; `pageSize` capped at `100`.

### 需求 5 — 邀请码唯一性兜底

**User Story:** 作为系统维护者，我希望邀请码在生成阶段不会因为唯一索引冲突写入失败导致用户无邀请码可用。

#### Acceptance Criteria

1. When `membership_status` writes a freshly generated invite code into `users.inviteCode` and the database returns a unique-index conflict, the cloud function shall regenerate a new code and retry at least once.
2. While the unique-index `idx_inviteCode_unique` does not yet exist on `users.inviteCode`, when `setup_indexes` is invoked, the system shall create or keep this index.
3. The system shall add a unique index on `member_invitations` for `invitedUserId` (named `idx_invitedUserId_unique`) to enforce 需求 1 第 5 条。
4. The system shall add a non-unique compound index on `member_invitations` for `inviterUserId + createdAt desc` (named `idx_inviter_createdAt`) to keep 需求 3 列表查询性能。
5. While the inviter is not yet existing in `users` (deleted account or test data), when reward computation runs, the function shall short-circuit and return `code: 'INVITE_INVITER_GONE'` without crashing the login flow.

### 需求 6 — 错误码与返回规范

**User Story:** 作为前端开发者 / 客服，我希望邀请相关云函数返回稳定、自描述的错误码，以便差异化提示与排障。

#### Acceptance Criteria

1. The `login` cloud function shall include `inviteReward` in its successful response, with shape `{ applied: boolean, code: string, rewardDays?: number, inviterId?: string, message?: string }`.
2. The system shall reuse the following codes consistently across `applyInviteReward`, `invitations_query`, `admin_invitations_list`:
   - `OK`、`UNAUTHORIZED`、`FORBIDDEN`、`INVITE_CODE_NOT_FOUND`、`INVITE_SELF_FORBIDDEN`、`INVITE_ALREADY_BOUND`、`INVITE_INVITER_GONE`、`INVITE_REWARD_FAILED`、`INVALID_PARAMS`、`SERVER_ERROR`。
3. While any of the above failure codes is returned, the response payload shall not change `success` to `false` for the outer login flow; user creation must still succeed.
4. The system shall log errors with prefix `[login][invite]` / `[invitations_query]` / `[admin_invitations_list]` for grep-friendly server logs.

---

## 验收策略

| 验收维度 | 方法 |
|---|---|
| 功能验收 | 真机执行：A 用户分享 → B 全新设备扫码进入 → 注册完成 → 检查 `member_invitations` 集合是否有 1 条记录、A 的 `inviteStats.invitedCount` +1；满 2 人时验证 `vipExpireAt` 和 `galleryTrialExpireAt` 各 +7 天。 |
| 并发验收 | 用脚本在云函数中 `Promise.all` 并发触发同一邀请人在 2 ms 内的 5 次 `applyInviteReward`（不同 invitee），最终 `invitedCount` 必须等于 5。 |
| 幂等验收 | 复用同一 `invitedUserId` 二次调用 `applyInviteReward`，`member_invitations` 集合记录数仍为 1，`invitedCount` 不再增加。 |
| 边缘场景 | 测试自邀（同 openid）、不存在的邀请码、邀请人已被删除等 → 返回对应错误码且不影响 `login.success`。 |
| 索引验收 | 在云开发数据库控制台确认 `users.idx_inviteCode_unique`、`member_invitations.idx_invitedUserId_unique`、`member_invitations.idx_inviter_createdAt`、`member_invitations.idx_createdAt_desc` 四个索引存在。 |
| 接口验收 | 前端「邀请历史」页能拉取 `invitations_query` 返回的记录并渲染；后台 `admin_invitations_list` 能按筛选返回正确数据。 |
