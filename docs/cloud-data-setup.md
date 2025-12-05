# 云数据库搭建与改造说明

## 目标
- 搭建统一的数据集合（Cloud Database）
- 引入仓库封装与实时监听（watch）
- 渐进替换页面中的分散数据库调用

## 集合清单
- 必须：`users`、`orders`
- 建议：`requests`、`products`、`categories`、`transactions`、`notifications`、`surveys`

## 已完成任务清单
- 新增云函数 `initCollections`，确保集合存在（`cloudfunctions/initCollections/index.js:1`）
- 启动首启执行集合初始化并写入本地标记（`app.js:142`）
- 统一数据访问封装与缓存（`utils/api.js:1`、`utils/api.js:12`、`utils/api.js:20`、`utils/api.js:28`）
- 发布页改造为仓库写入 `requests` 和 `orders`，并在集合不存在时自动初始化后重试（`pages/flows/publish/publish.js:80`）
- 购物车页接入 `watch`，实时合并云端与本地列表（`pages/cart/cart.js:90`、`pages/cart/cart.js:106`、`pages/cart/cart.js:178`）
- 故障排查与重试机制文档化（见文末“故障排查”）
- 本文件记录所有操作、代码位置与验证步骤

## 已实施的改动

### 1) 新增云函数：初始化集合
- 文件：`cloudfunctions/initCollections/index.js`
- 说明：确保上述集合存在，便于一次性初始化
- 相关：`cloudfunctions/initCollections/package.json`、`cloudfunctions/initCollections/config.json`

### 2) 启动时按需初始化集合
- 文件：`app.js`
- 位置：`app.js:12` 云开发初始化；`app.js:101` 按需调用 `initCollectionsIfDev`
- 说明：首启时先检查关键集合是否存在，仅在检测到缺失时调用云函数；否则直接写入本地标记跳过初始化

### 3) 统一数据访问封装
- 文件：`utils/api.js`
- 能力：
  - `dbInit()` 初始化数据库引用
  - `makeLRU(limit)` 简易 LRU 缓存
  - `getUsersRepo(db)`、`getOrdersRepo(db)`、`getRequestsRepo(db)` 封装 CRUD 与 `watch`

### 4) 发布页改造为仓库写入
- 文件：`pages/flows/publish/publish.js`
- 位置：顶部新增 `require('../../../utils/api')`
- 行为：
  - 保留本地缓存 `lighting_requests`
  - 云端写入：`requests.create(...)` 与 `orders.create(...)`

### 5) 购物车页接入实时监听并合并展示
- 文件：`pages/cart/cart.js`
- 位置：顶部新增 `require('../../utils/api')`
- 行为：
  - `startWatchers()` 监听当前用户的 `orders` 与 `requests`
  - 将云端文档合并本地 `lighting_requests`，统一在页面展示
  - `stopWatchers()` 在隐藏/卸载时关闭监听

## 使用与验证

### 部署云函数
- 在微信开发者工具云开发面板中，部署 `initCollections`

### 初始化集合
- 开发版运行小程序，查看日志输出：`集合初始化结果`
- 云开发控制台 → 数据库，确认集合已创建

### 发布请求写入验证
- 在发布页提交一次需求
- 验证：
  - 本地 `lighting_requests` 有新增
  - 云端 `requests` 与 `orders` 集合出现对应记录

### 购物车实时列表验证
- 打开购物车页，确保已登录（有 `userDoc._id`）
- 云端对 `orders`、`requests` 的写入会通过 `watch` 推送到页面，列表自动刷新

### 个人中心入口验证
- 进入个人中心页（`pages/profile/home/home`）
- 点击“购物车”入口，确认跳转到商城购物车页（`/pages/mall/cart/cart`）

## 权限与索引建议
- 权限：
  - 用户/订单/请求等集合采用“仅创建者可读写”，敏感写经云函数
  - 产品/分类集合开放只读，管理员写
- 索引：
  - `orders.orderNo` 唯一、`orders.userId+createdAt` 复合
  - `users._openid`、`products.sku`、`categories.slug`

## 下一步工作（建议）
- 将其他页面的数据库调用替换为仓库接口（分类页、优化/选配流程等）
- 为订单支付与押金、地址合并等敏感逻辑补充云函数接口
- 引入统一事件总线，写操作后触发应用内通知（可结合 `notifications` 集合）

## 代码定位参考
- 云函数初始化：`cloudfunctions/initCollections/index.js:1`
- 启动初始化调用：`app.js:142`
- 仓库封装：`utils/api.js:1`、`utils/api.js:9`、`utils/api.js:12`、`utils/api.js:20`、`utils/api.js:28`
- 发布页改造：`pages/flows/publish/publish.js:1`、`pages/flows/publish/publish.js:80`
- 购物车监听：`pages/cart/cart.js:1`、`pages/cart/cart.js:35`、`pages/cart/cart.js:90`、`pages/cart/cart.js:106`、`pages/cart/cart.js:178`

## 故障排查
- 发布后 `orders` 有记录但 `requests` 无记录：
  - 确认已部署并执行 `initCollections`，或查看启动日志是否执行成功（首次启动会自动执行）。
  - 确认 `requests` 集合权限为“仅创建者可读写”。前端写入会自动携带 `_openid`。
  - 查看发布页写入是否因集合不存在而自动重试：`pages/flows/publish/publish.js:80`，失败会触发一次 `initCollections` 并重试写入。
  - 若仍失败，打开开发者工具 Console，检查 `云端保存发布请求失败` 的错误信息，关注 `errCode` 与 `errMsg`。
- 实时监听错误：`current state (CONNECTED) does not accept "connectionSuccess"`
  - 原因：同一页面重复创建 watch 或网络抖动导致 SDK 状态机收到重复握手事件。
  - 修复：仓库 watch 支持 onError 并限制监听规模（orderBy+limit）；购物车页改为在 watch 参数里传入 onError，避免重复创建，并在错误时指数退避重启（`utils/api.js`、`pages/cart/cart.js:96`）。
- wx:key 重复告警
  - 现象：`Do not set same key "..." in wx:key`，常见于云端与本地列表合并后 id 重复。
  - 修复：`reloadRequests()` 合并时按 `id` 去重，优先云端，再补充本地（`pages/cart/cart.js:258`）。
### 页面改造记录
- selection
  - 文件：`pages/flows/selection/selection.js`
  - 改造：使用 `RequestsRepo.create` 与 `OrdersRepo.create` 写入云端；集合不存在时自动初始化并重试。
  - 关键代码：`pages/flows/selection/selection.js:1`（引入仓库）、`pages/flows/selection/selection.js:139`（云端写入与重试）。
  - 验证：提交一次选型需求，控制台查看 `requests` 与 `orders` 是否各有一条记录。
- optimize
  - 文件：`pages/flows/optimize/optimize.js`
  - 改造：使用 `RequestsRepo.create` 与 `OrdersRepo.create` 写入云端；集合不存在时自动初始化并重试。
  - 关键代码：`pages/flows/optimize/optimize.js:1`（引入仓库）、`pages/flows/optimize/optimize.js:84`（云端写入与重试）。
  - 验证：提交一次优化需求，控制台查看 `requests` 与 `orders` 是否各有一条记录。

### 其他修复
- profile/home
  - 文件：`pages/profile/home/home.wxml`、`pages/profile/home/home.js`
  - 改造：新增“购物车”入口，事件 `go` 对 Tab 页 `'/pages/cart/cart'` 使用 `wx.switchTab`，对商城购物车页 `'/pages/mall/cart/cart'` 使用 `wx.navigateTo`
  - 关键代码：`pages/profile/home/home.wxml:16`、`pages/profile/home/home.js:63-72`
  - 验证：在个人中心点击“购物车”，跳转到商城购物车页；点击“订单”入口，切换到底部“订单管理”页。
- 押金支付后跳转订单管理
  - 文件：`pages/profile/deposit/deposit.js`
  - 改造：支付成功后设置 `deposit_paid` 并在 300ms 后使用 `wx.switchTab({ url: '/pages/cart/cart' })` 自动跳转到订单管理页（底部 Tab）。
  - 关键代码：`pages/profile/deposit/deposit.js:25`
  - 验证：在押金页点击“支付押金”→确认→看到“支付成功”后自动进入“订单管理”页面。
- 进度页（用户视角）更多与押金
  - 文件：`pages/request/progress/progress.wxml`、`pages/request/progress/progress.js`、`pages/request/progress/progress.wxss`
  - 改造：底部按钮新增“押金”与“更多”；“更多”下拉包含“撤销订单/删除订单”。
  - 关键代码：`progress.wxml` 按钮区、`progress.wxss` 的 `.btn.more` 与 `.more-icon`、`progress.js:onMoreTap/onDeleteOrder/onGoDeposit`。
  - 验证：点击“更多”选择撤销/删除生效；“押金”跳转到押金支付页。

### 样式优化（更多按钮）
- 文件：`pages/request/progress/progress.wxss`
- 变更：
  - 去除更多按钮边框与背景，尺寸由 `120×88rpx` → `110×78rpx` → `90×58rpx`
  - 三点图标间距与尺寸由 `gap:12rpx, dot:14rpx` → `gap:8rpx, dot:10rpx`
- 验证：按钮上下边界完整显示，三点图标不裁切，清晰可见。
- publish
  - 文件：`pages/flows/publish/publish.js`
  - 改造：提交时 `await` 同步写入 `requests` 与 `orders`，并在集合不存在时初始化后重试。
  - 关键代码：`pages/flows/publish/publish.js:onSubmit`
  - 验证：发布一次需求后两集合均有记录，随后自动跳转到订单管理。
- custom（个性需求定制）
  - 文件：`pages/activities/detail/detail.js`
  - 改造：表单提交时同步写入 `requests` 与 `orders`，集合不存在时初始化后重试。
  - 关键代码：`pages/activities/detail/detail.js:onSubmit`
  - 验证：问卷提交后两集合均有记录，随后自动跳转到订单管理。
- schemes（住宅/商业/办公/酒店）
  - 文件：`pages/categories/residential/residential.js`、`pages/categories/commercial/commercial.js`、`pages/categories/office/office.js`、`pages/categories/hotel/hotel.js`
  - 改造：提交时同步写入 `requests` 与 `orders`，并在集合不存在时初始化后重试；保留本地 `lighting_requests` 与跳转。
  - 验证：四页任意提交后两集合均有记录；订单管理页可见列表更新。
- 逻辑删除（isDelete）
  - 集合：`orders`
  - 字段：`isDelete`（0：正常，1：已删除）。新增订单默认 `isDelete: 0`，删除操作仅更新该字段为 1，保留文档。
  - 接入位置：
    - 仓库：`utils/api.js`（`OrdersRepo.create/listByUser/removeByOrderNo/watchByUser`）
    - 进度页删除：`pages/request/progress/progress.js:onDeleteOrder`（更新为逻辑删除）
    - 购物车删除：`pages/cart/cart.js:onDeleteRequest`（更新为逻辑删除；云端订单列表过滤 `isDelete !== 1`）
    - 商城下单：`pages/order/confirm/confirm.js`（新增订单写入 `isDelete: 0`）
  - 验证：删除后文档仍存在但 `isDelete=1`；列表与监听不再显示该订单。
  - 兼容历史订单：仓库查询与监听改为仅按 `userId` 条件，客户端再过滤 `isDelete !== 1`，避免旧记录缺失 `isDelete` 时被漏显；建议通过控制台或云函数为历史数据补写 `isDelete: 0`。
- 路由与监听故障排查清单
  - 路由：尽量使用 `switchTab` 返回订单管理；`navigateBack` 前检测页面栈长度；为导航添加防重入标记避免并发导航。
  - 监听：仅在 `onShow` 启动、`onHide/onUnload` 关闭；仓库 `watch` 传入 `onError` 并限制 `orderBy+limit`；错误时指数退避；关闭与重启过程加防重入标记。
  - 网络：启动前检测网络连接；监听 `onNetworkStatusChange` 在断网时关闭监听、联网后重启。
