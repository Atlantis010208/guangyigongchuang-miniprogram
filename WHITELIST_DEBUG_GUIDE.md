# 🔍 白名单删除问题调试指南

## 问题描述

**删除了白名单记录，但仍然可以观看课程？**

可能的原因：
1. ❌ 白名单还有其他记录没删除
2. ❌ **订单记录**仍然存在（关键！）
3. ❌ 本地缓存没有清除
4. ❌ 学习进度记录还在

---

## 🚀 快速解决方案

### 第一步：打开微信开发者工具

1. 打开你的小程序项目
2. 打开 **Console**（Ctrl+Shift+I / Cmd+Option+I）

---

### 第二步：加载调试命令

1. **打开文件**：`DEBUG_WHITELIST_ISSUE.js`
2. **全选**：Ctrl+A / Cmd+A
3. **复制**：Ctrl+C / Cmd+C  
4. **粘贴到 Console**：Ctrl+V / Cmd+V
5. **回车执行**

---

### 第三步：运行完整调试

在 Console 中输入并执行：

```javascript
fullDebug()
```

这会自动：
- ✅ 查询你的 OPENID
- ✅ 测试当前是否能访问课程
- ✅ 查询所有购买记录（白名单、订单、学习进度）

---

## 📊 查看调试结果

### 结果 A：发现购买记录

Console 会显示：

```
========== 查询结果 ==========

📋 白名单记录 (course_whitelist):
  ⚠️ 找到 X 条白名单记录：
  1. { _id: xxx, status: 'activated', ... }

📦 订单记录 (orders):
  ⚠️ 找到 X 条订单记录：
  1. { _id: xxx, orderId: xxx, status: 'pending', ... }

🎯 问题原因：
  ❌ 白名单记录仍然存在！
  ❌ 订单记录存在！
  
💡 解决方案：
  使用 deleteAllPurchaseRecords() 删除所有相关记录
```

**这说明**：还有记录没删除干净！

---

### 结果 B：没有购买记录

Console 会显示：

```
📋 白名单记录: ✅ 无白名单记录（正常）
📦 订单记录: ✅ 无订单记录
✅ 所有购买记录已清除
💡 如果还能观看，请清除缓存：clearAllCache()
```

**这说明**：记录已删除，但可能是缓存问题。

---

## 🗑️ 删除所有购买记录

### 步骤 1：查看要删除什么

```javascript
checkAllPurchaseRecords('19854562428')
```

仔细查看有哪些记录。

---

### 步骤 2：确认删除

```javascript
deleteAllPurchaseRecords('19854562428', true)
```

**注意**：第二个参数 `true` 是确认删除！

这会删除：
- ✅ 所有白名单记录
- ✅ 所有相关订单记录
- ✅ 所有学习进度记录

---

### 步骤 3：清除本地缓存

```javascript
clearAllCache()
```

这会：
- 清除所有本地存储
- 重启小程序
- 回到首页

---

### 步骤 4：重新测试

```javascript
testCourseAccess()
```

**预期结果**：

```
========== 课程权限检查结果 ==========
是否购买: ❌ 否
学习进度: 0 %
✅ 已无法访问课程（权限清除成功）
```

---

## 🔍 详细排查

### 单独查询 OPENID

```javascript
getMyOpenid()
```

**输出示例**：
```
OPENID: oKoY810mH5_Iff27fL1eze-UmhTo
UnionID: 无
用户记录: { _id: xxx, phone: '19854562428', ... }
```

---

### 单独测试课程权限

```javascript
testCourseAccess('CO_DEFAULT_001')
```

**输出示例**：
```
课程ID: CO_DEFAULT_001
是否购买: ✅ 是 / ❌ 否
学习进度: 26 %
```

---

### 单独查询购买记录

```javascript
checkAllPurchaseRecords('19854562428')
```

这会显示：
- 白名单记录
- 订单记录
- 学习进度记录

---

## 🎯 常见场景

### 场景 1：删了白名单但还有订单

**查询结果**：
```
📋 白名单记录: ✅ 无
📦 订单记录: ⚠️ 找到 1 条订单记录
```

**原因**：
- 你删除了白名单记录
- 但是订单记录还在！
- 云函数会兜底检查订单

**解决**：
```javascript
deleteAllPurchaseRecords('19854562428', true)
```

---

### 场景 2：删了所有记录但还能看

**查询结果**：
```
📋 白名单记录: ✅ 无
📦 订单记录: ✅ 无
```

**但测试结果**：
```
是否购买: ✅ 是
```

**原因**：本地缓存！

**解决**：
```javascript
clearAllCache()
```

---

### 场景 3：删了又出现

**可能原因**：
1. 有多个设备登录
2. 数据同步延迟
3. 有定时任务在创建数据

**解决**：
1. 确保只在一个设备上操作
2. 删除后等待 1-2 分钟
3. 检查是否有后台任务

---

## 📋 命令速查表

| 命令 | 说明 | 用途 |
|------|------|------|
| `fullDebug()` | 运行完整调试 | **推荐第一步** |
| `getMyOpenid()` | 查询 OPENID | 查看当前用户身份 |
| `testCourseAccess()` | 测试课程权限 | 看是否能访问 |
| `checkAllPurchaseRecords()` | 查询购买记录 | 找到问题原因 |
| `deleteAllPurchaseRecords()` | 删除购买记录 | 清除所有记录 |
| `clearAllCache()` | 清除缓存 | 清除本地数据 |

---

## 🔐 云函数日志

### 查看日志

1. 打开 [云函数控制台](https://tcb.cloud.tencent.com/dev?envId=cloud1-5gb9c5u2c58ad6d7#/scf/detail?id=course_purchase_check)

2. 点击 **日志** 标签页

3. 查看最新的调用记录

---

### 关键日志内容

**正常情况（没有购买）**：
```
[course_purchase_check] 未找到白名单记录
[course_purchase_check] 未找到订单记录
[course_purchase_check] 最终返回: isPurchased: false
```

**异常情况（应该没有但还有）**：
```
[course_purchase_check] 发现已激活的白名单记录: 1 条
或
[course_purchase_check] 找到订单记录: 1 条
[course_purchase_check] 最终返回: isPurchased: true
```

---

## ⚠️ 重要提示

### 1. 订单记录很关键！

**云函数的权限判断逻辑**：

```
第一步：检查白名单
  ↓ 没有白名单
第二步：检查订单记录（兜底机制）
  ↓ 有订单
返回：isPurchased: true
```

**所以**：即使删除了白名单，如果有订单记录，仍然可以访问！

---

### 2. 删除操作不可逆

```javascript
deleteAllPurchaseRecords('19854562428', true)
```

这会**永久删除**：
- ✅ 白名单记录
- ✅ 订单记录
- ✅ 学习进度记录

**请谨慎操作！**

---

### 3. 清除缓存很重要

删除记录后，**必须清除缓存**：

```javascript
clearAllCache()
```

否则前端还会使用缓存的购买状态。

---

## 📞 技术支持

### 调试云函数

**名称**：`debug_purchase_records`

**功能**：
- 查询指定手机号的所有购买记录
- 删除指定手机号的所有购买记录

**调用示例**：

```javascript
// 查询
wx.cloud.callFunction({
  name: 'debug_purchase_records',
  data: {
    phone: '19854562428',
    courseId: 'CO_DEFAULT_001',
    action: 'query'
  }
})

// 删除
wx.cloud.callFunction({
  name: 'debug_purchase_records',
  data: {
    phone: '19854562428',
    courseId: 'CO_DEFAULT_001',
    action: 'delete'
  }
})
```

---

### 相关文件

- **DEBUG_WHITELIST_ISSUE.js** - 调试命令脚本（本地运行）
- **cloudfunctions/debug_purchase_records/** - 调试云函数（云端运行）
- **cloudfunctions/course_purchase_check/** - 权限验证云函数

---

## 🎉 完成

按照这个指南操作后，应该能：
- ✅ 找到所有购买记录
- ✅ 删除所有购买记录
- ✅ 清除本地缓存
- ✅ 确认无法访问课程

**如果还有问题，请提供**：
1. `fullDebug()` 的完整输出
2. 云函数日志截图
3. 操作步骤说明

