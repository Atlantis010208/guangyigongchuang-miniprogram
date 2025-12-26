/**
 * 云函数：admin_courses_add
 * 功能：新增课程
 * 权限：仅管理员（roles=0）
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证（支持小程序和 Web 端）
    const authResult = await requireAdmin(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_courses_add] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { data } = event
    
    if (!data) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少课程数据' }
    }
    
    // 验证必填字段
    if (!data.title) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '课程标题为必填项' }
    }
    
    // 生成唯一 courseId
    const courseId = `CO${Date.now()}`
    
    // 构建课程数据（通过网盘链接交付，不需要章节管理）
    const courseData = {
      courseId,
      title: data.title,
      description: data.description || '',
      cover: data.cover || '',
      instructorId: data.instructorId || '',
      instructorName: data.instructorName || '',
      instructorAvatar: data.instructorAvatar || '',
      price: data.price || 0,
      originalPrice: data.originalPrice || null,
      category: data.category || '',
      level: data.level || 'beginner',
      tags: data.tags || [],
      salesCount: 0,  // 销量
      rating: 0,
      ratingCount: 0,
      status: data.status || 'draft',
      isDelete: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      // ========== 网盘交付配置 ==========
      
      /** 网盘链接（购买后可见） */
      driveLink: data.driveLink || '',
      
      /** 网盘提取码 */
      drivePassword: data.drivePassword || '',
      
      /** 发货内容描述（如：【超级会员V4】通过百度网盘分享的文件：灯光设计课程｜...） */
      driveContent: data.driveContent || '',
      
      /** 备用联系/说明（如：需要"夸克网盘"或"其他方式"下载，加vx：ceokpi） */
      driveAltContact: data.driveAltContact || '',
      
      // ========== 小程序详情页扩展字段 ==========
      
      /** 轮播图列表 */
      images: data.images || [],
      
      /** 详情大图 */
      detailImage: data.detailImage || '',
      
      /** 你将获得（收益列表） */
      benefits: data.benefits || [],
      
      /** 课程亮点/特色 */
      highlights: data.highlights || [],
      
      /** 适用人群描述 */
      targetAudience: data.targetAudience || ''
    }
    
    // 添加课程
    const result = await db.collection('courses').add({
      data: courseData
    })
    
    console.log(`[admin_courses_add] Admin: ${authResult.user._id}, Added course: ${result._id}`)
    
    return {
      success: true,
      code: 'OK',
      data: {
        _id: result._id,
        ...courseData
      },
      message: '课程添加成功'
    }
    
  } catch (err) {
    console.error('[admin_courses_add] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
