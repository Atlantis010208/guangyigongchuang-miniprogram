/**
 * 云函数：course_progress_update
 * 功能：更新用户的课程学习进度
 * 权限：需登录
 * 
 * 参数：
 * - courseId: 课程 ID（必填）
 * - lessonId: 当前课时 ID（必填）
 * - lessonProgress: 当前课时播放进度百分比 0-100（可选）
 * - action: 操作类型（可选）
 *   - 'complete': 标记当前课时为已完成
 *   - 'update': 更新播放进度（默认）
 * 
 * 存储结构 (course_progress 集合)：
 * {
 *   _id: string,
 *   userId: string (OPENID),
 *   courseId: string,
 *   progress: number (0-100, 整个课程的进度),
 *   completedLessons: string[] (已完成的课时 ID 列表),
 *   lessonProgress: { [lessonId]: { progress: number, lastWatchedAt: Date, isCompleted: boolean } },
 *   totalLessons: number (课程总课时数),
 *   lastLessonId: string (最后观看的课时 ID),
 *   lastLessonProgress: number (最后观看课时的进度),
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    
    // 验证登录状态
    if (!OPENID) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        errorMessage: '请先登录'
      }
    }
    
    const { courseId, lessonId, lessonProgress = 0, action = 'update' } = event
    
    // 参数验证
    if (!courseId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少课程ID参数'
      }
    }
    
    if (!lessonId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少课时ID参数'
      }
    }
    
    // 查询课程信息获取总课时数
    const courseRes = await queryCourse(courseId)
    if (!courseRes) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: '课程不存在'
      }
    }
    
    // 计算总课时数和获取所有课时ID
    const totalLessons = countTotalLessons(courseRes.chapters || [])
    const allLessonIds = getAllVideoLessonIds(courseRes.chapters || [])
    
    // 查询现有进度记录
    const progressCollection = db.collection('course_progress')
    const existingRes = await progressCollection.where({
      userId: OPENID,
      courseId: courseId
    }).limit(1).get()
    
    const now = new Date()
    let completedLessons = []
    let lessonProgressMap = {}
    let newProgress = 0
    
    if (existingRes.data && existingRes.data.length > 0) {
      // 更新现有记录
      const existingRecord = existingRes.data[0]
      completedLessons = existingRecord.completedLessons || []
      lessonProgressMap = existingRecord.lessonProgress || {}
      
      // 【关键】检查该课时是否已经完成
      const existingLessonInfo = lessonProgressMap[lessonId]
      const alreadyCompleted = existingLessonInfo && existingLessonInfo.isCompleted
      
      if (alreadyCompleted) {
        // 如果已经完成，保持完成状态，不更新进度
        console.log('[course_progress_update] 课时已完成，保持完成状态:', lessonId)
        lessonProgressMap[lessonId] = {
          progress: 100,
          lastWatchedAt: now,
          isCompleted: true
        }
      } else {
        // 未完成的课时，正常更新进度
        const isCompleted = action === 'complete' || lessonProgress >= 95
        lessonProgressMap[lessonId] = {
          progress: lessonProgress,
          lastWatchedAt: now,
          isCompleted: isCompleted
        }
        
        // 如果是完成操作，添加到已完成列表
        if (isCompleted && !completedLessons.includes(lessonId)) {
          completedLessons.push(lessonId)
        }
      }
      
      // 计算整体进度：基于所有课时的平均进度
      let totalProgressSum = 0
      for (const id of allLessonIds) {
        const lessonInfo = lessonProgressMap[id]
        if (lessonInfo && typeof lessonInfo.progress === 'number') {
          totalProgressSum += lessonInfo.progress
        }
        // 未学习的课时进度为 0，不需要额外处理
      }
      
      newProgress = allLessonIds.length > 0 
        ? Math.round(totalProgressSum / allLessonIds.length)
        : 0
      
      // 确保进度不超过 100
      newProgress = Math.min(newProgress, 100)
      
      // 更新记录
      await progressCollection.doc(existingRecord._id).update({
        data: {
          progress: newProgress,
          completedLessons: completedLessons,
          lessonProgress: lessonProgressMap,
          totalLessons: totalLessons,
          lastLessonId: lessonId,
          lastLessonProgress: lessonProgress,
          updatedAt: now
        }
      })
      
      console.log('[course_progress_update] Updated progress:', {
        courseId,
        progress: newProgress,
        completedCount: completedLessons.length,
        totalLessons
      })
      
    } else {
      // 创建新记录
      const isCompleted = action === 'complete' || lessonProgress >= 95
      
      // 初始化课时进度映射
      lessonProgressMap[lessonId] = {
        progress: lessonProgress,
        lastWatchedAt: now,
        isCompleted: isCompleted
      }
      
      if (isCompleted) {
        completedLessons = [lessonId]
      }
      
      // 计算整体进度：基于所有课时的平均进度
      let totalProgressSum = 0
      for (const id of allLessonIds) {
        const lessonInfo = lessonProgressMap[id]
        if (lessonInfo && typeof lessonInfo.progress === 'number') {
          totalProgressSum += lessonInfo.progress
        }
        // 未学习的课时进度为 0，不需要额外处理
      }
      
      newProgress = allLessonIds.length > 0 
        ? Math.round(totalProgressSum / allLessonIds.length)
        : 0
      
      await progressCollection.add({
        data: {
          userId: OPENID,
          courseId: courseId,
          progress: newProgress,
          completedLessons: completedLessons,
          lessonProgress: lessonProgressMap,
          totalLessons: totalLessons,
          lastLessonId: lessonId,
          lastLessonProgress: lessonProgress,
          createdAt: now,
          updatedAt: now
        }
      })
      
      console.log('[course_progress_update] Created new progress record:', {
        courseId,
        progress: newProgress
      })
    }
    
    return {
      success: true,
      code: 'OK',
      data: {
        courseId: courseId,
        progress: newProgress,
        completedLessons: completedLessons,
        totalLessons: totalLessons,
        lastLessonId: lessonId
      },
      message: '更新学习进度成功'
    }
    
  } catch (err) {
    console.error('[course_progress_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

/**
 * 查询课程数据
 * @param {string} courseId - 课程 ID
 * @returns {Object|null} 课程数据
 */
async function queryCourse(courseId) {
  try {
    // 尝试通过 courseId 查询
    if (courseId.startsWith('CO') || courseId.startsWith('c')) {
      const res = await db.collection('courses').where({
        courseId: courseId,
        isDelete: _.neq(1)
      }).field({
        _id: true,
        courseId: true,
        chapters: true
      }).limit(1).get()
      
      if (res.data && res.data.length > 0) {
        return res.data[0]
      }
    }
    
    // 如果没找到，尝试通过 _id 查询
    try {
      const res = await db.collection('courses').doc(courseId).field({
        _id: true,
        courseId: true,
        chapters: true
      }).get()
      if (res.data) {
        return res.data
      }
    } catch (e) {
      // doc 查询失败，忽略
    }
    
    return null
  } catch (err) {
    console.error('[course_progress_update] queryCourse Error:', err)
    return null
  }
}

/**
 * 计算课程总课时数（只统计视频类型的课时）
 * @param {Array} chapters - 章节列表
 * @returns {number} 总课时数
 */
function countTotalLessons(chapters) {
  let count = 0
  
  for (const chapter of chapters) {
    if (chapter.lessons && Array.isArray(chapter.lessons)) {
      for (const lesson of chapter.lessons) {
        // 只统计视频类型的课时
        if (lesson.type === 'video') {
          count++
        }
      }
    }
  }
  
  return count
}

/**
 * 获取课程所有视频课时的ID列表
 * @param {Array} chapters - 章节列表
 * @returns {Array} 课时ID列表
 */
function getAllVideoLessonIds(chapters) {
  const lessonIds = []
  
  for (const chapter of chapters) {
    if (chapter.lessons && Array.isArray(chapter.lessons)) {
      for (const lesson of chapter.lessons) {
        // 只统计视频类型的课时
        if (lesson.type === 'video' && lesson.id) {
          lessonIds.push(lesson.id)
        }
      }
    }
  }
  
  return lessonIds
}

