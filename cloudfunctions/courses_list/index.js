/**
 * 云函数：courses_list
 * 功能：获取课程列表（供小程序端使用）
 * 权限：公开（无需登录即可调用）
 * 
 * 参数：
 * - limit: 返回数量，默认 20，最大 100
 * - offset: 偏移量，默认 0
 * - category: 按分类筛选
 * - level: 按难度筛选（beginner/intermediate/advanced）
 * - keyword: 关键词搜索（标题模糊匹配）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const {
      limit = 20,
      offset = 0,
      category,
      level,
      keyword
    } = event
    
    // 构建查询条件（仅返回已发布课程）
    let query = {
      status: 'published',
      isDelete: _.neq(1)
    }
    
    // 分类筛选
    if (category) {
      query.category = category
    }
    
    // 难度筛选
    if (level) {
      query.level = level
    }
    
    // 关键词搜索
    if (keyword) {
      query.title = db.RegExp({ regexp: keyword, options: 'i' })
    }
    
    // 获取总数
    const countRes = await db.collection('courses').where(query).count()
    const total = countRes.total
    
    // 获取数据（不返回敏感字段）
    const dataRes = await db.collection('courses')
      .where(query)
      .field({
        // 排除敏感字段
        chapters: false,
        driveLink: false,
        drivePassword: false,
        driveContent: false,
        driveAltContact: false
      })
      .orderBy('isFeatured', 'desc')  // 推荐课程优先
      .orderBy('createdAt', 'desc')   // 按创建时间倒序
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    const courses = dataRes.data
    
    // 收集所有需要转换的云存储图片
    const cloudFileIDs = []
    for (const course of courses) {
      // 封面图 - 兼容 cover 是字符串或对象的情况
      let coverUrl = course.cover
      if (coverUrl && typeof coverUrl === 'object') {
        // 如果 cover 是对象，取 fileID 字段
        coverUrl = coverUrl.fileID || coverUrl.downloadUrl || ''
      }
      if (coverUrl && typeof coverUrl === 'string' && coverUrl.startsWith('cloud://')) {
        cloudFileIDs.push(coverUrl)
      }
      // 轮播图
      if (course.images && Array.isArray(course.images)) {
        for (const img of course.images) {
          if (img && img.startsWith('cloud://')) {
            cloudFileIDs.push(img)
          }
        }
      }
      // 讲师头像
      if (course.instructorAvatar && course.instructorAvatar.startsWith('cloud://')) {
        cloudFileIDs.push(course.instructorAvatar)
      }
    }
    
    // 批量获取临时链接
    let urlMap = {}
    if (cloudFileIDs.length > 0) {
      try {
        const tempRes = await cloud.getTempFileURL({ fileList: [...new Set(cloudFileIDs)] })
        if (tempRes.fileList) {
          tempRes.fileList.forEach(item => {
            if (item.status === 0 && item.tempFileURL) {
              urlMap[item.fileID] = item.tempFileURL
            }
          })
        }
      } catch (e) {
        console.warn('[courses_list] 获取临时链接失败:', e)
      }
    }
    
    // 格式化返回数据（兼容前端 Mock 数据字段命名）
    const formattedCourses = courses.map(course => {
      // 处理封面图 - 优先使用 cover 字段
      // 重要：不要用 images 覆盖 cover，因为 images 现在存储的是详情图而非封面
      let coverUrl = course.cover || ''
      if (coverUrl && typeof coverUrl === 'object') {
        // 如果 cover 是对象，优先使用 downloadUrl（已是临时链接），其次使用 fileID
        coverUrl = coverUrl.downloadUrl || coverUrl.fileID || ''
      }
      // 只有当 cover 为空时，才回退到 images[0]（兼容旧数据）
      if (!coverUrl && course.images && course.images.length > 0) {
        coverUrl = course.images[0]
      }
      // 如果 coverUrl 在 urlMap 中有临时链接，使用临时链接
      if (urlMap[coverUrl]) {
        coverUrl = urlMap[coverUrl]
      }
      
      // 处理讲师头像
      let instructorAvatar = course.instructorAvatar || ''
      if (urlMap[instructorAvatar]) {
        instructorAvatar = urlMap[instructorAvatar]
      }
      
      return {
        // 双字段兼容
        id: course.courseId || course._id,
        courseId: course.courseId,
        _id: course._id,
        
        // 基础信息
        title: course.title,
        subtitle: course.subtitle || course.description?.substring(0, 50) || '',
        description: course.description,
        
        // 图片（兼容 coverUrl 字段名）
        coverUrl: coverUrl,
        cover: coverUrl,
        
        // 价格
        price: course.price || 0,
        originalPrice: course.originalPrice,
        
        // 标签和分类
        tags: course.tags || [],
        category: course.category,
        level: course.level,
        levelLabel: {
          beginner: '入门',
          intermediate: '进阶',
          advanced: '高级'
        }[course.level] || course.level,
        
        // 讲师信息（格式化为对象，兼容前端）
        instructor: {
          name: course.instructorName || '',
          title: course.instructorTitle || '资深讲师',
          avatar: instructorAvatar
        },
        instructorName: course.instructorName,
        
        // 统计数据
        salesCount: course.salesCount || 0,
        rating: course.rating || 0,
        ratingCount: course.ratingCount || 0,
        
        // 推荐标识
        isFeatured: course.isFeatured || false,
        
        // 时间
        createdAt: course.createdAt,
        updatedAt: course.updatedAt
      }
    })
    
    return {
      success: true,
      code: 'OK',
      data: formattedCourses,
      total: total,
      pagination: {
        limit: Math.min(limit, 100),
        offset: offset,
        hasMore: offset + courses.length < total
      },
      message: '获取课程列表成功'
    }
    
  } catch (err) {
    console.error('[courses_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

