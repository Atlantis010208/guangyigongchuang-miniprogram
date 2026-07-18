/**
 * 云函数：admin_quiz_list
 * 功能：题目集（quizzes）列表查询
 * 权限：仅管理员（roles=0）
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }

    const {
      limit = 20,
      offset = 0,
      keyword = '',
      courseId,
      status,
      orderBy = 'updatedAt',
      order = 'desc'
    } = event

    // 构建查询条件（软删除：isDelete != 1）
    const query = { isDelete: _.neq(1) }
    if (courseId) query.courseId = courseId
    if (status) query.status = status
    if (keyword) query.title = db.RegExp({ regexp: keyword, options: 'i' })

    // 总数
    const countRes = await db.collection('quizzes').where(query).count()

    // 列表
    const dataRes = await db.collection('quizzes')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .field({
        // 列表不返回完整题目，节省体积；只返回元信息
        _id: true,
        quizId: true,
        title: true,
        courseId: true,
        lessonRef: true,
        description: true,
        totalScore: true,
        passScore: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        questions: true // 仍带上以便前端计算 questionCount，可在前端裁剪
      })
      .get()

    // 把 questions 替换成 questionCount，避免列表数据过大
    const list = dataRes.data.map(q => ({
      ...q,
      questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
      questions: undefined
    }))

    return {
      success: true,
      code: 'OK',
      data: list,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      message: '获取题目集列表成功'
    }
  } catch (err) {
    console.error('[admin_quiz_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
