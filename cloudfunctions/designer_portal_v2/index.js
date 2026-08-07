'use strict'
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function safeGet(query) { try { const result = await query.get(); return result.data || [] } catch (error) { console.warn('[designer_portal_v2] optional query failed', error && error.message); return [] } }
function statusGroup(status) {
  if (['done', 'completed'].includes(status)) return 'completed'
  if (['submitted', 'published', 'created'].includes(status)) return 'pending'
  return 'ongoing'
}
function projectView(item) {
  const steps = Array.isArray(item.steps) ? item.steps : []
  const done = steps.filter(step => step && step.done).length
  const progress = steps.length ? Math.round(done / steps.length * 100) : Number(item.progress) || 0
  const nextStep = steps.find(step => step && !step.done)
  return {
    id: item._id,
    title: item.title || (item.space ? `${item.space}灯光设计方案` : '灯光设计方案'),
    status: statusGroup(item.status),
    statusText: item.statusText || '',
    progress,
    nextAction: nextStep && (nextStep.label || nextStep.title) || (progress >= 100 ? '查看交付文件' : '继续处理项目'),
    deadline: item.deadline || item.dueAt || '',
    imageUrl: item.coverUrl || item.imageUrl || '',
    settlementStatus: item.settlementStatus || ''
  }
}

exports.main = async (event) => {
  if ((event && event.action || 'overview') !== 'overview') return { success: false, code: 'INVALID_ACTION', message: 'Unsupported action' }
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, code: 'UNAUTHENTICATED', message: '登录状态已失效' }
  try {
    const users = await safeGet(db.collection('users').where(_.or([{ _openid: OPENID }, { openid: OPENID }])).limit(1))
    const user = users[0]
    if (!user) return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在' }
    if (user.roles !== 2 && user.roles !== 0) return { success: false, code: 'NOT_DESIGNER', message: '当前账号不是设计师身份' }
    const designers = await safeGet(db.collection('designers').where(_.or([{ _openid: OPENID }, { openid: OPENID }, { userId: user._id }])).limit(1))
    const designer = designers[0] || {}
    const ids = [OPENID, user._id, designer._id].filter(Boolean)
    const branches = []
    ids.forEach(id => branches.push({ designerId: id }, { assignedDesignerId: id }, { designerOpenid: id }))
    const rawProjects = branches.length ? await safeGet(db.collection('requests').where(_.or(branches)).orderBy('updatedAt', 'desc').limit(30)) : []
    const projects = rawProjects.map(projectView)
    const ongoing = projects.filter(item => item.status === 'ongoing')
    const pending = projects.filter(item => item.status === 'pending')
    const todos = ongoing.slice(0, 3).map(item => ({ id: item.id, title: item.nextAction, projectTitle: item.title, deadline: item.deadline }))
    return {
      success: true, code: 'OK', data: {
        designer: { id: designer._id || '', name: designer.name || user.nickname || '设计师', avatarUrl: designer.avatarUrl || user.avatarUrl || '' },
        stats: { ongoing: ongoing.length, todos: todos.length, pendingSettlement: projects.filter(item => item.status === 'completed' && item.settlementStatus !== 'settled').length },
        nextTask: todos[0] || null,
        todos,
        projects: ongoing.slice(0, 4)
      }
    }
  } catch (error) {
    console.error('[designer_portal_v2]', error)
    return { success: false, code: 'SERVER_ERROR', message: error.message || '服务暂不可用' }
  }
}
exports._test = { statusGroup, projectView }
