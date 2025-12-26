# 需求文档：后台管理云函数

## 介绍

为光乙共创平台后台管理系统创建完整的云函数支持。后台管理系统使用 React + TypeScript + Ant Design 构建，需要与微信云开发后端对接。所有管理端云函数统一使用 `admin_` 前缀，与 C 端云函数区分。

### 项目背景

- **小程序端项目**: `20250925-miniprogram-4`
- **后台管理系统**: `Backend-management/guangyi-admin`
- **云环境 ID**: `cloud1-5gb9c5u2c58ad6d7`
- **数据库类型**: 微信云开发云数据库（NoSQL）

### 已有数据库集合

| 集合名 | 描述 | 数据量 |
|--------|------|--------|
| users | 用户表 | 1 |
| designers | 设计师表 | 0 |
| products | 商品表 | 0 |
| orders | 订单表 | 5 |
| requests | 设计请求表 | 5 |
| appointments | 预约表 | 0 |
| feedbacks | 反馈表 | 1 |
| calc_templates | 计算模板表 | 0 |
| calculations | 计算记录表 | 0 |
| favorites | 收藏表 | 2 |
| categories | 分类表 | 0 |
| cart | 购物车表 | 0 |
| receipts | 发票表 | 0 |
| notifications | 通知表 | 0 |
| transactions | 交易表 | 0 |
| surveys | 勘测表 | 0 |
| user_settings | 用户设置表 | 1 |

---

## 需求

### 需求 1 - 仪表盘统计 (admin_dashboard_stats)

**用户故事：** 作为平台管理员，我需要在控制台查看平台关键运营指标，以便快速了解平台整体状况。

#### 验收标准

1. When 管理员访问控制台时，the system shall 返回以下统计数据：
   - 用户总数、新增用户数（本周/本月）
   - 设计师总数、在线设计师数
   - 订单总数、待处理订单数、本月订单数、总销售额
   - 设计请求总数、待处理请求数
   - 预约总数、待确认预约数

2. When 统计数据请求时，the system shall 支持时间范围筛选（today/week/month/year）

3. When 请求成功时，the system shall 返回订单趋势数据（近7天/30天）

4. When 非管理员用户请求时，the system shall 返回权限错误 (FORBIDDEN)

---

### 需求 2 - 用户管理 (admin_users_list / admin_users_update)

**用户故事：** 作为平台管理员，我需要管理平台用户，包括查看用户列表、修改用户角色和状态。

#### 验收标准

1. **admin_users_list**
   - When 管理员请求用户列表时，the system shall 返回分页的用户数据
   - When 提供搜索关键词时，the system shall 支持按昵称/手机号模糊搜索
   - When 提供角色筛选时，the system shall 支持按角色过滤（0=管理员, 1=用户, 2=设计师）
   - When 返回数据时，the system shall 包含用户基本信息（昵称、头像、手机号、角色、注册时间、状态）

2. **admin_users_update**
   - When 更新用户角色时，the system shall 验证目标角色有效性（0/1/2）
   - When 更新用户状态时，the system shall 支持禁用/启用操作
   - When 更新成功时，the system shall 记录更新时间

---

### 需求 3 - 设计师管理 (admin_designers_list / admin_designers_add / admin_designers_update)

**用户故事：** 作为平台管理员，我需要管理设计师信息，包括添加、编辑设计师资料和认证状态。

#### 验收标准

1. **admin_designers_list**
   - When 管理员请求设计师列表时，the system shall 返回分页的设计师数据
   - When 提供筛选条件时，the system shall 支持按空间类型、评分范围、认证状态过滤
   - When 提供排序条件时，the system shall 支持按评分、项目数、价格排序

2. **admin_designers_add**
   - When 添加新设计师时，the system shall 验证必填字段（姓名、头像、擅长空间类型）
   - When 添加成功时，the system shall 自动设置默认值（评分0、项目数0）

3. **admin_designers_update**
   - When 更新设计师信息时，the system shall 支持更新所有可编辑字段
   - When 更新认证状态时，the system shall 支持通过/拒绝操作
   - When 设置删除状态时，the system shall 使用软删除（isDelete=1）

---

### 需求 4 - 商品管理 (admin_products_list / 已有 admin_product_add / admin_product_update)

**用户故事：** 作为平台管理员，我需要管理商城商品，包括查看商品列表、上下架控制。

#### 验收标准

1. **admin_products_list**
   - When 管理员请求商品列表时，the system shall 返回分页的商品数据
   - When 提供筛选条件时，the system shall 支持按分类、状态、价格范围过滤
   - When 提供搜索条件时，the system shall 支持按商品名称模糊搜索
   - When 返回数据时，the system shall 包含库存预警信息（库存<10为低库存）

2. **状态管理** (通过现有 admin_product_update 实现)
   - When 切换商品状态时，the system shall 支持上架/下架操作
   - When 商品已下架时，小程序端不展示该商品

---

### 需求 5 - 订单管理 (admin_orders_list / admin_orders_update)

**用户故事：** 作为平台管理员，我需要管理平台订单，包括查看订单列表、更新订单状态和发货处理。

#### 验收标准

1. **admin_orders_list**
   - When 管理员请求订单列表时，the system shall 返回分页的订单数据
   - When 提供筛选条件时，the system shall 支持按订单状态、订单类型、日期范围过滤
   - When 提供搜索条件时，the system shall 支持按订单号搜索
   - When 返回数据时，the system shall 关联用户信息（昵称、手机号）

2. **admin_orders_update**
   - When 更新订单状态时，the system shall 验证状态流转合法性
     - pending → paid/cancelled
     - paid → shipped/refunded
     - shipped → completed
   - When 填写发货信息时，the system shall 保存物流单号和物流公司
   - When 状态变更时，the system shall 记录操作时间

---

### 需求 6 - 设计请求管理 (admin_requests_list / admin_requests_update)

**用户故事：** 作为平台管理员，我需要管理灯光设计请求，包括查看请求列表、分配设计师、更新工作流阶段。

#### 验收标准

1. **admin_requests_list**
   - When 管理员请求列表时，the system shall 返回分页的设计请求数据
   - When 提供筛选条件时，the system shall 支持按空间类型、工作流阶段、状态过滤
   - When 返回数据时，the system shall 关联用户和设计师信息

2. **admin_requests_update**
   - When 分配设计师时，the system shall 更新 designerId 字段
   - When 推进工作流阶段时，the system shall 按顺序更新 stage 字段：
     - publish → survey → concept → calc → selection → optimize → construction → commission
   - When 阶段变更时，the system shall 更新 steps 数组中对应阶段的状态和时间

---

### 需求 7 - 预约管理 (admin_appointments_list / admin_appointments_update)

**用户故事：** 作为平台管理员，我需要管理用户与设计师的预约记录。

#### 验收标准

1. **admin_appointments_list**
   - When 管理员请求预约列表时，the system shall 返回分页的预约数据
   - When 提供筛选条件时，the system shall 支持按状态、日期范围过滤
   - When 返回数据时，the system shall 关联用户和设计师信息

2. **admin_appointments_update**
   - When 更新预约状态时，the system shall 支持 pending/confirmed/completed/cancelled 状态
   - When 状态变更时，the system shall 记录更新时间

---

### 需求 8 - 反馈管理 (admin_feedback_list / admin_feedback_reply)

**用户故事：** 作为平台管理员，我需要处理用户反馈，包括查看反馈列表、回复用户。

#### 验收标准

1. **admin_feedback_list**
   - When 管理员请求反馈列表时，the system shall 返回分页的反馈数据
   - When 提供筛选条件时，the system shall 支持按类型、状态过滤
   - When 返回数据时，the system shall 包含用户信息和反馈内容

2. **admin_feedback_reply**
   - When 回复反馈时，the system shall 保存回复内容和时间
   - When 回复成功时，the system shall 更新反馈状态为 processing/resolved
   - When 设置已读时，the system shall 更新 isRead 字段

---

### 需求 9 - 内容管理 - 工具包 (admin_toolkits_list / admin_toolkits_add / admin_toolkits_update)

**用户故事：** 作为平台管理员，我需要管理灯光工具包内容。

#### 验收标准

1. **admin_toolkits_list**
   - When 管理员请求工具包列表时，the system shall 返回分页的工具包数据
   - When 提供筛选条件时，the system shall 支持按分类、状态过滤

2. **admin_toolkits_add**
   - When 添加工具包时，the system shall 验证必填字段（标题、价格、分类）
   - When 添加成功时，the system shall 生成唯一 toolkitId

3. **admin_toolkits_update**
   - When 更新工具包时，the system shall 支持更新所有可编辑字段
   - When 上下架操作时，the system shall 更新 status 字段

---

### 需求 10 - 内容管理 - 课程 (admin_courses_list / admin_courses_add / admin_courses_update)

**用户故事：** 作为平台管理员，我需要管理照明设计培训课程。

#### 验收标准

1. **admin_courses_list**
   - When 管理员请求课程列表时，the system shall 返回分页的课程数据
   - When 提供筛选条件时，the system shall 支持按难度等级、状态过滤

2. **admin_courses_add**
   - When 添加课程时，the system shall 验证必填字段（标题、价格、讲师）
   - When 添加成功时，the system shall 生成唯一 courseId

3. **admin_courses_update**
   - When 更新课程时，the system shall 支持更新所有可编辑字段
   - When 管理章节时，the system shall 支持添加/编辑/删除课程章节

---

### 需求 11 - 内容管理 - 计算模板 (admin_calc_templates_list / admin_calc_templates_update)

**用户故事：** 作为平台管理员，我需要管理照明计算模板。

#### 验收标准

1. **admin_calc_templates_list**
   - When 管理员请求模板列表时，the system shall 返回分页的模板数据
   - When 提供筛选条件时，the system shall 支持按类型(system/user)、空间类型过滤

2. **admin_calc_templates_update**
   - When 更新系统模板时，the system shall 支持更新所有配置
   - When 审核用户模板时，the system shall 支持公开/隐藏操作

---

## 通用验收标准

### 权限验证

- 所有 admin_ 前缀云函数 shall 验证调用者为管理员（roles === 0）
- When 权限验证失败时，shall 返回 `{ success: false, code: 'FORBIDDEN', errorMessage: 'No permission' }`

### 返回格式

- 成功响应格式：
```json
{
  "success": true,
  "code": "OK",
  "data": {},
  "total": 0,
  "message": "success"
}
```

- 失败响应格式：
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "errorMessage": "错误描述"
}
```

### 分页规范

- 默认 limit: 20, offset: 0
- 返回数据需包含 total 总数

### 软删除

- 删除操作统一使用软删除（isDelete: 1）
- 查询默认过滤已删除数据（isDelete: 0）

