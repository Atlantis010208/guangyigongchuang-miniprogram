## 原因
- 列表页 onShow 可能多次触发，重复调用 watch；或网络抖动导致 SDK 状态机收到重复握手事件，出现 CONNECTED 状态下再次接收 connectionSuccess 的异常。

## 修复方案
1) 为购物车页的 watch 增加幂等与防抖：
   - 若已有 watcher 则不再重复创建；创建前清理旧 watcher；延时 200ms 后再启动监听。
2) 增强 onError 重试：
   - 监听发生错误时关闭 watcher，指数退避重启（最多 5 次），避免死循环；在 hide/unload 时彻底清理。
3) 文档补充故障排查与修复说明。

## 变更文件
- `pages/cart/cart.js`：增加 `_watching`、`_watchTimer`、`_watchRetry` 及幂等/重试逻辑。
- `docs/cloud-data-setup.md`：新增“实时监听错误与修复”说明。

## 验证
- 打开购物车页不再出现错误日志；断网/重连后监听可自动恢复；页面隐藏/卸载后不会重复创建监听。