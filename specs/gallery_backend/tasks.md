# 实施计划：灯光实景图库后端云函数

## 阶段一：数据库基础设施

- [x] 1. 创建 `gallery_images` 集合及索引
  - 创建集合 `gallery_images`
  - 创建复合索引 `{ status: 1, sortOrder: -1 }`
  - 创建复合索引 `{ status: 1, tags: 1, sortOrder: -1 }`
  - 创建复合索引 `{ status: 1, createdAt: -1 }`
  - _需求: 需求7-验收标准1,2_

- [x] 2. 创建 `gallery_tags` 集合
  - 创建集合 `gallery_tags`
  - _需求: 需求2_

- [x] 3. 创建 `gallery_favorites` 集合及索引
  - 创建集合 `gallery_favorites`
  - 创建复合索引 `{ userId: 1, imageId: 1, isDelete: 1 }`
  - 创建复合索引 `{ userId: 1, isDelete: 1, createdAt: -1 }`
  - _需求: 需求7-验收标准4_

- [x] 4. 创建 `gallery_config` 集合并初始化
  - 创建集合 `gallery_config`
  - 插入初始记录 `{ _id: "tag_version", value: 1 }`
  - _需求: 需求6_

## 阶段二：管理端云函数

- [x] 5. 实现 `admin_gallery_tags` 云函数
  - 创建云函数目录及 package.json
  - 复制 admin_auth.js 权限模块
  - 实现 `add` 操作（新增标签，查重，自增 tagVersion）
  - 实现 `update` 操作（更新标签，自增 tagVersion）
  - 实现 `delete` 操作（逻辑删除，自增 tagVersion）
  - 实现 `list` 操作（按 group 分组、sortOrder 排序）
  - _需求: 需求2-验收标准1~5, 需求6-验收标准2_

- [x] 6. 实现 `admin_gallery_images` 云函数
  - 创建云函数目录及 package.json
  - 复制 admin_auth.js 权限模块
  - 实现 `add` 操作（新增图片，自动生成 keywords，自动计算 aspect，更新标签 imageCount）
  - 实现 `update` 操作（更新图片，同步更新 keywords，处理标签变更时的 imageCount 增减）
  - 实现 `delete` 操作（逻辑删除，更新标签 imageCount）
  - 实现 `list` 操作（管理端分页列表，支持按状态/标签/关键词筛选）
  - 实现 `batchAdd` 操作（批量导入，最多 50 条，逐条写入并更新标签计数）
  - _需求: 需求1-验收标准1~5_

## 阶段三：小程序端云函数

- [x] 7. 实现 `gallery_list` 云函数
  - 创建云函数目录及 package.json
  - 实现 `list` 操作（游标分页、标签筛选、多标签 AND 筛选）
  - 实现 `search` 操作（keywords 正则匹配 + 标签组合查询）
  - 实现 `tags` 操作（返回标签列表 + tagVersion 缓存判断）
  - 实现 `detail` 操作（单张图片详情，含原图 URL）
  - 实现 cloud:// → 临时 HTTPS URL 批量转换
  - _需求: 需求3-验收标准1~5, 需求4-验收标准1~4, 需求6-验收标准1~3_

- [x] 8. 实现 `gallery_favorites` 云函数
  - 创建云函数目录及 package.json
  - 实现 `add` 操作（添加收藏，去重检查，更新 favoriteCount）
  - 实现 `remove` 操作（逻辑删除，更新 favoriteCount）
  - 实现 `list` 操作（游标分页，关联查询图片信息）
  - 实现 `check` 操作（检查单张图片收藏状态）
  - 实现 `batchCheck` 操作（批量检查收藏状态）
  - _需求: 需求5-验收标准1~4_

## 阶段四：部署与验证

- [x] 9. 部署所有云函数
  - 部署 `admin_gallery_tags`
  - 部署 `admin_gallery_images`
  - 部署 `gallery_list`
  - 部署 `gallery_favorites`
  - _需求: 全部_

- [x] 10. 初始化测试数据
  - 通过 `admin_gallery_tags` 写入默认标签集（场景类型、光源类型、设计风格等分组）
  - 通过 `admin_gallery_images` 写入几条测试图片数据
  - 验证 gallery_list 查询、标签筛选、搜索功能
  - 验证 gallery_favorites 收藏/取消/列表功能
  - _需求: 全部验收标准_
