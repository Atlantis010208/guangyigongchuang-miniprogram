# 反馈类型图标更新

- 页面：`/pages/profile/feedback/`
- 变更：
  - 功能建议图标替换为本地图片：`/images/功能建议单.png`
  - 问题反馈图标替换为本地图片：`/images/问题反馈.png`

## 修改内容
- WXML：类型项支持图片/文本图标条件渲染
  - 当存在 `item.iconImage` 时渲染 `<image class="type-icon-img" src="{{item.iconImage}}" mode="aspectFit">`
- JS：为 `feedbackTypes` 中的 `suggestion` 与 `bug` 添加 `iconImage` 字段
- WXSS：新增 `.type-icon-img`，尺寸为 `40rpx`，与原 `.type-icon` 视觉占比一致

## 测试清单
- 显示：功能建议与问题反馈类型显示图片图标，其余类型保持文本图标
- 点击：点击类型卡片正常切换选中态，`form.type` 更新
- 适配：不同机型下图标随 `rpx` 缩放，居中对齐；`mode=aspectFit` 保持清晰不裁切
- 性能：本地图标加载迅速，建议图片体积控制在 10–30KB；超出时进行无损压缩

## 版本记录
- 2025-12-09：完成反馈类型图标替换与样式更新
