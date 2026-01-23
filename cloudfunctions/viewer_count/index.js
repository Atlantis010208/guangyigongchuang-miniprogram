/**
 * 视频观看人数统计云函数
 * 
 * 功能：
 * - join: 加入观看（用户开始播放视频）
 * - leave: 离开观看（用户暂停/离开页面）
 * - get: 获取当前观看人数
 * - updateActivity: 更新用户活跃时间
 * - cleanup: 清理过期记录（定时任务）
 */

const cloud = require('wx-server-sdk');
const config = require('./config');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action, courseId, lessonId } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  console.log('[viewer_count] Request:', { action, courseId, lessonId, openid });

  try {
    switch (action) {
      case 'join':
        return await handleJoin(db, openid, courseId, lessonId);
      case 'leave':
        return await handleLeave(db, openid, courseId, lessonId);
      case 'get':
        return await handleGet(db, lessonId);
      case 'getLearned':
        return await handleGetLearned(db, courseId, lessonId);
      case 'updateActivity':
        return await handleUpdateActivity(db, openid, courseId, lessonId);
      case 'cleanup':
        return await handleCleanup(db);
      default:
        return { 
          success: false, 
          message: `无效的 action: ${action}` 
        };
    }
  } catch (err) {
    console.error('[viewer_count] Error:', err);
    return { 
      success: false, 
      message: err.message,
      error: err.toString()
    };
  }
};

/**
 * 加入观看（用户开始播放视频）
 */
async function handleJoin(db, openid, courseId, lessonId) {
  if (!courseId || !lessonId) {
    return { success: false, message: '缺少必要参数：courseId 或 lessonId' };
  }

  const now = new Date();
  const collection = db.collection(config.COLLECTION_NAME);

  try {
    // 查询用户是否已有记录
    const existingRecord = await collection
      .where({
        courseId,
        lessonId,
        openid
      })
      .get();

    if (existingRecord.data.length > 0) {
      // 更新已有记录
      // 🔧 修复：重新开始观看时，需要重置 joinedAt 为当前时间
      // 这样观看时长才是本次会话的时长，而不是累计时长
      await collection
        .doc(existingRecord.data[0]._id)
        .update({
          data: {
            isPlaying: true,
            lastActiveAt: now,
            joinedAt: now  // 重置会话开始时间
          }
        });
      console.log('[join] Updated existing record:', existingRecord.data[0]._id);
    } else {
      // 创建新记录
      await collection.add({
        data: {
          courseId,
          lessonId,
          openid,
          isPlaying: true,
          lastActiveAt: now,
          joinedAt: now
        }
      });
      console.log('[join] Created new record');
    }

    // 统计当前观看人数
    const viewerCount = await getActiveViewerCount(db, lessonId);

    return {
      success: true,
      viewerCount,
      message: '加入成功'
    };
  } catch (err) {
    console.error('[join] Error:', err);
    throw err;
  }
}

/**
 * 离开观看（用户暂停/离开页面）
 */
async function handleLeave(db, openid, courseId, lessonId) {
  if (!courseId || !lessonId) {
    return { success: false, message: '缺少必要参数：courseId 或 lessonId' };
  }

  const collection = db.collection(config.COLLECTION_NAME);

  try {
    // 更新用户记录
    const result = await collection
      .where({
        courseId,
        lessonId,
        openid
      })
      .update({
        data: {
          isPlaying: false
        }
      });

    console.log('[leave] Updated records:', result.stats.updated);

    // 统计剩余观看人数
    const viewerCount = await getActiveViewerCount(db, lessonId);

    return {
      success: true,
      viewerCount,
      message: '离开成功'
    };
  } catch (err) {
    console.error('[leave] Error:', err);
    throw err;
  }
}

/**
 * 获取当前观看人数
 */
async function handleGet(db, lessonId) {
  if (!lessonId) {
    return { success: false, message: '缺少必要参数：lessonId' };
  }

  try {
    const viewerCount = await getActiveViewerCount(db, lessonId);

    return {
      success: true,
      viewerCount,
      message: '获取成功'
    };
  } catch (err) {
    console.error('[get] Error:', err);
    throw err;
  }
}

/**
 * 更新用户活跃时间（防止被误判为过期）
 */
async function handleUpdateActivity(db, openid, courseId, lessonId) {
  if (!courseId || !lessonId) {
    return { success: false, message: '缺少必要参数：courseId 或 lessonId' };
  }

  const now = new Date();
  const collection = db.collection(config.COLLECTION_NAME);

  try {
    const result = await collection
      .where({
        courseId,
        lessonId,
        openid
      })
      .update({
        data: {
          lastActiveAt: now
        }
      });

    console.log('[updateActivity] Updated records:', result.stats.updated);

    return {
      success: true,
      message: '更新成功'
    };
  } catch (err) {
    console.error('[updateActivity] Error:', err);
    throw err;
  }
}

/**
 * 清理过期记录（定时任务）
 */
async function handleCleanup(db) {
  const now = new Date();
  const expireThreshold = new Date(now.getTime() - config.ACTIVE_TIMEOUT);
  const collection = db.collection(config.COLLECTION_NAME);

  try {
    // 查询过期记录
    const expiredRecords = await collection
      .where({
        lastActiveAt: _.lt(expireThreshold)
      })
      .get();

    console.log(`[cleanup] Found ${expiredRecords.data.length} expired records`);

    if (expiredRecords.data.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: '没有需要清理的记录'
      };
    }

    // 删除过期记录
    const deletePromises = expiredRecords.data.map(record => 
      collection.doc(record._id).remove()
    );
    await Promise.all(deletePromises);

    console.log(`[cleanup] Deleted ${expiredRecords.data.length} records`);

    return {
      success: true,
      deletedCount: expiredRecords.data.length,
      message: '清理完成'
    };
  } catch (err) {
    console.error('[cleanup] Error:', err);
    throw err;
  }
}

/**
 * 获取已学习人数
 */
async function handleGetLearned(db, courseId, lessonId) {
  if (!courseId || !lessonId) {
    return { success: false, message: '缺少必要参数：courseId 或 lessonId' };
  }

  try {
    const learnedCount = await getLearnedCount(db, courseId, lessonId);

    return {
      success: true,
      learnedCount,
      message: '获取成功'
    };
  } catch (err) {
    console.error('[getLearned] Error:', err);
    throw err;
  }
}

/**
 * 辅助函数：获取活跃观看人数
 * @param {Database} db - 数据库实例
 * @param {string} lessonId - 课时ID
 * @returns {Promise<number>} 观看人数
 */
async function getActiveViewerCount(db, lessonId) {
  const now = new Date();
  const activeThreshold = new Date(now.getTime() - config.ACTIVE_TIMEOUT);

  try {
    const result = await db.collection(config.COLLECTION_NAME)
      .where({
        lessonId,
        isPlaying: true,
        lastActiveAt: _.gte(activeThreshold) // 最近5分钟内活跃
      })
      .count();

    console.log(`[getActiveViewerCount] lessonId: ${lessonId}, count: ${result.total}`);
    return result.total;
  } catch (err) {
    console.error('[getActiveViewerCount] Error:', err);
    return 0; // 查询失败返回 0
  }
}

/**
 * 辅助函数：获取已学习人数
 * @param {Database} db - 数据库实例
 * @param {string} courseId - 课程ID
 * @param {string} lessonId - 课时ID
 * @returns {Promise<number>} 已学习人数
 */
async function getLearnedCount(db, courseId, lessonId) {
  try {
    // 查询所有购买了该课程的用户的学习进度
    const progressRecords = await db.collection('course_progress')
      .where({
        courseId: courseId
      })
      .field({
        lessonProgress: true
      })
      .get();

    // 统计完成该课时的人数（只统计 isCompleted = true 的情况）
    let count = 0;
    for (const record of progressRecords.data) {
      const lessonProgress = record.lessonProgress || {};
      const lessonInfo = lessonProgress[lessonId];
      
      // 只统计已完成的课时（显示绿色"已学习"标识）
      if (lessonInfo && lessonInfo.isCompleted === true) {
        count++;
      }
    }

    console.log(`[getLearnedCount] courseId: ${courseId}, lessonId: ${lessonId}, count: ${count}`);
    return count;
  } catch (err) {
    console.error('[getLearnedCount] Error:', err);
    return 0; // 查询失败返回 0
  }
}

