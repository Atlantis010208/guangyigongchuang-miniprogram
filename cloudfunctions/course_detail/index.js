/**
 * 云函数：course_detail
 * 功能：获取课程详情（供小程序端使用）
 * 权限：公开（已发布的课程）
 * 
 * 安全说明：
 * - 返回章节大纲结构（用于显示目录）
 * - 不返回视频链接（视频链接需调用 course_videos 获取，需购买验证）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { id, courseId } = event
    
    if (!id && !courseId) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少课程ID参数'
      }
    }
    
    // 构建查询条件
    let query = { isDelete: _.neq(1) }
    
    // 判断 id 是 MongoDB ObjectId 格式还是 courseId 格式
    const queryId = id || courseId
    if (queryId) {
      // 如果以 CO 或 c 开头，说明是 courseId
      if (queryId.startsWith('CO') || queryId.startsWith('c')) {
        query.courseId = queryId
      } else if (queryId.length === 32) {
        // 32位字符串，可能是 _id
        query._id = queryId
      } else {
        // 其他情况，同时尝试匹配 _id 和 courseId
        query = {
          isDelete: _.neq(1),
          ..._.or([{ _id: queryId }, { courseId: queryId }])
        }
      }
    }
    
    // 查询课程
    const result = await db.collection('courses')
      .where(query)
      .limit(1)
      .get()
    
    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        code: 'NOT_FOUND',
        errorMessage: '课程不存在或已下架'
      }
    }
    
    const course = result.data[0]
    
    // 检查状态（只返回已发布的课程）
    if (course.status !== 'published') {
      return {
        success: false,
        code: 'NOT_AVAILABLE',
        errorMessage: '该课程暂未发布'
      }
    }
    
    // 辅助函数：从 cover 字段中提取 URL（兼容字符串和对象格式）
    const extractUrl = (value) => {
      if (!value) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'object') {
        // 优先使用 downloadUrl（临时链接），其次使用 fileID
        return value.downloadUrl || value.fileID || ''
      }
      return ''
    }
    
    // 处理图片：如果有 images 字段且包含云存储 fileID，转换为临时链接
    // 注意：images 字段已废弃，仅作为旧数据兼容
    let images = (course.images || []).map(extractUrl).filter(Boolean)
    
    // 处理封面图 - 兼容 cover 是字符串或对象的情况
    // 重要：封面图应单独处理，不要加入 images 或 detailImages 数组
    let coverUrl = extractUrl(course.cover)
    
    // 处理详情图片 - 这是独立于封面的课程详情展示图
    let detailImages = (course.detailImages || []).map(extractUrl).filter(Boolean)
    
    let detailImage = extractUrl(course.detailImage)
    let instructorAvatar = extractUrl(course.instructorAvatar)
    
    // 收集所有需要转换的云存储 fileID
    const allUrls = [...images, ...detailImages]
    if (detailImage) allUrls.push(detailImage)
    if (instructorAvatar) allUrls.push(instructorAvatar)
    if (coverUrl && !images.includes(coverUrl)) allUrls.push(coverUrl)
    
    const cloudFileIDs = allUrls.filter(url => typeof url === 'string' && url.startsWith('cloud://'))
    
    let urlMap = {}
    if (cloudFileIDs.length > 0) {
      try {
        const uniqueFileIDs = [...new Set(cloudFileIDs)]
        const tempRes = await cloud.getTempFileURL({ fileList: uniqueFileIDs })
        if (tempRes.fileList) {
          tempRes.fileList.forEach(item => {
            if (item.status === 0 && item.tempFileURL) {
              urlMap[item.fileID] = item.tempFileURL
            }
          })
        }
        // 替换 images 中的 fileID 为临时链接
        images = images.map(url => urlMap[url] || url)
        // 替换 detailImages 中的 fileID 为临时链接
        detailImages = detailImages.map(url => urlMap[url] || url)
        // 替换 coverUrl
        if (coverUrl && urlMap[coverUrl]) {
          coverUrl = urlMap[coverUrl]
        }
        // 替换 detailImage
        if (detailImage && urlMap[detailImage]) {
          detailImage = urlMap[detailImage]
        }
        // 替换 instructorAvatar
        if (instructorAvatar && urlMap[instructorAvatar]) {
          instructorAvatar = urlMap[instructorAvatar]
        }
      } catch (e) {
        console.warn('获取临时链接失败:', e)
      }
    }
    
    // 处理章节数据：返回大纲结构，但不返回视频链接
    const chapters = (course.chapters || []).map(chapter => ({
      title: chapter.title,
      lessons: (chapter.lessons || []).map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        duration: lesson.duration,
        format: lesson.format,
        size: lesson.size
        // 注意：不返回 videoUrl 和 fileUrl，这些需要通过 course_videos 获取（需购买验证）
      }))
    }))
    
    // 格式化返回数据，兼容小程序端字段命名
    const formattedCourse = {
      _id: course._id,
      id: course.courseId || course._id,
      courseId: course.courseId,
      name: course.title,
      title: course.title,
      subtitle: course.subtitle || course.description?.substring(0, 50) || '',
      desc: course.description,
      description: course.description,
      price: course.price || 0,
      originalPrice: course.originalPrice,
      images: images,
      cover: coverUrl || images[0] || '',
      coverUrl: coverUrl || images[0] || '',
      detailImage: detailImage,
      detailImages: detailImages, // 新增：课程详情图片列表
      benefits: course.benefits || [],
      highlights: course.highlights || [],
      targetAudience: course.targetAudience || '',
      // 讲师信息
      instructor: {
        name: course.instructorName || '',
        title: course.instructorTitle || '资深讲师',
        avatar: instructorAvatar
      },
      instructorId: course.instructorId,
      instructorName: course.instructorName,
      instructorAvatar: instructorAvatar,
      // 课程内容
      chapters: chapters, // 章节大纲（不含视频链接）
      duration: course.duration || 0,
      lessonCount: course.lessonCount || chapters.reduce((sum, ch) => sum + (ch.lessons?.length || 0), 0),
      // 分类和标签
      category: course.category,
      level: course.level,
      levelLabel: {
        beginner: '入门',
        intermediate: '进阶',
        advanced: '高级'
      }[course.level] || course.level,
      tags: course.tags || [],
      // 统计数据
      enrollCount: course.enrollCount || 0,
      salesCount: course.salesCount || 0,
      rating: course.rating || 0,
      ratingCount: course.ratingCount || 0,
      isFeatured: course.isFeatured || false,
      // 状态
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      // 网盘交付信息（用于资料下载）
      driveLink: course.driveLink || '',
      drivePassword: course.drivePassword || '',
      driveContent: course.driveContent || '',
      driveAltContact: course.driveAltContact || '',
      // 国际版网盘链接
      driveLinkIntl: course.driveLinkIntl || '',
      drivePasswordIntl: course.drivePasswordIntl || ''
    }
    
    return {
      success: true,
      code: 'OK',
      data: formattedCourse,
      message: '获取课程详情成功'
    }
    
  } catch (err) {
    console.error('[course_detail] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
