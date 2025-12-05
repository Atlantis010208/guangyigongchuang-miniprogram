## 改造范围
- 流程页写入与统一封装：`pages/flows/selection/selection.js`、`pages/flows/optimize/optimize.js`
- 列表页数据来源统一与监听：必要页面引用仓库并接入 `watch`
- 文档持续更新：仅更新 `docs/cloud-data-setup.md`，新增“页面改造记录”与“验证步骤”小节

## 实施步骤
1) 扫描并读取两处流程页代码，定位直接 `db.collection` 与本地存储写入点
2) 替换为 `utils/api.js` 仓库接口：
   - 云端：`RequestsRepo.create(...)` 与 `OrdersRepo.create(...)`
   - 保留本地缓存键并做轻量映射
   - 写入失败时按发布页同样逻辑自动触发 `initCollections` 并重试
3) 对应列表页（如购物车）已接入 `watch`，如需额外列表页，则复用封装并在隐藏/卸载时关闭监听
4) 在 `docs/cloud-data-setup.md` 增加各页面“改造记录/代码位置/验证步骤”条目，保持单一文档汇总

## 验证
- 每页提交后云端 `requests` 与 `orders` 均产生记录
- 购物车页收到实时推送并合并显示
- 文档中提供可复现的验证清单

## 交付
- 更新两处页面代码
- 更新 `docs/cloud-data-setup.md`（新增页面改造记录与验证步骤）