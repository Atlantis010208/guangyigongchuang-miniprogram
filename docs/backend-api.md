# 后端接口文档

## 统一返回规范
- 成功：`{ ok?: true, success?: true, code: 'OK', ts?: number, data?: any }`
- 失败：`{ ok?: false, success?: false, code: string, errorMessage: string }`
- 分页：`{ page: number, pageSize: number, items: any[] }`

## 云函数（wx.cloud.callFunction）
### login
- 入参：`{ profile?: { nickname?, avatarUrl? } }`
- 出参：`{ success, code, openid, user }`
- 错误码：`MISSING_OPENID`、`LOGIN_FAILED`

### getPhoneNumber
- 入参：`{ code: string }`
- 出参：`{ success, code, phoneInfo }`
- 错误码：`MISSING_CODE`、`PHONE_FAILED`

### orders_create
- 入参：`{ order: { type?, category?, items?, totalAmount?, status? } }`
- 出参：`{ success, code, data: orderDoc }`（含 `orderNo/userId/isDelete/createdAt/updatedAt`）
- 错误码：`MISSING_OPENID`、`ORDERS_CREATE_FAILED`

### orders_update
- 入参：`{ orderNo: string, patch: object }`（按 `orderNo + userId` 更新）
- 出参：`{ success, code, data: { updated: number } }`
- 错误码：`MISSING_OPENID`、`MISSING_ORDER_NO`、`ORDERS_UPDATE_FAILED`

### orders_remove
- 入参：`{ orderNo: string }`（逻辑删除）
- 出参：`{ success, code, data: { updated: number } }`
- 错误码：`MISSING_OPENID`、`MISSING_ORDER_NO`、`ORDERS_REMOVE_FAILED`

### requests_create
- 入参：`{ request: { category?, params?, status? } }`
- 出参：`{ success, code, data: requestDoc }`（含 `orderNo/userId/isDelete/createdAt/updatedAt`）
- 错误码：`MISSING_OPENID`、`REQUESTS_CREATE_FAILED`

### requests_update
- 入参：`{ id?: string, orderNo?: string, patch: object }`
- 出参：`{ success, code, data: { updated: number } }`
- 错误码：`MISSING_OPENID`、`MISSING_ID_OR_ORDER_NO`、`REQUESTS_UPDATE_FAILED`

### requests_remove
- 入参：`{ id?: string, orderNo?: string }`（逻辑删除）
- 出参：`{ success, code, data: { updated: number } }`
- 错误码：`MISSING_OPENID`、`MISSING_ID_OR_ORDER_NO`、`REQUESTS_REMOVE_FAILED`

## 云托管（HTTP）
### GET /api/recommend/designers
- 查询参数：`q?: string`、`tags?: string[]`、`page?: number`、`pageSize?: number`
- 响应：`{ ok, version: 'v1', ts, query, items: Designer[] }`

### POST /api/pay/callback
- 体参数：WeChat Pay v3 异步通知（JSON）
- 响应：`{ ok, ts, transactionId, outTradeNo, status }`
- 注意：实际环境需启用签名验证与状态写回；密钥/证书通过环境变量配置。

### GET /api/admin/collections
- 响应：`{ ok, items: string[] }`

### GET /api/admin/models
- 响应：`{ ok, models: Record<string, string[]> }`

### GET /api/admin/users|orders|requests
- 查询参数：`page?: number`、`pageSize?: number`
- 响应：`{ ok, version: 'v1', ts, page, pageSize, items }`
- 说明：当前为占位返回；绑定 CloudBase Node SDK 后返回真实数据。

## 调用示例
### 云函数
```
wx.cloud.callFunction({ name: 'orders_create', data: { order: { type: 'products', totalAmount: 100 } } })
wx.cloud.callFunction({ name: 'orders_update', data: { orderNo: 'O123', patch: { status: 'paid' } } })
wx.cloud.callFunction({ name: 'orders_remove', data: { orderNo: 'O123' } })
```

### 云托管（本地）
```
curl http://localhost:8080/api/admin/collections
curl http://localhost:8080/api/admin/models
curl "http://localhost:8080/api/admin/orders?page=1&pageSize=10"
```

## 错误码表（部分）
- `OK`：成功
- `MISSING_OPENID`：缺少 openid
- `MISSING_ORDER_NO`：缺少订单号
- `MISSING_ID_OR_ORDER_NO`：缺少 id 或订单号
- `LOGIN_FAILED`、`PHONE_FAILED`、`ORDERS_CREATE_FAILED`、`ORDERS_UPDATE_FAILED`、`ORDERS_REMOVE_FAILED`、`REQUESTS_CREATE_FAILED`、`REQUESTS_UPDATE_FAILED`、`REQUESTS_REMOVE_FAILED`

## 版本与约定
- 统一时间戳字段：`createdAt/updatedAt`（毫秒）。
- 逻辑删除字段：`isDelete`（0/1）。
- 分页约定：`page >= 1`，`pageSize <= 50`。 
