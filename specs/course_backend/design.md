# 课程后端云函数技术设计文档

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        小程序前端                                │
│   pages/course/index  │  pages/course/course-detail  │  video-player
└───────────────┬───────────────┬───────────────┬─────────────────┘
                │               │               │
                ▼               ▼               ▼
┌───────────────────────────────────────────────────────────────┐
│                      云函数层 (CloudFunctions)                 │
│  ┌──────────────┐  ┌─────────────────────┐  ┌──────────────┐  │
│  │ courses_list │  │ course_purchase_    │  │ course_      │  │
│  │   (公开)     │  │    check (登录)     │  │  videos      │  │
│  └──────────────┘  └─────────────────────┘  │  (登录+购买) │  │
│                                             └──────────────┘  │
└───────────────────────────────────────────────────────────────┘
                │               │               │
                ▼               ▼               ▼
┌───────────────────────────────────────────────────────────────┐
│                      云数据库 (MongoDB)                        │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                   │
│   │ courses │    │ orders  │    │  users  │                   │
│   └─────────┘    └─────────┘    └─────────┘                   │
└───────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 云函数 | Node.js 18 + wx-server-sdk | 微信云开发标准运行时 |
| 数据库 | 云开发数据库（MongoDB） | 已有 courses、orders 集合 |
| 存储 | 云存储 | 视频和图片资源存储 |
| 权限 | wx-server-sdk.getWXContext() | 获取用户 OPENID |

---

## 云函数设计

### 1. courses_list 云函数

#### 功能职责
- 返回已发布的课程列表（公开接口，无需登录）
- 支持分页、筛选、排序
- 自动转换云存储图片为临时链接

#### 目录结构
```
cloudfunctions/
└── courses_list/
    ├── index.js      # 主入口
    └── package.json  # 依赖配置
```

#### 核心逻辑

```javascript
// 伪代码
exports.main = async (event) => {
  const { limit = 20, offset = 0, category, level, keyword } = event
  
  // 1. 构建查询条件（仅返回已发布课程）
  let query = { 
    status: 'published', 
    isDelete: _.neq(1) 
  }
  
  // 2. 可选筛选
  if (category) query.category = category
  if (level) query.level = level
  if (keyword) query.title = db.RegExp({ regexp: keyword, options: 'i' })
  
  // 3. 查询数据（不返回敏感字段）
  const courses = await db.collection('courses')
    .where(query)
    .field({
      chapters: false,  // 不返回章节详情
      driveLink: false, // 不返回网盘信息（如有）
      drivePassword: false
    })
    .orderBy('isFeatured', 'desc')
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(Math.min(limit, 100))
    .get()
  
  // 4. 转换云存储图片为临时链接
  // 5. 格式化返回数据（兼容前端字段命名）
  
  return { success: true, data, total, pagination }
}
```

#### 返回字段映射（兼容前端 Mock 数据）

| 数据库字段 | 返回字段 | 说明 |
|-----------|---------|------|
| `courseId` | `id` / `courseId` | 双字段兼容 |
| `title` | `title` | 课程标题 |
| `subtitle` | `subtitle` | 副标题（新增） |
| `description` | `description` | 课程描述 |
| `cover` / `images[0]` | `coverUrl` | 封面图（兼容字段名） |
| `price` | `price` | 价格 |
| `originalPrice` | `originalPrice` | 原价 |
| `tags` | `tags` | 标签数组 |
| `instructorName` | `instructor.name` | 讲师信息（格式化） |
| `instructorAvatar` | `instructor.avatar` | 讲师头像 |
| `isFeatured` | `isFeatured` | 是否推荐 |
| `salesCount` | `salesCount` | 销量 |
| `rating` | `rating` | 评分 |

---

### 2. course_purchase_check 云函数

#### 功能职责
- 检查用户是否已购买指定课程
- 支持单个和批量检查
- 需要登录才能调用

#### 目录结构
```
cloudfunctions/
└── course_purchase_check/
    ├── index.js      # 主入口
    └── package.json  # 依赖配置
```

#### 核心逻辑

```javascript
// 伪代码
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { courseId, courseIds } = event
  
  // 1. 验证登录状态
  if (!OPENID) {
    return { success: true, data: { isPurchased: false } }
  }
  
  // 2. 批量检查逻辑
  const idsToCheck = courseIds || [courseId]
  
  // 3. 查询已支付订单
  const orders = await db.collection('orders').where({
    userId: OPENID,
    category: 'course',
    status: _.in(['paid', 'completed']),
    isDelete: _.neq(1)
  }).get()
  
  // 4. 从订单中提取已购买的课程 ID
  const purchasedMap = {}
  for (const order of orders.data) {
    const items = order.params?.items || order.items || []
    for (const item of items) {
      if (item.category === 'course' || item.type === 'course') {
        purchasedMap[item.id] = {
          isPurchased: true,
          purchasedAt: order.paidAt || order.createdAt,
          orderId: order.orderNo
        }
      }
    }
  }
  
  // 5. 返回结果
  if (courseIds) {
    // 批量检查
    const result = {}
    for (const id of courseIds) {
      result[id] = purchasedMap[id] || { isPurchased: false }
    }
    return { success: true, data: result }
  } else {
    // 单个检查
    return { success: true, data: purchasedMap[courseId] || { isPurchased: false } }
  }
}
```

#### 订单数据结构参考

```javascript
// orders 集合中的课程订单结构
{
  _id: "xxx",
  orderNo: "O1703836800000",
  userId: "oXXXX...",         // 用户 OPENID
  _openid: "oXXXX...",
  category: "course",         // 订单分类
  status: "paid",             // 订单状态
  paidAt: 1703836800000,
  params: {
    items: [{
      id: "c001",             // 课程 ID
      name: "二哥十年经验灯光课",
      price: 999,
      category: "course"
    }]
  }
}
```

---

### 3. course_videos 云函数

#### 功能职责
- 返回课程的完整章节和视频链接
- **核心安全逻辑**：验证用户已购买才返回视频数据
- 转换云存储视频为临时播放链接

#### 目录结构
```
cloudfunctions/
└── course_videos/
    ├── index.js      # 主入口
    └── package.json  # 依赖配置
```

#### 核心逻辑

```javascript
// 伪代码
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { courseId, lessonId } = event
  
  // 1. 验证参数
  if (!courseId) {
    return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少课程ID' }
  }
  
  // 2. 验证登录状态
  if (!OPENID) {
    return { 
      success: false, 
      code: 'UNAUTHORIZED', 
      errorMessage: '请先登录后再观看课程' 
    }
  }
  
  // 3. 验证购买状态（核心安全检查）
  const isPurchased = await checkPurchaseStatus(db, OPENID, courseId)
  
  if (!isPurchased) {
    return { 
      success: false, 
      code: 'NOT_PURCHASED', 
      errorMessage: '您尚未购买此课程，请先购买后观看' 
    }
  }
  
  // 4. 获取课程数据
  const course = await db.collection('courses').doc(courseId).get()
  
  // 5. 转换视频链接为临时播放链接
  const chapters = await processChapters(course.data.chapters)
  
  // 6. 定位当前课时
  const currentLesson = findLesson(chapters, lessonId)
  
  return {
    success: true,
    code: 'OK',
    data: {
      courseId,
      title: course.data.title,
      isPurchased: true,
      chapters,
      currentLesson
    }
  }
}

// 检查购买状态（复用 course_purchase_check 的逻辑）
async function checkPurchaseStatus(db, openid, courseId) {
  const orders = await db.collection('orders').where({
    userId: openid,
    category: 'course',
    status: _.in(['paid', 'completed']),
    isDelete: _.neq(1)
  }).get()
  
  for (const order of orders.data) {
    const items = order.params?.items || order.items || []
    for (const item of items) {
      if (item.id === courseId) {
        return true
      }
    }
  }
  return false
}

// 处理章节数据，转换视频链接
async function processChapters(chapters) {
  const videoUrls = []
  const fileUrls = []
  
  // 收集所有云存储链接
  for (const chapter of chapters) {
    for (const lesson of chapter.lessons || []) {
      if (lesson.videoUrl && lesson.videoUrl.startsWith('cloud://')) {
        videoUrls.push(lesson.videoUrl)
      }
      if (lesson.fileUrl && lesson.fileUrl.startsWith('cloud://')) {
        fileUrls.push(lesson.fileUrl)
      }
    }
  }
  
  // 批量获取临时链接
  const allUrls = [...videoUrls, ...fileUrls]
  if (allUrls.length > 0) {
    const tempRes = await cloud.getTempFileURL({ fileList: allUrls })
    const urlMap = {}
    tempRes.fileList.forEach(item => {
      if (item.status === 0) urlMap[item.fileID] = item.tempFileURL
    })
    
    // 替换链接
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons || []) {
        if (lesson.videoUrl && urlMap[lesson.videoUrl]) {
          lesson.videoUrl = urlMap[lesson.videoUrl]
        }
        if (lesson.fileUrl && urlMap[lesson.fileUrl]) {
          lesson.fileUrl = urlMap[lesson.fileUrl]
        }
      }
    }
  }
  
  return chapters
}
```

---

## 数据库设计

### courses 集合扩展字段

```javascript
{
  // === 已有字段 ===
  _id: "xxx",
  courseId: "CO_DEFAULT_001",
  title: "十年经验二哥 灯光设计课",
  description: "...",
  price: 365,
  originalPrice: 499,
  cover: "cloud://xxx/cover.jpg",
  images: ["cloud://xxx/1.jpg", "cloud://xxx/2.jpg"],
  instructorId: "d001",
  instructorName: "二哥",
  instructorAvatar: "cloud://xxx/avatar.jpg",
  category: "照明基础",
  level: "intermediate",
  tags: ["灯光设计", "照明设计"],
  salesCount: 89,
  rating: 4.9,
  ratingCount: 89,
  status: "published",
  isDelete: 0,
  createdAt: 1703836800000,
  updatedAt: 1703836800000,
  
  // === 新增字段 ===
  subtitle: "零基础到精通,掌握专业灯光设计核心逻辑",  // 副标题
  isFeatured: true,   // 是否推荐
  
  // 章节列表（核心付费内容）
  chapters: [
    {
      title: "第一章：灯光设计底层逻辑",
      lessons: [
        {
          id: "l1-1",
          title: "1.1 光的物理属性与情感表达",
          type: "video",
          duration: "15:20",
          videoUrl: "cloud://xxx/video1.mp4"  // 云存储 fileID
        },
        {
          id: "l1-2",
          title: "1.2 色温与显色性的应用法则",
          type: "video",
          duration: "18:45",
          videoUrl: "cloud://xxx/video2.mp4"
        }
      ]
    },
    {
      title: "课程资料包",
      lessons: [
        {
          id: "m1",
          title: "灯光设计常用参数表.pdf",
          type: "file",
          size: "2.5MB",
          format: "PDF",
          fileUrl: "cloud://xxx/file1.pdf"
        }
      ]
    }
  ]
}
```

### 索引建议

| 集合 | 索引字段 | 类型 | 说明 |
|------|---------|------|------|
| courses | `status` + `isDelete` + `isFeatured` | 复合 | 列表查询优化 |
| courses | `courseId` | 唯一 | 课程ID查询 |
| orders | `userId` + `category` + `status` | 复合 | 购买状态查询 |

---

## 安全设计

### 权限控制矩阵

| 云函数 | 未登录 | 已登录未购买 | 已购买 |
|--------|--------|-------------|--------|
| courses_list | ✅ 返回列表 | ✅ 返回列表 | ✅ 返回列表 |
| course_purchase_check | ✅ 返回 false | ✅ 检查状态 | ✅ 检查状态 |
| course_videos | ❌ UNAUTHORIZED | ❌ NOT_PURCHASED | ✅ 返回视频 |

### 数据保护策略

1. **courses_list 不返回敏感字段**
   - 不返回 `chapters`（章节详情）
   - 不返回 `driveLink`、`drivePassword`（如有网盘交付）

2. **course_videos 严格验证**
   - 必须登录（OPENID 非空）
   - 必须已购买（订单状态为 paid/completed）
   - 验证失败返回错误，不返回任何视频链接

3. **云存储临时链接**
   - 视频和文件使用临时链接（有效期约 2 小时）
   - 避免直接暴露永久链接

---

## 错误码定义

| 错误码 | HTTP 含义 | 说明 |
|--------|----------|------|
| `OK` | 200 | 成功 |
| `INVALID_PARAMS` | 400 | 参数错误 |
| `UNAUTHORIZED` | 401 | 未登录 |
| `NOT_PURCHASED` | 403 | 未购买课程 |
| `NOT_FOUND` | 404 | 课程不存在 |
| `SERVER_ERROR` | 500 | 服务器错误 |

---

## 与现有系统集成

### 订单系统集成

课程购买通过现有订单系统完成：
1. 用户点击"立即购买" → 跳转订单确认页 (`pages/order/confirm/confirm`)
2. 提交订单 → 调用 `orders_create` 云函数
3. 支付完成 → 订单状态更新为 `paid`
4. 用户再次访问课程 → `course_videos` 验证订单状态

### 字段兼容

课程订单商品数据结构：
```javascript
{
  id: "c001",        // 课程 ID（用于匹配）
  name: "课程标题",
  price: 999,
  quantity: 1,
  image: "封面图",
  category: "course" // 标记为课程类商品
}
```

---

## 部署配置

### package.json

```json
{
  "name": "courses_list",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

### 云函数配置

| 云函数 | 超时时间 | 内存 | 说明 |
|--------|---------|------|------|
| courses_list | 10s | 256MB | 列表查询 |
| course_purchase_check | 5s | 128MB | 简单查询 |
| course_videos | 20s | 256MB | 需转换视频链接 |

