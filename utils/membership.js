/**
 * 会员状态工具库
 * 配套 specs/membership_center/design.md §2.3
 *
 * 职责：
 * 1. 离线计算 effectiveLevel（与云函数 membership_status 逻辑一致，用于防御与即时展示）
 * 2. 统一封装 membership_status 云函数调用
 * 3. 提供页面共用的小工具（剩余天数、推荐 Tab、日期格式化）
 */

const ONE_DAY_MS = 24 * 3600 * 1000

/**
 * 根据 vipLevel + vipExpireAt 计算 effectiveLevel
 * @param {string|null} vipLevel 'normal' | 'premium' | null
 * @param {number|null} vipExpireAt 到期时间戳（毫秒）
 * @returns {'free'|'normal'|'premium'}
 */
function getEffectiveLevel(vipLevel, vipExpireAt) {
  if (!vipExpireAt || vipExpireAt < Date.now()) return 'free'
  if (vipLevel === 'premium') return 'premium'
  if (vipLevel === 'normal') return 'normal'
  return 'free'
}

/**
 * 计算会员剩余天数（向上取整，最小 0）
 * @param {number|null} vipExpireAt
 * @returns {number}
 */
function getRemainingDays(vipExpireAt) {
  if (!vipExpireAt) return 0
  const diff = vipExpireAt - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / ONE_DAY_MS)
}

/**
 * 格式化到期时间戳为 'YYYY.MM.DD'
 * @param {number|null} timestamp
 * @returns {string}
 */
function formatExpireDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/**
 * 根据当前 effectiveLevel 推荐默认开通 Tab
 * - free / 试用中 → 普通会员（最低门槛）
 * - normal → 高级会员（推荐升级）
 * - premium → 不应进入开通页，调用方应自行处理
 */
function getRecommendedTab(effectiveLevel) {
  if (effectiveLevel === 'normal') return 'premium'
  return 'normal'
}

/**
 * 调用 membership_status 云函数，返回标准化数据；失败时返回兜底
 * @returns {Promise<Object>} 完整会员状态对象
 */
function fetchMembershipStatus() {
  return new Promise((resolve) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      resolve(getFallbackStatus(false))
      return
    }
    wx.cloud.callFunction({
      name: 'membership_status',
      data: {},
      success: (res) => {
        const data = res && res.result && res.result.data
        if (res && res.result && res.result.success && data) {
          resolve(normalizeStatus(data))
        } else {
          resolve(getFallbackStatus(false))
        }
      },
      fail: (err) => {
        console.warn('[membership] fetchMembershipStatus failed:', err)
        resolve(getFallbackStatus(false))
      }
    })
  })
}

/**
 * 标准化云函数返回数据，确保所有字段都有默认值
 */
function normalizeStatus(raw) {
  return {
    effectiveLevel: raw.effectiveLevel || 'free',
    vipLevel: raw.vipLevel || null,
    vipExpireAt: raw.vipExpireAt || null,
    remainingDays: typeof raw.remainingDays === 'number' ? raw.remainingDays : 0,
    toolkitPerpetual: !!raw.toolkitPerpetual,
    galleryTrialExpireAt: raw.galleryTrialExpireAt || null,
    inviteCode: raw.inviteCode || '',
    inviteStats: raw.inviteStats || { invitedCount: 0, trialDaysGranted: 0 },
    isLoggedIn: !!raw.isLoggedIn
  }
}

/**
 * 兜底状态对象（云函数不可用 / 失败时使用）
 */
function getFallbackStatus(isLoggedIn) {
  return {
    effectiveLevel: 'free',
    vipLevel: null,
    vipExpireAt: null,
    remainingDays: 0,
    toolkitPerpetual: false,
    galleryTrialExpireAt: null,
    inviteCode: '',
    inviteStats: { invitedCount: 0, trialDaysGranted: 0 },
    isLoggedIn: !!isLoggedIn
  }
}

/**
 * 计算邀请进度展示参数
 * 业务规则：每邀 2 人 +7 天试用，无上限叠加
 * @param {number} invitedCount 已邀请人数
 * @returns {{ inCycle: number, needed: number, percent: number, nextRewardDays: number }}
 */
function getInviteProgress(invitedCount) {
  const safe = Math.max(0, Number(invitedCount) || 0)
  const inCycle = safe % 2 // 当前周期内已邀请人数（0 或 1）
  const needed = 2 - inCycle // 还差几人完成本周期
  const percent = Math.round((inCycle / 2) * 100)
  return { inCycle, needed, percent, nextRewardDays: 7 }
}

module.exports = {
  getEffectiveLevel,
  getRemainingDays,
  formatExpireDate,
  getRecommendedTab,
  fetchMembershipStatus,
  getFallbackStatus,
  getInviteProgress
}
