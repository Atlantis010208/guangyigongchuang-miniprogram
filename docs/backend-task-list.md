# 微信小程序后端云开发任务清单（移除模拟数据，接入云函数/数据库/存储/云托管）

## 概述
- 目标：全面移除前端模拟数据，改为后端调用云函数与云数据库/云存储，并按需引入云托管以承载长驻后端服务。
- 已检索代码结构并定位模拟数据与云开发使用点；后续按清单实施替换、补齐后端能力与权限、部署与验证。
- 参考文档（Context7）：
  - 云开发总览与能力：`/websites/developers_weixin_qq_miniprogram_dev_wxcloudservice_wxcloud`
  - 云托管总览与部署：`/websites/developers_weixin_qq_miniprogram_dev_wxcloudservice_wxcloudrun_src`

## 现状与改造范围
- 云初始化：`app.js:11-15`
- 数据访问封装：`utils/api.js:10-13,15-47`
- 现有云函数：`cloudfunctions/login/index.js`、`cloudfunctions/initCollections/index.js`、`cloudfunctions/getPhoneNumber/index.js`
- 模拟数据：`pages/designers/list/list.js:35-41,44-101`、`pages/designers/detail/detail.js:47-54,56-81`
- 本地缓存数据：`pages/cart/cart.js:267-310,312-375`

## 任务清单
### 一、移除模拟数据并接入云端
- 删除设计师列表/详情的模拟数据，改为云函数或云数据库查询
- 建立 `designers` 集合
- 新增云函数：`designers_list`、`designer_detail`
- 前端调用改造：`wx.cloud.callFunction({ name: 'designers_list' | 'designer_detail' })`

### 二、需求与预约云端化
- 设计师预约落库到 `appointments` 集合（仅创建者可读写）
- 新增云函数：`appointments_create`、`appointments_list_by_user`、`appointments_cancel`

### 三、订单与需求数据双轨合并与云端对齐
- 以云端为主、本地为辅的合并逻辑
- 扩充集合字段与索引
- 新增云函数：`orders_*`、`requests_*`

### 四、云数据库权限与安全
- 配置集合权限：`products/categories/designers` 管理端可写、所有人可读；`users/orders/requests/appointments/...` 仅创建者可读写
- 云函数使用 `getWXContext` 获取可信身份
- 统一错误码与重试策略

### 五、云存储接入与图片链接管理
- 迁移图片到云存储，前端使用临时链接
- 设置 CDN 缓存策略与监控

### 六、云托管后端（按需）
- 创建 Node.js 云托管服务，提供推荐/回调等接口
- 部署与灰度发布

### 七、前端数据访问层统一
- 在 `utils/api.js` 扩展 Designers 与 Appointments 仓库，同现有风格
- 页面仅依赖仓库/服务层

### 八、环境与配置
- 保持 `project.config.json`、`app.js` 云环境配置与集合初始化逻辑
- 规范资源配额

### 九、索引与性能优化
- 为高频字段建立索引；使用聚合与 Explain 优化查询

### 十、监控与日志
- 云函数调用/错误监控
- 云托管日志检索
- 告警配置

### 十一、测试与验证
- 前端功能回归
- 云函数调试与日志验证，云托管接口集成测试

### 十二、迁移与数据治理
- 本地缓存数据迁移至云端集合；清理冗余
- 数据导出/备份与回滚预案

## 参考（Context7 摘要）
- 云函数管理与用户态：天然鉴权与 `OPENID/APPID` 注入
- 数据库权限：仅创建者可读写/仅管理端可写等基础权限模型
- 实时推送：上限与语法支持
- 存储与缓存：策略优先级与监控指标
- 云托管：天然鉴权、自动扩缩、灰度发布、CI/CD

## 路径与代码定位
- 初始化与集合检测：`app.js:101-121`
- 登录云函数：`cloudfunctions/login/index.js:5-12,57-61`
- 集合初始化：`cloudfunctions/initCollections/index.js:18-31`
- 设计师列表：`pages/designers/list/list.js:32-42`
- 设计师详情：`pages/designers/detail/detail.js:44-53`

