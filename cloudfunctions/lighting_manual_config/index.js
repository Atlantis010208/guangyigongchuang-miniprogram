/**
 * 云函数：lighting_manual_config
 * 功能：灯光设计服务说明书页面配置管理（头像等）
 *
 * 支持操作：
 *   - get:  获取配置（公开读，小程序端使用，返回 avatarFileId + avatarUrl）
 *   - set:  更新配置（管理员写入，后台管理系统使用）
 *
 * 集合设计：
 *   lighting_manual_config
 *   固定单例文档 _id = 'main'
 *   字段：
 *     - avatarFileId: string  (cloud:// 开头)
 *     - updatedAt: Date
 *     - updatedBy: string     (管理员 _id 或来源标识)
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const COLLECTION = 'lighting_manual_config'
const DOC_ID = 'main'

function resp(success, code, message, data) {
  return {
    success,
    code,
    errorMessage: message,
    data: data || null,
    timestamp: Date.now()
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function validateFileId(id) {
  return isNonEmptyString(id) && /^cloud:\/\//i.test(id.trim())
}

/**
 * 获取配置（公开，小程序端调用）
 * 自动为 avatarFileId 换取临时 URL
 */
async function getConfig() {
  let doc = null
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get()
    doc = res.data || null
  } catch (e) {
    // 文档不存在时直接返回空配置，不视为错误
    if (e && e.errCode !== -1 && e.code !== 'DATABASE_DOCUMENT_NOT_EXIST') {
      console.log('[lighting_manual_config] getConfig 读取异常:', e.message || e)
    }
  }

  const avatarFileId = doc && doc.avatarFileId ? doc.avatarFileId : ''
  let avatarUrl = ''

  if (avatarFileId) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [avatarFileId] })
      if (urlRes && Array.isArray(urlRes.fileList) && urlRes.fileList[0]) {
        avatarUrl = urlRes.fileList[0].tempFileURL || ''
      }
    } catch (e) {
      console.warn('[lighting_manual_config] getTempFileURL 失败:', e.message || e)
    }
  }

  return resp(true, 'OK', '', {
    avatarFileId,
    avatarUrl,
    updatedAt: doc && doc.updatedAt ? doc.updatedAt : null
  })
}

/**
 * 更新配置（管理员）
 */
async function setConfig(event) {
  const authRes = await requireAdmin(db, _)
  if (!authRes.ok) {
    return resp(false, authRes.errorCode, getErrorMessage(authRes.errorCode))
  }

  const { avatarFileId } = event
  if (avatarFileId !== '' && !validateFileId(avatarFileId)) {
    return resp(false, 'INVALID_PARAMS', 'avatarFileId 必须是 cloud:// 开头的字符串，或空字符串用于清除')
  }

  const now = db.serverDate()
  const updatedBy = (authRes.user && (authRes.user._id || authRes.user.username)) || 'admin'
  const value = avatarFileId ? avatarFileId.trim() : ''

  // 优先用 doc().set() 实现幂等 upsert；set 不存在时回退到 update+add 兜底
  const docRef = db.collection(COLLECTION).doc(DOC_ID)
  try {
    if (typeof docRef.set === 'function') {
      await docRef.set({
        data: {
          avatarFileId: value,
          updatedAt: now,
          updatedBy,
          createdAt: now
        }
      })
    } else {
      // 兜底：先尝试 update，stats.updated=0 则 add
      const updateRes = await docRef.update({
        data: { avatarFileId: value, updatedAt: now, updatedBy }
      })
      const updated = updateRes && updateRes.stats && updateRes.stats.updated
      if (!updated) {
        await db.collection(COLLECTION).add({
          data: {
            _id: DOC_ID,
            avatarFileId: value,
            updatedAt: now,
            updatedBy,
            createdAt: now
          }
        })
      }
    }
  } catch (e) {
    console.error('[lighting_manual_config] setConfig 写入失败:', e)
    return resp(false, 'DB_ERROR', '保存配置失败：' + (e.message || ''))
  }

  return resp(true, 'OK', '', {
    avatarFileId: avatarFileId ? avatarFileId.trim() : ''
  })
}

exports.main = async (event) => {
  const action = event && event.action
  try {
    switch (action) {
      case 'get':
        return await getConfig()
      case 'set':
        return await setConfig(event)
      default:
        return resp(false, 'INVALID_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('[lighting_manual_config] 处理异常:', e)
    return resp(false, 'INTERNAL_ERROR', e.message || '云函数内部错误')
  }
}
