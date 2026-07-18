/**
 * 云函数：membership_status
 *
 * 职责：
 * 1. 查询当前用户会员状态（effectiveLevel / vipLevel / vipExpireAt / remainingDays / toolkitPerpetual）
 * 2. 首次调用时为已登录用户生成唯一邀请码（6 位字母数字，去除易混 O/0/I/1）
 *
 * 注意：
 * - 不创建 users 文档（由现有 login 云函数负责）
 * - 邀请码使用逻辑、奖励发放在后续 spec 实现
 *
 * 配套文档：specs/membership_center/design.md §4.1
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const ONE_DAY_MS = 24 * 3600 * 1000

// 邀请码字符集：去除易混 O/0/I/1
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6
const MAX_RETRY = 5

/**
 * 生成 6 位随机邀请码
 */
function makeRandomCode() {
  let s = ''
  for (let i = 0; i < CODE_LEN; i++) {
    s += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  }
  return s
}

/**
 * 生成全局唯一邀请码
 * - 应用层重试 5 次，逐次查询冲突
 * - 5 次都冲突时使用「4 位随机 + 2 位时间戳 base36 大写」兜底
 * - 实际依赖 users.inviteCode 唯一稀疏索引兜底
 */
async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const code = makeRandomCode()
    try {
      const existing = await db.collection('users')
        .where({ inviteCode: code })
        .limit(1)
        .get()
      if (!existing.data || existing.data.length === 0) {
        return code
      }
    } catch (e) {
      // 查询异常时直接返回当前 code，依赖 DB 唯一索引兜底
      console.warn('[membership_status][inviteCode] 唯一性查询异常，降级为依赖 DB 唯一索引兜底:', e.message)
      return code
    }
  }
  // 极小概率：5 次都冲突，使用时间戳兜底
  const ts = Date.now().toString(36).slice(-2).toUpperCase()
  return makeRandomCode().slice(0, 4) + ts
}

/**
 * 计算 effectiveLevel
 */
function computeEffectiveLevel(vipLevel, vipExpireAt) {
  if (!vipExpireAt || vipExpireAt < Date.now()) return 'free'
  if (vipLevel === 'premium') return 'premium'
  if (vipLevel === 'normal') return 'normal'
  return 'free'
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const OPENID = wxContext.OPENID || wxContext.openid

    // 未登录：返回 free 状态
    if (!OPENID) {
      return {
        success: true,
        code: 'OK',
        data: {
          effectiveLevel: 'free',
          vipLevel: null,
          vipExpireAt: null,
          remainingDays: 0,
          toolkitPerpetual: false,
          galleryTrialExpireAt: null,
          inviteCode: '',
          inviteStats: { invitedCount: 0, trialDaysGranted: 0 },
          isLoggedIn: false
        }
      }
    }

    // 查询用户文档
    const userQuery = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get()

    if (!userQuery.data || userQuery.data.length === 0) {
      // 用户文档不存在：返回 free 状态（不创建用户）
      return {
        success: true,
        code: 'OK',
        data: {
          effectiveLevel: 'free',
          vipLevel: null,
          vipExpireAt: null,
          remainingDays: 0,
          toolkitPerpetual: false,
          galleryTrialExpireAt: null,
          inviteCode: '',
          inviteStats: { invitedCount: 0, trialDaysGranted: 0 },
          isLoggedIn: true
        }
      }
    }

    let user = userQuery.data[0]

    // 首次调用：生成邀请码
    if (!user.inviteCode) {
      const newCode = await generateUniqueInviteCode()
      try {
        await db.collection('users').doc(user._id).update({
          data: { inviteCode: newCode, updatedAt: Date.now() }
        })
        user.inviteCode = newCode
      } catch (e) {
        // 写入失败（可能是唯一索引冲突），重试一次
        console.warn('[membership_status][inviteCode] 首次写入失败，准备重试:', e.message)
        try {
          const retryCode = await generateUniqueInviteCode()
          await db.collection('users').doc(user._id).update({
            data: { inviteCode: retryCode, updatedAt: Date.now() }
          })
          user.inviteCode = retryCode
        } catch (retryErr) {
          console.error('[membership_status][inviteCode] 重试仍失败，本次返回空邀请码，前端会提示“生成中”:', retryErr.message)
          user.inviteCode = ''
        }
      }
    }

    // 计算 effectiveLevel + 剩余天数
    const now = Date.now()
    const vipLevel = user.vipLevel || null
    const vipExpireAt = user.vipExpireAt || null
    const effectiveLevel = computeEffectiveLevel(vipLevel, vipExpireAt)
    const isVipActive = vipExpireAt && vipExpireAt > now
    const remainingDays = isVipActive ? Math.ceil((vipExpireAt - now) / ONE_DAY_MS) : 0

    // 从 member_invitations 集合实时 count 邀请人数（防止 user.inviteStats.invitedCount 字段缺失）
    let invitedCount = 0
    try {
      const countRes = await db.collection('member_invitations')
        .where({ inviterOpenid: OPENID })
        .count()
      invitedCount = (countRes && typeof countRes.total === 'number') ? countRes.total : 0
    } catch (e) {
      // 兜底：从 user.inviteStats 读取
      invitedCount = (user.inviteStats && Number(user.inviteStats.invitedCount)) || 0
    }

    const rawStats = user.inviteStats || {}
    const trialDaysGranted = Number(rawStats.trialDaysGranted) || 0

    return {
      success: true,
      code: 'OK',
      data: {
        effectiveLevel,
        vipLevel,
        vipExpireAt,
        remainingDays,
        toolkitPerpetual: !!user.toolkitPerpetual,
        galleryTrialExpireAt: user.galleryTrialExpireAt || null,
        inviteCode: user.inviteCode || '',
        inviteStats: { invitedCount, trialDaysGranted },
        isLoggedIn: true
      }
    }
  } catch (err) {
    console.error('[membership_status] 异常:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: (err && err.message) || '查询会员状态失败',
      data: {
        effectiveLevel: 'free',
        vipLevel: null,
        vipExpireAt: null,
        remainingDays: 0,
        toolkitPerpetual: false,
        galleryTrialExpireAt: null,
        inviteCode: '',
        inviteStats: { invitedCount: 0, trialDaysGranted: 0 },
        isLoggedIn: false
      }
    }
  }
}
