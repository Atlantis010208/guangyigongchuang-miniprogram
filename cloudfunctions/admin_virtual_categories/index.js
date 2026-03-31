/**
 * 云函数：admin_virtual_categories
 * 功能：虚拟商品分类管理（list / add / delete）
 * 权限：仅管理员
 */
const cloud = require('wx-server-sdk')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 默认分类（virtual_categories 集合为空时的降级数据）
const DEFAULT_CATEGORIES = [
  { name: '设计服务', sort: 10 },
  { name: '资料工具', sort: 20 },
  { name: 'CAD图纸',  sort: 30 },
  { name: '3D模型',   sort: 40 },
  { name: '材质贴图', sort: 50 },
  { name: '计算工具', sort: 60 },
  { name: '其他资源', sort: 70 },
]

exports.main = async (event) => {
  const { action } = event

  try {
    // 权限验证
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }

    switch (action) {
      case 'list':
        return await listCategories()
      case 'add':
        return await addCategory(event)
      case 'delete':
        return await deleteCategory(event)
      default:
        return { success: false, code: 'INVALID_ACTION', errorMessage: '无效的操作类型' }
    }
  } catch (error) {
    console.error('[admin_virtual_categories] 异常:', error)
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      errorMessage: '服务器内部错误',
      details: error.message
    }
  }
}

/**
 * 获取所有虚拟商品分类
 */
async function listCategories() {
  const res = await db.collection('virtual_categories')
    .where({ isDelete: _.neq(1) })
    .orderBy('sort', 'asc')
    .orderBy('createdAt', 'asc')
    .limit(200)
    .get()

  let categories = res.data || []

  // 降级：集合为空时初始化默认分类
  if (categories.length === 0) {
    console.log('[admin_virtual_categories] 集合为空，返回默认分类')
    categories = DEFAULT_CATEGORIES.map(c => ({ _id: '', ...c }))
  }

  return {
    success: true,
    data: { categories },
    total: categories.length
  }
}

/**
 * 新增虚拟商品分类
 */
async function addCategory(event) {
  const { name } = event

  if (!name || !name.trim()) {
    return { success: false, code: 'INVALID_PARAMS', errorMessage: '分类名称不能为空' }
  }

  const trimmedName = name.trim()

  // 检查重名
  const existing = await db.collection('virtual_categories')
    .where({ name: trimmedName, isDelete: _.neq(1) })
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    return { success: false, code: 'DUPLICATE_NAME', errorMessage: `分类"${trimmedName}"已存在` }
  }

  // 获取当前最大 sort 值
  const maxSortRes = await db.collection('virtual_categories')
    .where({ isDelete: _.neq(1) })
    .orderBy('sort', 'desc')
    .limit(1)
    .get()

  const maxSort = maxSortRes.data && maxSortRes.data.length > 0
    ? (maxSortRes.data[0].sort || 0) + 10
    : 100

  const now = Date.now()
  const addRes = await db.collection('virtual_categories').add({
    data: {
      name: trimmedName,
      sort: maxSort,
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    success: true,
    data: { _id: addRes._id, name: trimmedName, sort: maxSort },
    message: `分类"${trimmedName}"创建成功`
  }
}

/**
 * 软删除虚拟商品分类
 */
async function deleteCategory(event) {
  const { id } = event

  if (!id) {
    return { success: false, code: 'INVALID_PARAMS', errorMessage: '分类 ID 不能为空' }
  }

  await db.collection('virtual_categories').doc(id).update({
    data: {
      isDelete: 1,
      updatedAt: Date.now()
    }
  })

  return { success: true, message: '分类已删除' }
}
