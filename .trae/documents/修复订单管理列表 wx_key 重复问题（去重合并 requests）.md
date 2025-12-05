## 问题
- 订单管理页（cart）合并云端与本地请求时，`requests` 列表出现相同 `id` 的项，导致 WXML 警告：Do not set same key in wx:key。

## 方案
- 在 `reloadRequests()` 中对合并结果按 `id` 去重：
  - 优先使用云端项（权威源），若本地存在同 `id` 则忽略本地项；不存在时补充本地项。
- 保持现有过滤：跳过 `doc.isDelete === 1` 的云端项。
- 文档补充故障排查：记录去重策略与代码位置。

## 变更文件
- `pages/cart/cart.js`：更新 `reloadRequests()` 的合并逻辑，使用 `Set` 或 `Map` 去重。
- `docs/cloud-data-setup.md`：在“故障排查”加入“wx:key 重复”说明。

## 验证
- 列表无重复；控制台不再提示 `Do not set same key ...`；删除或新增后列表稳定。