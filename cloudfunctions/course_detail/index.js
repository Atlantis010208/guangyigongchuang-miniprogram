/**
 * 云函数：course_detail
 * 功能：获取课程详情（供小程序端使用）
 * 权限：公开（已发布的课程）
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
      // 如果以 CO 开头，说明是 courseId
      if (queryId.startsWith('CO')) {
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
    
    // 处理图片：如果有 images 字段且包含云存储 fileID，转换为临时链接
    let images = course.images || []
    if (course.cover && images.length === 0) {
      images = [course.cover]
    }
    
    let detailImage = course.detailImage || ''
    
    // 收集所有需要转换的云存储 fileID
    const allUrls = [...images]
    if (detailImage) allUrls.push(detailImage)
    
    const cloudFileIDs = allUrls.filter(url => url && url.startsWith('cloud://'))
    
    if (cloudFileIDs.length > 0) {
      try {
        const tempRes = await cloud.getTempFileURL({ fileList: cloudFileIDs })
        const urlMap = {}
        if (tempRes.fileList) {
          tempRes.fileList.forEach(item => {
            if (item.status === 0 && item.tempFileURL) {
              urlMap[item.fileID] = item.tempFileURL
            }
          })
        }
        // 替换 images 中的 fileID 为临时链接
        images = images.map(url => urlMap[url] || url)
        // 替换 detailImage
        if (detailImage && urlMap[detailImage]) {
          detailImage = urlMap[detailImage]
        }
      } catch (e) {
        console.warn('获取临时链接失败:', e)
      }
    }
    
    // 格式化返回数据，兼容小程序端字段命名
    const formattedCourse = {
      _id: course._id,
      id: course.courseId || course._id,
      courseId: course.courseId,
      name: course.title,
      title: course.title,
      desc: course.description,
      description: course.description,
      price: course.price || 0,
      originalPrice: course.originalPrice,
      images: images,
      cover: images[0] || course.cover || '',
      detailImage: detailImage,
      benefits: course.benefits || [],
      highlights: course.highlights || [],
      targetAudience: course.targetAudience || '',
      instructorId: course.instructorId,
      instructorName: course.instructorName,
      instructorAvatar: course.instructorAvatar,
      duration: course.duration || 0,
      lessonCount: course.lessonCount || 0,
      lessons: (course.lessons || []).map(lesson => ({
        ...lesson,
        // 只返回试看课程的视频链接
        videoUrl: lesson.isFree ? lesson.videoUrl : ''
      })),
      category: course.category,
      level: course.level,
      levelLabel: {
        beginner: '入门',
        intermediate: '进阶',
        advanced: '高级'
      }[course.level] || course.level,
      tags: course.tags || [],
      enrollCount: course.enrollCount || 0,
      rating: course.rating || 0,
      ratingCount: course.ratingCount || 0,
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt
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

