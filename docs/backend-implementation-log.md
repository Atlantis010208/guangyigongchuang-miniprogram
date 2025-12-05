# 后端实现日志

## 概览
- 云函数：完成鉴权与用户、订单/请求写操作的标准化与安全化。
- 云托管：完善推荐、支付回调与初始管理接口，提供只读分页基础。
- 数据治理：统一逻辑删除、扩展高频索引、版本化集合初始化。

## 变更清单
- 云函数
  - login：统一返回结构 `{success, code, openid, user}`，错误码 `LOGIN_FAILED`。
  - getPhoneNumber：统一返回结构 `{success, code, phoneInfo}`，错误码 `PHONE_FAILED`。
  - 新增：
    - orders_create（云函数）：创建订单（含 `orderNo/userId/isDelete/createdAt/updatedAt`）。
    - orders_update（云函数）：按 `orderNo + userId` 更新订单。
    - orders_remove（云函数）：按 `orderNo + userId` 逻辑删除订单。
    - requests_create（云函数）：创建请求（含逻辑删除字段）。
    - requests_update（云函数）：按 `id` 或 `orderNo + userId` 更新请求。
    - requests_remove（云函数）：按 `id` 或 `orderNo + userId` 逻辑删除请求。
- 云托管（Express 8080）
  - GET `/api/recommend/designers`：统一返回 `{ok, version, ts, items}`。
  - POST `/api/pay/callback`：统一返回 `{ok, ts, transactionId, outTradeNo, status}`。
  - GET `/api/admin/collections`：返回集合清单。
  - GET `/api/admin/models`：返回主要域模型字段。
  - GET `/api/admin/users|orders|requests`：分页只读（当前为占位返回，后续绑定 CloudBase SDK）。
- 仓库层（utils/api.js）
  - 列表与监听统一过滤 `isDelete: 0`。
  - 删除改为逻辑删除（requests）。
- 索引与初始化
  - setup_indexes：新增 `users/orders/requests` 索引（含 `_openid`、`orderNo` 唯一、`userId+createdAt` 等）。
  - app.js：集合初始化版本提升为 `v3`，触发一次性初始化与索引治理。

## 环境与配置
- 云函数/云托管统一环境：`cloud1-5gb9c5u2c58ad6d7`。
- 云托管配置建议：
  - 环境变量（示例）：`ENV_ID`、支付密钥/证书相关变量（不加入仓库明文）。
  - 灰度与流水线：开发/测试用 dev/test 分支自动部署；预发/生产采用手动触发与灰度发布。
  - 告警建议：环境创建/资源到期/欠费等规则开启。

### 云函数依赖与部署
- 每个云函数目录必须包含独立的 `package.json` 并声明 `dependencies`：
  - `cloudfunctions/orders_create|orders_update|orders_remove|requests_create|requests_update|requests_remove`
  - 依赖：`wx-server-sdk`（例如 `^2.11.0`）
- 在微信开发者工具的云函数面板，选择“上传并部署（云端安装依赖）”。如遇缺包错误，可在函数详情中“重新安装依赖/清理构建缓存”后重试。

## 验证步骤
- 云托管本地验证（需已运行 `node cloudrun/index.js`）：
  - `curl http://localhost:8080/api/admin/collections`
  - `curl http://localhost:8080/api/admin/models`
  - `curl "http://localhost:8080/api/admin/orders?page=1&pageSize=10"`
- 云函数调用（示例，前端或开发者工具）：
  - `wx.cloud.callFunction({ name: 'orders_create', data: { order: { type: 'products', totalAmount: 100 } } })`
  - `wx.cloud.callFunction({ name: 'orders_update', data: { orderNo: 'O123', patch: { status: 'paid' } } })`
  - `wx.cloud.callFunction({ name: 'orders_remove', data: { orderNo: 'O123' } })`
  - `wx.cloud.callFunction({ name: 'requests_create', data: { request: { category: 'residential' } } })`

## 联调变更（前端页面）
- pages/cart/cart.js：将删除订单/需求的云端同步迁移为调用 `orders_remove` 与 `requests_remove` 云函数。
- pages/order/detail/detail.js：撤销改为 `orders_update` 与 `requests_update`，删除改为 `orders_remove` 与 `requests_remove`。
- pages/order/confirm/confirm.js：支付状态同步改为 `orders_update` 与 `requests_update`。
- pages/request/progress/progress.js：删除订单与需求改为 `orders_remove` 与 `requests_remove`。

### 创建订单改造
- pages/order/confirm/confirm.js：将订单与需求创建改为调用 `orders_create` 与 `requests_create`，调用时传入 `userDoc._id` 作为 `userId` 以匹配现有监听与列表过滤。
- flows：publish/selection/optimize 的创建逻辑均迁移为云函数调用（保持 `category`、`params`、`status` 字段一致）。
- categories：residential/commercial/office/hotel 的创建逻辑均迁移为云函数调用，失败时保留 `initCollections` 重试。
- activities/detail：表单提交流程改为云函数调用，保持与监听一致。
### 前端调用封装
- utils/util.js：新增 `callCf(name, data)` 统一云函数调用与错误处理，返回云函数 `result` 字段。

## 后续规划
- 绑定 CloudBase Node SDK 到云托管只读接口，落地真实数据查询。
- 支付回调对接 WeChat Pay v3 验签与订单状态写回云数据库。
- 管理后台 UI 独立项目对接上述 admin 接口，逐步扩展写操作（受控权限）。

