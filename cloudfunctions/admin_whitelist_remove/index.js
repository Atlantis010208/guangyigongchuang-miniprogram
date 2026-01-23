/**
 * 云函数：admin_whitelist_remove
 * 功能：移除课程白名单记录，同时删除关联的订单记录
 * 权限：仅管理员
 * 
 * 入参：
 *   - whitelistId: 白名单记录 _id（单个删除）
 *   - whitelistIds: 白名单记录 _id 数组（批量删除）
 *   - phone: 手机号（通过手机号删除）
 * 
 * 出参：
 *   - success: boolean
 *   - code: 状态码
 *   - data: { deletedWhitelist, deletedOrders, details }
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const db = cloud.database()
  const _ = db.command
  
  try {
    // 1. 验证管理员权限
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const adminUser = authResult.user
    console.log('[admin_whitelist_remove] 管理员:', adminUser.username || adminUser._id)
    
    const { whitelistId, whitelistIds, phone } = event
    
    // 参数验证
    if (!whitelistId && (!whitelistIds || !Array.isArray(whitelistIds) || whitelistIds.length === 0) && !phone) {
      return {
        success: false,
        code: 'INVALID_PARAMS',
        errorMessage: '请提供白名单ID或手机号'
      }
    }
    
    // 统计结果
    let deletedWhitelist = 0
    let deletedOrders = 0
    const details = []
    
    // 确定要删除的白名单 ID 列表
    let idsToDelete = []
    
    if (whitelistIds && whitelistIds.length > 0) {
      idsToDelete = whitelistIds
    } else if (whitelistId) {
      idsToDelete = [whitelistId]
    } else if (phone) {
      // 通过手机号查询白名单记录
      const whitelistRes = await db.collection('course_whitelist')
        .where({ phone })
        .get()
      
      if (whitelistRes.data && whitelistRes.data.length > 0) {
        idsToDelete = whitelistRes.data.map(item => item._id)
        console.log('[admin_whitelist_remove] 通过手机号找到白名单记录:', idsToDelete.length, '条')
      } else {
        return {
          success: false,
          code: 'NOT_FOUND',
          errorMessage: '未找到该手机号的白名单记录'
        }
      }
    }
    
    console.log('[admin_whitelist_remove] 待删除白名单数量:', idsToDelete.length)
    
    // 2. 逐个处理白名单记录
    for (const id of idsToDelete) {
      const detail = {
        whitelistId: id,
        whitelistDeleted: false,
        ordersDeleted: 0,
        phone: null,
        courseId: null,
        error: null
      }
      
      try {
        // 2.1 获取白名单记录详情
        const whitelistDoc = await db.collection('course_whitelist').doc(id).get()
        
        if (!whitelistDoc.data) {
          detail.error = '白名单记录不存在'
          details.push(detail)
          continue
        }
        
        const whitelist = whitelistDoc.data
        detail.phone = whitelist.phone
        detail.courseId = whitelist.courseId
        
        console.log('[admin_whitelist_remove] 处理白名单:', {
          id,
          phone: whitelist.phone,
          courseId: whitelist.courseId,
          status: whitelist.status,
          orderId: whitelist.orderId,
          orderNo: whitelist.orderNo
        })
        
        // 2.2 删除关联的订单记录
        // 方式1: 通过 whitelistId 查找
        // 方式2: 通过 source='whitelist' + phone 查找
        // 方式3: 通过白名单记录中的 orderId/orderNo 查找
        
        const orderConditions = []
        
        // 条件1: whitelistId 匹配
        orderConditions.push({ whitelistId: id })
        
        // 条件2: source + phone 匹配（需要查找 params.items 或 whitelistPhone）
        if (whitelist.phone) {
          orderConditions.push({
            source: 'whitelist',
            whitelistPhone: whitelist.phone
          })
        }
        
        // 条件3: 通过订单号匹配
        if (whitelist.orderNo) {
          orderConditions.push({ orderNo: whitelist.orderNo })
        }
        
        // 条件4: 通过订单 _id 匹配
        if (whitelist.orderId) {
          orderConditions.push({ _id: whitelist.orderId })
        }
        
        // 执行订单删除（使用 $or 条件）
        if (orderConditions.length > 0) {
          const ordersRes = await db.collection('orders')
            .where(_.or(orderConditions))
            .get()
          
          if (ordersRes.data && ordersRes.data.length > 0) {
            console.log('[admin_whitelist_remove] 找到关联订单:', ordersRes.data.length, '条')
            
            // 逐个删除订单
            for (const order of ordersRes.data) {
              try {
                await db.collection('orders').doc(order._id).remove()
                detail.ordersDeleted++
                deletedOrders++
                console.log('[admin_whitelist_remove] 删除订单成功:', order._id, order.orderNo)
              } catch (orderErr) {
                console.error('[admin_whitelist_remove] 删除订单失败:', order._id, orderErr.message)
              }
            }
          } else {
            console.log('[admin_whitelist_remove] 未找到关联订单')
          }
        }
        
        // 2.3 删除学习进度记录（可选，根据需要决定是否保留）
        // 这里我们也删除学习进度，确保用户无法继续学习
        if (whitelist.activatedUserId && whitelist.courseId) {
          try {
            const progressRes = await db.collection('course_progress')
              .where({
                userId: whitelist.activatedUserId,
                courseId: whitelist.courseId
              })
              .remove()
            
            if (progressRes.stats && progressRes.stats.removed > 0) {
              console.log('[admin_whitelist_remove] 删除学习进度:', progressRes.stats.removed, '条')
            }
          } catch (progressErr) {
            console.warn('[admin_whitelist_remove] 删除学习进度失败:', progressErr.message)
          }
        }
        
        // 2.4 删除白名单记录
        await db.collection('course_whitelist').doc(id).remove()
        detail.whitelistDeleted = true
        deletedWhitelist++
        console.log('[admin_whitelist_remove] 删除白名单成功:', id)
        
      } catch (itemErr) {
        console.error('[admin_whitelist_remove] 处理记录失败:', id, itemErr.message)
        detail.error = itemErr.message
      }
      
      details.push(detail)
    }
    
    // 3. 返回结果
    const message = `成功删除 ${deletedWhitelist} 条白名单记录和 ${deletedOrders} 条订单记录`
    console.log('[admin_whitelist_remove]', message)
    
    return {
      success: true,
      code: 'OK',
      message,
      data: {
        deletedWhitelist,
        deletedOrders,
        totalRequested: idsToDelete.length,
        details
      }
    }
    
  } catch (err) {
    console.error('[admin_whitelist_remove] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
