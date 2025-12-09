# 个人资料编辑页头像图标更新

- 页面：`/pages/auth/profile-edit/`
- 变更：将头像编辑图标替换为本地图片 `images/加.png`

## 修改内容
- WXML：`<text class="icon">📷</text>` 替换为 `<image class="icon-img" src="/images/加.png" mode="aspectFit">`
- WXSS：新增 `.avatar-edit-icon .icon-img { width: 24rpx; height: 24rpx; display: block; }`
- 保持原有 `.avatar-edit-icon` 外观（48rpx 圆形、蓝色背景、白色描边、右下角定位）

## 测试清单
- 图标显示：进入页面，头像右下角显示蓝色圆形内的“加”图标
- 点击触发：点击头像区域触发 `chooseAvatar`，选择头像流程正常
- 响应式布局：不同模拟机型下图标随 rpx 缩放，位置固定在头像右下角

## 设计一致性
- 使用苹果风格蓝色 `#007aff` 背景与白色描边，图标大小 24rpx 与原先文本图标视觉等效

## 文件变更
- `pages/auth/profile-edit/profile-edit.wxml`
- `pages/auth/profile-edit/profile-edit.wxss`
- `images/加.png`（已存在）

## 版本记录
- 2025-12-09：完成头像编辑图标替换与样式优化
