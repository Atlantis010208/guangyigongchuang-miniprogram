'use strict'
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function safeGet(query) {
  try { const result = await query.get(); return result.data || [] } catch (error) { console.warn('[owner_portal_v2] optional query failed', error && error.message); return [] }
}
function firstText(...values) { return values.find(value => typeof value === 'string' && value.trim()) || '' }
function normalizeStatus(value) {
  if (['completed', 'done'].includes(value)) return 'completed'
  if (['processing', 'matched', 'review', 'design', 'verifying'].includes(value)) return 'processing'
  return 'pending'
}
function makeNextAction(request) {
  if (!request) return { state: 'empty', title: '开始填写灯光需求', meta: '用几分钟告诉我们你的空间与生活习惯', progress: 0, requestId: '' }
  const status = normalizeStatus(request.status)
  if (status === 'completed') return { state: status, title: '查看已完成的灯光方案', meta: '方案已交付', progress: 100, requestId: request._id }
  if (status === 'processing') return { state: status, title: '查看灯光服务进度', meta: '设计师正在处理你的需求', progress: Number(request.progress) || 50, requestId: request._id }
  return { state: status, title: '查看需求处理状态', meta: '需求已提交，等待匹配设计师', progress: Number(request.progress) || 10, requestId: request._id }
}

exports.main = async (event) => {
  if ((event && event.action || 'overview') !== 'overview') return { success: false, code: 'INVALID_ACTION', message: 'Unsupported action' }
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, code: 'UNAUTHENTICATED', message: '登录状态已失效' }
  try {
    const users = await safeGet(db.collection('users').where(_.or([{ _openid: OPENID }, { openid: OPENID }])).limit(1))
    const user = users[0] || {}
    const identityValues = [OPENID, user._id, user.userId, user.webUid].filter(Boolean)
    const branches = []
    identityValues.forEach(id => branches.push({ _openid: id }, { openid: id }, { ownerId: id }, { userId: id }, { webUid: id }))
    const requests = branches.length ? await safeGet(db.collection('requests').where(_.or(branches)).orderBy('updatedAt', 'desc').limit(20)) : []
    const cases = await safeGet(db.collection('lighting_cases').where({ status: 'active' }).orderBy('sortOrder', 'desc').limit(4))
    const counts = { total: requests.length, pending: 0, processing: 0, completed: 0 }
    requests.forEach(item => { counts[normalizeStatus(item.status)] += 1 })
    return {
      success: true,
      code: 'OK',
      data: {
        user: { avatarUrl: firstText(user.avatarUrl, user.avatar), nickname: firstText(user.nickname, user.name, '业主') },
        nextAction: makeNextAction(requests[0]),
        requestStatus: counts,
        featuredCases: cases.map(item => ({
          id: item._id,
          title: firstText(item.title, '灯光设计案例'),
          imageUrl: firstText(item.coverUrl, item.imageUrl, Array.isArray(item.imageUrls) && item.imageUrls[0], Array.isArray(item.imageFileIds) && item.imageFileIds[0]),
          spaceType: firstText(item.spaceType, item.category), city: firstText(item.city)
        }))
      }
    }
  } catch (error) {
    console.error('[owner_portal_v2]', error)
    return { success: false, code: 'SERVER_ERROR', message: error.message || '服务暂不可用' }
  }
}

exports._test = { normalizeStatus, makeNextAction }
