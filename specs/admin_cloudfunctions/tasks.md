# 实施计划：后台管理云函数

## 任务列表

### 阶段一：基础设施（优先级：P0）

- [x] 1. 创建公共模块
  - 更新 `cloudfunctions/common/auth.js` - 权限验证模块
  - 添加管理员验证函数 `verifyAdmin`
  - _需求: 通用验收标准 - 权限验证_

- [x] 2. 创建统一响应模块
  - 创建 `cloudfunctions/common/response.js`
  - 实现 success/error 响应函数
  - 定义标准错误码
  - _需求: 通用验收标准 - 返回格式_

### 阶段二：核心业务云函数（优先级：P0）

- [x] 3. 实现仪表盘统计云函数 `admin_dashboard_stats`
  - 统计用户、设计师、订单、请求等数据
  - 实现订单趋势数据
  - 实现请求分布数据
  - _需求: 需求 1_

- [x] 4. 实现用户列表云函数 `admin_users_list`
  - 分页查询用户数据
  - 支持按昵称/手机号搜索
  - 支持按角色筛选
  - _需求: 需求 2_

- [x] 5. 实现用户更新云函数 `admin_users_update`
  - 支持更新用户角色
  - 支持禁用/启用用户
  - _需求: 需求 2_

### 阶段三：设计师管理（优先级：P0）

- [x] 6. 实现设计师列表云函数 `admin_designers_list`
  - 分页查询设计师数据
  - 支持多维度筛选和排序
  - _需求: 需求 3_

- [x] 7. 实现设计师新增云函数 `admin_designers_add`
  - 验证必填字段
  - 设置默认值
  - _需求: 需求 3_

- [x] 8. 实现设计师更新云函数 `admin_designers_update`
  - 支持更新设计师信息
  - 支持认证状态管理
  - _需求: 需求 3_

### 阶段四：订单与请求管理（优先级：P0）

- [x] 9. 实现商品列表云函数 `admin_products_list`
  - 分页查询商品数据
  - 支持多维度筛选
  - 库存预警标记
  - _需求: 需求 4_

- [x] 10. 实现订单列表云函数 `admin_orders_list`
  - 分页查询订单数据
  - 关联用户信息
  - 支持多维度筛选
  - _需求: 需求 5_

- [x] 11. 实现订单更新云函数 `admin_orders_update`
  - 状态流转验证
  - 发货信息保存
  - _需求: 需求 5_

- [x] 12. 实现设计请求列表云函数 `admin_requests_list`
  - 分页查询请求数据
  - 关联用户和设计师信息
  - _需求: 需求 6_

- [x] 13. 实现设计请求更新云函数 `admin_requests_update`
  - 设计师分配
  - 工作流阶段推进
  - _需求: 需求 6_

### 阶段五：预约与反馈管理（优先级：P1）

- [x] 14. 实现预约列表云函数 `admin_appointments_list`
  - 分页查询预约数据
  - 关联用户和设计师信息
  - _需求: 需求 7_

- [x] 15. 实现预约更新云函数 `admin_appointments_update`
  - 状态更新
  - _需求: 需求 7_

- [x] 16. 实现反馈列表云函数 `admin_feedback_list`
  - 分页查询反馈数据
  - 包含用户信息
  - _需求: 需求 8_

- [x] 17. 实现反馈回复云函数 `admin_feedback_reply`
  - 保存回复内容
  - 更新反馈状态
  - _需求: 需求 8_

### 阶段六：内容管理（优先级：P1）

- [x] 18. 实现工具包列表云函数 `admin_toolkits_list`
  - 分页查询工具包数据
  - 支持分类和状态筛选
  - _需求: 需求 9_

- [x] 19. 实现工具包新增云函数 `admin_toolkits_add`
  - 验证必填字段
  - 生成唯一 toolkitId
  - _需求: 需求 9_

- [x] 20. 实现工具包更新云函数 `admin_toolkits_update`
  - 支持更新所有字段
  - 上下架操作
  - _需求: 需求 9_

- [x] 21. 实现课程列表云函数 `admin_courses_list`
  - 分页查询课程数据
  - 支持难度和状态筛选
  - _需求: 需求 10_

- [x] 22. 实现课程新增云函数 `admin_courses_add`
  - 验证必填字段
  - 生成唯一 courseId
  - _需求: 需求 10_

- [x] 23. 实现课程更新云函数 `admin_courses_update`
  - 支持更新所有字段
  - 章节管理
  - _需求: 需求 10_

- [x] 24. 实现计算模板列表云函数 `admin_calc_templates_list`
  - 分页查询模板数据
  - 支持类型和空间类型筛选
  - _需求: 需求 11_

- [x] 25. 实现计算模板更新云函数 `admin_calc_templates_update`
  - 支持更新配置
  - 公开/隐藏操作
  - _需求: 需求 11_

### 阶段七：部署与测试（优先级：P0）

- [x] 26. 部署所有云函数
  - 使用 MCP createFunction 部署新函数
  - 验证部署成功（23个云函数全部部署完成）

- [x] 27. 联调测试
  - 后台管理系统与云函数联调
  - 验证所有功能正常

---

## 云函数清单

| 序号 | 云函数名称 | 功能描述 | 对应需求 | 状态 |
|------|------------|----------|----------|------|
| 1 | admin_dashboard_stats | 仪表盘统计数据 | 需求1 | ✅ |
| 2 | admin_users_list | 用户列表查询 | 需求2 | ✅ |
| 3 | admin_users_update | 用户信息更新 | 需求2 | ✅ |
| 4 | admin_designers_list | 设计师列表查询 | 需求3 | ✅ |
| 5 | admin_designers_add | 新增设计师 | 需求3 | ✅ |
| 6 | admin_designers_update | 更新设计师 | 需求3 | ✅ |
| 7 | admin_products_list | 商品列表查询 | 需求4 | ✅ |
| 8 | admin_orders_list | 订单列表查询 | 需求5 | ✅ |
| 9 | admin_orders_update | 订单状态更新 | 需求5 | ✅ |
| 10 | admin_requests_list | 设计请求列表 | 需求6 | ✅ |
| 11 | admin_requests_update | 设计请求更新 | 需求6 | ✅ |
| 12 | admin_appointments_list | 预约列表查询 | 需求7 | ✅ |
| 13 | admin_appointments_update | 预约状态更新 | 需求7 | ✅ |
| 14 | admin_feedback_list | 反馈列表查询 | 需求8 | ✅ |
| 15 | admin_feedback_reply | 反馈回复 | 需求8 | ✅ |
| 16 | admin_toolkits_list | 工具包列表 | 需求9 | ✅ |
| 17 | admin_toolkits_add | 新增工具包 | 需求9 | ✅ |
| 18 | admin_toolkits_update | 更新工具包 | 需求9 | ✅ |
| 19 | admin_courses_list | 课程列表 | 需求10 | ✅ |
| 20 | admin_courses_add | 新增课程 | 需求10 | ✅ |
| 21 | admin_courses_update | 更新课程 | 需求10 | ✅ |
| 22 | admin_calc_templates_list | 计算模板列表 | 需求11 | ✅ |
| 23 | admin_calc_templates_update | 更新计算模板 | 需求11 | ✅ |

---

## 预估工时

| 阶段 | 任务数 | 预估时间 |
|------|--------|----------|
| 阶段一：基础设施 | 2 | 0.5h |
| 阶段二：核心业务 | 3 | 1h |
| 阶段三：设计师管理 | 3 | 1h |
| 阶段四：订单与请求 | 5 | 1.5h |
| 阶段五：预约与反馈 | 4 | 1h |
| 阶段六：内容管理 | 8 | 2h |
| 阶段七：部署测试 | 2 | 0.5h |
| **合计** | **27** | **约 7.5h** |

---

## 风险与依赖

### 风险

1. **数据库集合为空**：部分集合（designers, products等）当前无数据，需先初始化测试数据
2. **权限验证**：需确保 admin 用户已在 users 表中设置 roles=0

### 依赖

1. **已有云函数**：复用现有 common/auth.js 模块
2. **数据库集合**：依赖已创建的 17 个集合
3. **前端项目**：后台管理系统 API 调用层需对接新云函数

