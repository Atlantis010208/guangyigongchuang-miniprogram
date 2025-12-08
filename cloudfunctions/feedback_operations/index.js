/**
 * 用户反馈操作云函数
 * 支持操作：submit（提交反馈）、list（获取历史反馈）、detail（获取反馈详情）
 * 
 * 入参 event:
 *   - action: string, 操作类型
 *   - feedback: object, 反馈内容（submit 时使用）
 *   - feedbackId: string, 反馈ID（detail 时使用）
 *   - page/pageSize: number, 分页参数（list 时使用）
 * 
 * 返回值:
 *   - success: boolean
 *   - code: string
 *   - message: string
 *   - data: any
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 反馈类型配置
const FEEDBACK_TYPES = {
  suggestion: '功能建议',
  bug: '问题反馈',
  complaint: '投诉',
  other: '其他'
}

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID

  // 验证用户身份
  if (!OPENID) {
    return {
      success: false,
      code: 'MISSING_OPENID',
      errorMessage: '缺少用户身份信息',
      timestamp: Date.now()
    }
  }

  try {
    const { action } = event

    // 验证操作类型
    if (!action) {
      return {
        success: false,
        code: 'MISSING_ACTION',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    // 根据操作类型分发处理
    switch (action) {
      case 'submit':
        return await submitFeedback(OPENID, event)
      case 'list':
        return await listFeedback(OPENID, event)
      case 'detail':
        return await getFeedbackDetail(OPENID, event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('用户反馈操作异常:', error)
    return {
      success: false,
      code: 'FEEDBACK_ERROR',
      errorMessage: error.message || '反馈操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 提交反馈
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数
 */
async function submitFeedback(userId, event) {
  try {
    const { feedback } = event

    // 验证反馈内容
    if (!feedback) {
      return {
        success: false,
        code: 'MISSING_FEEDBACK',
        errorMessage: '缺少反馈内容',
        timestamp: Date.now()
      }
    }

    const { type, content, images, contact } = feedback

    // 验证必填字段
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        code: 'EMPTY_CONTENT',
        errorMessage: '反馈内容不能为空',
        timestamp: Date.now()
      }
    }

    if (content.length > 500) {
      return {
        success: false,
        code: 'CONTENT_TOO_LONG',
        errorMessage: '反馈内容不能超过500字',
        timestamp: Date.now()
      }
    }

    // 验证反馈类型
    const feedbackType = type && FEEDBACK_TYPES[type] ? type : 'other'

    // 确保集合存在
    await ensureCollection('feedbacks')

    const now = Date.now()
    
    // 生成反馈编号
    const feedbackNo = `FB${now}${Math.random().toString(36).substr(2, 4).toUpperCase()}`

    // 获取用户信息（可选）
    let userInfo = {}
    try {
      const userRes = await db.collection('users')
        .where({ _openid: userId })
        .limit(1)
        .get()
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        userInfo = {
          nickname: user.nickname || '',
          avatarUrl: user.avatarUrl || '',
          phoneNumber: user.phoneNumber || ''
        }
      }
    } catch (e) {
      console.log('获取用户信息失败（非关键）:', e.message)
    }

    // 创建反馈记录
    const feedbackData = {
      feedbackNo,
      userId,
      userInfo,
      type: feedbackType,
      typeLabel: FEEDBACK_TYPES[feedbackType],
      content: content.trim(),
      images: Array.isArray(images) ? images.slice(0, 9) : [], // 最多9张图片
      contact: contact || '', // 联系方式（可选）
      status: 'pending', // pending-待处理, processing-处理中, resolved-已解决, closed-已关闭
      statusLabel: '待处理',
      reply: '', // 管理员回复
      replyTime: null,
      isRead: false, // 用户是否已读回复
      createdAt: now,
      updatedAt: now
    }

    const addRes = await db.collection('feedbacks').add({
      data: feedbackData
    })

    console.log('提交反馈成功:', { userId, feedbackNo, feedbackId: addRes._id })

    return {
      success: true,
      code: 'OK',
      message: '反馈已提交，感谢您的宝贵意见！',
      data: {
        feedbackId: addRes._id,
        feedbackNo
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('提交反馈失败:', error)
    throw error
  }
}

/**
 * 获取用户反馈列表
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数
 */
async function listFeedback(userId, event) {
  try {
    const { page = 1, pageSize = 20 } = event
    const skip = (Number(page) - 1) * Number(pageSize)

    // 确保集合存在
    await ensureCollection('feedbacks')

    // 查询总数
    const countRes = await db.collection('feedbacks')
      .where({ userId })
      .count()

    const total = countRes.total || 0

    // 查询列表
    const listRes = await db.collection('feedbacks')
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(Number(pageSize))
      .get()

    const feedbacks = (listRes.data || []).map(item => ({
      _id: item._id,
      feedbackNo: item.feedbackNo,
      type: item.type,
      typeLabel: item.typeLabel,
      content: item.content.length > 50 ? item.content.substring(0, 50) + '...' : item.content,
      status: item.status,
      statusLabel: item.statusLabel,
      hasReply: !!item.reply,
      isRead: item.isRead,
      createdAt: item.createdAt
    }))

    return {
      success: true,
      code: 'OK',
      message: '获取反馈列表成功',
      data: {
        list: feedbacks,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize))
      },
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('获取反馈列表失败:', error)
    throw error
  }
}

/**
 * 获取反馈详情
 * @param {string} userId - 用户 openid
 * @param {object} event - 请求参数
 */
async function getFeedbackDetail(userId, event) {
  try {
    const { feedbackId } = event

    if (!feedbackId) {
      return {
        success: false,
        code: 'MISSING_FEEDBACK_ID',
        errorMessage: '缺少反馈ID',
        timestamp: Date.now()
      }
    }

    // 查询反馈详情
    const res = await db.collection('feedbacks')
      .doc(feedbackId)
      .get()

    if (!res.data) {
      return {
        success: false,
        code: 'FEEDBACK_NOT_FOUND',
        errorMessage: '反馈记录不存在',
        timestamp: Date.now()
      }
    }

    const feedback = res.data

    // 验证是否是当前用户的反馈
    if (feedback.userId !== userId) {
      return {
        success: false,
        code: 'PERMISSION_DENIED',
        errorMessage: '无权查看此反馈',
        timestamp: Date.now()
      }
    }

    // 如果有回复且未读，标记为已读
    if (feedback.reply && !feedback.isRead) {
      await db.collection('feedbacks')
        .doc(feedbackId)
        .update({
          data: {
            isRead: true,
            updatedAt: Date.now()
          }
        })
      feedback.isRead = true
    }

    // 处理图片临时链接
    if (feedback.images && feedback.images.length > 0) {
      const cloudFiles = feedback.images.filter(src => src && src.startsWith('cloud://'))
      if (cloudFiles.length > 0) {
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: cloudFiles })
          const urlMap = {}
          ;(tempRes.fileList || []).forEach(file => {
            if (file.fileID && file.tempFileURL) {
              urlMap[file.fileID] = file.tempFileURL
            }
          })
          feedback.imageUrls = feedback.images.map(src => urlMap[src] || src)
        } catch (e) {
          feedback.imageUrls = feedback.images
        }
      } else {
        feedback.imageUrls = feedback.images
      }
    }

    return {
      success: true,
      code: 'OK',
      message: '获取反馈详情成功',
      data: feedback,
      timestamp: Date.now()
    }

  } catch (error) {
    console.error('获取反馈详情失败:', error)
    throw error
  }
}

/**
 * 确保集合存在
 * @param {string} collectionName - 集合名称
 */
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).count()
  } catch (e) {
    if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
      try {
        await db.createCollection(collectionName)
        console.log('创建集合成功:', collectionName)
      } catch (createErr) {
        console.log('创建集合忽略:', createErr.message)
      }
    }
  }
}
