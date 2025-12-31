/**
 * 云函数：admin_update_video_urls
 * 功能：批量更新课程视频地址
 * 权限：仅管理员
 * 
 * 说明：此函数用于更新指定课程的视频云存储地址
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 新的视频地址映射
const VIDEO_URL_MAP = {
  '1.1 灯光设计基础': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-带字幕｜灯光设计基础(1).mp4',
  '1.1灯光设计基础': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-带字幕｜灯光设计基础(1).mp4',
  '2.1 灯光设计软件介绍': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/灯光设计软件(1).mp4',
  '2.1灯光设计软件介绍': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/灯光设计软件(1).mp4',
  '3.2 PS灯光设计初稿彩屏图和手绘图设计课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕丨3-1Ps灯光设计初稿彩屏图和手绘图设计课.mp4',
  '3.2PS灯光设计初稿彩屏图和手绘图设计课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕丨3-1Ps灯光设计初稿彩屏图和手绘图设计课.mp4',
  '3.2 Ps灯光设计初稿彩屏图和手绘图设计课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕丨3-1Ps灯光设计初稿彩屏图和手绘图设计课.mp4',
  '3.2Ps灯光设计初稿彩屏图和手绘图设计课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕丨3-1Ps灯光设计初稿彩屏图和手绘图设计课.mp4',
  '3.3 灯光设计概念方案汇报方案制作课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/3-2-Ps灯光设计初稿和手绘图设计课.mp4',
  '3.3灯光设计概念方案汇报方案制作课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/3-2-Ps灯光设计初稿和手绘图设计课.mp4',
  '3.4 灯光深化设计施工图纸CAD绘制课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕｜灯光设计实操-灯光深化设计施工图纸cad绘制课.mp4',
  '3.4灯光深化设计施工图纸CAD绘制课': 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/课程视频/视频-剪辑-带字幕｜灯光设计实操-灯光深化设计施工图纸cad绘制课.mp4'
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 检查用户是否为管理员
    if (!openid) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        errorMessage: '需要登录才能执行此操作'
      }
    }
    
    const userRes = await db.collection('users').where({
      _openid: openid,
      roles: 0,
      isDelete: _.neq(1)
    }).get()
    
    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        code: 'FORBIDDEN',
        errorMessage: '仅管理员可执行此操作'
      }
    }
    
    const { courseId = 'CO_DEFAULT_001' } = event
    
    // 查询课程
    const courseRes = await db.collection('courses').where({
      courseId: courseId,
      isDelete: _.neq(1)
    }).get()
    
    if (!courseRes.data || courseRes.data.length === 0) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: '课程不存在'
      }
    }
    
    const course = courseRes.data[0]
    const chapters = course.chapters || []
    let updateCount = 0
    
    // 更新视频地址
    const unmatchedLessons = []
    
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      console.log(`[admin_update_video_urls] 章节: ${chapter.title}`)
      
      if (chapter.lessons && Array.isArray(chapter.lessons)) {
        for (let j = 0; j < chapter.lessons.length; j++) {
          const lesson = chapter.lessons[j]
          const lessonTitle = lesson.title
          
          console.log(`[admin_update_video_urls] 课时标题: "${lessonTitle}" (类型: ${lesson.type})`)
          
          // 查找匹配的新视频地址
          if (VIDEO_URL_MAP[lessonTitle]) {
            chapters[i].lessons[j].videoUrl = VIDEO_URL_MAP[lessonTitle]
            updateCount++
            console.log(`[admin_update_video_urls] ✅ 更新视频: ${lessonTitle}`)
          } else if (lesson.type === 'video') {
            unmatchedLessons.push(lessonTitle)
            console.log(`[admin_update_video_urls] ⚠️ 未找到匹配: "${lessonTitle}"`)
          }
        }
      }
    }
    
    if (unmatchedLessons.length > 0) {
      console.log(`[admin_update_video_urls] 未匹配的视频课程:`, unmatchedLessons)
    }
    
    // 更新数据库
    await db.collection('courses').doc(course._id).update({
      data: {
        chapters: chapters,
        updatedAt: Date.now()
      }
    })
    
    console.log(`[admin_update_video_urls] 共更新 ${updateCount} 个视频地址`)
    
    return {
      success: true,
      code: 'OK',
      data: {
        courseId: courseId,
        updateCount: updateCount
      },
      message: `成功更新 ${updateCount} 个视频地址`
    }
    
  } catch (err) {
    console.error('[admin_update_video_urls] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

