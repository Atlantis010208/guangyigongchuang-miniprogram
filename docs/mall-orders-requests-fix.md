# 电子商城订单与需求记录同步修复

## 问题描述

电子商城中创建订单时，虽然 `orders` 表有记录，但 `requests` 表没有对应记录。这导致订单和需求数据不一致。

## 问题分析

### 数据表关系

在小程序中，有两个核心数据表：

1. **orders 表**：存储所有类型的订单信息
   - 类型包括：`goods`（电子商城）、`products`（照明设计服务）等
   - 字段：`type`, `orderNo`, `category`, `params`, `status`, `paid`, `userId` 等

2. **requests 表**：存储用户的需求/请求信息
   - 用于跟踪服务进度和状态
   - 字段：`orderNo`, `category`, `params`, `userId`, `status` 等

### 其他页面的实现

查看其他页面（如 [`hotel.js`](../pages/categories/hotel/hotel.js:140)、[`optimize.js`](../pages/flows/optimize/optimize.js:109)）的实现，发现它们在创建订单时会**同时创建** `orders` 和 `requests` 记录：

```javascript
// 示例：hotel.js
const Orders = api.getOrdersRepo(db)
const Requests = api.getRequestsRepo(db)

await Requests.create({ orderNo: id, category: 'hotel', params: order.params, userId, status: 'submitted' })
await Orders.create({ type:'products', orderNo: id, category:'hotel', params: order.params, status:'submitted', paid:false, userId })
```

### 电子商城的问题

[`pages/order/confirm/confirm.js`](../pages/order/confirm/confirm.js:149) 中的订单创建代码只创建了 `orders` 记录，没有创建 `requests` 记录：

```javascript
// 修复前的代码
db.collection('orders').add({ data: {
  type: 'goods',
  orderNo: orderId,
  // ... 其他字段
} })
```

## 修复方案

### 修改内容

修改 [`pages/order/confirm/confirm.js`](../pages/order/confirm/confirm.js) 文件：

1. **引入 API 模块**
   ```javascript
   const api = require('../../../utils/api')
   ```

2. **统一使用 API 封装的数据库操作**
   - 使用 `api.getOrdersRepo(db)` 和 `api.getRequestsRepo(db)`
   - 替代直接使用 `db.collection('orders').add()`

3. **同时创建 orders 和 requests 记录**
   ```javascript
   const Orders = api.getOrdersRepo(db)
   const Requests = api.getRequestsRepo(db)
   
   // 创建订单记录
   Orders.create({ 
     type: 'goods', 
     orderNo: orderId, 
     category: 'mall',
     params: orderParams,
     status: 'pending', 
     paid: false, 
     userId 
   })
   
   // 创建需求记录
   Requests.create({ 
     orderNo: orderId, 
     category: 'mall', 
     params: orderParams,
     userId, 
     status: 'pending' 
   })
   ```

4. **更新支付状态时同步更新两个表**
   ```javascript
   Orders.updateByOrderNo(orderId, updateData)
   // 同时更新 requests 表
   db.collection('requests').where({ orderNo: orderId }).update({ data: updateData })
   ```

### 错误处理

添加了完善的错误处理机制：

- 如果 `requests` 集合不存在，自动调用云函数 `initCollections` 初始化
- 捕获并记录所有数据库操作错误
- 确保即使某个操作失败，其他操作仍能继续

## 修复效果

修复后，电子商城创建订单时会：

1. ✅ 在 `orders` 表创建订单记录（type: 'goods'）
2. ✅ 在 `requests` 表创建需求记录（category: 'mall'）
3. ✅ 两条记录通过 `orderNo` 关联
4. ✅ 支付状态更新时同步更新两个表

## 数据一致性

修复后的数据结构：

### orders 表记录
```javascript
{
  _id: "xxx",
  type: "goods",
  orderNo: "1234567890",
  category: "mall",
  params: {
    items: [...],
    totalAmount: 999,
    address: {...},
    addressText: "...",
    note: "..."
  },
  status: "pending" / "paid" / "failed",
  paid: false / true,
  userId: "user_xxx",
  createdAt: 1234567890,
  updatedAt: 1234567890,
  isDelete: 0
}
```

### requests 表记录
```javascript
{
  _id: "yyy",
  orderNo: "1234567890",
  category: "mall",
  params: {
    items: [...],
    totalAmount: 999,
    address: {...},
    addressText: "...",
    note: "..."
  },
  status: "pending" / "paid" / "failed",
  userId: "user_xxx",
  createdAt: 1234567890,
  updatedAt: 1234567890,
  isDelete: 0
}
```

## 测试建议

1. 在电子商城添加商品到购物车
2. 进入订单确认页面
3. 提交订单并完成支付
4. 检查云数据库：
   - `orders` 表应有对应记录（type: 'goods'）
   - `requests` 表应有对应记录（category: 'mall'）
   - 两条记录的 `orderNo` 应该相同
   - 支付状态应该一致

## 相关文件

- [`pages/order/confirm/confirm.js`](../pages/order/confirm/confirm.js) - 订单确认页面（已修复）
- [`utils/api.js`](../utils/api.js) - 数据库操作封装
- [`pages/categories/hotel/hotel.js`](../pages/categories/hotel/hotel.js) - 参考实现
- [`pages/flows/optimize/optimize.js`](../pages/flows/optimize/optimize.js) - 参考实现
- [`pages/order/detail/detail.js`](../pages/order/detail/detail.js) - 订单详情页（已修复删除功能）
- [`pages/cart/cart.js`](../pages/cart/cart.js) - 购物车页面（已修复删除功能）

---

## 第二次修复：订单删除功能

### 问题描述

删除订单时，`orders` 表和 `requests` 表中的 `isDelete` 字段没有被更新为 1。

### 问题分析

原有的删除代码只是从本地存储中删除了记录，但没有正确调用云端数据库的更新操作，或者只更新了 `orders` 表而没有更新 `requests` 表。

### 修复内容

#### 1. 订单详情页 [`pages/order/detail/detail.js`](../pages/order/detail/detail.js)

修复 `onDelete` 方法：

```javascript
// 修复前
const list = wx.getStorageSync('mall_orders') || []
const next = list.filter(o => o.id!==this.data.order.id)
wx.setStorageSync('mall_orders', next)
// 没有云端同步

// 修复后
const orderId = this.data.order.id
// 删除本地记录
const list = wx.getStorageSync('mall_orders') || []
const next = list.filter(o => o.id!==orderId)
wx.setStorageSync('mall_orders', next)

// 同步云端逻辑删除
const db = api.dbInit()
if (db) {
  const Orders = api.getOrdersRepo(db)
  // 更新 orders 表
  Orders.updateByOrderNo(orderId, { isDelete: 1 })
  // 更新 requests 表
  db.collection('requests').where({ orderNo: orderId }).update({
    data: { isDelete: 1 }
  })
}
```

#### 2. 购物车页面 [`pages/cart/cart.js`](../pages/cart/cart.js)

修复 `onDeleteRequest` 和 `onDeleteMallOrder` 方法：

- 使用统一的 API 封装进行数据库操作
- 同时更新 `orders` 和 `requests` 表的 `isDelete` 字段

### 修复效果

删除订单时会：

1. ✅ 从本地存储中删除记录
2. ✅ 更新云端 `orders` 表的 `isDelete` 字段为 1
3. ✅ 更新云端 `requests` 表的 `isDelete` 字段为 1

## 修复日期

- 第一次修复（订单创建）：2025-11-24
- 第二次修复（订单删除）：2025-11-24