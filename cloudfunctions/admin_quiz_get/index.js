/**
 * 云函数：admin_quiz_get
 * 功能：获取题目集详情（含答案/解析）
 * 权限：仅管理员
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

    const { id } = event
    if (!id) {
      return { success: false, code: 'INVALID_PARAMS', errorMessage: '缺少题目集 ID' }
    }

    const res = await db.collection('quizzes').doc(id).get().catch(() => null)
    if (!res || !res.data) {
      return { success: false, code: 'NOT_FOUND', errorMessage: '题目集不存在' }
    }

    return {
      success: true,
      code: 'OK',
      data: res.data,
      message: '获取题目集成功'
    }
  } catch (err) {
    console.error('[admin_quiz_get] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
