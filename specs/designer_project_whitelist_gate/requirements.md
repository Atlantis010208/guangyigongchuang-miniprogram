# Requirements Document

## Introduction

设计师端 V2「项目」页面包含「我的项目」「接单大厅」「已完」三个业务入口。当前页面会展示可接项目并允许设计师申请接单，但该能力应只对后台「设计师白名单」认证通过的设计师开放。

本需求新增设计师白名单准入校验：当用户未命中后台管理系统中的 `designer_whitelist` 启用记录时，整个项目页面不可使用，包括接单大厅列表、我的项目、已完项目、查看详情和申请接单入口。页面视觉沿用现有 V2 黑白项目页样式，不引入新的视觉体系；仓库中未找到 `rules/ui-design.mdc`，因此以前台当前页面作为 UI 基线。

## Requirements

### Requirement 1 - Designer Project Page Access Gate

**User Story:** 作为平台管理员，我希望只有后台设计师白名单认证通过的设计师才能使用设计师端项目页面，避免未认证设计师查看和申请平台项目。

#### Acceptance Criteria

1. When a designer opens `pages/v2/designer-projects/index`, the mini program shall verify the current user against the backend designer whitelist before loading project data.
2. While the whitelist verification is pending, the mini program shall not render available projects or enable project actions.
3. When the current user is not in an enabled designer whitelist record, the mini program shall show a no-access state and shall not load project lists.
4. When the current user is in an enabled designer whitelist record, the mini program shall load and display the project page normally.
5. When whitelist verification fails because of a transient service error, the mini program shall fail closed and show a retryable error state instead of exposing project data.

### Requirement 2 - Server-Side Enforcement

**User Story:** 作为平台管理员，我希望即使前端被绕过，后端也能阻止未认证设计师读取项目和申请接单。

#### Acceptance Criteria

1. When `designer_projects` receives any protected action from the mini program, the cloud function shall verify the current OPENID against the backend designer whitelist.
2. When the current OPENID is not bound to an enabled designer whitelist record, the cloud function shall return an authorization error and shall not return project data.
3. When the current OPENID is not bound to an enabled designer whitelist record, the cloud function shall reject project mutation actions such as applying for a project or submitting verification.
4. While verifying whitelist state, the cloud function shall use CloudBase server-side identity (`cloud.getWXContext().OPENID`) rather than trusting client-provided user identifiers.
5. When the whitelist record is disabled or deleted in the backend management system, the user's project page access shall be removed on the next verification.

### Requirement 3 - Backward Compatibility With Existing Designer Whitelist

**User Story:** 作为运营人员，我希望复用后台现有「设计师白名单」数据，不新增一套认证名单，避免重复维护。

#### Acceptance Criteria

1. When verifying project access, the system shall use the existing `designer_whitelist` collection managed by the backend designer whitelist page.
2. While matching a whitelist record, the system shall support the existing binding model used by `check_designer_whitelist`, including activated records bound to the current OPENID and enabled records matched by the user's stored phone number when available.
3. When a whitelist record status is disabled, removed, or not enabled, the system shall treat the designer as unauthenticated for project access.
4. When the user has role `roles=2` but is no longer in the enabled designer whitelist, the system shall deny access to project features.

### Requirement 4 - Whole Page Disabled UX

**User Story:** 作为未认证设计师，我希望看到明确的不可用提示，知道需要联系平台完成认证，而不是看到空列表或可以点击但失败的按钮。

#### Acceptance Criteria

1. When an unauthenticated designer opens the project page, the page shall show a concise certification-required state.
2. While the page is in the certification-required state, tab switching, category filtering, project detail navigation, and application actions shall not expose project data.
3. When the user taps retry, the page shall re-run whitelist verification.
4. While displaying the certification-required state, the page shall keep the existing V2 visual language: black text, white cards, grey background, restrained borders, and the current bottom tab bar.

### Requirement 5 - Test Coverage

**User Story:** 作为开发者，我希望有自动化测试覆盖准入逻辑，避免后续改动重新放开接单大厅。

#### Acceptance Criteria

1. When running the frontend preview tests, the tests shall verify that the project page calls an access check before loading project lists.
2. When the access check returns unauthenticated, the tests shall verify that the project list request is not sent.
3. When the access check returns authenticated, the tests shall verify that existing project loading behavior remains available.
4. When running backend contract tests, the tests shall verify that protected `designer_projects` actions reject non-whitelisted users.
