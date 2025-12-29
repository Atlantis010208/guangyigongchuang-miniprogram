# 课程后端云函数需求文档

## 介绍

本需求旨在完善课程中心的后端云函数功能，提供小程序端课程列表接口和用户购买状态检查接口，支持用户购买课程后解锁视频播放功能。

### 背景分析

**当前问题：**
- 缺少小程序端获取课程列表的公开接口（`courses_list`）
- 无法判断用户是否已购买课程
- 视频播放页面使用本地 Mock 数据，无法从云端获取课程章节和视频

**已有资源：**
- 数据库集合：`courses`（存储课程数据）、`orders`（存储订单数据）
- 后台管理云函数：`admin_courses_list`、`admin_courses_add`、`admin_courses_update`
- 详情接口：`course_detail`（已实现，但未区分购买状态）
- 视频播放页面：`pages/course/video-player/video-player`（需要 chapters 和 videoUrl 数据）

**业务流程：**
1. 用户浏览课程列表 → 调用 `courses_list`
2. 用户查看课程详情 → 调用 `course_detail`（仅展示课程介绍，大纲&资料锁定）
3. 用户购买课程 → 创建订单并支付
4. 用户点击"立即观看" → 检查购买状态，已购买则跳转视频播放页面
5. 视频播放页面 → 获取完整章节和视频链接

**关键规则：未购买用户无法查看任何课程内容（无试看功能），大纲&资料完全锁定。**

---

## 需求

### 需求 1 - 课程列表接口 (courses_list)

**用户故事：** 作为小程序用户，我希望能够获取从数据库动态加载的课程列表。

#### 验收标准

1. **When** 调用 `courses_list` 云函数，**the** 云函数 **shall** 返回所有已发布（status='published'）的课程列表。

2. **When** 请求课程列表时，**the** 云函数 **shall** 支持分页参数（limit、offset），默认返回前 20 条数据。

3. **When** 请求课程列表时，**the** 云函数 **shall** 支持按分类（category）和难度（level）筛选课程。

4. **When** 课程包含云存储图片（cloud://）时，**the** 云函数 **shall** 自动将其转换为临时访问链接。

5. **When** 用户未登录时，**the** 云函数 **shall** 仍能返回公开的课程列表（无需登录即可浏览）。

6. **While** 返回数据时，**the** 云函数 **shall** 包含推荐课程标识（isFeatured）以便前端高亮显示。

7. **While** 返回数据时，**the** 云函数 **shall** 返回与前端 Mock 数据兼容的字段格式（如 coverUrl、subtitle 等）。

8. **While** 返回数据时，**the** 云函数 **shall** 不返回课程视频链接和章节详情（保护付费内容）。

---

### 需求 2 - 用户购买状态检查 (course_purchase_check)

**用户故事：** 作为已登录用户，我希望能够检查自己是否已购买某课程，以便解锁视频播放功能。

#### 验收标准

1. **When** 调用 `course_purchase_check` 云函数，**the** 云函数 **shall** 根据用户 openid 和课程 ID 检查是否存在已支付的订单。

2. **When** 存在已支付订单（status='paid' 或 'completed'）时，**the** 云函数 **shall** 返回 `isPurchased: true` 及购买时间。

3. **When** 用户未登录时，**the** 云函数 **shall** 返回 `isPurchased: false`，不抛出错误。

4. **When** 传入 courseIds 数组时，**the** 云函数 **shall** 批量检查多个课程的购买状态。

5. **While** 检查订单时，**the** 云函数 **shall** 仅匹配 `category: 'course'` 的订单商品。

---

### 需求 3 - 课程视频数据接口 (course_videos)

**用户故事：** 作为已购买课程的用户，我希望能够获取课程的完整章节和视频链接，以便在视频播放页面观看课程。

#### 验收标准

1. **When** 调用 `course_videos` 云函数，**the** 云函数 **shall** 首先验证用户是否已购买该课程。

2. **When** 用户已购买课程时，**the** 云函数 **shall** 返回课程的完整章节结构（chapters）和所有视频的播放链接（videoUrl）。

3. **When** 用户未购买课程时，**the** 云函数 **shall** 返回错误码 `NOT_PURCHASED`，提示用户需要购买才能观看。

4. **When** 用户未登录时，**the** 云函数 **shall** 返回错误码 `UNAUTHORIZED`，提示用户需要登录。

5. **When** 视频链接为云存储 fileID 时，**the** 云函数 **shall** 将其转换为临时播放链接。

6. **While** 返回数据时，**the** 云函数 **shall** 与视频播放页面（video-player）所需的数据格式兼容。

---

## 接口规范

### courses_list 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量，默认 20，最大 100 |
| offset | number | 否 | 偏移量，默认 0 |
| category | string | 否 | 按分类筛选 |
| level | string | 否 | 按难度筛选（beginner/intermediate/advanced） |
| keyword | string | 否 | 关键词搜索（标题模糊匹配） |

### courses_list 返回结构

```json
{
  "success": true,
  "code": "OK",
  "data": [
    {
      "id": "c001",
      "courseId": "CO_DEFAULT_001",
      "title": "二哥十年经验灯光课（正课）",
      "subtitle": "零基础到精通,掌握专业灯光设计核心逻辑",
      "description": "...",
      "coverUrl": "https://...",
      "price": 999,
      "originalPrice": 1299,
      "tags": ["灯光设计", "实战案例", "包含资料"],
      "level": "intermediate",
      "levelLabel": "进阶",
      "category": "照明基础",
      "isFeatured": true,
      "salesCount": 89,
      "rating": 4.9,
      "ratingCount": 89,
      "instructor": {
        "name": "二哥",
        "title": "资深灯光设计师",
        "avatar": "https://..."
      }
    }
  ],
  "total": 5,
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### course_purchase_check 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| courseId | string | 否 | 单个课程 ID |
| courseIds | string[] | 否 | 批量检查多个课程（优先于 courseId） |

### course_purchase_check 返回结构（单个课程）

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "isPurchased": true,
    "purchasedAt": 1703836800000,
    "orderId": "ORD202312291200001"
  }
}
```

### course_purchase_check 返回结构（批量检查）

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "c001": { "isPurchased": true, "purchasedAt": 1703836800000 },
    "c002": { "isPurchased": false }
  }
}
```

### course_videos 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| courseId | string | 是 | 课程 ID |
| lessonId | string | 否 | 指定课时 ID（用于播放页初始定位） |

### course_videos 返回结构（已购买 - 成功）

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "courseId": "c001",
    "title": "二哥十年经验灯光课（正课）",
    "isPurchased": true,
    "chapters": [
      {
        "title": "第一章：灯光设计底层逻辑",
        "lessons": [
          {
            "id": "l1-1",
            "title": "1.1 光的物理属性与情感表达",
            "type": "video",
            "duration": "15:20",
            "videoUrl": "https://xxx.com/video1.mp4"
          },
          {
            "id": "l1-2",
            "title": "1.2 色温与显色性的应用法则",
            "type": "video",
            "duration": "18:45",
            "videoUrl": "https://xxx.com/video2.mp4"
          }
        ]
      },
      {
        "title": "课程资料包",
        "lessons": [
          {
            "id": "m1",
            "title": "灯光设计常用参数表.pdf",
            "type": "file",
            "size": "2.5MB",
            "format": "PDF",
            "fileUrl": "https://xxx.com/file1.pdf"
          }
        ]
      }
    ],
    "currentLesson": {
      "id": "l1-1",
      "title": "1.1 光的物理属性与情感表达",
      "type": "video",
      "duration": "15:20",
      "videoUrl": "https://xxx.com/video1.mp4"
    }
  }
}
```

### course_videos 返回结构（未购买 - 失败）

```json
{
  "success": false,
  "code": "NOT_PURCHASED",
  "errorMessage": "您尚未购买此课程，请先购买后观看"
}
```

### course_videos 返回结构（未登录 - 失败）

```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "errorMessage": "请先登录后再观看课程"
}
```

---

## 数据库字段补充

### courses 集合需新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| chapters | array | 课程章节列表 |
| chapters[].title | string | 章节标题 |
| chapters[].lessons | array | 课时列表 |
| chapters[].lessons[].id | string | 课时 ID |
| chapters[].lessons[].title | string | 课时标题 |
| chapters[].lessons[].type | string | 类型：video / file |
| chapters[].lessons[].duration | string | 视频时长（如 "15:20"） |
| chapters[].lessons[].videoUrl | string | 视频链接（云存储 fileID 或 URL） |
| chapters[].lessons[].fileUrl | string | 文件下载链接 |
| chapters[].lessons[].size | string | 文件大小 |
| chapters[].lessons[].format | string | 文件格式 |
| isFeatured | boolean | 是否推荐课程 |
| subtitle | string | 课程副标题 |

---

## 优先级

1. 🔴 **P0** - courses_list 云函数（课程列表）
2. 🔴 **P0** - course_videos 云函数（视频播放数据，需验证购买状态）
3. 🟡 **P1** - course_purchase_check 云函数（购买状态检查）
