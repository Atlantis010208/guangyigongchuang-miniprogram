'use strict'

const cloud = require('wx-server-sdk')
const { requireAdmin } = require('./admin_auth')
const domain = require('./domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function failure(code, message) {
  return { success: false, code, errorMessage: message, message }
}

function combineConditions(conditions) {
  if (!conditions.length) return {}
  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

async function findCourseAliases(courseId) {
  if (!courseId) return []
  let rows = []
  try {
    const result = await db.collection('courses').where({ courseId }).field({ _id: true, courseId: true }).limit(1).get()
    rows = result.data || []
  } catch (_) {}
  if (!rows.length) {
    try {
      const result = await db.collection('courses').doc(courseId).field({ _id: true, courseId: true }).get()
      if (result.data) rows = [result.data]
    } catch (_) {}
  }
  return Array.from(new Set(rows.flatMap(row => [row._id, row.courseId]).filter(Boolean)))
}

async function resolveKeyword(keyword) {
  if (!keyword) return { userIds: [], courseIds: [], active: false }
  const regexp = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
  const [users, courses] = await Promise.all([
    db.collection('users').where(_.or([{ nickname: regexp }, { name: regexp }])).field({ _openid: true, openid: true }).limit(100).get(),
    db.collection('courses').where({ title: regexp }).field({ _id: true, courseId: true }).limit(100).get()
  ])
  return {
    active: true,
    userIds: Array.from(new Set((users.data || []).flatMap(item => [item._openid, item.openid]).filter(Boolean))),
    courseIds: Array.from(new Set((courses.data || []).flatMap(item => [item._id, item.courseId]).filter(Boolean)))
  }
}

async function loadUsers(userIds) {
  if (!userIds.length) return []
  const result = await db.collection('users')
    .where(_.or([{ _openid: _.in(userIds) }, { openid: _.in(userIds) }]))
    .field({ _openid: true, openid: true, nickname: true, name: true, avatarUrl: true, avatar: true })
    .limit(100)
    .get()
  return result.data || []
}

async function loadCourses(courseIds) {
  if (!courseIds.length) return []
  const [business, documents] = await Promise.all([
    db.collection('courses').where({ courseId: _.in(courseIds) }).field({ courseId: true, title: true, cover: true, coverUrl: true, chapters: true }).limit(100).get(),
    db.collection('courses').where({ _id: _.in(courseIds) }).field({ courseId: true, title: true, cover: true, coverUrl: true, chapters: true }).limit(100).get()
  ])
  const map = new Map()
  ;[...(business.data || []), ...(documents.data || [])].forEach(item => map.set(item._id, item))
  return Array.from(map.values())
}

async function convertImages(list) {
  const fileIds = Array.from(new Set(list.flatMap(item => [item.avatarUrl, item.courseCover]).filter(value => typeof value === 'string' && value.startsWith('cloud://'))))
  if (!fileIds.length) return list
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds })
    const map = {}
    ;(result.fileList || []).forEach(item => { if (item.status === 0) map[item.fileID] = item.tempFileURL })
    return list.map(item => Object.assign({}, item, {
      avatarUrl: map[item.avatarUrl] || item.avatarUrl,
      courseCover: map[item.courseCover] || item.courseCover
    }))
  } catch (error) {
    console.warn('[admin_course_progress_list] image conversion degraded', error && error.message)
    return list
  }
}

exports.main = async (event) => {
  try {
    const auth = await requireAdmin(event, cloud, db, _)
    if (!auth.ok) return failure(auth.code || 'FORBIDDEN', auth.message || '无管理员权限')
    const params = domain.normalizeParams(event)
    const conditions = []

    if (params.courseId) {
      const aliases = await findCourseAliases(params.courseId)
      if (!aliases.length) return { success: true, code: 'OK', data: { total: 0, list: [] } }
      conditions.push({ courseId: _.in(aliases) })
    }

    const keyword = await resolveKeyword(params.keyword)
    if (keyword.active) {
      const branches = []
      if (keyword.userIds.length) branches.push({ userId: _.in(keyword.userIds) })
      if (keyword.courseIds.length) branches.push({ courseId: _.in(keyword.courseIds) })
      if (!branches.length) return { success: true, code: 'OK', data: { total: 0, list: [] } }
      conditions.push(branches.length === 1 ? branches[0] : _.or(branches))
    }

    const where = combineConditions(conditions)
    const collection = db.collection('course_progress').where(where)
    const [progressResult, countResult] = await Promise.all([
      collection.orderBy(params.orderBy, params.order).skip(params.offset).limit(params.limit).get(),
      db.collection('course_progress').where(where).count()
    ])
    const records = progressResult.data || []
    if (!records.length) return { success: true, code: 'OK', data: { total: countResult.total || 0, list: [] } }

    const userIds = Array.from(new Set(records.map(item => item.userId).filter(Boolean)))
    const courseIds = Array.from(new Set(records.map(item => item.courseId).filter(Boolean)))
    const [users, courses] = await Promise.all([loadUsers(userIds), loadCourses(courseIds)])
    const userMap = Object.create(null)
    users.forEach(item => { if (item._openid) userMap[item._openid] = item; if (item.openid) userMap[item.openid] = item })
    const courseMap = Object.create(null)
    courses.forEach(item => { if (item._id) courseMap[item._id] = item; if (item.courseId) courseMap[item.courseId] = item })
    const list = records.map(record => domain.formatRecord(record, userMap[record.userId], courseMap[record.courseId]))

    return { success: true, code: 'OK', data: { total: countResult.total || 0, list: await convertImages(list) } }
  } catch (error) {
    console.error('[admin_course_progress_list] failed', error)
    return failure('INTERNAL_ERROR', '获取学习进度失败，请稍后重试')
  }
}

exports._test = { combineConditions, failure }
