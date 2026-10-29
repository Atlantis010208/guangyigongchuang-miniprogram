/**
 * 云函数：products_list
 * 功能：专业商城商品列表查询（分类筛选 / 关键词搜索 / 价格区间 / 分页）
 * 权限：公开只读，仅返回未删除且已上架的商品
 *
 * 入参：
 *   page       {number} 页码，从 1 开始，默认 1
 *   pageSize   {number} 每页数量，默认 20，最大 50
 *   type       {string} 商品类型，如 virtual
 *   category   {string} 虚拟商品分类名，兼容旧英文枚举
 *   keyword    {string} 关键词，匹配名称 / 描述 / 标签
 *   minPrice   {number} 价格下限
 *   maxPrice   {number} 价格上限
 *   sortBy     {string} 排序字段，仅接受白名单字段
 *   sortOrder  {string} asc / desc
 *
 * 返回：{ success, code, message, data: { products, pagination }, timestamp }
 *   失败时返回 success=false 与 errorMessage，不抛出异常。
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 旧英文枚举 → 中文名映射（兼容历史数据）
const LEGACY_CATEGORY_MAP = {
  '设计服务': 'design_service',
  '资料工具': 'data_tool',
  'CAD图纸': 'cad',
  '3D模型': 'model',
  '材质贴图': 'material',
  '计算工具': 'calculation',
  '其他资源': 'other'
}

// 排序字段白名单，避免前端传入任意字段导致全表扫描
const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'price', 'sales', 'viewCount']
const DEFAULT_SORT_FIELD = 'createdAt'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

// getTempFileURL 单次调用的文件数上限
const TEMP_URL_BATCH_SIZE = 50

// 列表不下发的字段：
// virtualContent 含网盘链接、提取码与客服微信，只能由 product_detail 校验已购后返回；
// detailImages 仅详情页需要，列表所需封面已由 coverImage 统一给出。
const OMITTED_FIELDS = ['virtualContent', 'detailImages']

/**
 * 把入参规整为正整数，超出范围时回落到默认值 / 上限。
 * @param {*} value 原始入参
 * @param {number} fallback 默认值
 * @param {number} max 上限，不传则不限制
 * @returns {number} 规整后的正整数
 */
function toPositiveInt(value, fallback, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  const normalized = Math.floor(parsed)
  return max ? Math.min(normalized, max) : normalized
}

/**
 * 转义正则元字符，避免用户输入 "(" 等字符导致查询报错。
 * @param {string} text 用户输入的关键词
 * @returns {string} 可安全用于正则的文本
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 构造查询条件。
 * 说明：微信云数据库不支持 $or / $gte 这类原生 Mongo 写法，
 * 必须使用 db.command 的 _.or / _.gte 等指令，否则条件会被当成普通字段而失效。
 * @param {object} params 已解构的查询入参
 * @returns {object} 可直接传给 where() 的查询条件
 */
function buildWhere(params) {
  const { type, category, keyword, minPrice, maxPrice } = params

  // isDelete 用 neq(1) 而非 eq(0)，兼容历史数据中缺少该字段的商品
  const conditions = [{ isDelete: _.neq(1), status: 'active' }]

  // 分类筛选仅适用于虚拟商品，未显式传 type 时按 virtual 兜底
  if (category) {
    conditions.push({ type: type || 'virtual' })
    const legacyKey = LEGACY_CATEGORY_MAP[category]
    conditions.push({
      virtualCategory: legacyKey ? _.in([category, legacyKey]) : category
    })
  } else if (type) {
    conditions.push({ type })
  }

  if (minPrice !== undefined && minPrice !== null && minPrice !== '') {
    conditions.push({ price: _.gte(Number(minPrice)) })
  }
  if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') {
    conditions.push({ price: _.lte(Number(maxPrice)) })
  }

  if (keyword && String(keyword).trim()) {
    const regexp = db.RegExp({ regexp: escapeRegExp(String(keyword).trim()), options: 'i' })
    conditions.push(_.or([
      { name: regexp },
      { description: regexp },
      { tags: regexp }
    ]))
  }

  return conditions.length === 1 ? conditions[0] : _.and(conditions)
}

/**
 * 选出列表要展示的封面图，优先级：coverImage > images[0] > detailImages[0]。
 * @param {object} product 商品文档
 * @returns {string} 封面图地址或云文件 ID，取不到时为空串
 */
function pickCoverImage(product) {
  if (product.coverImage) return product.coverImage
  if (Array.isArray(product.images) && product.images.length > 0) return product.images[0]
  if (Array.isArray(product.detailImages) && product.detailImages.length > 0) return product.detailImages[0]
  return ''
}

/**
 * 汇总本页所有需要换取临时链接的云文件 ID，用于一次性批量转换。
 * @param {Array<object>} products 商品文档列表
 * @returns {Array<string>} 去重后的云文件 ID
 */
function collectCloudFileIds(products) {
  const fileIds = new Set()
  const collect = (value) => {
    if (typeof value === 'string' && value.startsWith('cloud://')) fileIds.add(value)
  }

  products.forEach((product) => {
    collect(pickCoverImage(product))
    if (Array.isArray(product.images)) product.images.forEach(collect)
  })

  return Array.from(fileIds)
}

/**
 * 批量把云文件 ID 换成临时访问链接。
 * 单次失败只降级为返回原始 ID，不影响列表整体返回。
 * @param {Array<string>} fileIds 云文件 ID 列表
 * @returns {Promise<object>} fileID → tempFileURL 映射表
 */
async function resolveTempFileUrls(fileIds) {
  const urlMap = {}
  if (fileIds.length === 0) return urlMap

  for (let i = 0; i < fileIds.length; i += TEMP_URL_BATCH_SIZE) {
    const chunk = fileIds.slice(i, i + TEMP_URL_BATCH_SIZE)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      const fileList = (res && res.fileList) || []
      fileList.forEach((file) => {
        if (file && file.fileID && file.tempFileURL) {
          urlMap[file.fileID] = file.tempFileURL
        }
      })
    } catch (error) {
      console.warn('[products_list] 获取图片临时链接失败:', error.message)
    }
  }

  return urlMap
}

/**
 * 把商品文档转成列表项：剔除敏感字段并补齐可直接渲染的图片地址。
 * @param {object} product 商品文档
 * @param {object} urlMap fileID → tempFileURL 映射表
 * @returns {object} 列表项
 */
function toListItem(product, urlMap) {
  const item = { ...product }
  OMITTED_FIELDS.forEach((field) => { delete item[field] })

  const cover = pickCoverImage(product)
  item.coverImage = urlMap[cover] || cover
  item.images = Array.isArray(product.images)
    ? product.images.map((image) => urlMap[image] || image)
    : []

  return item
}

// 云函数入口函数
exports.main = async (event = {}) => {
  try {
    const page = toPositiveInt(event.page, 1)
    const pageSize = toPositiveInt(event.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const sortBy = SORTABLE_FIELDS.includes(event.sortBy) ? event.sortBy : DEFAULT_SORT_FIELD
    const sortOrder = event.sortOrder === 'asc' ? 'asc' : 'desc'

    const where = buildWhere(event)
    const collection = db.collection('products')

    const countResult = await collection.where(where).count()
    const total = countResult.total || 0
    const totalPages = Math.ceil(total / pageSize)

    // 页码越界时直接返回空列表，避免无意义的 skip 扫描
    let products = []
    if (total > 0 && page <= totalPages) {
      const productsResult = await collection
        .where(where)
        .orderBy(sortBy, sortOrder)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const rawProducts = productsResult.data || []
      const urlMap = await resolveTempFileUrls(collectCloudFileIds(rawProducts))
      products = rawProducts.map((product) => toListItem(product, urlMap))
    }

    return {
      success: true,
      code: 'OK',
      message: '查询成功',
      data: {
        products,
        pagination: { page, pageSize, total, totalPages }
      },
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[products_list] 查询商品列表失败:', error)
    return {
      success: false,
      code: 'QUERY_PRODUCTS_ERROR',
      errorMessage: '查询商品列表失败',
      details: error.message,
      timestamp: Date.now()
    }
  }
}
