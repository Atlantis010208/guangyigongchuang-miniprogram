# Requirements Document

## Introduction

设计师端 V2「我的」页面需要接入真实云函数数据，并与后台管理系统中的设计师管理、设计师白名单联调。页面不再使用静态 mock 作品或默认设计师资料作为业务数据；未认证设计师不得读取个人档案与作品数据。

## Requirements

### Requirement 1 - Designer Profile Source

**User Story:** 作为已认证设计师，我希望「我的」页面展示后台维护的真实设计师档案，以便小程序端与后台管理端看到一致的信息。

#### Acceptance Criteria

1. While 用户已登录且命中后台 `designer_whitelist.status = active`，when V2「我的」页面加载档案，the 系统 shall 从 `designers` 集合读取当前设计师真实档案。
2. While `designer_whitelist` 记录包含 `designerId`，when 云函数读取档案，the 系统 shall 优先使用该 `designerId` 读取后台管理系统中的设计师记录。
3. While `designerId` 未绑定，when 云函数读取档案，the 系统 shall 兼容通过 `openid/_openid/userId/phone` 查找 `designers` 记录。
4. While 头像字段为 `cloud://`，when 云函数返回档案，the 系统 shall 转换并返回临时访问链接。

### Requirement 2 - Certification Gate

**User Story:** 作为平台运营方，我希望只有后台认证过的设计师能访问个人档案数据，避免未认证账号使用设计师端能力。

#### Acceptance Criteria

1. When 当前账号未命中 `designer_whitelist.status = active`，the `designer_profile` 云函数 shall 返回 `DESIGNER_NOT_CERTIFIED`。
2. When 当前账号未认证，the `designer_portfolios` 云函数 shall 返回 `DESIGNER_NOT_CERTIFIED` and shall not query `designers` or portfolio data.
3. When 当前账号未登录或没有 `users` 记录，the 云函数 shall 返回明确的认证或用户不存在错误。

### Requirement 3 - Portfolio Data Without Mock

**User Story:** 作为已认证设计师，我希望「我的作品」只展示真实作品数据，避免 mock 作品误导用户。

#### Acceptance Criteria

1. When V2「我的」页面加载作品，the 系统 shall 调用 `designer_portfolios action=list` 获取真实作品数据。
2. While `designer_portfolios` 集合有记录，when 云函数返回列表，the 系统 shall 使用这些记录作为作品来源。
3. While `designer_portfolios` 集合无记录但后台设计师记录有 `portfolioImages`，when 云函数返回列表，the 系统 shall 兼容转换 `designers.portfolioImages` 为作品展示数据。
4. While 云端没有任何作品数据，when 页面渲染「我的作品」，the 系统 shall 显示真实空态，而不是静态 mock 作品。

### Requirement 4 - Backend Admin Integration

**User Story:** 作为后台管理员，我希望后台设计师白名单和设计师管理改动能同步影响小程序「我的」页面。

#### Acceptance Criteria

1. When 后台管理系统新增或启用设计师白名单，the 小程序云函数 shall recognize the active whitelist record on next request.
2. When 后台管理系统更新 `designers` 档案字段，the V2「我的」页面 shall show updated name, profession, intro, avatar, and portfolio image data after reload.
3. When 后台管理系统停用或删除白名单，the 小程序云函数 shall fail closed and stop returning profile/portfolio data.

### Requirement 5 - Shared Owner And Designer Account

**User Story:** 作为同时使用业主端和设计师端的用户，我希望两端共享同一微信账号与资料，以便在业主端登录后进入设计师端时无需重复注册。

#### Acceptance Criteria

1. When 微信用户调用登录、手机号授权或设计师认证云函数，the 系统 shall only use server-side `OPENID/UNIONID` to locate the existing `users` record and shall not trust a client supplied user id or openid.
2. While 用户已经在业主端完成登录资料，when 用户进入设计师端，the 系统 shall reuse the existing `users.nickname/avatarUrl/phoneNumber` as the designer login account data.
3. While 当前微信身份通过 `UNIONID` or `alternateOpenids` 命中已有用户，when 登录云函数 runs，the 系统 shall update the same user record instead of creating a duplicate account.
4. While shared account data is complete，when the designer login state is rendered，the system shall allow the user to continue with the existing profile without re-authorizing unchanged fields.

### Requirement 6 - Certification Binding And Revocation

**User Story:** 作为平台运营方，我希望设计师认证能形成可追踪的账号、白名单和档案绑定，并在撤销白名单时立即收回权限。

#### Acceptance Criteria

1. When a verified user phone matches an active designer whitelist record，the system shall bind `users._id`, server-side `OPENID`, `designer_whitelist._id`, and `designers._id`.
2. When no linked designer profile exists for an active whitelist record，the system shall initialize one from the shared user profile and persist the generated `designerId` back to both user and whitelist records.
3. When the admin whitelist list is loaded，the backend shall return whether each record is linked, its linked designer id, and activation time.
4. When an admin removes a linked whitelist record，the system shall revoke the non-admin user's designer role and certification markers while retaining the owner account and profile data.
5. When an admin imports a phone that already exists in disabled state，the system shall reactivate that whitelist record rather than silently treating it as an unchanged duplicate.
