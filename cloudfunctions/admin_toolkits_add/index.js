/**
 * 云函数：admin_toolkits_add
 * 功能：新增工具包
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
      console.log('[admin_toolkits_add] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { data } = event
    
    if (!data) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少工具包数据' }
    }
    
    // 验证必填字段
    if (!data.title) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '工具包标题为必填项' }
    }
    
    if (!data.category) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '工具包分类为必填项' }
    }
    
    // 生成唯一 toolkitId
    const toolkitId = `TK${Date.now()}`
    
    // 构建工具包数据
    const toolkitData = {
      toolkitId,
      title: data.title,
      description: data.description || '',
      price: data.price || 0,
      originalPrice: data.originalPrice || null,
      cover: data.cover || '',
      category: data.category,
      tags: data.tags || [],
      favoriteCount: 0,
      salesCount: 0,  // 销量
      rating: 0,
      ratingCount: 0,
      status: data.status || 'inactive',
      isDelete: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      // ========== 网盘交付配置 ==========
      
      /** 网盘链接（购买后可见） */
      driveLink: data.driveLink || '',
      
      /** 网盘提取码 */
      drivePassword: data.drivePassword || '',
      
      /** 发货内容描述（如：【超级会员V4】通过百度网盘分享的文件：工具包-¥69｜...） */
      driveContent: data.driveContent || '',
      
      /** 备用联系/说明（如：需要"夸克网盘"或"其他方式"下载，加vx：ceokpi） */
      driveAltContact: data.driveAltContact || '',
      
      // ========== 小程序详情页扩展字段 ==========
      
      /** 轮播图列表 */
      images: data.images || [],
      
      /** 工具包内容列表 */
      contentList: data.contentList || [],
      
      /** 产品参数列表 */
      params: data.params || [],
      
      /** 规格选择组 */
      variantGroups: data.variantGroups || [],
      
      /** 适用人群配置 */
      targetGroups: data.targetGroups || []
    }
    
    // 添加工具包
    const result = await db.collection('toolkits').add({
      data: toolkitData
    })
    
    console.log(`[admin_toolkits_add] Admin: ${authResult.user._id}, Added toolkit: ${result._id}`)
    
    return {
      success: true,
      code: 'OK',
      data: {
        _id: result._id,
        ...toolkitData
      },
      message: '工具包添加成功'
    }
    
  } catch (err) {
    console.error('[admin_toolkits_add] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

