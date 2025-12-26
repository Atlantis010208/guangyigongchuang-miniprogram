# 需求文档 - 设计师筛选功能同步对接

## 介绍

本需求旨在修复小程序端设计师筛选功能与云数据库、后台管理系统之间的数据不一致问题。通过统一字段命名、完善筛选功能、修复云函数逻辑，确保设计师数据在三端（小程序、云函数、后台管理）之间的一致性。

## 当前问题分析

### 1. 字段命名不一致

| 组件 | 使用字段 | 正确字段（数据库） | 问题描述 |
|------|---------|-------------------|---------|
| list.wxml | `avatarUrl` | `avatar` | 头像字段名错误 |
| list.wxml | `experienceYears` | `experience` | 从业年限字段名错误 |
| list.wxml | `projectCount` | `projects` | 项目数字段名错误 |
| detail.wxml | `avatarUrl` | `avatar` | 头像字段名错误 |
| detail.wxml | `experienceYears` | `experience` | 从业年限字段名错误 |
| detail.wxml | `projectCount` | `projects` | 项目数字段名错误 |
| detail.wxml | `heroImage` | 不存在 | 英雄图字段不存在 |
| designers_list云函数 | `hasCalcExperience` | `hasCalcExp` | 认证字段名错误 |
| designers_list云函数 | `projectCount` | `projects` | 排序字段映射错误 |
| designers_list云函数 | `pricePerSqm` | `price` | 价格字段映射错误 |

### 2. 功能缺失

- 小程序端搜索关键词未传递给云函数
- 空间类型筛选功能显示"开发中"未实现
- 云函数未过滤已删除设计师（`isDelete=1`）

### 3. 数据库字段定义

**designers 集合（规范字段）：**
```
_id: 文档ID
name: 姓名
title: 职称
avatar: 头像URL（云存储地址）
bio: 个人简介
rating: 评分（0-5）
projects: 完成项目数
price: 咨询价格（元/次）
experience: 从业经验（年）
specialties: 专业特长数组
certifications: 认证列表数组
portfolioImages: 作品图片数组
hasCalcExp: 照度计算认证（布尔）
spaceType: 擅长空间类型数组（residential/commercial/office/hotel）
isDelete: 软删除标记（0=正常，1=删除）
createdAt: 创建时间戳
updatedAt: 更新时间戳
```

**appointments 集合（规范字段）：**
```
_id: 文档ID
_openid: 用户openid
userId: 用户ID
designerId: 设计师ID
designerName: 设计师姓名
serviceName: 服务名称
spaceType: 空间类型
area: 设计面积
budget: 预算范围
contactType: 联系方式类型
contact: 联系方式
phone: 电话
address: 地址
appointmentDate: 预约日期
appointmentTime: 预约时间
remark: 备注
status: 状态（pending/confirmed/completed/cancelled）
rescheduleCount: 改期次数
rescheduleHistory: 改期历史
createdAt: 创建时间戳
updatedAt: 更新时间戳
```

## 需求

### 需求 1 - 修复小程序端设计师列表字段

**用户故事：** 作为小程序用户，我希望设计师列表页面能正确显示设计师的头像、从业年限、项目数等信息，以便我能准确了解设计师的资质。

#### 验收标准

1. When 页面加载设计师列表时，the 小程序应当正确显示设计师头像（使用 `avatar` 字段）。
2. When 页面加载设计师列表时，the 小程序应当正确显示从业年限（使用 `experience` 字段）。
3. When 页面加载设计师列表时，the 小程序应当正确显示成交数量（使用 `projects` 字段）。
4. When 设计师数据包含作品图片时，the 小程序应当使用 `portfolioImages` 数组显示作品预览。

### 需求 2 - 修复小程序端设计师详情字段

**用户故事：** 作为小程序用户，我希望设计师详情页面能完整展示设计师的所有信息，包括简介、认证、作品集等。

#### 验收标准

1. When 进入设计师详情页时，the 小程序应当正确显示设计师头像（使用 `avatar` 字段）。
2. When 进入设计师详情页时，the 小程序应当正确显示从业年限（使用 `experience` 字段）。
3. When 进入设计师详情页时，the 小程序应当正确显示成交数量（使用 `projects` 字段）。
4. When 设计师有个人简介时，the 小程序应当在详情页展示 `bio` 字段内容。
5. When 设计师有认证资质时，the 小程序应当展示 `certifications` 数组内容。
6. While 显示代表作品Tab时，the 小程序应当使用 `portfolioImages` 数组展示作品图片。
7. When 顶部英雄图缺失时，the 小程序应当使用作品图片的第一张或默认占位图替代。

### 需求 3 - 修复云函数 designers_list

**用户故事：** 作为系统，我需要云函数能正确查询和筛选设计师数据，确保返回给小程序的数据准确无误。

#### 验收标准

1. When 云函数接收筛选参数时，the 云函数应当使用正确的字段名 `hasCalcExp` 查询照度计算认证。
2. When 云函数接收排序参数 `projects` 时，the 云函数应当按 `projects` 字段排序而非不存在的 `projectCount`。
3. When 云函数接收排序参数 `price` 时，the 云函数应当按 `price` 字段排序而非不存在的 `pricePerSqm`。
4. When 查询设计师列表时，the 云函数应当默认过滤 `isDelete=1` 的已删除设计师。
5. When 接收到关键词搜索参数时，the 云函数应当支持按姓名模糊搜索。

### 需求 4 - 实现空间类型筛选功能

**用户故事：** 作为小程序用户，我希望能按空间类型（住宅/商业/办公/酒店）筛选设计师，快速找到擅长特定领域的设计师。

#### 验收标准

1. When 点击"擅长风格"筛选按钮时，the 小程序应当弹出空间类型选择器。
2. When 选择某个空间类型时，the 小程序应当将筛选条件传递给云函数。
3. When 云函数接收空间类型筛选时，the 云函数应当查询 `spaceType` 数组包含该类型的设计师。
4. When 筛选结果返回时，the 小程序应当刷新列表显示符合条件的设计师。
5. When 再次点击已选中的筛选时，the 小程序应当取消该筛选条件。

### 需求 5 - 实现关键词搜索功能

**用户故事：** 作为小程序用户，我希望能通过输入关键词搜索设计师，快速找到特定的设计师。

#### 验收标准

1. When 用户在搜索框输入关键词时，the 小程序应当将关键词存储到状态中。
2. When 用户按下回车或等待一定时间后，the 小程序应当触发搜索请求。
3. When 搜索请求发送时，the 小程序应当将 `keyword` 参数传递给云函数。
4. When 云函数接收到关键词时，the 云函数应当按设计师姓名进行模糊匹配。

### 需求 6 - 确保后台管理系统字段一致性

**用户故事：** 作为管理员，我希望后台管理系统的设计师信息字段与云数据库完全一致，确保编辑保存的数据能正确显示在小程序端。

#### 验收标准

1. When 管理员在后台编辑设计师时，the 后台应当使用与数据库一致的字段名保存数据。
2. When 管理员添加新设计师时，the 后台应当确保所有必填字段都正确写入数据库。
3. When 管理员修改设计师头像时，the 后台应当将云存储地址保存到 `avatar` 字段。
4. When 管理员修改作品图片时，the 后台应当将云存储地址数组保存到 `portfolioImages` 字段。

### 需求 7 - 预约数据字段对接

**用户故事：** 作为系统，我需要确保小程序端提交的预约数据与后台管理系统的预约管理页面字段一致，便于管理员查看和处理预约。

#### 验收标准

1. When 用户提交预约时，the 小程序应当将所有表单字段正确传递给云函数。
2. When 云函数创建预约时，the 云函数应当使用规范的字段名存储数据。
3. When 后台管理员查看预约详情时，the 后台应当能正确显示预约的所有信息字段。
4. When 后台显示空间类型时，the 后台应当正确映射中文标签（如 "住宅" 对应数据库存储的文本）。

## 设计风格与配色

本需求不涉及 UI 设计变更，保持现有设计风格。主要是数据层面的修复和对接。

## 优先级

1. **P0（必须修复）**：需求1、需求2、需求3 - 直接影响用户体验的显示问题
2. **P1（重要）**：需求4、需求5 - 筛选功能完善
3. **P2（一般）**：需求6、需求7 - 后台对接优化

