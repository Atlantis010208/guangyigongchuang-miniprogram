'use strict'

const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const domain = require('./domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function responseError(code, message) {
  return { success: false, code, errorMessage: message, message }
}

function anonymize(value) {
  return value ? crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12) : ''
}

function courseFields(action) {
  const common = { _id: true, courseId: true, title: true, status: true, isDelete: true }
  if (action === 'introduction') return Object.assign(common, {
    subtitle: true, description: true, cover: true, coverUrl: true, swiperImages: true,
    instructorName: true, instructorAvatar: true, instructor: true,
    detailImages: true, images: true, detailImage: true,
    targetAudience: true, highlights: true, benefits: true
  })
  return Object.assign(common, { chapters: true })
}

async function findCourseByBusinessId(courseId, action) {
  const result = await db.collection('courses').where({ courseId }).field(courseFields(action)).limit(1).get()
  return result.data && result.data[0] || null
}

async function findCourseByDocumentId(courseId, action) {
  try {
    const result = await db.collection('courses').doc(courseId).field(courseFields(action)).get()
    return result.data || null
  } catch (_) {
    return null
  }
}

async function findCourse(courseId, action) {
  const course = await findCourseByBusinessId(courseId, action) || await findCourseByDocumentId(courseId, action)
  if (!course) return { ok: false, response: responseError('COURSE_NOT_FOUND', '课程不存在') }
  if (course.status !== 'published' || Number(course.isDelete) === 1) {
    return { ok: false, response: responseError('COURSE_NOT_AVAILABLE', '课程暂不可用') }
  }
  return { ok: true, course }
}

async function convertIntroductionImages(data) {
  const fileIds = Array.from(domain.collectCloudFileIds(data))
  if (!fileIds.length) return data
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds })
    const urlMap = {}
    ;(result.fileList || []).forEach((item) => {
      if (item && item.status === 0 && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
    })
    return domain.replaceCloudUrls(data, urlMap)
  } catch (error) {
    console.warn('[designer_learning_content] image url conversion degraded', error && error.message)
    return data
  }
}

async function findUser(openid) {
  const result = await db.collection('users')
    .where(_.or([{ _openid: openid }, { openid }]))
    .limit(1)
    .get()
  return result.data && result.data[0] || null
}

function courseAliases(course) {
  return Array.from(new Set([domain.text(course && course.courseId), domain.text(course && course._id)].filter(Boolean)))
}

async function findLatestProgress(openid, course) {
  const aliases = courseAliases(course)
  const query = aliases.length === 1
    ? { userId: openid, courseId: aliases[0] }
    : _.and([{ userId: openid }, _.or(aliases.map(courseId => ({ courseId })))])
  const result = await db.collection('course_progress').where(query).limit(20).get()
  const rows = result.data || []
  rows.sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
  if (rows.length > 1) console.warn('[designer_learning_content] duplicate progress records', { user: anonymize(openid), courseId: domain.canonicalCourseId(course) })
  return rows[0] || null
}

async function handleHistory(openid, course) {
  if (!openid) return responseError('UNAUTHENTICATED', '登录状态已失效')
  const user = await findUser(openid)
  if (!user || (Number(user.roles) !== 0 && Number(user.roles) !== 2)) {
    return responseError('NOT_DESIGNER', '当前账号不是设计师身份')
  }
  const progress = await findLatestProgress(openid, course)
  return { success: true, code: 'OK', data: domain.buildHistory(course, progress, 20) }
}

exports.main = async (event) => {
  const startedAt = Date.now()
  const parsed = domain.validateRequest(event)
  if (!parsed.ok) return responseError(parsed.code, parsed.message)
  const context = cloud.getWXContext()
  const openid = context.OPENID || context.openid || ''
  let resultCode = 'INTERNAL_ERROR'
  try {
    const lookup = await findCourse(parsed.courseId, parsed.action)
    if (!lookup.ok) {
      resultCode = lookup.response.code
      return lookup.response
    }
    let response
    if (parsed.action === 'introduction') {
      const introduction = domain.buildIntroduction(lookup.course)
      response = { success: true, code: 'OK', data: await convertIntroductionImages(introduction) }
    } else if (parsed.action === 'catalog') {
      response = { success: true, code: 'OK', data: domain.buildCatalog(lookup.course) }
    } else {
      response = await handleHistory(openid, lookup.course)
    }
    resultCode = response.code
    return response
  } catch (error) {
    console.error('[designer_learning_content] request failed', { action: parsed.action, courseId: parsed.courseId, user: anonymize(openid), error: error && error.message })
    return responseError('INTERNAL_ERROR', '学习内容加载失败，请稍后重试')
  } finally {
    console.log('[designer_learning_content] request', { action: parsed.action, courseId: parsed.courseId, user: anonymize(openid), resultCode, durationMs: Date.now() - startedAt })
  }
}

exports._test = { anonymize, courseAliases, responseError }
