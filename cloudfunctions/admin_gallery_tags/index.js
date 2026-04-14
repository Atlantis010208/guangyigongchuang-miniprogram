/**
 * 云函数：admin_gallery_tags
 * 功能：灯光图库标签管理（CRUD）
 * 权限：仅管理员
 * 
 * 支持操作：
 *   - add: 新增标签（查重，自增 tagVersion）
 *   - update: 更新标签（自增 tagVersion）
 *   - delete: 逻辑删除标签（自增 tagVersion）
 *   - list: 获取标签列表（按 group 分组、sortOrder 排序）
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口
exports.main = async (event, context) => {
  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      console.log('[admin_gallery_tags] 权限验证失败:', authResult.errorCode)
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode),
        timestamp: Date.now()
      }
    }

    const { action } = event

    if (!action) {
      return {
        success: false,
        code: 'MISSING_ACTION',
        errorMessage: '缺少操作类型参数',
        timestamp: Date.now()
      }
    }

    switch (action) {
      case 'add':
        return await addTag(event)
      case 'update':
        return await updateTag(event)
      case 'delete':
        return await deleteTag(event)
      case 'list':
        return await listTags(event)
      default:
        return {
          success: false,
          code: 'INVALID_ACTION',
          errorMessage: '不支持的操作类型: ' + action,
          timestamp: Date.now()
        }
    }

  } catch (error) {
    console.error('[admin_gallery_tags] 异常:', error)
    return {
      success: false,
      code: 'GALLERY_TAGS_ERROR',
      errorMessage: error.message || '标签操作失败',
      timestamp: Date.now()
    }
  }
}

/**
 * 新增标签
 */
async function addTag(event) {
  const { name, group, sortOrder = 100 } = event

  if (!name || !group) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少必要参数：标签名称(name)、分组(group)',
      timestamp: Date.now()
    }
  }

  // 查重：同名同分组不允许重复
  const existRes = await db.collection('gallery_tags')
    .where({ name, group, status: 1 })
    .limit(1)
    .get()

  if (existRes.data && existRes.data.length > 0) {
    return {
      success: false,
      code: 'TAG_EXISTS',
      errorMessage: `标签"${name}"在分组"${group}"中已存在`,
      timestamp: Date.now()
    }
  }

  const now = Date.now()
  const tagData = {
    name,
    group,
    sortOrder: Number(sortOrder),
    imageCount: 0,
    status: 1,
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('gallery_tags').add({ data: tagData })

  // 自增 tagVersion
  await incrementTagVersion()

  console.log('[admin_gallery_tags] 新增标签:', { name, group, tagId: addRes._id })

  return {
    success: true,
    code: 'OK',
    message: '标签新增成功',
    data: { tagId: addRes._id, ...tagData },
    timestamp: Date.now()
  }
}

/**
 * 更新标签
 */
async function updateTag(event) {
  const { tagId, name, group, sortOrder } = event

  if (!tagId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少标签ID(tagId)',
      timestamp: Date.now()
    }
  }

  // 构建更新数据
  const updateData = { updatedAt: Date.now() }
  if (name !== undefined) updateData.name = name
  if (group !== undefined) updateData.group = group
  if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder)

  // 如果修改了名称，检查是否与已有标签冲突
  if (name !== undefined) {
    const targetGroup = group !== undefined ? group : null
    if (targetGroup) {
      const existRes = await db.collection('gallery_tags')
        .where({
          name,
          group: targetGroup,
          status: 1,
          _id: _.neq(tagId)
        })
        .limit(1)
        .get()

      if (existRes.data && existRes.data.length > 0) {
        return {
          success: false,
          code: 'TAG_EXISTS',
          errorMessage: `标签"${name}"在分组"${targetGroup}"中已存在`,
          timestamp: Date.now()
        }
      }
    }
  }

  const updateRes = await db.collection('gallery_tags')
    .doc(tagId)
    .update({ data: updateData })

  // 自增 tagVersion
  await incrementTagVersion()

  console.log('[admin_gallery_tags] 更新标签:', { tagId, updated: updateRes.stats.updated })

  return {
    success: true,
    code: 'OK',
    message: '标签更新成功',
    data: { tagId, updated: updateRes.stats.updated },
    timestamp: Date.now()
  }
}

/**
 * 物理删除标签
 */
async function deleteTag(event) {
  const { tagId } = event

  if (!tagId) {
    return {
      success: false,
      code: 'INVALID_PARAMS',
      errorMessage: '缺少标签ID(tagId)',
      timestamp: Date.now()
    }
  }

  const removeRes = await db.collection('gallery_tags')
    .doc(tagId)
    .remove()

  // 自增 tagVersion
  await incrementTagVersion()

  console.log('[admin_gallery_tags] 物理删除标签:', { tagId, removed: removeRes.stats.removed })

  return {
    success: true,
    code: 'OK',
    message: '标签删除成功',
    data: { tagId, deleted: removeRes.stats.removed },
    timestamp: Date.now()
  }
}

/**
 * 获取标签列表（按 group 分组、sortOrder 排序）
 */
async function listTags(event) {
  const { includeDisabled = false } = event

  const query = includeDisabled ? {} : { status: 1 }

  const listRes = await db.collection('gallery_tags')
    .where(query)
    .orderBy('group', 'asc')
    .orderBy('sortOrder', 'asc')
    .orderBy('name', 'asc')
    .limit(200)
    .get()

  const tags = listRes.data || []

  // 按 group 分组
  const grouped = {}
  tags.forEach(tag => {
    if (!grouped[tag.group]) {
      grouped[tag.group] = []
    }
    grouped[tag.group].push(tag)
  })

  // 获取当前 tagVersion
  let tagVersion = 1
  try {
    const configRes = await db.collection('gallery_config').doc('tag_version').get()
    if (configRes.data) {
      tagVersion = configRes.data.value
    }
  } catch (e) {
    console.warn('[admin_gallery_tags] 获取 tagVersion 失败:', e.message)
  }

  return {
    success: true,
    code: 'OK',
    message: '获取标签列表成功',
    data: {
      tags,
      grouped,
      tagVersion,
      total: tags.length
    },
    timestamp: Date.now()
  }
}

/**
 * 自增 tagVersion
 */
async function incrementTagVersion() {
  try {
    await db.collection('gallery_config')
      .doc('tag_version')
      .update({
        data: {
          value: _.inc(1),
          updatedAt: Date.now()
        }
      })
  } catch (e) {
    console.warn('[admin_gallery_tags] 更新 tagVersion 失败:', e.message)
  }
}
