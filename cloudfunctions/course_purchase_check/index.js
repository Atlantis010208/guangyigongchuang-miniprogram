/**
 * 云函数：course_purchase_check
 * 功能：检查用户是否已购买课程
 * 权限：公开（未登录返回 isPurchased: false）
 * 
 * 参数：
 * - courseId: 单个课程 ID
 * - courseIds: 批量检查多个课程（数组，优先于 courseId）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid
    
    // 🔍 调试日志：记录完整的上下文信息
    console.log('[course_purchase_check] ========== 开始检查 ==========')
    console.log('[course_purchase_check] OPENID:', OPENID)
    console.log('[course_purchase_check] wxContext:', JSON.stringify(wxContext))
    console.log('[course_purchase_check] 请求参数:', JSON.stringify(event))
    
    const { courseId, courseIds } = event
    
    // 参数验证
    if (!courseId && (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0)) {
      console.log('[course_purchase_check] ❌ 参数验证失败')
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '缺少课程ID参数'
      }
    }
    
    // 确定要检查的课程 ID 列表
    const idsToCheck = courseIds || [courseId]
    
    // ⚠️ 重要：即使有 OPENID，也要验证用户是否真正登录
    // traceUser: true 会为每个用户创建临时 OPENID，但这不代表用户已登录
    if (!OPENID) {
      console.log('[course_purchase_check] ⚠️ 用户未登录（无OPENID），返回未购买状态')
      if (courseIds) {
        const result = {}
        for (const id of idsToCheck) {
          result[id] = { isPurchased: false }
        }
        console.log('[course_purchase_check] 返回结果（批量）:', JSON.stringify({ success: true, code: 'OK', data: result }))
        return { success: true, code: 'OK', data: result }
      } else {
        console.log('[course_purchase_check] 返回结果（单个）:', JSON.stringify({ success: true, code: 'OK', data: { isPurchased: false } }))
        return { success: true, code: 'OK', data: { isPurchased: false } }
      }
    }
    
    console.log('[course_purchase_check] OPENID 存在:', OPENID)
    
    // ⚠️ 新增：验证用户是否真正登录（检查 users 集合中是否有记录）
    try {
      const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
      
      // 如果数据库中没有用户记录，说明只是临时 OPENID，不是真正登录
      if (!userRes.data || userRes.data.length === 0) {
        console.log('[course_purchase_check] ⚠️ 用户未真正登录（数据库无记录），返回未购买状态')
        if (courseIds) {
          const result = {}
          for (const id of idsToCheck) {
            result[id] = { isPurchased: false }
          }
          return { success: true, code: 'OK', data: result }
        } else {
          return { success: true, code: 'OK', data: { isPurchased: false } }
        }
      }
      
      console.log('[course_purchase_check] ✅ 用户已真正登录，用户ID:', userRes.data[0]._id)
    } catch (userCheckErr) {
      console.error('[course_purchase_check] 验证用户登录状态失败:', userCheckErr)
      // 验证失败时，保守处理，返回未购买
      if (courseIds) {
        const result = {}
        for (const id of idsToCheck) {
          result[id] = { isPurchased: false }
        }
        return { success: true, code: 'OK', data: result }
      } else {
        return { success: true, code: 'OK', data: { isPurchased: false } }
      }
    }
    
    // 先获取用户信息，用于白名单检查
    let userPhone = null
    try {
      const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        // 优先使用纯手机号，如果没有则从完整手机号中移除国家码
        userPhone = user.purePhoneNumber || (user.phoneNumber ? user.phoneNumber.replace(/^\+86/, '') : null)
      }
    } catch (err) {
      console.warn('[course_purchase_check] 获取用户信息失败:', err.message)
    }
    
    // 并行查询用户已支付的课程订单、学习进度和白名单
    const queries = [
      db.collection('orders').where({
        userId: OPENID,
        category: 'course',
        status: _.in(['paid', 'completed']),
        isDelete: _.neq(1)
      }).get(),
      db.collection('course_progress').where({
        userId: OPENID
      }).get()
    ]
    
    // 如果用户有手机号，也查询白名单（作为兜底检查）
    if (userPhone) {
      queries.push(
        db.collection('course_whitelist').where({
          phone: userPhone,
          status: 'activated'
        }).get()
      )
    }
    
    const [ordersRes, progressRes, whitelistRes] = await Promise.all(queries)
    
    // 构建学习进度映射表
    const progressMap = {}
    for (const progressRecord of progressRes.data) {
      progressMap[progressRecord.courseId] = {
        progress: progressRecord.progress || 0,
        completedLessons: progressRecord.completedLessons || [],
        totalLessons: progressRecord.totalLessons || 0,
        lastLessonId: progressRecord.lastLessonId,
        updatedAt: progressRecord.updatedAt
      }
    }
    
    // 构建已购买课程的映射表
    const purchasedMap = {}
    
    for (const order of ordersRes.data) {
      // 获取订单商品列表（兼容不同数据结构）
      const items = (order.params && order.params.items) || order.items || []
      
      for (const item of items) {
        // 获取课程 ID（兼容不同字段名）
        const itemCourseId = item.id || item.courseId || item.productId
        
        // 验证是课程类商品
        if (item.category === 'course' || item.type === 'course' || order.category === 'course') {
          if (itemCourseId) {
            purchasedMap[itemCourseId] = {
              isPurchased: true,
              purchasedAt: order.paidAt || order.createdAt,
              orderId: order.orderNo || order._id,
              // 附加学习进度信息
              ...(progressMap[itemCourseId] || { progress: 0 })
            }
          }
        }
      }
      
      // 如果订单本身就是单个课程（没有 items）
      if (items.length === 0 && order.courseId) {
        purchasedMap[order.courseId] = {
          isPurchased: true,
          purchasedAt: order.paidAt || order.createdAt,
          orderId: order.orderNo || order._id,
          // 附加学习进度信息
          ...(progressMap[order.courseId] || { progress: 0 })
        }
      }
    }
    
    // ========== 新增：白名单兜底检查 ==========
    // 如果用户在白名单中且状态为已激活，但订单可能创建失败了
    // 这里作为兜底，直接把白名单中的课程也标记为已购买
    if (whitelistRes && whitelistRes.data && whitelistRes.data.length > 0) {
      console.log('[course_purchase_check] 发现已激活的白名单记录:', whitelistRes.data.length, '条')
      
      for (const whitelist of whitelistRes.data) {
        const whitelistCourseId = whitelist.courseId
        
        // 如果这个课程还没在 purchasedMap 中（订单可能创建失败）
        if (whitelistCourseId && !purchasedMap[whitelistCourseId]) {
          console.log('[course_purchase_check] 白名单兜底激活课程:', whitelistCourseId)
          purchasedMap[whitelistCourseId] = {
            isPurchased: true,
            purchasedAt: whitelist.activatedAt || whitelist.createdAt,
            orderId: whitelist.orderId || null,
            source: 'whitelist', // 标记来源为白名单
            whitelistId: whitelist._id,
            // 附加学习进度信息
            ...(progressMap[whitelistCourseId] || { progress: 0 })
          }
        }
      }
    }
    // ========================================
    
    // 辅助函数：检查某个课程 ID 是否已购买
    // 需要兼容多种 ID 格式（course01、c001、CO_DEFAULT_001、_id 等）
    const checkPurchased = (targetId) => {
      // 直接匹配
      if (purchasedMap[targetId]) {
        return purchasedMap[targetId]
      }
      
      // ⚠️ 移除了危险的模糊匹配逻辑，确保权限验证的严格性
      // 如果没有直接匹配，说明用户未购买该课程
      
      console.log('[course_purchase_check] 未找到购买记录:', targetId, '已购买课程:', Object.keys(purchasedMap))
      
      // 未购买的课程，返回未购买状态
      // 但仍然返回学习进度（如果有的话，可能是试看记录）
      if (progressMap[targetId]) {
        return {
          isPurchased: false,
          ...progressMap[targetId]
        }
      }
      
      return { isPurchased: false, progress: 0 }
    }
    
    // 返回结果
    if (courseIds) {
      // 批量检查
      const result = {}
      for (const id of idsToCheck) {
        result[id] = checkPurchased(id)
      }
      console.log('[course_purchase_check] 最终返回结果（批量）:', JSON.stringify(result))
      return {
        success: true,
        code: 'OK',
        data: result,
        message: '批量检查购买状态成功'
      }
    } else {
      // 单个检查
      const finalResult = checkPurchased(courseId)
      console.log('[course_purchase_check] 最终返回结果（单个）:', JSON.stringify(finalResult))
      console.log('[course_purchase_check] ========== 检查完成 ==========')
      return {
        success: true,
        code: 'OK',
        data: finalResult,
        message: '检查购买状态成功'
      }
    }
    
  } catch (err) {
    console.error('[course_purchase_check] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}

