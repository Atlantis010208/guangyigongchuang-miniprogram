/**
 * 云函数：course_videos
 * 功能：获取课程视频数据（需登录且已购买）
 * 权限：需登录 + 已购买课程
 * 
 * 参数：
 * - courseId: 课程 ID（必填）
 * - lessonId: 指定课时 ID（可选，用于播放页初始定位）
 * - lazyLoad: 是否延迟加载（可选，默认 true）
 *            - true: 只获取当前课时的视频链接，节省流量
 *            - false: 获取所有课时的视频链接（兼容旧版）
 * - getLessonUrl: 单独获取某个课时的视频链接（可选）
 * 
 * 安全策略：
 * - 未登录：返回 UNAUTHORIZED 错误
 * - 未购买：返回 NOT_PURCHASED 错误
 * - 已购买：返回完整章节和视频链接
 * 
 * 性能优化 V3（流量优化版）：
 * - 并行查询课程和购买状态
 * - 【重要】延迟加载：默认只获取当前课时的视频临时链接
 * - 其他课时的视频链接在用户切换时按需获取
 * - 支持单独获取某个课时的视频链接（getLessonUrl 模式）
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
    
    const { 
      courseId, 
      lessonId, 
      lazyLoad = true,           // 默认开启延迟加载
      getLessonUrl = false       // 是否仅获取单个课时的视频链接
    } = event
    
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
    
    // ========== 模式1：单独获取某个课时的视频链接（流量优化核心） ==========
    if (getLessonUrl && lessonId) {
      console.log('[course_videos] 延迟加载模式：获取课时', lessonId, '的视频链接')
      
      // 先验证购买状态
      const isPurchased = await checkPurchaseStatus(OPENID, courseId)
      if (!isPurchased) {
        return {
          success: false,
          code: 'NOT_PURCHASED',
          errorMessage: '您尚未购买此课程'
        }
      }
      
      // 查询课程获取课时信息
      const course = await queryCourse(courseId)
      if (!course) {
        return {
          success: false,
          code: 'NOT_FOUND',
          errorMessage: '课程不存在'
        }
      }
      
      // 查找指定课时
      const lesson = findLessonByIdFromCourse(course.chapters || [], lessonId)
      if (!lesson) {
        return {
          success: false,
          code: 'LESSON_NOT_FOUND',
          errorMessage: '课时不存在'
        }
      }
      
      // 只获取这一个课时的视频链接
      const processedLesson = await processingleLesson(lesson)
      
      console.log('[course_videos] 单课时加载耗时:', Date.now() - startTime, 'ms')
      
      return {
        success: true,
        code: 'OK',
        data: {
          lesson: processedLesson
        },
        message: '获取课时视频链接成功'
      }
    }
    
    // ========== 模式2：获取完整课程数据（首次加载） ==========
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
    
    // 处理章节数据
    // lazyLoad = true 时：只获取当前课时的视频链接，其他课时不获取（节省流量）
    // lazyLoad = false 时：获取所有课时的视频链接（兼容旧版）
    const chapters = await processChapters(course.chapters || [], lessonId, userProgress, lazyLoad)
    
    // 定位当前课时
    let currentLesson = null
    if (lessonId) {
      currentLesson = findLessonById(chapters, lessonId)
    }
    
    // 如果没有指定课时，默认第一个视频
    if (!currentLesson) {
      currentLesson = findFirstVideoLesson(chapters)
    }
    
    // 获取课程封面作为视频 poster
    let courseCoverUrl = course.cover || ''
    if (courseCoverUrl && typeof courseCoverUrl === 'object') {
      courseCoverUrl = courseCoverUrl.downloadUrl || courseCoverUrl.fileID || ''
    }
    if (courseCoverUrl && courseCoverUrl.startsWith('cloud://')) {
      try {
        const tempRes = await cloud.getTempFileURL({ fileList: [courseCoverUrl] })
        if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
          courseCoverUrl = tempRes.fileList[0].tempFileURL
        }
      } catch (e) {
        console.warn('[course_videos] 获取封面临时链接失败:', e)
      }
    }
    
    return {
      success: true,
      code: 'OK',
      data: {
        courseId: course.courseId || course._id,
        title: course.title,
        coverUrl: courseCoverUrl,   // 新增：课程封面URL，用作视频 poster
        isPurchased: true,
        chapters: chapters,
        currentLesson: currentLesson,
        lazyLoadEnabled: lazyLoad   // 告知前端是否启用了延迟加载
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
 * 处理单个课时的视频链接（用于延迟加载）
 * @param {Object} lesson - 原始课时数据
 * @returns {Object} 处理后的课时数据（包含临时视频链接）
 */
async function processingleLesson(lesson) {
  if (!lesson) return null
  
  const processedLesson = JSON.parse(JSON.stringify(lesson))
  const cloudFileIDs = []
  
  // 收集需要转换的云存储链接
  if (processedLesson.videoUrls && typeof processedLesson.videoUrls === 'object') {
    for (const [quality, url] of Object.entries(processedLesson.videoUrls)) {
      if (url && url.startsWith('cloud://')) {
        cloudFileIDs.push(url)
      }
    }
  } else if (processedLesson.videoUrl && processedLesson.videoUrl.startsWith('cloud://')) {
    cloudFileIDs.push(processedLesson.videoUrl)
  }
  
  // 获取临时链接
  if (cloudFileIDs.length > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: [...new Set(cloudFileIDs)] })
      const urlMap = {}
      if (tempRes.fileList) {
        tempRes.fileList.forEach(item => {
          if (item.status === 0 && item.tempFileURL) {
            urlMap[item.fileID] = item.tempFileURL
          }
        })
      }
      
      // 替换链接
      if (processedLesson.videoUrls && typeof processedLesson.videoUrls === 'object') {
        for (const quality in processedLesson.videoUrls) {
          const cloudUrl = processedLesson.videoUrls[quality]
          if (cloudUrl && urlMap[cloudUrl]) {
            processedLesson.videoUrls[quality] = urlMap[cloudUrl]
          }
        }
      } else if (processedLesson.videoUrl && urlMap[processedLesson.videoUrl]) {
        processedLesson.videoUrl = urlMap[processedLesson.videoUrl]
      }
    } catch (e) {
      console.warn('[course_videos] 单课时获取临时链接失败:', e)
    }
  }
  
  return processedLesson
}

/**
 * 从原始章节数据中查找课时（不含临时链接转换）
 * @param {Array} chapters - 原始章节数据
 * @param {string} lessonId - 课时 ID
 * @returns {Object|null} 原始课时数据
 */
function findLessonByIdFromCourse(chapters, lessonId) {
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
 * 处理章节数据，转换云存储链接为临时链接
 * 【流量优化 V3】支持延迟加载模式
 * @param {Array} chapters - 原始章节数据
 * @param {string} currentLessonId - 当前课时 ID（可选）
 * @param {Object} userProgress - 用户学习进度映射
 * @param {boolean} lazyLoad - 是否延迟加载（true: 只获取当前课时链接）
 * @returns {Array} 处理后的章节数据
 */
async function processChapters(chapters, currentLessonId, userProgress = {}, lazyLoad = true) {
  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    return []
  }
  
  // 收集需要转换的云存储链接
  const cloudFileIDs = []
  let currentLessonFileIDs = []  // 当前课时的视频链接
  
  for (const chapter of chapters) {
    for (const lesson of chapter.lessons || []) {
      const isCurrentLesson = currentLessonId && lesson.id === currentLessonId
      
      // 【新增】支持多分辨率 videoUrls 对象
      if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
        for (const [quality, url] of Object.entries(lesson.videoUrls)) {
          if (url && url.startsWith('cloud://')) {
            if (lazyLoad) {
              // 延迟加载模式：只收集当前课时的视频链接
              if (isCurrentLesson) {
                currentLessonFileIDs.push(url)
              }
            } else {
              // 全量加载模式：收集所有视频链接
              cloudFileIDs.push(url)
            }
          }
        }
      }
      // 【兼容】旧格式单一 videoUrl
      else if (lesson.videoUrl && lesson.videoUrl.startsWith('cloud://')) {
        if (lazyLoad) {
          if (isCurrentLesson) {
            currentLessonFileIDs.push(lesson.videoUrl)
          }
        } else {
          cloudFileIDs.push(lesson.videoUrl)
        }
      }
      
      // 文件类型课时：始终获取链接（文件通常较小）
      if (lesson.fileUrl && lesson.fileUrl.startsWith('cloud://')) {
        cloudFileIDs.push(lesson.fileUrl)
      }
    }
  }
  
  // 如果延迟加载模式，把当前课时的链接加入待处理列表
  if (lazyLoad && currentLessonFileIDs.length > 0) {
    cloudFileIDs.push(...currentLessonFileIDs)
  }
  
  // 如果没有指定当前课时且是延迟加载模式，获取第一个视频的链接
  if (lazyLoad && currentLessonFileIDs.length === 0 && !currentLessonId) {
    // 找到第一个视频课时
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons || []) {
        if (lesson.type === 'video') {
          if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
            for (const url of Object.values(lesson.videoUrls)) {
              if (url && url.startsWith('cloud://')) {
                cloudFileIDs.push(url)
              }
            }
          } else if (lesson.videoUrl && lesson.videoUrl.startsWith('cloud://')) {
            cloudFileIDs.push(lesson.videoUrl)
          }
          break
        }
      }
      if (cloudFileIDs.length > 0) break
    }
  }
  
  // 批量获取临时链接
  let urlMap = {}
  const uniqueFileIDs = [...new Set(cloudFileIDs)]
  
  if (uniqueFileIDs.length > 0) {
    try {
      console.log(`[course_videos] 获取 ${uniqueFileIDs.length} 个文件的临时链接 (lazyLoad=${lazyLoad})`)
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
      const isCurrentLesson = currentLessonId && lesson.id === currentLessonId
      const isFirstLesson = !currentLessonId && lesson === processedChapters[0]?.lessons?.[0]
      
      // 【新增】处理多分辨率 videoUrls 对象
      if (lesson.videoUrls && typeof lesson.videoUrls === 'object') {
        for (const quality in lesson.videoUrls) {
          const cloudUrl = lesson.videoUrls[quality]
          if (cloudUrl && urlMap[cloudUrl]) {
            lesson.videoUrls[quality] = urlMap[cloudUrl]
            console.log(`[course_videos] 替换 ${lesson.id} 的 ${quality} URL`)
          } else if (lazyLoad && !isCurrentLesson && !isFirstLesson) {
            // 延迟加载模式：非当前课时保留原始 cloud:// 链接（标记为待加载）
            lesson._needsLazyLoad = true
          }
        }
      }
      // 【兼容】处理旧格式单一 videoUrl
      else if (lesson.videoUrl) {
        if (urlMap[lesson.videoUrl]) {
          lesson.videoUrl = urlMap[lesson.videoUrl]
          console.log(`[course_videos] 替换 ${lesson.id} 的 videoUrl`)
        } else if (lazyLoad && !isCurrentLesson && !isFirstLesson) {
          lesson._needsLazyLoad = true
        }
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
  
  console.log(`[course_videos] 处理完成，共 ${processedChapters.length} 个章节，延迟加载=${lazyLoad}`)
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

