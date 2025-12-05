## 将在文档中追加与修订
- 押金支付后的跳转说明：使用 `wx.switchTab` 跳转至订单管理页 `/pages/cart/cart`，代码位置 `pages/profile/deposit/deposit.js:25`。
- 进度页“更多”按钮样式变更：
  - 去除边框、背景透明；尺寸连续收紧（110×78 → 90×58 rpx）
  - 三点图标间距与尺寸调整（12→10 rpx），确保不裁切
  - 文件与代码位置：`pages/request/progress/progress.wxss` 的 `.btn.more`、`.more-icon`、`.more-icon .dot`
- 保留既有记录（更多下拉与押金按钮改造、监听稳健化、集合初始化等），新增本次改动描述与验证步骤。

## 交付
- 更新 `docs/cloud-data-setup.md`，保持单一文档可查。