# 目标
- 完成小程序后端（云函数 + 云托管）开发与稳定化。
- 交付两份文档：
  - `docs/backend-implementation-log.md`：记录操作与完成任务、环境与验证步骤。
  - `docs/backend-api.md`：后端接口文档（云函数与云托管），含请求/响应、错误码、示例。

## 实施范围
### 云函数
- 鉴权与用户：`login`、`getPhoneNumber` 统一返回结构与错误码；补充异常分支与字段一致性。
- 订单/请求安全写：新增 `orders_create/update/remove`、`requests_create/update/remove`，前端写入迁移至云函数。
- 集合治理：`initCollections` 完整集合清单，`setup_indexes` 扩展 `users/orders/requests/designers/appointments` 索引。

### 云托管（Express）
- 推荐接口：`GET /api/recommend/designers` 支持查询与分页，返回 `{ok, version, ts, items}`。
- 支付回调：`POST /api/pay/callback` WeChat Pay v3 验签骨架（密钥/证书走环境变量），返回 `{ok, ts, transactionId, outTradeNo, status}`。
- 管理初始接口：
  - `GET /api/admin/collections` 返回集合清单。
  - `GET /api/admin/models` 返回域模型字段。
  - `GET /api/admin/users|orders|requests` 只读分页查询（对接 CloudBase Node SDK，凭环境变量 `ENV_ID`）。

### 数据与权限
- 逻辑删除统一：仓库层列表/监听过滤 `isDelete: 0`；删除统一为逻辑删除。
- 集合权限模板：控制台设置“仅创建者可读写”，文档提供模板与步骤。

## 文档交付内容
### backend-implementation-log.md
- 变更列表（云函数/云托管/仓库层/索引与权限）与提交摘要。
- 环境变量与配置项（不含敏感值）：`ENV_ID`、支付密钥配置、灰度/告警建议。
- 验证步骤：PowerShell/cURL 命令、预期响应示例、控制台索引与权限检查。

### backend-api.md
- 云函数接口：名称、入参、出参、错误码表、调用示例（`wx.cloud.callFunction`）。
- 云托管接口：路径、方法、查询/体参数、响应结构、错误码、cURL 示例与说明。
- 通用规范：时间戳、分页、`ok/code/errorMessage` 约定，鉴权与幂等建议。

## 验证与运维
- 本地验证云托管端口 `8080` 与云函数调用链；支付回调使用沙箱参数联调。
- 云托管灰度、告警、费用与容量规划（依据 Context7 云托管官方文档）。

## Context7 依据
- `/websites/developers_weixin_qq_miniprogram_dev_wxcloudservice_wxcloudrun_src`：云托管与云函数对比、支付回调、环境流水线、告警设置等最佳实践。

## 约束与安全
- 不引入明文秘钥；支付配置通过环境变量注入。
- 接口返回统一规范，便于前端与管理端快速对接。