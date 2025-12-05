# 目标
将 flows/categories/activities 下所有使用 `Requests.create` / `Orders.create` 的页面统一迁移为云函数 `requests_create` / `orders_create`，调用时传入 `userDoc._id` 作为 `userId`，与监听一致。

## 范围（页面文件）
- flows：`pages/flows/publish/publish.js`、`pages/flows/selection/selection.js`、`pages/flows/optimize/optimize.js`
- categories：`pages/categories/residential/residential.js`、`pages/categories/commercial/commercial.js`、`pages/categories/office/office.js`、`pages/categories/hotel/hotel.js`
- activities：`pages/activities/detail/detail.js`

## 改造方式
- 引入 `util` 并使用 `util.callCf(name, data)` 封装调用云函数。
- 获取 `userId = wx.getStorageSync('userDoc')._id`，将其传入 `order.userId` / `request.userId`。
- 保留原有 `initCollections` 重试逻辑：云函数失败且错误为集合缺失时，先调用 `initCollections` 再重试云函数。
- 不改动数据结构与字段命名，保持与现有监听 / 映射一致（`type/category/params/status/paid` 等）。

## 验证
- 在每个入口下单一次：云数据库出现新订单与请求；订单管理页监听与列表显示该订单；支付/撤销/删除流程正常。

## 文档
- 更新 `docs/backend-implementation-log.md`，记录迁移页面与调用约定（统一使用云函数创建、`userId` 为用户文档 `_id`）。