# Implementation Plan

- [x] 1. 封装设计师白名单准入规则
  - 在 `designer_projects` 云函数内新增白名单准入 helper，身份只取 `cloud.getWXContext().OPENID`。
  - 复用 `designer_whitelist`，支持 active 白名单的 OPENID 绑定字段和用户手机号格式兼容匹配。
  - 区分 `DESIGNER_NOT_CERTIFIED`、`NOT_DESIGNER_PROFILE`、`USER_NOT_FOUND`。
  - _Requirement: 2, 3_

- [x] 2. 为 `designer_projects` 增加项目页 access action
  - 新增 `action: 'access'`，通过时返回 `{ allowed: true, certified: true, designerId }`。
  - 未认证时返回 `DESIGNER_NOT_CERTIFIED`，不返回项目数据。
  - 保持现有 `list/detail/update_step/submit_verify` 响应结构兼容。
  - _Requirement: 1, 2, 3_

- [x] 3. 强化 `designer_projects` 全部受保护 action 的服务端门禁
  - `list/detail/update_step/submit_verify` 均要求 active 白名单和 designer 档案。
  - 后台禁用或删除白名单后，即使用户仍保留 `roles=2` 也会被拒绝。
  - _Requirement: 2, 3_

- [x] 4. 强化 `designer_demands` 接单大厅云函数门禁
  - 接入同等白名单准入规则。
  - 保护 `list/detail/accept/collect/uncollect/check_collect/count`。
  - _Requirement: 2, 3_

- [x] 5. 扩展 V2 设计师服务层
  - 在 `services/v2/designer.js` 新增 `projectAccess()`。
  - 继续沿用 `callCloud` 标准响应包装。
  - _Requirement: 1, 5_

- [x] 6. 接入 V2 项目页前端门禁
  - `onLoad` 先执行 `checkProjectAccess()`，通过后才加载项目数据。
  - 拒绝或异常时清空项目、接单大厅和已完成数据。
  - 提供 checking、denied、error 与 retry 状态。
  - _Requirement: 1, 4_

- [x] 7. 更新 V2 项目页不可用状态 UI
  - 保留自定义顶部标题和底部 tabbar。
  - 未认证时不渲染项目分类、项目卡片、接单大厅卡片和操作按钮。
  - 沿用现有黑白 V2 视觉样式。
  - _Requirement: 4_

- [x] 8. 补充前端预览测试
  - 验证 access denied 时不调用 `projects` 和 `demands`。
  - 验证 access allowed 时加载两路项目列表与一路接单大厅数据。
  - 验证 WXML 包含不可用状态和 retry 绑定。
  - _Requirement: 5_

- [x] 9. 补充后端合约测试
  - 覆盖 active 白名单允许、白名单缺失/disabled 拒绝、designer 档案缺失。
  - 覆盖项目列表与接单大厅 count 在拒绝时不会查询业务数据。
  - _Requirement: 2, 3, 5_

- [x] 10. 运行验证并整理部署说明
  - 运行项目页预览、白名单门禁、V2 路由与角色 tab 测试。
  - 检查云函数依赖与代码格式。
  - 记录需重新部署的 `designer_projects`、`designer_demands` 云函数。
  - _Requirement: 5_
