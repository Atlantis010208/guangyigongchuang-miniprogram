// 云函数：admin_viewers_list
// 功能：获取当前正在观看的用户列表，支持筛选、排序、分页
// 权限：仅管理员可访问

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  console.log('[admin_viewers_list] 收到请求:', event);

  try {
    // ========== 1. 权限验证：仅管理员可访问 ==========
    const { OPENID } = cloud.getWXContext();
    
    const adminUser = await db.collection('users')
      .where({ openid: OPENID, roles: 0 })
      .get();

    if (!adminUser.data || adminUser.data.length === 0) {
      console.log('[admin_viewers_list] 权限不足，openid:', OPENID);
      return {
        success: false,
        errorMessage: '无权限访问，仅管理员可查看观看者列表'
      };
    }

    console.log('[admin_viewers_list] 权限验证通过，管理员:', adminUser.data[0].nickname);

    // ========== 2. 解析参数 ==========
    const {
      courseId,
      lessonId,
      keyword,
      orderBy = 'lastActiveAt',
      order = 'desc',
      limit = 20,
      offset = 0
    } = event;

    // ========== 3. 构建查询条件 ==========
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - INACTIVITY_TIMEOUT);

    let whereCondition = {
      isPlaying: true,
      lastActiveAt: _.gte(activeThreshold)
    };

    if (courseId) whereCondition.courseId = courseId;
    if (lessonId) whereCondition.lessonId = lessonId;

    console.log('[admin_viewers_list] 查询条件:', whereCondition);

    // ========== 4. 查询观看记录 ==========
    const viewerQuery = db.collection('viewer_records')
      .where(whereCondition)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(limit);

    const [viewerResult, countResult] = await Promise.all([
      viewerQuery.get(),
      db.collection('viewer_records').where(whereCondition).count()
    ]);

    console.log(`[admin_viewers_list] 查询到 ${viewerResult.data.length} 条观看记录，总数: ${countResult.total}`);

    // 如果没有观看记录，直接返回空列表
    if (!viewerResult.data || viewerResult.data.length === 0) {
      return {
        success: true,
        data: {
          total: 0,
          list: []
        }
      };
    }

    // ========== 5. 批量查询用户信息和课程信息 ==========
    const openids = [...new Set(viewerResult.data.map(v => v.openid))];
    const courseIds = [...new Set(viewerResult.data.map(v => v.courseId))];

    console.log(`[admin_viewers_list] 关联查询: ${openids.length} 个用户, ${courseIds.length} 个课程`);
    console.log('[admin_viewers_list] courseIds数组:', courseIds);

    const [usersResult, coursesResult] = await Promise.all([
      db.collection('users')
        .where({ _openid: _.in(openids) })
        .field({ _openid: true, nickname: true, avatarUrl: true, _id: true })
        .get(),
      db.collection('courses')
        .where({ courseId: _.in(courseIds) })
        .field({ courseId: true, title: true, cover: true, chapters: true })
        .get()
    ]);

    console.log('[admin_viewers_list] 用户查询结果:', usersResult.data.length, '个');
    console.log('[admin_viewers_list] 课程查询结果:', coursesResult.data.length, '个');

    // ========== 6. 构建映射表 ==========
    const userMap = {};
    usersResult.data.forEach(u => {
      userMap[u._openid] = u;
    });

    const courseMap = {};
    coursesResult.data.forEach(c => {
      courseMap[c.courseId] = c;
      console.log(`[admin_viewers_list] 课程映射: ${c.courseId} => ${c.title}`);
    });

    // ========== 7. 组装返回数据 ==========
    const list = viewerResult.data.map(record => {
      const user = userMap[record.openid] || {};
      const course = courseMap[record.courseId] || {};

      // 查找章节和课时名称
      let chapterName = '';
      let lessonName = '';
      if (course.chapters && Array.isArray(course.chapters)) {
        for (const chapter of course.chapters) {
          if (chapter.lessons && Array.isArray(chapter.lessons)) {
            const lesson = chapter.lessons.find(l => l.id === record.lessonId);
            if (lesson) {
              chapterName = chapter.title || '';
              lessonName = lesson.title || '';
              break;
            }
          }
        }
      }

      // 计算观看时长（秒）
      // 兼容 createdAt 和 joinedAt 字段（joinedAt 可能是 Date 对象或 { $date: timestamp } 格式）
      let startTimeValue = record.createdAt || record.joinedAt;
      if (startTimeValue && typeof startTimeValue === 'object' && startTimeValue.$date) {
        startTimeValue = startTimeValue.$date;
      }
      const startTimeDate = startTimeValue ? new Date(startTimeValue) : new Date();
      const duration = Math.floor((now - startTimeDate) / 1000);

      // 处理 lastActiveAt（同样可能是对象格式）
      let lastActiveValue = record.lastActiveAt;
      if (lastActiveValue && typeof lastActiveValue === 'object' && lastActiveValue.$date) {
        lastActiveValue = lastActiveValue.$date;
      }

      return {
        recordId: record._id,
        // 用户信息
        userId: user._id || '',
        nickname: user.nickname || '未知用户',
        avatarUrl: user.avatarUrl || '',
        // 观看内容
        courseId: record.courseId,
        courseName: course.title || '未知课程',
        courseCover: course.cover || '',
        chapterName,
        lessonId: record.lessonId,
        lessonName: lessonName || '未知课时',
        // 观看详情
        duration,
        progress: 0, // 暂不支持进度计算
        // 时间信息
        startTime: startTimeDate.getTime(),
        lastActiveTime: lastActiveValue ? new Date(lastActiveValue).getTime() : Date.now(),
      };
    });

    // ========== 7.5. 转换云存储 URL 为 HTTPS URL ==========
    // 收集所有需要转换的 cloud:// URL
    const cloudFileIds = [];
    list.forEach(item => {
      if (item.avatarUrl && item.avatarUrl.startsWith('cloud://')) {
        cloudFileIds.push(item.avatarUrl);
      }
      if (item.courseCover && item.courseCover.startsWith('cloud://')) {
        cloudFileIds.push(item.courseCover);
      }
    });

    // 批量获取临时下载链接
    let fileUrlMap = {};
    if (cloudFileIds.length > 0) {
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: cloudFileIds
        });
        console.log(`[admin_viewers_list] 转换 ${cloudFileIds.length} 个云存储 URL`);
        
        // 构建 URL 映射表
        tempUrlResult.fileList.forEach(file => {
          if (file.status === 0) {
            fileUrlMap[file.fileID] = file.tempFileURL;
          }
        });
      } catch (error) {
        console.error('[admin_viewers_list] 获取临时下载链接失败:', error);
        // 继续执行，只是不显示图片
      }
    }

    // 替换 list 中的 URL
    list.forEach(item => {
      if (item.avatarUrl && fileUrlMap[item.avatarUrl]) {
        item.avatarUrl = fileUrlMap[item.avatarUrl];
      }
      if (item.courseCover && fileUrlMap[item.courseCover]) {
        item.courseCover = fileUrlMap[item.courseCover];
      }
    });

    // ========== 8. 关键词搜索过滤 ==========
    let filteredList = list;
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filteredList = list.filter(item =>
        item.nickname.toLowerCase().includes(kw) ||
        item.courseName.toLowerCase().includes(kw) ||
        item.lessonName.toLowerCase().includes(kw)
      );
      console.log(`[admin_viewers_list] 关键词搜索 "${keyword}"，匹配 ${filteredList.length} 条记录`);
    }

    // ========== 9. 返回结果 ==========
    console.log(`[admin_viewers_list] 成功返回 ${filteredList.length} 条记录`);
    return {
      success: true,
      data: {
        total: countResult.total,
        list: filteredList
      }
    };

  } catch (error) {
    console.error('[admin_viewers_list] 发生错误:', error);
    return {
      success: false,
      errorMessage: error.message || '获取观看者列表失败'
    };
  }
};

