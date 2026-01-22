// 云函数：admin_viewers_stats
// 功能：获取观看统计数据（总人数、课程分布、平均时长）
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
  console.log('[admin_viewers_stats] 收到请求');

  try {
    // ========== 1. 权限验证：仅管理员可访问 ==========
    const { OPENID } = cloud.getWXContext();

    const adminUser = await db.collection('users')
      .where({ openid: OPENID, roles: 0 })
      .get();

    if (!adminUser.data || adminUser.data.length === 0) {
      console.log('[admin_viewers_stats] 权限不足，openid:', OPENID);
      return {
        success: false,
        errorMessage: '无权限访问，仅管理员可查看观看统计'
      };
    }

    console.log('[admin_viewers_stats] 权限验证通过，管理员:', adminUser.data[0].nickname);

    // ========== 2. 查询活跃观看记录 ==========
    const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟
    const now = new Date();
    const activeThreshold = new Date(now.getTime() - INACTIVITY_TIMEOUT);

    const activeViewers = await db.collection('viewer_records')
      .where({
        isPlaying: true,
        lastActiveAt: _.gte(activeThreshold)
      })
      .get();

    console.log(`[admin_viewers_stats] 查询到 ${activeViewers.data.length} 条活跃观看记录`);

    // 如果没有观看记录，返回空统计
    if (!activeViewers.data || activeViewers.data.length === 0) {
      return {
        success: true,
        data: {
          currentViewers: 0,
          topCourses: [],
          averageDuration: 0
        }
      };
    }

    // ========== 3. 统计总人数 ==========
    const currentViewers = activeViewers.data.length;

    // ========== 4. 统计课程分布 ==========
    const courseCounts = {};
    activeViewers.data.forEach(record => {
      const courseId = record.courseId;
      courseCounts[courseId] = (courseCounts[courseId] || 0) + 1;
    });

    console.log('[admin_viewers_stats] 课程分布:', courseCounts);

    // ========== 5. 查询课程名称 ==========
    const courseIds = Object.keys(courseCounts);
    
    let coursesResult = { data: [] };
    if (courseIds.length > 0) {
      coursesResult = await db.collection('courses')
        .where({ courseId: _.in(courseIds) })
        .field({ courseId: true, title: true })
        .get();
    }

    const courseMap = {};
    coursesResult.data.forEach(c => {
      courseMap[c.courseId] = c.title;
    });

    // ========== 6. 构建 topCourses（前 5 名） ==========
    const topCourses = Object.entries(courseCounts)
      .map(([courseId, count]) => ({
        courseId,
        courseName: courseMap[courseId] || '未知课程',
        viewerCount: count
      }))
      .sort((a, b) => b.viewerCount - a.viewerCount)
      .slice(0, 5);

    console.log('[admin_viewers_stats] 热门课程 Top5:', topCourses);

    // ========== 7. 计算平均观看时长 ==========
    const totalDuration = activeViewers.data.reduce((sum, record) => {
      // 兼容 createdAt 和 joinedAt 字段（joinedAt 可能是 Date 对象或 { $date: timestamp } 格式）
      let startTimeValue = record.createdAt || record.joinedAt;
      if (startTimeValue && typeof startTimeValue === 'object' && startTimeValue.$date) {
        startTimeValue = startTimeValue.$date;
      }
      const startTimeDate = startTimeValue ? new Date(startTimeValue) : new Date();
      const duration = Math.floor((now - startTimeDate) / 1000);
      return sum + duration;
    }, 0);

    const averageDuration = currentViewers > 0 ? Math.floor(totalDuration / currentViewers) : 0;

    console.log(`[admin_viewers_stats] 平均观看时长: ${averageDuration} 秒`);

    // ========== 8. 返回结果 ==========
    return {
      success: true,
      data: {
        currentViewers,
        topCourses,
        averageDuration
      }
    };

  } catch (error) {
    console.error('[admin_viewers_stats] 发生错误:', error);
    return {
      success: false,
      errorMessage: error.message || '获取观看统计失败'
    };
  }
};

