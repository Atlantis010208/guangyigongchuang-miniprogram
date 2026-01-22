# 🔍 未登录状态显示购买信息 - 调试指南

## 🔴 问题描述

**症状：** 未登录状态下，课程详情页面底部显示"学习进度 26%"

**期望行为：** 未登录或未购买时，应该显示"立即购买"按钮，而不是学习进度

---

## ✅ 已完成的修复

### 1. **数据重置逻辑** ✅

**文件：** `pages/course/course-detail/course-detail.js`

添加了三层数据重置保护：

```javascript
// 1️⃣ onLoad 时重置
onLoad(options) {
  this.setData({
    isPurchased: false,
    progress: 0,
    course: null,
    chapters: []
  });
  // ...
}

// 2️⃣ onShow 时重置
onShow() {
  this.setData({
    isPurchased: false,
    progress: 0
  });
  // ...
}

// 3️⃣ loadCourseDetail 开始时重置
async loadCourseDetail(courseId) {
  this.setData({ 
    loading: true, 
    error: null,
    isPurchased: false,  // 确保开始时是未购买状态
    progress: 0
  });
  // ...
}
```

### 2. **严格的购买状态验证** ✅

```javascript
async checkPurchaseStatus(courseId) {
  // ...
  // ⚠️ 严格验证：确保 isPurchased 是明确的 true
  const isActuallyPurchased = isPurchased === true;
  const actualProgress = isActuallyPurchased ? (progress || 0) : 0;
  
  console.log('[course-detail] 最终购买状态:', {
    isPurchased: isActuallyPurchased,
    progress: actualProgress
  });
  
  this.setData({
    isPurchased: isActuallyPurchased,
    progress: actualProgress,
    checkingPurchase: false
  });
  // ...
}
```

---

## 🧪 调试步骤

### 第一步：清除所有缓存

1. **微信开发者工具**
   ```
   工具 → 清除缓存 → 全部清除
   ```

2. **手机端微信**
   ```
   我 → 设置 → 通用 → 存储空间 → 清理缓存
   ```

3. **删除小程序**
   - 长按小程序图标
   - 删除小程序
   - 重新搜索并打开

### 第二步：确认登录状态

打开微信开发者工具的**调试器**，在 Console 中执行：

```javascript
// 检查当前登录状态
wx.cloud.callFunction({
  name: 'course_purchase_check',
  data: { courseId: 'CO_DEFAULT_001' }
}).then(res => {
  console.log('购买检查结果:', res.result)
})
```

**预期结果：**

```javascript
// ✅ 未登录时应该返回
{
  success: true,
  code: 'OK',
  data: {
    isPurchased: false,
    progress: 0
  }
}

// ✅ 已登录但未购买时应该返回
{
  success: true,
  code: 'OK',
  data: {
    isPurchased: false,
    progress: 0
  }
}

// ✅ 已登录且已购买时才返回
{
  success: true,
  code: 'OK',
  data: {
    isPurchased: true,
    progress: 26,
    purchasedAt: "2026-01-15T10:30:00.000Z",
    orderId: "ORDER123"
  }
}
```

### 第三步：检查页面数据

在课程详情页面，打开调试器，执行：

```javascript
// 获取当前页面实例
const pages = getCurrentPages()
const currentPage = pages[pages.length - 1]

// 检查页面数据
console.log('课程详情页数据:', {
  isPurchased: currentPage.data.isPurchased,
  progress: currentPage.data.progress,
  course: currentPage.data.course ? currentPage.data.course.title : 'null'
})
```

**预期结果：**

```javascript
// ✅ 未登录/未购买时应该显示
{
  isPurchased: false,
  progress: 0,
  course: "灯光设计课"
}

// ✅ 已购买时才显示
{
  isPurchased: true,
  progress: 26,
  course: "灯光设计课"
}
```

### 第四步：检查云函数日志

1. 打开 [云函数管理页面](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/scf/detail?id=course_purchase_check&NameSpace=cloud1-5gb9c5u2c58ad6d7)

2. 点击"日志"标签

3. 查看最近的调用记录

**关键日志：**

```
[course_purchase_check] 未找到购买记录: CO_DEFAULT_001 已购买课程: []
↑ 这表示未购买状态 ✅
```

---

## 🔍 问题排查清单

### 检查点 1: 页面初始状态

- [ ] `onLoad` 是否正确重置了 `isPurchased` 和 `progress`
- [ ] `onShow` 是否正确重置了状态
- [ ] `loadCourseDetail` 是否在开始时就重置状态

### 检查点 2: 云函数返回

- [ ] 云函数是否返回了正确的 `isPurchased: false`
- [ ] 云函数日志中是否显示"未找到购买记录"
- [ ] 网络请求是否正常完成（没有错误）

### 检查点 3: 数据绑定

- [ ] WXML 中的 `{{isPurchased}}` 是否正确绑定
- [ ] 底部栏的条件渲染 `wx:if="{{!isPurchased}}"` 是否正确
- [ ] 是否有其他地方修改了 `isPurchased` 的值

### 检查点 4: 缓存问题

- [ ] 是否清除了微信开发者工具的缓存
- [ ] 是否清除了手机端微信的缓存
- [ ] 是否重新编译了小程序代码

---

## 🎯 常见问题 FAQ

### Q1: 为什么清除缓存后还是显示学习进度？

**A:** 可能的原因：
1. **未重新编译代码** - 点击"编译"按钮重新构建
2. **Storage 数据残留** - 在 Storage 面板中手动删除所有数据
3. **页面栈问题** - 返回首页，然后重新进入课程详情

**解决方法：**
```javascript
// 在课程详情页 onLoad 中添加
wx.removeStorageSync('courseData')
wx.removeStorageSync('userInfo')
```

### Q2: 云函数返回正确但页面还是显示错误？

**A:** 可能是数据绑定时机问题

**解决方法：**
1. 检查 `checkPurchaseStatus` 是否被正确调用
2. 在 `setData` 后添加日志确认

```javascript
this.setData({
  isPurchased: false,
  progress: 0
}, () => {
  console.log('数据更新完成:', this.data.isPurchased, this.data.progress)
})
```

### Q3: 手机端和开发工具表现不一致？

**A:** 可能是环境差异

**解决方法：**
1. 确保手机端已清除缓存
2. 确保手机端微信版本最新
3. 使用真机调试查看日志

---

## 📊 验证成功标准

**✅ 验证通过的标志：**

1. **未登录状态**
   - ✅ 底部显示："总价 ¥399" + "立即购买"按钮
   - ✅ 不显示"学习进度"
   - ✅ 课程章节显示锁定状态 🔒

2. **已登录但未购买**
   - ✅ 底部显示："总价 ¥399" + "立即购买"按钮
   - ✅ 不显示"学习进度"
   - ✅ 课程章节显示锁定状态 🔒

3. **已登录且已购买**
   - ✅ 底部显示："学习进度 26%" + "立即观看"按钮
   - ✅ 课程章节可以正常点击
   - ✅ 没有锁定图标

---

## 🚀 测试用例

### 测试用例 1: 未登录用户访问课程

```
1. 退出登录（如果已登录）
2. 清除所有缓存
3. 打开小程序
4. 进入课程详情页
5. 检查底部栏是否显示"立即购买"
```

**预期结果：** ✅ 显示"立即购买"，不显示学习进度

### 测试用例 2: 已登录未购买用户

```
1. 确保已登录
2. 确保未购买该课程
3. 清除缓存
4. 进入课程详情页
5. 检查底部栏
```

**预期结果：** ✅ 显示"立即购买"，不显示学习进度

### 测试用例 3: 已购买用户

```
1. 确保已登录
2. 确保已购买该课程
3. 清除缓存
4. 进入课程详情页
5. 检查底部栏
```

**预期结果：** ✅ 显示"学习进度 X%"和"立即观看"

---

## 📝 调试日志收集

如果问题仍然存在，请收集以下信息：

1. **微信开发者工具 Console 日志**
   ```
   [course-detail] course_detail Response: {...}
   [course-detail] purchase_check Response: {...}
   [course-detail] 最终购买状态: {...}
   ```

2. **云函数日志**
   - 进入云函数管理页面
   - 查看最近的调用记录
   - 截图日志内容

3. **页面数据快照**
   ```javascript
   const pages = getCurrentPages()
   const currentPage = pages[pages.length - 1]
   console.log('完整页面数据:', currentPage.data)
   ```

4. **Storage 数据**
   - 开发者工具 → Storage 面板
   - 截图所有存储的数据

---

## ✅ 修复清单

- [x] 添加 onLoad 数据重置
- [x] 添加 onShow 数据重置
- [x] 添加 loadCourseDetail 数据重置
- [x] 严格验证购买状态（必须是明确的 true）
- [x] 添加详细日志输出
- [ ] 用户清除缓存并测试
- [ ] 验证未登录状态显示正确
- [ ] 验证已登录未购买状态显示正确
- [ ] 验证已购买状态显示正确

---

**最后更新：** 2026-01-20
**修复状态：** 代码已修复，等待用户验证

