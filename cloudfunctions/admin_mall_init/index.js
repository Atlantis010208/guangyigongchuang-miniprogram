/**
 * 云函数：admin_mall_init
 * 功能：专业商城数据库初始化（创建集合、种子分类、建立索引）
 * 权限：仅管理员（roles=0 或后台管理账号）
 *
 * 该函数幂等：重复执行不会覆盖已有数据，只补齐缺失的集合与默认分类。
 *
 * 入参：
 *   dryRun {boolean} 只做检查不写入，默认 false
 *
 * 返回：{ success, code, data: { collections, categories, indexes }, message }
 */
const cloud = require('wx-server-sdk')
const https = require('https')
const { requireAdmin, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 专业商城依赖的集合
const REQUIRED_COLLECTIONS = ['products', 'virtual_categories']

// 集合为空时写入的默认分类，与 admin_virtual_categories 保持一致
const DEFAULT_CATEGORIES = [
  { name: '设计服务', sort: 10 },
  { name: '资料工具', sort: 20 },
  { name: 'CAD图纸', sort: 30 },
  { name: '3D模型', sort: 40 },
  { name: '材质贴图', sort: 50 },
  { name: '计算工具', sort: 60 },
  { name: '其他资源', sort: 70 }
]

/**
 * 商城查询所需索引。
 * products 的查询形态固定为：status + isDelete 过滤，叠加 type / virtualCategory，
 * 再按 createdAt / price / sales 排序，因此按该顺序建立复合索引。
 */
const INDEX_PLAN = [
  {
    collection: 'products',
    indexes: [
      { name: 'idx_status_isDelete_createdAt', unique: false, keys: [{ name: 'status', direction: '1' }, { name: 'isDelete', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
      { name: 'idx_type_virtualCategory_createdAt', unique: false, keys: [{ name: 'type', direction: '1' }, { name: 'virtualCategory', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
      { name: 'idx_status_isDelete_price', unique: false, keys: [{ name: 'status', direction: '1' }, { name: 'isDelete', direction: '1' }, { name: 'price', direction: '1' }] },
      { name: 'idx_status_isDelete_sales', unique: false, keys: [{ name: 'status', direction: '1' }, { name: 'isDelete', direction: '1' }, { name: 'sales', direction: '-1' }] },
      { name: 'idx_productId', unique: false, keys: [{ name: 'productId', direction: '1' }] }
    ]
  },
  {
    collection: 'virtual_categories',
    indexes: [
      { name: 'idx_isDelete_sort', unique: false, keys: [{ name: 'isDelete', direction: '1' }, { name: 'sort', direction: '1' }] }
    ]
  }
]

/**
 * 发送 JSON POST 请求。
 * @param {string} url 完整请求地址
 * @param {object} body 请求体
 * @returns {Promise<object>} 解析后的响应，解析失败时返回空对象
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    try {
      const target = new URL(url)
      const payload = Buffer.from(JSON.stringify(body))
      const req = https.request({
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length }
      }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (e) {
            resolve({})
          }
        })
      })
      req.on('error', reject)
      req.write(payload)
      req.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 确保集合存在，不存在时创建。
 * @param {string} name 集合名
 * @param {boolean} dryRun 是否只检查不创建
 * @returns {Promise<object>} { collection, status }
 */
async function ensureCollection(name, dryRun) {
  try {
    await db.collection(name).count()
    return { collection: name, status: 'exists' }
  } catch (error) {
    const notExists = error && (error.errCode === -502005
      || (error.message && error.message.indexOf('collection not exists') !== -1))

    if (!notExists) {
      return { collection: name, status: 'error', message: error.message }
    }
    if (dryRun) {
      return { collection: name, status: 'missing' }
    }

    try {
      await db.createCollection(name)
      return { collection: name, status: 'created' }
    } catch (createError) {
      return { collection: name, status: 'error', message: createError.message }
    }
  }
}

/**
 * 集合为空时写入默认分类，已有数据则跳过，避免覆盖后台配置。
 * @param {boolean} dryRun 是否只检查不写入
 * @returns {Promise<object>} { status, inserted, existing }
 */
async function seedCategories(dryRun) {
  const existing = await db.collection('virtual_categories')
    .where({ isDelete: _.neq(1) })
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    return { status: 'skipped', inserted: 0, reason: '分类已存在，保留后台配置' }
  }
  if (dryRun) {
    return { status: 'pending', inserted: 0 }
  }

  const now = Date.now()
  let inserted = 0
  for (const category of DEFAULT_CATEGORIES) {
    try {
      await db.collection('virtual_categories').add({
        data: { ...category, isDelete: 0, createdAt: now, updatedAt: now }
      })
      inserted += 1
    } catch (error) {
      console.warn('[admin_mall_init] 写入默认分类失败:', category.name, error.message)
    }
  }

  return { status: 'seeded', inserted }
}

/**
 * 建立商城查询索引。
 * 云函数默认拿不到 CLOUDBASE_ACCESS_TOKEN，此时返回索引清单供在控制台手动创建。
 * @param {boolean} dryRun 是否只返回计划不实际创建
 * @returns {Promise<object>} { applied, plan, results }
 */
async function ensureIndexes(dryRun) {
  const token = process.env.CLOUDBASE_ACCESS_TOKEN || ''
  const envId = process.env.ENV_ID || process.env.TCB_ENV || ''

  if (dryRun || !token || !envId) {
    return {
      applied: false,
      reason: dryRun ? '仅预演' : '缺少 CLOUDBASE_ACCESS_TOKEN / ENV_ID，请在云开发控制台按 plan 手动创建索引',
      plan: INDEX_PLAN
    }
  }

  const endpoint = `https://api.weixin.qq.com/tcb/databaseupdateindex?access_token=${encodeURIComponent(token)}`
  const results = await Promise.all(INDEX_PLAN.map((item) => postJson(endpoint, {
    env: envId,
    collection_name: item.collection,
    create_indexes: item.indexes,
    drop_indexes: []
  }).catch((error) => ({ collection: item.collection, error: error.message }))))

  return { applied: true, plan: INDEX_PLAN, results }
}

exports.main = async (event = {}) => {
  try {
    const authResult = await requireAdmin(db, _)
    if (!authResult.ok) {
      console.log('[admin_mall_init] 权限验证失败:', authResult.errorCode)
      return {
        success: false,
        code: authResult.errorCode,
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }

    const dryRun = event.dryRun === true

    const collections = []
    for (const name of REQUIRED_COLLECTIONS) {
      collections.push(await ensureCollection(name, dryRun))
    }

    const failed = collections.filter((item) => item.status === 'error')
    if (failed.length > 0) {
      return {
        success: false,
        code: 'INIT_COLLECTION_FAILED',
        errorMessage: `集合初始化失败：${failed.map((item) => item.collection).join('、')}`,
        data: { collections }
      }
    }

    const categories = await seedCategories(dryRun)
    const indexes = await ensureIndexes(dryRun)

    console.log('[admin_mall_init] 初始化完成:', JSON.stringify({ collections, categories }))

    return {
      success: true,
      code: 'OK',
      data: { dryRun, collections, categories, indexes },
      message: dryRun ? '预演完成，未写入任何数据' : '专业商城数据库初始化完成'
    }
  } catch (error) {
    console.error('[admin_mall_init] 初始化失败:', error)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: error.message || '服务器错误'
    }
  }
}
