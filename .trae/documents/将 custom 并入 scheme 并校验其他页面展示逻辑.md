# 目标
- 修改订单管理页的请求归一化逻辑：将 `category: 'custom'` 并入 `source: 'scheme'`，使个性需求定制显示在“方案订单”分组。
- 同步调整卡片标题逻辑：当 `source: 'scheme'` 且 `category: 'custom'` 时显示“个性需求定制”。
- 检查其它页面是否对 `custom_form` 进行过滤或不展示；如有，统一改为 `scheme` 分组或放开过滤。

## 改动文件
- `pages/cart/cart.js`
  - 归一化：`normalizedSource = (isScheme || isCustomForm) ? 'scheme' : cat`
  - 卡片标题：当 `source==='scheme' && category==='custom'` 时设置为“个性需求定制”，否则保持原逻辑。

## 验证
- 在个性需求定制页提交后，订单管理页的“方案订单”应出现对应卡片；电子商城不受影响。
- 其它入口（publish/selection/optimize/categories）不受此改动影响，仍正常显示。

## 风险与说明
- 仅影响前端展示分组，不修改数据结构；监听与分页逻辑不变。