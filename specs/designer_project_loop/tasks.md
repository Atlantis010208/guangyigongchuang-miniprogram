# 实施计划

- [x] 1. 移除设计师详情页工作流步骤 UI
  - 删除 `designer-project-detail.wxml` 第49-62行（"工作流步骤"标题 + `.timeline` 区块）
  - 删除 `designer-project-detail.wxss` 中 `.timeline`、`.t-row`、`.t-dot`、`.t-text`、`.t-row::after`、`.step-action`、`.btn-step` 相关样式
  - _需求: 需求1

- [x] 2. 移除设计师详情页 onToggleStep 方法
  - 删除 `designer-project-detail.js` 中 `onToggleStep` 方法（第113-150行）
  - _需求: 需求1

- [x] 3. 云函数新增 submit_verify action
  - 在 `designer_projects/index.js` 的 `exports.main` switch 中新增 `case 'submit_verify'`
  - 新增 `submitVerify(openid, requestId)` 函数：验证设计师身份 → 校验项目归属 → 校验 status 为 review/design → 更新 `status='verifying'`、`designerConfirmed=true`、`verifySubmittedAt=now`
  - 部署云函数到云端
  - _需求: 需求2

- [x] 4. 设计师详情页底部操作栏动态化
  - 修改 `designer-project-detail.wxml` 底部操作栏，根据 `project.status` 和 `project.designerConfirmed` 条件渲染：
    - review/design 且未确认 → 【提交验收】+ 【联系客户】+ 【联系平台】
    - verifying → 提示文案 + 【联系客户】+ 【联系平台】
    - done → 【联系客户】+ 【联系平台】
  - 在 `designer-project-detail.js` 新增 `onSubmitVerify` 方法，调用云函数 `submit_verify`
  - _需求: 需求2

- [x] 5. 设计师详情页步骤条适配 verifying 状态
  - 修改 `designer-project-detail.js` 的 `processProjectData` 中 `progressActive` 计算逻辑，增加 `verifying` → index=1 的映射
  - _需求: 需求4

- [x] 6. 业主端进度页增加确认验收按钮
  - 修改 `progress.wxml` 底部 `wx:else`（业主视角）区块，增加条件：当 `req.designerConfirmed && !req.userConfirmed` 时显示【确认验收】按钮
  - _需求: 需求3

- [x] 7. 业主端进度页实现确认验收逻辑
  - 修改 `progress.js` 的 `loadData` 方法，将 `designerConfirmed`、`userConfirmed` 字段透传到 `req` 对象
  - 新增 `onUserConfirmVerify` 方法，调用 `requests_update` 云函数更新 `userConfirmed=true`、`status='done'`、`completedAt=now`
  - 修改 `progressActive` 计算逻辑，增加 `verifying` 状态 → index=1 的映射
  - _需求: 需求3, 需求4
