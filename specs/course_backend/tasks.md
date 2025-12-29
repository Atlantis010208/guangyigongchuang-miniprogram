# 课程后端云函数 - 实施计划

## 任务总览

| 序号 | 任务 | 优先级 | 预估时间 | 状态 |
|------|------|--------|---------|------|
| 1 | courses_list 云函数 | P0 | 20min | ✅ 已完成 |
| 2 | course_purchase_check 云函数 | P1 | 15min | ✅ 已完成 |
| 3 | course_videos 云函数 | P0 | 25min | ✅ 已完成 |
| 4 | 云函数部署与测试 | P0 | 10min | ✅ 已完成 |

---

## 详细任务

- [x] 1. **courses_list 云函数开发** ✅
  - 创建 `cloudfunctions/courses_list/` 目录
  - 编写 `index.js` 主入口文件
  - 编写 `package.json` 依赖配置
  - 实现功能：
    - 查询已发布课程（status='published'）
    - 支持分页（limit/offset）
    - 支持筛选（category/level/keyword）
    - 云存储图片转临时链接
    - 返回字段兼容前端 Mock 数据格式（coverUrl, subtitle, instructor 等）
    - 不返回敏感字段（chapters, driveLink 等）
  - _需求: 需求 1_

- [x] 2. **course_purchase_check 云函数开发** ✅
  - 创建 `cloudfunctions/course_purchase_check/` 目录
  - 编写 `index.js` 主入口文件
  - 编写 `package.json` 依赖配置
  - 实现功能：
    - 获取用户 OPENID
    - 支持单个课程检查（courseId）
    - 支持批量检查（courseIds 数组）
    - 查询 orders 集合匹配 category='course' 且 status in ['paid', 'completed']
    - 返回 isPurchased、purchasedAt、orderId
  - _需求: 需求 2_

- [x] 3. **course_videos 云函数开发** ✅
  - 创建 `cloudfunctions/course_videos/` 目录
  - 编写 `index.js` 主入口文件
  - 编写 `package.json` 依赖配置
  - 实现功能：
    - 验证用户登录状态（未登录返回 UNAUTHORIZED）
    - 验证购买状态（未购买返回 NOT_PURCHASED）
    - 查询课程数据获取 chapters
    - 云存储视频/文件链接转临时链接
    - 支持 lessonId 参数定位当前课时
    - 返回格式兼容 video-player 页面
  - _需求: 需求 3_

- [x] 4. **云函数部署与测试** ✅
  - 部署 courses_list 云函数
  - 部署 course_purchase_check 云函数
  - 部署 course_videos 云函数
  - 测试各接口返回数据正确性
  - 验证权限控制逻辑
  - _需求: 全部_

---

## 文件清单

```
cloudfunctions/
├── courses_list/
│   ├── index.js        # 任务 1
│   └── package.json    # 任务 1
├── course_purchase_check/
│   ├── index.js        # 任务 2
│   └── package.json    # 任务 2
└── course_videos/
    ├── index.js        # 任务 3
    └── package.json    # 任务 3
```

---

## 验收标准

### courses_list
- [x] 返回已发布课程列表
- [x] 支持分页、筛选
- [x] 图片链接正确转换
- [x] 不返回 chapters 等敏感字段

### course_purchase_check
- [x] 未登录返回 isPurchased: false
- [x] 已购买返回正确的购买信息
- [x] 支持批量检查

### course_videos
- [x] 未登录返回 UNAUTHORIZED 错误
- [x] 未购买返回 NOT_PURCHASED 错误
- [x] 已购买返回完整章节和视频链接
- [x] 视频链接正确转换为临时链接

