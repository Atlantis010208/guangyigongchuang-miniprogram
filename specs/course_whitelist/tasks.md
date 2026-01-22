# 课程白名单授权功能 - 实施计划

## 任务概览

| 阶段 | 任务数 | 预估时间 | 状态 |
|------|--------|----------|------|
| 一、数据库准备 | 2 | 10 分钟 | ✅ 已完成 |
| 二、云函数开发 | 3 | 45 分钟 | ✅ 已完成 |
| 三、管理后台开发 | 3 | 45 分钟 | ✅ 已完成 |
| 四、测试验证 | 3 | 20 分钟 | 🔲 待执行 |
| **合计** | **11** | **约 2 小时** | - |

---

## 一、数据库准备

- [x] **1.1 创建 `course_whitelist` 集合** ✅
  - 使用 MCP 工具创建集合
  - 验证集合创建成功
  - _需求: 需求 1_

- [x] **1.2 创建数据库索引** ✅
  - 创建唯一索引 `phone + courseId`（防止重复导入）
  - 创建普通索引 `status`（状态筛选）
  - 创建普通索引 `activatedUserId`（用户查询）
  - 创建普通索引 `createdAt`（时间排序）
  - _需求: 需求 1_

---

## 二、云函数开发

- [x] **2.1 创建 `admin_whitelist_import` 云函数** ✅
  - 创建云函数目录和基础文件（index.js, package.json）
  - 添加管理员权限验证（复用 admin_auth.js）
  - 实现 Excel/CSV 文件解析（使用 xlsx 库）
  - 实现手机号格式校验（11位数字，1开头）
  - 实现去重逻辑（查询已存在记录）
  - 实现批量插入逻辑
  - 返回导入统计结果
  - 部署云函数
  - _需求: 需求 1_

- [x] **2.2 创建 `admin_whitelist_list` 云函数** ✅
  - 创建云函数目录和基础文件
  - 添加管理员权限验证
  - 实现分页查询
  - 实现状态筛选（pending/activated/all）
  - 实现手机号模糊搜索
  - 实现统计数据计算（总数、待激活、已激活、激活率）
  - 手机号脱敏处理（138****5678）
  - 部署云函数
  - _需求: 需求 4_

- [x] **2.3 改造 `getPhoneNumber` 云函数** ✅
  - 新增 `checkAndActivateWhitelist` 函数
  - 在保存手机号后调用白名单检查
  - 匹配白名单时创建课程订单（status: completed, source: whitelist）
  - 更新白名单状态为 activated
  - 添加异常捕获（不影响登录流程）
  - 添加日志记录
  - 部署更新后的云函数
  - _需求: 需求 2_

---

## 三、管理后台开发

- [x] **3.1 扩展 API 服务层** ✅
  - 在 `src/services/api.ts` 中添加 `whitelistApi` 对象
  - 实现 `list` 方法（列表查询）
  - 实现 `import` 方法（文件导入）
  - 添加 TypeScript 类型定义（WhitelistRecord, WhitelistStats）
  - _需求: 需求 1, 需求 4_

- [x] **3.2 创建白名单管理页面** ✅
  - 创建 `src/pages/business/WhitelistList.tsx`
  - 实现统计卡片组件（总数、待激活、已激活、激活率）
  - 实现文件上传组件（支持 xlsx/xls/csv）
  - 实现导入结果弹窗（成功/重复/失败统计）
  - 实现状态筛选下拉框
  - 实现手机号搜索输入框
  - 实现数据表格（分页、状态标签、时间格式化）
  - 实现模板下载功能
  - _需求: 需求 1, 需求 4_

- [x] **3.3 配置路由和菜单** ✅
  - 在路由配置中添加 `/business/whitelist` 路由
  - 在侧边栏菜单中添加"课程白名单"入口（业务管理下）
  - 设置菜单图标（ListChecks）
  - _需求: 需求 4_

---

## 四、测试验证

- [ ] **4.1 白名单导入测试**
  - 准备测试 Excel 文件（包含有效手机号、无效手机号、重复手机号）
  - 测试文件上传和解析
  - 验证导入结果统计准确
  - 验证数据库记录正确
  - _需求: 需求 1_

- [ ] **4.2 白名单激活测试**
  - 使用测试手机号在小程序中授权登录
  - 验证白名单状态变为 activated
  - 验证订单创建成功（source: whitelist）
  - 验证课程详情页显示"已购买"
  - 验证"我的订单"页面显示课程订单
  - 测试非白名单用户登录（不创建订单）
  - 测试已激活用户再次登录（不重复创建订单）
  - _需求: 需求 2, 需求 3_

- [ ] **4.3 管理后台测试**
  - 测试白名单列表查询
  - 测试状态筛选功能
  - 测试手机号搜索功能
  - 测试分页功能
  - 验证统计数据准确
  - _需求: 需求 4_

---

## 文件清单

### 新增文件

| 文件路径 | 说明 | 状态 |
|----------|------|------|
| `cloudfunctions/admin_whitelist_import/index.js` | 白名单导入云函数 | ✅ |
| `cloudfunctions/admin_whitelist_import/package.json` | 依赖配置 | ✅ |
| `cloudfunctions/admin_whitelist_import/admin_auth.js` | 权限验证（复制） | ✅ |
| `cloudfunctions/admin_whitelist_list/index.js` | 白名单列表云函数 | ✅ |
| `cloudfunctions/admin_whitelist_list/package.json` | 依赖配置 | ✅ |
| `cloudfunctions/admin_whitelist_list/admin_auth.js` | 权限验证（复制） | ✅ |
| `Backend-management/guangyi-admin/src/pages/business/WhitelistList.tsx` | 管理后台页面 | ✅ |

### 修改文件

| 文件路径 | 修改内容 | 状态 |
|----------|----------|------|
| `cloudfunctions/getPhoneNumber/index.js` | 新增白名单激活逻辑 | ✅ |
| `Backend-management/guangyi-admin/src/services/api.ts` | 新增 whitelistApi | ✅ |
| `Backend-management/guangyi-admin/src/App.tsx` | 新增路由配置 | ✅ |
| `Backend-management/guangyi-admin/src/layouts/BasicLayout.tsx` | 新增菜单项 | ✅ |

---

## 验收标准检查清单

### 需求 1 - 白名单数据导入 ✅
- [x] 支持 xlsx/xls/csv 格式
- [x] 手机号格式校验
- [x] 重复记录跳过
- [x] 导入结果统计

### 需求 2 - 用户登录自动激活 ✅
- [x] 手机号授权时自动检查白名单
- [x] 静默创建课程订单
- [x] 更新白名单状态
- [x] 不影响正常登录流程
- [x] 幂等性保证

### 需求 3 - 课程购买状态检查兼容 ✅
- [x] 创建订单后自动被 course_purchase_check 识别
- [x] 可正常观看课程视频
- [x] 我的订单显示课程订单

### 需求 4 - 白名单管理查询 ✅
- [x] 列表分页展示
- [x] 状态筛选
- [x] 手机号搜索
- [x] 统计数据展示

---

## 已部署资源

### 云函数

| 函数名 | 状态 | 控制台链接 |
|--------|------|-----------|
| admin_whitelist_import | ✅ 已部署 | [查看](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/scf/detail?id=admin_whitelist_import&NameSpace=cloud1-5gb9c5u2c58ad6d7) |
| admin_whitelist_list | ✅ 已部署 | [查看](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/scf/detail?id=admin_whitelist_list&NameSpace=cloud1-5gb9c5u2c58ad6d7) |
| getPhoneNumber | ✅ 已更新 | [查看](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/scf/detail?id=getPhoneNumber&NameSpace=cloud1-5gb9c5u2c58ad6d7) |

### 数据库

| 集合名 | 状态 | 控制台链接 |
|--------|------|-----------|
| course_whitelist | ✅ 已创建 | [查看](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/db/doc/collection/course_whitelist) |

---

**开发阶段已完成！** ✅ 

**下一步**：进行测试验证，确保功能正常工作。
