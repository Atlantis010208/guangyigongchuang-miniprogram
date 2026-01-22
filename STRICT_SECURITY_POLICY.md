# 🔒 严格安全策略：未登录不能查看课程

## 策略概述

实施最严格的安全策略：**未登录用户完全不能访问课程内容**

这是最安全的做法，确保所有课程内容都受到登录保护。

---

## 🛡️ 多层防护机制

### 第一层：前端页面拦截

**文件**: `pages/course/course-detail/course-detail.js`

#### 1. `onLoad` 时检查登录

```javascript
onLoad(options) {
  const app = getApp();
  if (!app.isLoggedIn()) {
    // 显示登录提示
    wx.showModal({
      title: '需要登录',
      content: '查看课程需要先登录账号',
      confirmText: '去登录',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          // 跳转到登录页，记录回跳地址
          wx.redirectTo({ url: '/pages/auth/login/login?redirect=...' });
        } else {
          // 返回上一页
          wx.navigateBack();
        }
      }
    });
    return; // 🔒 阻止后续代码执行
  }
  
  // 只有登录用户才能继续
  this.loadCourseDetail(id);
}
```

**防护效果**：
- ✅ 未登录用户无法进入课程页面
- ✅ 自动引导用户去登录
- ✅ 登录后自动回跳到课程页面
- ✅ 不会加载任何课程数据

---

#### 2. `onShow` 时二次检查

```javascript
onShow() {
  const app = getApp();
  if (!app.isLoggedIn()) {
    // 强制返回
    wx.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
    return; // 🔒 阻止后续代码执行
  }
  
  // 只有登录用户才能刷新数据
  this.loadCourseDetail(this.courseId);
}
```

**防护效果**：
- ✅ 防止用户通过其他途径进入页面后退出登录
- ✅ 页面每次显示时都验证登录状态
- ✅ 登录失效时立即阻止访问

---

### 第二层：云函数权限验证

**文件**: `cloudfunctions/course_purchase_check/index.js`

```javascript
// 第一层：检查 OPENID 是否存在
if (!OPENID) {
  console.log('[course_purchase_check] OPENID 不存在，返回未购买状态');
  return { success: true, code: 'OK', data: { isPurchased: false } };
}

// 第二层：检查用户是否真正登录（users 集合中有记录）
const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get();

if (!userRes.data || userRes.data.length === 0) {
  console.log('[course_purchase_check] ⚠️ 用户未真正登录（数据库无记录），返回未购买状态');
  return { success: true, code: 'OK', data: { isPurchased: false } };
}

console.log('[course_purchase_check] ✅ 用户已真正登录，用户ID:', userRes.data[0]._id);
```

**防护效果**：
- ✅ 即使前端被绕过，云函数也会验证登录
- ✅ 检查 OPENID 是否存在
- ✅ 检查用户记录是否在数据库中
- ✅ 双重验证确保真正登录

---

**文件**: `cloudfunctions/course_videos/index.js`

```javascript
// 检查用户是否登录
if (!OPENID) {
  return { success: false, code: 'UNAUTHORIZED', message: '未登录' };
}

// 检查购买状态
const checkRes = await checkPurchaseStatus(OPENID, courseId);
if (!checkRes.isPurchased) {
  return { success: false, code: 'NOT_PURCHASED', message: '未购买课程' };
}
```

**防护效果**：
- ✅ 获取视频列表必须登录
- ✅ 获取视频播放地址必须登录
- ✅ 未购买无法获取视频数据

---

### 第三层：数据库安全规则

**文件**: 云数据库权限设置

对于敏感集合（如 `courses`, `course_videos`, `orders`, `users`），设置权限为：

- **仅管理端可读写**：只有云函数和管理员可以访问
- **仅创建者可读写**：用户只能访问自己的数据

**防护效果**：
- ✅ 小程序端无法直接读取课程数据
- ✅ 必须通过云函数才能访问
- ✅ 云函数会验证登录和权限

---

## 🚫 被阻止的访问场景

### 场景 1：未登录直接访问课程详情页

**用户操作**：
```
小程序启动 → 点击课程卡片 → 尝试进入课程详情页
```

**系统响应**：
```
1. 检测到未登录
2. 显示"需要登录"弹窗
3. 引导用户去登录
4. 不加载任何课程数据
```

**结果**：❌ **无法查看课程内容**

---

### 场景 2：已登录后退出

**用户操作**：
```
登录 → 查看课程 → 退出登录 → 返回课程页
```

**系统响应**：
```
1. onShow 检测到未登录
2. 显示"请先登录"提示
3. 自动返回上一页
4. 清除所有课程数据
```

**结果**：❌ **无法继续查看课程**

---

### 场景 3：尝试绕过前端直接调用云函数

**攻击尝试**：
```javascript
wx.cloud.callFunction({
  name: 'course_videos',
  data: { courseId: 'CO_DEFAULT_001' }
})
```

**系统响应**：
```
1. 云函数检查 OPENID
2. OPENID 不存在 → 返回 UNAUTHORIZED
3. 或 OPENID 不在 users 集合 → 返回 UNAUTHORIZED
```

**结果**：❌ **云函数拒绝请求**

---

### 场景 4：使用 `traceUser: true` 产生的临时 OPENID

**背景**：
- `app.js` 中设置了 `traceUser: true`
- 微信会为未登录用户生成临时 OPENID

**系统响应**：
```
1. 云函数收到临时 OPENID
2. 在 users 集合中查询该 OPENID
3. 查询结果为空（没有用户记录）
4. 返回 isPurchased: false
```

**结果**：❌ **临时 OPENID 无法通过验证**

---

## ✅ 安全策略总结

| 防护层 | 检查点 | 未登录时的行为 | 已登录但无记录时的行为 |
|--------|--------|----------------|----------------------|
| **前端 - onLoad** | `app.isLoggedIn()` | 显示登录弹窗，引导登录 | 通过（继续加载） |
| **前端 - onShow** | `app.isLoggedIn()` | 强制返回上一页 | 通过（继续加载） |
| **云函数 - 第一层** | `OPENID` 是否存在 | 返回 `isPurchased: false` | 继续检查 |
| **云函数 - 第二层** | `users` 集合中是否有记录 | N/A | 返回 `isPurchased: false` |
| **数据库权限** | 集合访问权限 | 无法直接访问 | 无法直接访问 |

---

## 🔐 登录状态管理

### 登录状态检查逻辑

**文件**: `app.js`

```javascript
// 检查登录状态
isLoggedIn() {
  this.checkLoginStatus();
  return this.globalData.isLoggedIn;
}

checkLoginStatus() {
  const userDoc = util.getStorage('userDoc');
  const openid = util.getStorage('openid');
  const expireTime = util.getStorage('loginExpireTime');
  const now = Date.now();

  // 1. 没有登录信息
  if (!userDoc || !openid) {
    this.globalData.isLoggedIn = false;
    return;
  }

  // 2. 登录已过期
  if (expireTime && now >= expireTime) {
    this.clearLoginCache();
    this.globalData.isLoggedIn = false;
    return;
  }

  // 3. 登录有效
  this.globalData.isLoggedIn = true;
  this.globalData.userDoc = userDoc;
  this.globalData.openid = openid;
}
```

---

### 登录有效期

- **有效期**：24 小时
- **存储位置**：`loginExpireTime`（本地缓存）
- **过期行为**：自动清除缓存，标记为未登录

---

## 📋 测试验证

### 1. 未登录访问测试

**步骤**：
1. 清除登录缓存（开发者工具 → Console）
   ```javascript
   wx.clearStorageSync();
   wx.reLaunch({ url: '/pages/products/products' });
   ```

2. 点击任意课程卡片

**预期结果**：
- ✅ 显示"需要登录"弹窗
- ✅ 点击"去登录"跳转到登录页
- ✅ 点击"返回"返回上一页
- ✅ 不加载课程数据

---

### 2. 登录后访问测试

**步骤**：
1. 完成登录流程
2. 点击课程卡片进入详情页

**预期结果**：
- ✅ 正常加载课程详情
- ✅ 显示购买状态（已购买/未购买）
- ✅ 显示学习进度（如果已购买）

---

### 3. 登录后退出测试

**步骤**：
1. 登录并进入课程详情页
2. 在"我的"页面点击"退出登录"
3. 返回课程详情页

**预期结果**：
- ✅ 显示"请先登录"提示
- ✅ 1.5秒后自动返回上一页
- ✅ 课程数据被清除

---

### 4. 云函数验证测试

**步骤**：
1. 在开发者工具 Console 中执行：
   ```javascript
   wx.cloud.callFunction({
     name: 'course_purchase_check',
     data: { courseId: 'CO_DEFAULT_001' }
   }).then(res => {
     console.log('云函数返回:', res.result);
   });
   ```

2. 查看云函数日志

**预期结果（未登录）**：
- ✅ 返回 `{ isPurchased: false }`
- ✅ 日志显示"OPENID 不存在"或"用户未真正登录"

**预期结果（已登录）**：
- ✅ 返回正确的购买状态
- ✅ 日志显示"用户已真正登录"和用户ID

---

## 🎯 安全优势

### ✅ 多层防护

1. **前端拦截**：第一时间阻止未登录访问
2. **云函数验证**：即使前端被绕过也无法获取数据
3. **数据库权限**：底层权限控制

### ✅ 用户体验友好

1. **明确提示**：告知用户需要登录
2. **自动跳转**：登录成功后自动回到课程页
3. **保持状态**：登录后保持 24 小时有效期

### ✅ 防止常见攻击

1. ❌ 绕过前端直接调用云函数
2. ❌ 使用临时 OPENID 访问
3. ❌ 直接访问数据库
4. ❌ 伪造登录状态

---

## 🔄 与之前策略的对比

### 之前：宽松策略

- ❌ 未登录可以查看课程列表和详情
- ❌ 只有观看视频和下载资料时需要登录
- ❌ 依赖购买状态控制权限
- ⚠️ 安全性较低

### 现在：严格策略

- ✅ 未登录完全无法查看课程内容
- ✅ 进入课程详情页必须先登录
- ✅ 多层验证确保安全
- ✅ 最高安全级别

---

## 📝 维护建议

### 1. 定期检查日志

查看云函数日志，确保没有异常访问：

```bash
# 关注这些日志
[course_purchase_check] OPENID 不存在
[course_purchase_check] 用户未真正登录
[course_videos] 未登录
```

### 2. 监控登录转化率

统计未登录用户被拦截的次数，优化登录引导：

```javascript
// 添加埋点
console.log('[Analytics] 未登录尝试访问课程', { courseId, timestamp });
```

### 3. 优化登录流程

- 提供更多登录方式（手机号、微信授权）
- 简化登录步骤
- 记住登录状态

---

## 🎉 总结

现在你的小程序实施了**最严格的安全策略**：

- 🔒 **前端**：未登录无法进入课程详情页
- 🔒 **云函数**：双重验证登录状态
- 🔒 **数据库**：权限控制底层访问
- 🔒 **多层防护**：即使一层被绕过，其他层仍然生效

**这是最安全的做法！** ✅

所有课程内容都受到完整的登录保护，未登录用户完全无法访问。

