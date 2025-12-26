/**
 * 云函数：admin_designers_update
 * 功能：更新设计师信息
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
      console.log('[admin_designers_update] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const { id, data } = event
    
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少设计师 ID' }
    }
    
    if (!data || Object.keys(data).length === 0) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少更新数据' }
    }
    
    // 检查设计师是否存在
    const designerRes = await db.collection('designers').doc(id).get()
    
    if (!designerRes.data) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '设计师不存在' }
    }
    
    const oldDesigner = designerRes.data
    
    // 找出需要删除的云存储文件
    const filesToDelete = []
    
    // 1. 检查头像是否被替换（新头像且旧头像是 cloud:// 格式）
    if (data.avatar && oldDesigner.avatar && oldDesigner.avatar.startsWith('cloud://')) {
      if (data.avatar !== oldDesigner.avatar) {
        filesToDelete.push(oldDesigner.avatar)
        console.log('[admin_designers_update] 检测到头像更换，将删除旧头像:', oldDesigner.avatar)
      }
    }
    
    // 2. 检查作品图片是否被删除
    if (data.portfolioImages && Array.isArray(data.portfolioImages)) {
      const oldImages = oldDesigner.portfolioImages || []
      const newImages = data.portfolioImages
      
      // 找出被删除的图片（存在于旧数据但不在新数据中）
      const deletedImages = oldImages.filter(oldImg => 
        oldImg.startsWith('cloud://') && !newImages.includes(oldImg)
      )
      
      if (deletedImages.length > 0) {
        filesToDelete.push(...deletedImages)
        console.log('[admin_designers_update] 检测到作品图片删除，共', deletedImages.length, '张')
      }
    }
    
    // 构建更新数据
    const updateData = {
      ...data,
      updatedAt: Date.now()
    }
    
    // 移除不允许更新的字段
    delete updateData._id
    delete updateData.createdAt
    
    // 更新设计师
    await db.collection('designers').doc(id).update({
      data: updateData
    })
    
    // 删除云存储文件（异步，不阻塞主流程）
    if (filesToDelete.length > 0) {
      console.log('[admin_designers_update] 开始删除云存储文件，共', filesToDelete.length, '个')
      try {
        const deleteResult = await cloud.deleteFile({
          fileList: filesToDelete
        })
        console.log('[admin_designers_update] 云存储文件删除结果:', deleteResult)
      } catch (deleteError) {
        // 删除失败不影响主流程，只记录日志
        console.warn('[admin_designers_update] 云存储文件删除失败:', deleteError)
      }
    }
    
    console.log(`[admin_designers_update] Admin: ${authResult.user._id}, Updated designer: ${id}`)
    
    return {
      success: true,
      code: 'OK',
      message: '设计师信息更新成功'
    }
    
  } catch (err) {
    console.error('[admin_designers_update] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
