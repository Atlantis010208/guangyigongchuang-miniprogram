# 虚拟商品发货内容更新未同步：排查与修复

日期：2026-10-27。

## 已证实的原因

后台 `ToolkitList.tsx` 将发货配置提交给 `admin_virtual_products_update`，保存于 `products.virtualContent`，保存逻辑正常。

工具包迁移时生成了 `products.productId = VP_TK_DEFAULT_001`，并保留 `_migratedFrom = toolkits`、`_originalToolkitId`。迁移是一次性的，之后后台编辑没有同步旧集合。

旧订单详情仍直接查询 `toolkits`，按创建时间取第一条，而非订单商品。查询失败又会使用源码中的固定百度网盘链接；`completed` 状态也不显示发货信息。这三处行为使旧数据长期掩盖新配置。

线上核对：商品的新配置为不限速下载链接、密码 `2580`；旧工具包仍是百度网盘、提取码 `1u1E`。最初查看旧工具包配置的结论不完整，后台的新内容实际已保存。

## 修复

1. `admin_virtual_products_update`：对于明确关联旧工具包的迁移商品，在同一数据库事务内更新商品与旧工具包发货字段。清空字段也同步；同步失败则回滚，避免假成功。
2. 当前工具包已备份并将四个旧发货字段同步为后台配置。新旧四字段线上回读一致。
3. `orders_list` 新增 `action: virtual_delivery`，实现位于 `virtual-delivery.js`。仅依据调用者真实 OPENID、订单归属和已支付/已完成等状态读取；请求体不能指定另一个用户或无关商品。按商品 ID 及迁移关联优先读取 `products.virtualContent`，未迁移商品才精确回退到旧表。主商品显式清空配置时不再恢复旧配置。
4. 订单页面调用上述接口，取消固定链接兜底、按商品名猜测和取最新商品的逻辑；支持已完成订单、多件虚拟商品与服务类型交付。读取失败提示重试。

## 部署状态

- 后台保存函数、订单查询函数已部署且状态为 Active。
- 环境函数数量已达 200 个上限，因此复用 `orders_list`，没有新增函数。
- 部署订单查询函数时保留原线上代码和依赖包，仅添加独立分支及模块。
- 旧版小程序现在可通过已同步的 `toolkits` 字段显示新内容。
- 页面源码需重新编译、上传及发布后才能启用新查询路径；未宣称已做真机 UI 验收。
- 无登录身份的线上调用返回拒绝访问，函数正常加载；已登录用户的完整流程通过模拟真实查询条件的回归测试验证，仍需真机复核。

## 验证

以下均通过：

```powershell
node specs/order-virtual-delivery.test.js
node specs/order-virtual-delivery-backend.test.js
node specs/mall-backend.test.js
node scripts/check-app-page-files.js
```

覆盖：后台新内容优先、重复读取最新配置、已完成状态、未支付/退款/他人订单拒绝、显式清空不回退、精确商品匹配、多商品/服务交付、旧表同步及事务失败回滚。

`npm test` 在既有 `case-presentation-public.test.js` 的 `./country-options` mock 缺失处中断，未完成全量测试；相关文件未在本次修改。

## 备份与回滚

备份目录：工作区 `tmp/order-delivery-fix-backup/`。

- `admin_virtual_products_update.index.js`：部署前线上入口代码。
- `orders_list.zip`：部署前线上完整函数代码与依赖。
- `toolkit-delivery-before.json`：同步前四个发货字段及记录标识。

回滚时恢复相应函数代码；按备份的 `_id` 仅恢复四个发货字段，勿整条覆盖商品。旧数据恢复后会再次显示旧下载链接。
