## 问题
- 住宅、商业、办公、酒店四个方案页提交时仅写入 orders（或仅本地），未写入 requests。

## 方案
- 在四个页面的提交函数中：
  - 引入 `utils/api` 仓库
  - 将 `onSubmitOrder` 改为 `async`
  - 提交时 `await` 写入 `requests`（category: residential/commercial/office/hotel）与 `orders`（type: products），并在集合不存在时自动调用 `initCollections` 后重试
  - 保留现有本地 `lighting_requests` 写入与页面跳转

## 变更文件
- `pages/categories/residential/residential.js`
- `pages/categories/commercial/commercial.js`
- `pages/categories/office/office.js`
- `pages/categories/hotel/hotel.js`
- 文档 `docs/cloud-data-setup.md` 增加对应改造记录与验证步骤

## 验证
- 以上四页提交一次后，云数据库 `requests` 与 `orders` 都有对应记录；随后跳转订单管理页。