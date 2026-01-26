# 计算结果页面重构说明

## 概述
将照度计算器的结果页面从 `pages/search/search` 中独立出来，创建了专门的结果页面 `pages/search/calc-result/calc-result`。

## 文件结构

### 新增文件
```
pages/search/calc-result/
  ├── calc-result.wxml   # 结果页面模板
  ├── calc-result.wxss   # 结果页面样式
  ├── calc-result.js     # 结果页面逻辑
  └── calc-result.json   # 结果页面配置
```

### 修改文件
1. `app.json` - 注册新页面路由
2. `pages/search/search.js` - 修改计算逻辑，改为跳转到结果页
3. `pages/search/search.wxml` - 移除内嵌的结果页面代码
4. `pages/search/search.wxss` - 移除结果页面相关样式

## 主要改动

### 1. 创建独立结果页面
**文件**: `pages/search/calc-result/calc-result.*`

**功能**:
- 独立展示计算结果
- 支持导出 CSV（功能占位）
- 支持返回重新计算

**数据结构**:
```javascript
{
  mode: 'count' | 'quantity' | 'lux',  // 计算模式
  mainValue: Number,                    // 主结果数值
  mainUnit: String,                     // 主结果单位
  mainLabel: String,                    // 主结果标签
  headerLeft: { label, value },         // 左侧次要结果
  headerRight: { label, value },        // 右侧次要结果
  details: [{label, value}]             // 详细参数列表
}
```

### 2. 修改计算逻辑
**文件**: `pages/search/search.js`

**主要变更**:
```javascript
// 修改前：在当前页面显示结果
this.setData({ showResult: true, resultData })

// 修改后：跳转到独立结果页
this.setData({ resultData })
wx.navigateTo({
  url: '/pages/search/calc-result/calc-result'
})
```

**移除的方法**:
- `applyNavBarStyle()` - 导航栏样式控制
- `onExportCSV()` - 导出 CSV（已移至结果页）
- `onRecalculate()` - 重新计算（已移至结果页）
- `onBackToSearch()` - 返回搜索页（已移至结果页）

**简化的方法**:
- `onShow()` - 移除结果页状态处理
- `onHide()` - 移除结果页状态重置
- `onLoad()` - 移除状态存储逻辑

**移除的常量**:
- `NAV_STATE_KEY` - 不再需要记录结果页状态

### 3. 页面路由注册
**文件**: `app.json`

```json
"pages": [
  "pages/products/products",
  "pages/course/index/index",
  "pages/search/search",
  "pages/search/calc-result/calc-result",  // 新增
  // ...其他页面
]
```

## 数据传递方式

结果页面通过获取上一页的数据来显示结果：

```javascript
// 在结果页的 onLoad 中
const pages = getCurrentPages()
const prevPage = pages[pages.length - 2]
const resultData = prevPage.data.resultData
```

## 优势

### 1. 代码结构更清晰
- 计算输入和结果展示分离
- 每个页面职责单一
- 易于维护和扩展

### 2. 用户体验更好
- 结果页面可以独立后退
- 不影响主页面的 TabBar 状态
- 页面切换更流畅

### 3. 性能优化
- 减少单页面的代码量
- 避免条件渲染带来的性能损耗
- 页面层级更清晰

## 使用示例

### 从计算页跳转到结果页
```javascript
// 在 search.js 中
onCalculate() {
  // ... 计算逻辑 ...
  
  const resultData = {
    mode: 'count',
    mainValue: 7,
    mainUnit: '盏',
    mainLabel: '建议灯具数量',
    headerLeft: { label: '功率密度', value: '5.44W/㎡' },
    headerRight: { label: '目标照度', value: '200Lx' },
    details: [
      { label: '房间面积', value: '9 ㎡' },
      { label: '空间类型', value: '客厅' },
      // ...
    ]
  }
  
  this.setData({ resultData })
  wx.navigateTo({
    url: '/pages/search/calc-result/calc-result'
  })
}
```

### 从结果页返回
```javascript
// 在 calc-result.js 中
onRecalculate() {
  wx.navigateBack({ delta: 1 })
}
```

## 注意事项

1. **数据持久化**: 当前使用页面栈传递数据，如果需要支持分享或深度链接，需要改用路由参数或全局状态
2. **导出功能**: CSV 导出功能当前为占位实现，需要后续开发
3. **向后兼容**: 保留了 `resultData` 在 search 页面的存储，确保数据传递稳定

## 未来优化方向

1. 实现 CSV 导出功能
2. 支持结果页的分享功能
3. 添加结果对比功能
4. 优化数据传递方式（考虑使用全局状态管理）
5. 添加结果历史记录功能

## 测试建议

1. 测试三种计算模式的结果展示
2. 测试返回和重新计算功能
3. 测试页面切换时的数据保持
4. 测试从结果页返回后再次计算的流程
