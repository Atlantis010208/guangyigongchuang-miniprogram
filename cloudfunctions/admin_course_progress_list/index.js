/**
 * 云函数：admin_course_progress_list
 * 功能：获取用户学习进度列表，支持筛选、排序、分页
 * 权限：仅管理员可访问
 * 
 * 参数：
 * - courseId: 课程ID（可选，用于筛选特定课程）
 * - keyword: 搜索关键词（可选，搜索用户昵称）
 * - orderBy: 排序字段（默认 'updatedAt'）
 * - order: 排序方向（默认 'desc'）
 * - limit: 每页数量（默认 20）
 * - offset: 偏移量（默认 0）
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  console.log('[admin_course_progress_list] 收到请求:', event);

  try {
    // ========== 1. 权限验证：仅管理员可访问 ==========
    const { OPENID } = cloud.getWXContext();
    
    const adminUser = await db.collection('users')
      .where({ _openid: OPENID, roles: 0 })
      .get();

    if (!adminUser.data || adminUser.data.length === 0) {
      console.log('[admin_course_progress_list] 权限不足，openid:', OPENID);
      return {
        success: false,
        errorMessage: '无权限访问，仅管理员可查看学习进度'
      };
    }

    console.log('[admin_course_progress_list] 权限验证通过，管理员:', adminUser.data[0].nickname);

    // ========== 2. 解析参数 ==========
    const {
      courseId,
      keyword,
      orderBy = 'updatedAt',
      order = 'desc',
      limit = 20,
      offset = 0
    } = event;

    // ========== 3. 构建查询条件 ==========
    let whereCondition = {};
    if (courseId) {
      whereCondition.courseId = courseId;
    }

    console.log('[admin_course_progress_list] 查询条件:', whereCondition);

    // ========== 4. 查询学习进度记录 ==========
    const progressQuery = db.collection('course_progress')
      .where(whereCondition)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(limit);

    const [progressResult, countResult] = await Promise.all([
      progressQuery.get(),
      db.collection('course_progress').where(whereCondition).count()
    ]);

    console.log(`[admin_course_progress_list] 查询到 ${progressResult.data.length} 条学习进度记录，总数: ${countResult.total}`);

    // 如果没有学习进度记录，直接返回空列表
    if (!progressResult.data || progressResult.data.length === 0) {
      return {
        success: true,
        data: {
          total: 0,
          list: []
        }
      };
    }

    // ========== 5. 批量查询用户信息和课程信息 ==========
    const userIds = [...new Set(progressResult.data.map(p => p.userId))];
    const courseIds = [...new Set(progressResult.data.map(p => p.courseId))];

    console.log(`[admin_course_progress_list] 关联查询: ${userIds.length} 个用户, ${courseIds.length} 个课程`);

    const [usersResult, coursesResult] = await Promise.all([
      db.collection('users')
        .where({ _openid: _.in(userIds) })
        .field({ _openid: true, nickname: true, avatarUrl: true, _id: true })
        .get(),
      db.collection('courses')
        .where({ courseId: _.in(courseIds) })
        .field({ courseId: true, title: true, cover: true, chapters: true })
        .get()
    ]);

    console.log('[admin_course_progress_list] 用户查询结果:', usersResult.data.length, '个');
    console.log('[admin_course_progress_list] 课程查询结果:', coursesResult.data.length, '个');

    // ========== 6. 构建映射表 ==========
    const userMap = {};
    usersResult.data.forEach(u => {
      userMap[u._openid] = u;
    });

    const courseMap = {};
    coursesResult.data.forEach(c => {
      courseMap[c.courseId] = c;
    });

    // ========== 7. 组装返回数据 ==========
    const list = progressResult.data.map(record => {
      const user = userMap[record.userId] || {};
      const course = courseMap[record.courseId] || {};

      // 统计已完成的课时详情
      const lessonProgress = record.lessonProgress || {};
      const completedLessons = [];
      const learningLessons = [];
      
      // 遍历所有课时进度
      for (const lessonId in lessonProgress) {
        const lessonInfo = lessonProgress[lessonId];
        
        // 在课程章节中查找课时信息
        let lessonTitle = lessonId;
        let chapterTitle = '';
        
        if (course.chapters && Array.isArray(course.chapters)) {
          for (const chapter of course.chapters) {
            if (chapter.lessons && Array.isArray(chapter.lessons)) {
              const lesson = chapter.lessons.find(l => l.id === lessonId);
              if (lesson) {
                lessonTitle = lesson.title || lessonId;
                chapterTitle = chapter.title || '';
                break;
              }
            }
          }
        }
        
        const lessonDetail = {
          lessonId: lessonId,
          lessonTitle: lessonTitle,
          chapterTitle: chapterTitle,
          progress: lessonInfo.progress || 0,
          isCompleted: lessonInfo.isCompleted || false,
          lastWatchedAt: lessonInfo.lastWatchedAt ? new Date(lessonInfo.lastWatchedAt).getTime() : null
        };
        
        if (lessonInfo.isCompleted) {
          completedLessons.push(lessonDetail);
        } else if (lessonInfo.progress > 0) {
          learningLessons.push(lessonDetail);
        }
      }

      return {
        recordId: record._id,
        // 用户信息
        userId: user._id || '',
        nickname: user.nickname || '未知用户',
        avatarUrl: user.avatarUrl || '',
        // 课程信息
        courseId: record.courseId,
        courseName: course.title || '未知课程',
        courseCover: course.cover || '',
        // 学习进度
        progress: record.progress || 0,
        totalLessons: record.totalLessons || 0,
        completedCount: record.completedLessons ? record.completedLessons.length : 0,
        completedLessons: completedLessons,
        learningLessons: learningLessons,
        lastLessonId: record.lastLessonId || '',
        // 时间信息
        createdAt: record.createdAt ? new Date(record.createdAt).getTime() : null,
        updatedAt: record.updatedAt ? new Date(record.updatedAt).getTime() : null,
      };
    });

    // ========== 8. 转换云存储 URL 为 HTTPS URL ==========
    const cloudFileIds = [];
    list.forEach(item => {
      if (item.avatarUrl && item.avatarUrl.startsWith('cloud://')) {
        cloudFileIds.push(item.avatarUrl);
      }
      if (item.courseCover && item.courseCover.startsWith('cloud://')) {
        cloudFileIds.push(item.courseCover);
      }
    });

    let fileUrlMap = {};
    if (cloudFileIds.length > 0) {
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: cloudFileIds
        });
        console.log(`[admin_course_progress_list] 转换 ${cloudFileIds.length} 个云存储 URL`);
        
        tempUrlResult.fileList.forEach(file => {
          if (file.status === 0) {
            fileUrlMap[file.fileID] = file.tempFileURL;
          }
        });
      } catch (error) {
        console.error('[admin_course_progress_list] 获取临时下载链接失败:', error);
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

    // ========== 9. 关键词搜索过滤 ==========
    let filteredList = list;
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filteredList = list.filter(item =>
        item.nickname.toLowerCase().includes(kw) ||
        item.courseName.toLowerCase().includes(kw)
      );
      console.log(`[admin_course_progress_list] 关键词搜索 "${keyword}"，匹配 ${filteredList.length} 条记录`);
    }

    // ========== 10. 返回结果 ==========
    console.log(`[admin_course_progress_list] 成功返回 ${filteredList.length} 条记录`);
    return {
      success: true,
      data: {
        total: countResult.total,
        list: filteredList
      }
    };

  } catch (error) {
    console.error('[admin_course_progress_list] 发生错误:', error);
    return {
      success: false,
      errorMessage: error.message || '获取学习进度列表失败'
    };
  }
};

