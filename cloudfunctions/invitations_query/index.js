/**
 * 云函数：invitations_query
 *
 * 职责：
 *   - action='listMine'：查询当前登录用户邀请的全部记录（按 createdAt 倒序，游标分页）
 *
 * 字段脱敏：
 *   - 不返回 invitedOpenid 等敏感身份字段，仅返回昵称、头像、是否发奖等列表展示所需字段
 *
 * 配套文档：specs/invite_reward_backend/{requirements,design,tasks}.md
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 注意：现有 invitations 集合已被设计师邀请工单系统占用，会员邀请奖励单独使用 member_invitations 集合
const COLLECTION = 'member_invitations'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num))
}

function resp(success, code, data, errorMessage) {
  const out = { success, code, data: data || null, timestamp: Date.now() }
  if (errorMessage) out.errorMessage = errorMessage
  return out
}

/**
 * 列表项脱敏：只返回展示所需字段，避免暴露被邀请人 openid
 */
function sanitizeForUser(record) {
  if (!record) return null
  return {
    _id: record._id,
    invitedUserId: record.invitedUserId || '',
    invitedNickname: record.invitedNickname || '',
    invitedAvatarUrl: record.invitedAvatarUrl || '',
    inviteCode: record.inviteCode || '',
    createdAt: Number(record.createdAt) || 0,
    rewardGranted: !!record.rewardGranted,
    rewardDays: Number(record.rewardDays) || 0
  }
}

/**
 * 查询当前用户邀请的所有记录
 */
async function listMine(openid, pageSize, lastId) {
  // 游标分页：lastId 不为空时，先取该记录的 createdAt 作为游标
  let cursorCreatedAt = null
  if (lastId) {
    try {
      const cursorRes = await db.collection(COLLECTION).doc(lastId).get()
      if (cursorRes && cursorRes.data && cursorRes.data.inviterOpenid === openid) {
        cursorCreatedAt = Number(cursorRes.data.createdAt) || null
      }
    } catch (e) {
      console.warn('[invitations_query] 解析游标失败:', e && e.message)
    }
  }

  const where = cursorCreatedAt
    ? { inviterOpenid: openid, createdAt: _.lt(cursorCreatedAt) }
    : { inviterOpenid: openid }

  const res = await db.collection(COLLECTION)
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(pageSize + 1)
    .get()

  const all = (res && res.data) || []
  const hasMore = all.length > pageSize
  const slice = hasMore ? all.slice(0, pageSize) : all
  const list = slice.map(sanitizeForUser)
  const newLastId = list.length > 0 ? list[list.length - 1]._id : null

  return { list, hasMore, lastId: newLastId }
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid

    if (!OPENID) {
      return resp(false, 'UNAUTHORIZED', null, '请先登录')
    }

    const action = event && event.action ? String(event.action) : 'listMine'
    if (action !== 'listMine') {
      return resp(false, 'INVALID_PARAMS', null, '不支持的 action: ' + action)
    }

    const pageSize = clamp(Number(event && event.pageSize) || DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    const lastId = (event && event.lastId) ? String(event.lastId) : ''

    const data = await listMine(OPENID, pageSize, lastId)
    return resp(true, 'OK', data)
  } catch (err) {
    console.error('[invitations_query] 异常:', err)
    return resp(false, 'SERVER_ERROR', null, (err && err.message) || '查询邀请记录失败')
  }
}
