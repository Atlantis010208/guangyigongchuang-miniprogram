/**
 * 云函数：course_videos
 * 功能：获取课程视频数据（需登录且已购买）
 * 权限：需登录 + 已购买课程
 * 
 * 参数：
 * - courseId: 课程 ID（必填）
 * - lessonId: 指定课时 ID（可选，用于播放页初始定位）
 * 
 * 安全策略：
 * - 未登录：返回 UNAUTHORIZED 错误
 * - 未购买：返回 NOT_PURCHASED 错误
 * - 已购买：返回完整章节和视频链接
 * 
 * 性能优化 V2：
 * - 并行查询课程和购买状态
 * - 只获取当前视频的临时链接（延迟加载其他视频）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const startTime = Date.now()
  
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    
    const { courseId, lessonId } = event
    
    // 参数验证
    if (!courseId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少课程ID参数'
      }
    }
    
    // 验证登录状态
    if (!OPENID) {
      return {
        success: false,
        code: 'UNAUTHORIZED',
        errorMessage: '请先登录后再观看课程'
      }
    }
    
    // 【性能优化】并行查询课程数据和购买状态
    const [course, isPurchased] = await Promise.all([
      queryCourse(courseId),
      checkPurchaseStatus(OPENID, courseId)
    ])
    
    console.log('[course_videos] Parallel query took:', Date.now() - startTime, 'ms')
    
    if (!isPurchased) {
      return {
        success: false,
        code: 'NOT_PURCHASED',
        errorMessage: '您尚未购买此课程，请先购买后观看'
      }
    }
    
    if (!course) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: '课程不存在'
      }
    }
    
    // 查询用户的学习进度
    let userProgress = {}
    try {
      const progressRes = await db.collection('course_progress').where({
        userId: OPENID,
        courseId: course.courseId || course._id
      }).limit(1).get()
      
      if (progressRes.data && progressRes.data.length > 0) {
        userProgress = progressRes.data[0].lessonProgress || {}
      }
    } catch (err) {
      console.warn('[course_videos] 查询学习进度失败:', err)
    }
    
    // 处理章节数据，转换云存储链接为临时链接，并附加学习进度
    const chapters = await processChapters(course.chapters || [], lessonId, userProgress)
    
    // 定位当前课时
    let currentLesson = null
    if (lessonId) {
      currentLesson = findLessonById(chapters, lessonId)
    }
    
    // 如果没有指定课时，默认第一个视频
    if (!currentLesson) {
      currentLesson = findFirstVideoLesson(chapters)
    }
    
    return {
      success: true,
      code: 'OK',
      data: {
        courseId: course.courseId || course._id,
        title: course.title,
        isPurchased: true,
        chapters: chapters,
        currentLesson: currentLesson
      },
      message: '获取课程视频数据成功'
    }
    
  } catch (err) {
    console.error('[course_videos] Error:', err)
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
      }).limit(1).get()
      
      if (res.data && res.data.length > 0) {
        return res.data[0]
      }
    }
    
    // 如果没找到，尝试通过 _id 查询
    try {
      const res = await db.collection('courses').doc(courseId).get()
      if (res.data) {
        return res.data
      }
    } catch (e) {
      // doc 查询失败，忽略
    }
    
    return null
  } catch (err) {
    console.error('[course_videos] queryCourse Error:', err)
    return null
  }
}

/**
 * 检查用户是否已购买课程（优化版 + 白名单兜底）
 * @param {string} openid - 用户 OPENID
 * @param {string} courseId - 课程 ID
 * @returns {boolean} 是否已购买
 */
async function checkPurchaseStatus(openid, courseId) {
  try {
    // 1. 先查询订单（优化：只查询必要字段，减少数据传输）
    const ordersRes = await db.collection('orders').where({
      userId: openid,
      category: 'course',
      status: _.in(['paid', 'completed']),
      isDelete: _.neq(1)
    }).field({
      _id: true,
      courseId: true,
      items: true,
      params: true
    }).limit(20).get()  // 限制查询数量
    
    for (const order of ordersRes.data) {
      // 获取订单商品列表
      const items = (order.params && order.params.items) || order.items || []
      
      for (const item of items) {
        const itemCourseId = item.id || item.courseId || item.productId
        if (itemCourseId === courseId) {
          console.log('[course_videos] 通过订单验证购买状态:', order._id)
          return true
        }
      }
      
      // 如果订单本身就是单个课程
      if (items.length === 0 && order.courseId === courseId) {
        console.log('[course_videos] 通过订单验证购买状态(单课程):', order._id)
        return true
      }
    }
    
    // 2. ========== 新增：白名单兜底检查 ==========
    // 如果订单中没有找到，尝试查询白名单（防止账号合并后 openid 不一致）
    try {
      // 先获取用户手机号
      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
      
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        const userPhone = user.purePhoneNumber || (user.phoneNumber ? user.phoneNumber.replace(/^\+86/, '') : null)
        
        if (userPhone) {
          // 查询白名单
          const whitelistRes = await db.collection('course_whitelist').where({
            phone: userPhone,
            courseId: courseId,
            status: 'activated'
          }).limit(1).get()
          
          if (whitelistRes.data && whitelistRes.data.length > 0) {
            console.log('[course_videos] ✅ 通过白名单验证购买状态:', whitelistRes.data[0]._id)
            return true
          }
        }
      }
    } catch (whitelistErr) {
      console.warn('[course_videos] 白名单查询失败:', whitelistErr.message)
    }
    // ==========================================
    
    console.log('[course_videos] ❌ 未找到购买记录（订单和白名单均未找到）')
    return false
  } catch (err) {
    console.error('[course_videos] checkPurchaseStatus Error:', err)
    return false
  }
}

/**
 * 处理章节数据，转换云存储链接为临时链接
 * 【性能优化】优先处理当前课时的视频链接
 * @param {Array} chapters - 原始章节数据
 * @param {string} currentLessonId - 当前课时 ID（可选）
 * @param {Object} userProgress - 用户学习进度映射
 * @returns {Array} 处理后的章节数据
 */
async function processChapters(chapters, currentLessonId, userProgress = {}) {
  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    return []
  }
  
  // 收集所有云存储链接，优先当前课时
  const cloudFileIDs = []
  let currentVideoUrl = null
  
  for (const chapter of chapters) {
    for (const lesson of chapter.lessons || []) {
      // 【新增】支持多分辨率 videoUrls 对象
      if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
        for (const [quality, url] of Object.entries(lesson.videoUrls)) {
          if (url && url.startsWith('cloud://')) {
            // 如果是当前课时，优先记录 1080p 或最高分辨率
            if (currentLessonId && lesson.id === currentLessonId && !currentVideoUrl) {
              currentVideoUrl = url
            }
            cloudFileIDs.push(url)
          }
        }
      }
      // 【兼容】旧格式单一 videoUrl
      else if (lesson.videoUrl && lesson.videoUrl.startsWith('cloud://')) {
        // 如果是当前课时，记录下来优先处理
        if (currentLessonId && lesson.id === currentLessonId) {
          currentVideoUrl = lesson.videoUrl
        }
        cloudFileIDs.push(lesson.videoUrl)
      }
      
      // 处理文件类型课时
      if (lesson.fileUrl && lesson.fileUrl.startsWith('cloud://')) {
        cloudFileIDs.push(lesson.fileUrl)
      }
    }
  }
  
  // 如果没有指定当前课时，默认第一个视频
  if (!currentVideoUrl && cloudFileIDs.length > 0) {
    currentVideoUrl = cloudFileIDs[0]
  }
  
  // 批量获取临时链接
  let urlMap = {}
  const uniqueFileIDs = [...new Set(cloudFileIDs)]
  
  if (uniqueFileIDs.length > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: uniqueFileIDs })
      if (tempRes.fileList) {
        tempRes.fileList.forEach(item => {
          if (item.status === 0 && item.tempFileURL) {
            urlMap[item.fileID] = item.tempFileURL
          }
        })
      }
    } catch (e) {
      console.warn('[course_videos] 获取临时链接失败:', e)
    }
  }
  
  // 深拷贝并替换链接，附加学习进度
  const processedChapters = JSON.parse(JSON.stringify(chapters))
  
  for (const chapter of processedChapters) {
    for (const lesson of chapter.lessons || []) {
      // 【新增】处理多分辨率 videoUrls 对象
      if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
        for (const quality in lesson.videoUrls) {
          const cloudUrl = lesson.videoUrls[quality]
          if (cloudUrl && urlMap[cloudUrl]) {
            lesson.videoUrls[quality] = urlMap[cloudUrl]
            console.log(`[course_videos] 替换 ${lesson.id} 的 ${quality} URL`)
          }
        }
      }
      // 【兼容】处理旧格式单一 videoUrl
      else if (lesson.videoUrl && urlMap[lesson.videoUrl]) {
        lesson.videoUrl = urlMap[lesson.videoUrl]
        console.log(`[course_videos] 替换 ${lesson.id} 的 videoUrl (旧格式)`)
      }
      
      // 处理文件 URL
      if (lesson.fileUrl && urlMap[lesson.fileUrl]) {
        lesson.fileUrl = urlMap[lesson.fileUrl]
      }
      
      // 附加学习进度信息
      const lessonProgressInfo = userProgress[lesson.id] || {}
      lesson.progress = lessonProgressInfo.progress || 0
      lesson.isCompleted = lessonProgressInfo.isCompleted || false
      lesson.lastWatchedAt = lessonProgressInfo.lastWatchedAt || null
    }
  }
  
  console.log(`[course_videos] 处理完成，共 ${processedChapters.length} 个章节`)
  return processedChapters
}

/**
 * 根据 lessonId 查找课时
 * @param {Array} chapters - 章节列表
 * @param {string} lessonId - 课时 ID
 * @returns {Object|null} 课时对象
 */
function findLessonById(chapters, lessonId) {
  for (const chapter of chapters) {
    for (const lesson of chapter.lessons || []) {
      if (lesson.id === lessonId) {
        return lesson
      }
    }
  }
  return null
}

/**
 * 查找第一个视频课时
 * @param {Array} chapters - 章节列表
 * @returns {Object|null} 课时对象
 */
function findFirstVideoLesson(chapters) {
  for (const chapter of chapters) {
    for (const lesson of chapter.lessons || []) {
      if (lesson.type === 'video') {
        return lesson
      }
    }
  }
  return null
}

