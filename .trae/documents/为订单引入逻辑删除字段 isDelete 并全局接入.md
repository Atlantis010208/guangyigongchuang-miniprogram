## 目标
- 在 `orders` 集合引入逻辑删除字段 `isDelete`（0：正常，1：已删除），保留数据库记录。
- 用户点击“删除订单”时，将对应订单的 `isDelete` 更新为 1。

## 代码改造范围
1) 仓库层
- `utils/api.js` 的 `OrdersRepo`：
  - `create` 默认写入 `isDelete: 0`
  - `listByUser` 与 `watchByUser` 过滤 `isDelete: 0`
  - `removeByOrderNo` 改为逻辑删除：`isDelete: 1`

2) 页面交互
- 进度页 `pages/request/progress/progress.js`：
  - `onDeleteOrder` 改为更新 `isDelete: 1`（不物理删除）
  - `onCancel` 保留撤销逻辑，仅更新本地状态，不再云端删除
- 购物车页 `pages/cart/cart.js`：
  - 删除订单时改为更新 `isDelete: 1`
  - 云端订单列表过滤掉 `isDelete: 1`
- 商城下单与各业务下单：
  - 业务新增订单时默认写入 `isDelete: 0`（仓库层已覆盖；若有直写的地方也补充）

3) 文档
- 在 `docs/cloud-data-setup.md` 追加“逻辑删除（isDelete）”说明：字段含义、写入默认值、删除操作与列表过滤。

## 验证
- 删除订单后，`orders` 文档仍在，`isDelete=1`
- 列表与监听不显示已删除订单；新订单默认 `isDelete=0`。
