## 问题
- 发布照明需求与个性需求定制仅写入了 `orders`，未写入 `requests`。
- 发布页已引入仓库，但写入未等待完成；个性需求页仍为旧逻辑，仅写 `orders`。

## 修复方案
1) 发布页：将 `onSubmit` 改为 `async`，在页面跳转前 `await` 完成 `Requests.create` 与 `Orders.create`。
2) 个性需求页（activities/detail）：引入 `utils/api` 仓库，同时写入 `requests` 与 `orders`，并增加集合不存在时的初始化重试逻辑。
3) 文档：在 `docs/cloud-data-setup.md` 追加本次修复记录与验证步骤。

## 验证
- 提交发布/个性需求后，`requests` 与 `orders` 都出现对应记录；页面随后跳转至购物车。