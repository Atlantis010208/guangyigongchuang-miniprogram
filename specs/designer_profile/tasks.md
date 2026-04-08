# 实施计划：设计师端个人中心后端云函数开发

## 任务概览

共 5 个云函数 + 2 个新建集合 + 9 个前端页面接入，按云函数顺序依次执行。

---

- [ ] 1. 创建云数据库新集合
  - 在云开发控制台（或通过 `initCollections` 云函数）创建 `designer_portfolios` 集合
  - 创建 `designer_orders` 集合
  - _需求：数据集合说明_

---

- [ ] 2. 开发云函数 `designer_profile`（设计师档案管理）
  - 创建 `cloudfunctions/designer_profile/package.json`（依赖 wx-server-sdk ~2.6.3）
  - 实现 `action: 'get'`：通过 openid 查 users 验证角色，查/初始化 designers 档案，处理头像临时链接
  - 实现 `action: 'update'`：白名单字段验证，更新 designers，同步 users.nickname/avatarUrl
  - 通过 MCP 工具部署到云环境 `cloud1-5gb9c5u2c58ad6d7`
  - _需求：需求1 - 设计师档案管理_

---

- [ ] 3. 开发云函数 `designer_portfolios`（作品集管理）
  - 创建 `cloudfunctions/designer_portfolios/package.json`
  - 实现 `action: 'list'`：查询当前设计师的作品集，支持 spaceType 筛选和分页，批量转换 cloud:// 链接
  - 实现 `action: 'add'`：校验参数（coverImage 必须 cloud://，galleryImages 1-9张），插入记录，designers.portfolioCount +1
  - 实现 `action: 'delete'`：验证归属，软删除，portfolioCount -1
  - 通过 MCP 工具部署
  - _需求：需求2 - 作品集管理_

---

- [ ] 4. 开发云函数 `designer_demands`（需求大厅与接单）
  - 创建 `cloudfunctions/designer_demands/package.json`
  - 实现 `action: 'list'`：查询 requests 集合（status='submitted'，无 designerId），支持 spaceType 筛选、分页，计算 isNew/isExpiringSoon/tagType/tagText
  - 实现 `action: 'detail'`：返回需求详情（不含 contact 字段）
  - 实现 `action: 'accept'`：验证角色，读取需求状态，条件更新（where status='submitted'），创建 designer_orders 记录，处理并发返回 ALREADY_TAKEN
  - 通过 MCP 工具部署
  - _需求：需求3 - 需求大厅_

---

- [ ] 5. 开发云函数 `designer_projects`（我的项目管理）
  - 创建 `cloudfunctions/designer_projects/package.json`
  - 实现 `action: 'list'`：查询 requests 集合（designerId = 当前设计师），支持状态筛选（all/review/design/done），状态文本映射，分页
  - 实现 `action: 'detail'`：验证 designerId 归属，返回完整请求数据（含 contact 联系方式）
  - 实现 `action: 'update_step'`：更新 steps 数组，全部完成时自动将 status 改为 'done' 并触发 designers.projects +1
  - 通过 MCP 工具部署
  - _需求：需求4 - 我的项目管理_

---

- [ ] 6. 开发云函数 `designer_settings`（设置管理）
  - 创建 `cloudfunctions/designer_settings/package.json`
  - 实现 `action: 'get_notifications'`：从 users 集合读取 notificationSettings，不存在时返回默认值
  - 实现 `action: 'update_notifications'`：仅允许更新 4 个布尔字段，写入 users.notificationSettings
  - 通过 MCP 工具部署
  - _需求：需求5 - 消息通知设置_

---

- [ ] 7. 前端接入 —— `designer-profile` 和 `designer-profile-edit`
  - `designer-profile.js`：`onLoad` 调用 `designer_profile` get，渲染真实档案数据（含统计数据）
  - `designer-profile-edit.js`：`loadUserData()` 调用 get，`onSave()` 调用 update，头像变更用 `wx.cloud.uploadFile` 上传后传 fileID 给 update
  - _需求：需求1、需求6_

---

- [ ] 8. 前端接入 —— `designer-portfolios` 和 `designer-portfolio-add`
  - `designer-portfolios.js`：`loadPortfolios()` 调用 `designer_portfolios` list，支持标签筛选，处理 tempFileURL 显示
  - `designer-portfolio-add.js`：`onSubmit()` 先 `wx.cloud.uploadFile` 上传封面和图集（多并发），获取 fileID 数组后调 add，返回后刷新列表
  - 作品删除功能（在列表页增加长按删除或删除按钮）
  - _需求：需求2_

---

- [ ] 9. 前端接入 —— `designer-home`、`designer-demands`、`designer-demand-detail`
  - `designer-home.js`：`loadDemands()` 调用 `designer_demands` list（page=1, pageSize=3）
  - `designer-demands.js`：`loadDemands()` 调用 list，切换分类时传 spaceType，支持上拉加载更多
  - `designer-demand-detail.js`：`loadDemandDetail()` 调用 detail；`onTakeOrder()` 调用 accept，成功跳转 designer-order-success，失败显示"已被抢单"提示
  - _需求：需求3_

---

- [ ] 10. 前端接入 —— `designer-projects`
  - `designer-projects.js`：`onShow()` 调用 `designer_projects` list；tab 切换传对应 statusFilter；展示项目卡片（空间/服务/面积/状态）
  - 增加项目详情跳转（如有详情页）
  - _需求：需求4_

---

- [ ] 11. 前端接入 —— `designer-notifications`
  - `onLoad()` 调用 `designer_settings` get_notifications，渲染真实开关状态
  - 每个 onChange 回调立即调用 update_notifications 保存，失败时回滚开关状态并提示
  - _需求：需求5_
