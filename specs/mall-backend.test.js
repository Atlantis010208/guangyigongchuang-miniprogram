/**
 * 专业商城后端 spec：覆盖 products_list 与 virtual_categories 两个云函数。
 * 用内存数据库模拟微信云数据库的 command 指令与 RegExp，验证查询条件真实生效。
 */
const assert = require('assert')
const path = require('path')
const Module = require('module')

const productsListPath = path.resolve(__dirname, '..', 'cloudfunctions', 'products_list', 'index.js')
const categoriesPath = path.resolve(__dirname, '..', 'cloudfunctions', 'virtual_categories', 'index.js')

const COMMAND = Symbol('command')
const REGEXP = Symbol('regexp')

/** 构造字段级匹配指令，例如 _.neq(1) */
const fieldCommand = (test) => ({ [COMMAND]: 'field', test })
/** 构造查询级逻辑指令，例如 _.or([...]) */
const logicCommand = (type, queries) => ({ [COMMAND]: type, queries })

const command = {
  neq: (value) => fieldCommand((actual) => actual !== value),
  eq: (value) => fieldCommand((actual) => actual === value),
  in: (values) => fieldCommand((actual) => values.includes(actual)),
  gte: (value) => fieldCommand((actual) => Number(actual) >= value),
  lte: (value) => fieldCommand((actual) => Number(actual) <= value),
  inc: (value) => fieldCommand(() => true) && value,
  and: (queries) => logicCommand('and', queries),
  or: (queries) => logicCommand('or', queries)
}

/** 判断单个字段值是否命中查询条件 */
function matchValue(actual, expected) {
  if (expected && expected[COMMAND] === 'field') return expected.test(actual)
  if (expected && expected[REGEXP]) {
    const values = Array.isArray(actual) ? actual : [actual]
    return values.some((value) => typeof value === 'string' && expected.regexp.test(value))
  }
  return actual === expected
}

/** 递归判断文档是否命中查询条件（支持 _.and / _.or 嵌套） */
function matchQuery(doc, query) {
  if (!query) return true
  if (query[COMMAND] === 'and') return query.queries.every((sub) => matchQuery(doc, sub))
  if (query[COMMAND] === 'or') return query.queries.some((sub) => matchQuery(doc, sub))
  return Object.entries(query).every(([key, expected]) => matchValue(doc[key], expected))
}

/** 创建内存数据库，records 为各集合的初始文档 */
function createDb(records) {
  const store = new Map(Object.entries(records).map(([name, rows]) => [name, rows]))

  const collection = (name) => {
    const rows = store.get(name) || []
    const build = (query, sort, skipCount, limitCount) => ({
      orderBy(field, order) {
        return build(query, { field, order }, skipCount, limitCount)
      },
      skip(n) {
        return build(query, sort, n, limitCount)
      },
      limit(n) {
        return build(query, sort, skipCount, n)
      },
      async count() {
        return { total: rows.filter((row) => matchQuery(row, query)).length }
      },
      async get() {
        let matched = rows.filter((row) => matchQuery(row, query))
        if (sort) {
          const direction = sort.order === 'asc' ? 1 : -1
          matched = [...matched].sort((a, b) => {
            const left = a[sort.field]
            const right = b[sort.field]
            if (left === right) return 0
            return left > right ? direction : -direction
          })
        }
        if (skipCount) matched = matched.slice(skipCount)
        if (limitCount !== undefined) matched = matched.slice(0, limitCount)
        return { data: matched.map((row) => ({ ...row })) }
      }
    })

    return {
      where: (query) => build(query),
      async add({ data }) {
        rows.push({ _id: `id_${rows.length + 1}`, ...data })
        store.set(name, rows)
        return { _id: `id_${rows.length}` }
      }
    }
  }

  return {
    collection,
    command,
    RegExp: ({ regexp, options }) => ({ [REGEXP]: true, regexp: new RegExp(regexp, options) })
  }
}

/** 以 mock 的 wx-server-sdk 载入云函数 */
function loadFunction(functionPath, { db, getTempFileURL }) {
  const mockCloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() { return db },
    getWXContext() { return { OPENID: 'openid-test' } },
    getTempFileURL
  }

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'wx-server-sdk') return mockCloud
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[functionPath]
  const fn = require(functionPath)
  Module._load = originalLoad
  return fn
}

const PRODUCTS = [
  {
    _id: 'p_course',
    name: '二哥十年经验｜可落地的灯光设计课',
    description: '【课程】系统讲解灯光设计方法',
    tags: ['课程'],
    price: 399,
    type: 'virtual',
    virtualCategory: '设计服务',
    status: 'active',
    isDelete: 0,
    createdAt: 500,
    images: ['cloud://demo/course.png'],
    detailImages: ['cloud://demo/course-detail.png'],
    virtualContent: { driveLink: 'https://pan.example.com/secret', drivePassword: '8888' }
  },
  {
    _id: 'p_consult',
    name: '灯光一对一咨询答疑',
    description: '针对具体问题获得建议',
    tags: [],
    price: 9.9,
    type: 'virtual',
    virtualCategory: 'data_tool',
    status: 'active',
    createdAt: 400,
    coverImage: 'cloud://demo/consult.png',
    virtualContent: { contactWechat: 'wx-secret' }
  },
  {
    _id: 'p_https_cover',
    name: '灯光设计服务｜客厅整体照明方案',
    description: '整套灯光设计交付',
    price: 1950,
    type: 'virtual',
    virtualCategory: '设计服务',
    status: 'active',
    isDelete: 0,
    createdAt: 300,
    coverImage: 'https://cdn.example.com/service.png'
  },
  {
    _id: 'p_inactive',
    name: '未上架商品',
    price: 100,
    type: 'virtual',
    virtualCategory: '设计服务',
    status: 'inactive',
    isDelete: 0,
    createdAt: 200
  },
  {
    _id: 'p_deleted',
    name: '已删除商品',
    price: 100,
    type: 'virtual',
    virtualCategory: '设计服务',
    status: 'active',
    isDelete: 1,
    createdAt: 100
  }
]

;(async () => {
  // ========== products_list ==========
  let tempUrlCalls = []
  const db = createDb({ products: PRODUCTS.map((item) => ({ ...item })) })
  const productsList = loadFunction(productsListPath, {
    db,
    async getTempFileURL({ fileList }) {
      tempUrlCalls.push(fileList)
      return {
        fileList: fileList.map((fileID) => ({ fileID, tempFileURL: `https://tmp.example.com/${fileID.split('/').pop()}` }))
      }
    }
  })

  // 只返回已上架且未删除的商品；缺少 isDelete 字段的历史数据也要能查到
  const all = await productsList.main({ type: 'virtual', pageSize: 20 })
  assert.strictEqual(all.success, true)
  assert.deepStrictEqual(all.data.products.map((item) => item._id), ['p_course', 'p_consult', 'p_https_cover'])
  assert.strictEqual(all.data.pagination.total, 3)

  // 敏感的虚拟交付内容不能出现在列表接口里
  all.data.products.forEach((item) => {
    assert.strictEqual(item.virtualContent, undefined, `${item._id} 不应下发 virtualContent`)
    assert.strictEqual(item.detailImages, undefined, `${item._id} 不应下发 detailImages`)
  })

  // 封面图：cloud:// 换成临时链接，https 地址原样保留，缺省时回落到 images[0]
  const [course, consult, httpsCover] = all.data.products
  assert.strictEqual(course.coverImage, 'https://tmp.example.com/course.png')
  assert.strictEqual(course.images[0], 'https://tmp.example.com/course.png')
  assert.strictEqual(consult.coverImage, 'https://tmp.example.com/consult.png')
  assert.strictEqual(httpsCover.coverImage, 'https://cdn.example.com/service.png')

  // 整页图片只换一次临时链接，避免逐个商品发请求
  assert.strictEqual(tempUrlCalls.length, 1)
  assert.deepStrictEqual(tempUrlCalls[0].slice().sort(), ['cloud://demo/consult.png', 'cloud://demo/course.png'])

  // 关键词搜索命中名称、描述与标签
  const byName = await productsList.main({ type: 'virtual', keyword: '一对一' })
  assert.deepStrictEqual(byName.data.products.map((item) => item._id), ['p_consult'])
  const byDescription = await productsList.main({ type: 'virtual', keyword: '整套灯光设计' })
  assert.deepStrictEqual(byDescription.data.products.map((item) => item._id), ['p_https_cover'])
  const byTag = await productsList.main({ type: 'virtual', keyword: '课程' })
  assert.deepStrictEqual(byTag.data.products.map((item) => item._id), ['p_course'])

  // 关键词里的正则元字符要被转义，不能让查询报错
  const specialChars = await productsList.main({ type: 'virtual', keyword: '灯光(' })
  assert.strictEqual(specialChars.success, true)
  assert.strictEqual(specialChars.data.products.length, 0)

  // 分类筛选兼容中文名与历史英文枚举
  const byCategory = await productsList.main({ type: 'virtual', category: '设计服务' })
  assert.deepStrictEqual(byCategory.data.products.map((item) => item._id), ['p_course', 'p_https_cover'])
  const byLegacyCategory = await productsList.main({ type: 'virtual', category: '资料工具' })
  assert.deepStrictEqual(byLegacyCategory.data.products.map((item) => item._id), ['p_consult'])

  // 价格区间筛选生效
  const byPrice = await productsList.main({ type: 'virtual', minPrice: 100, maxPrice: 500 })
  assert.deepStrictEqual(byPrice.data.products.map((item) => item._id), ['p_course'])

  // 分页与排序
  const firstPage = await productsList.main({ type: 'virtual', pageSize: 2, page: 1 })
  assert.deepStrictEqual(firstPage.data.products.map((item) => item._id), ['p_course', 'p_consult'])
  assert.strictEqual(firstPage.data.pagination.totalPages, 2)
  const secondPage = await productsList.main({ type: 'virtual', pageSize: 2, page: 2 })
  assert.deepStrictEqual(secondPage.data.products.map((item) => item._id), ['p_https_cover'])
  const overflowPage = await productsList.main({ type: 'virtual', pageSize: 2, page: 9 })
  assert.deepStrictEqual(overflowPage.data.products, [])

  const priceAsc = await productsList.main({ type: 'virtual', sortBy: 'price', sortOrder: 'asc' })
  assert.deepStrictEqual(priceAsc.data.products.map((item) => item._id), ['p_consult', 'p_course', 'p_https_cover'])

  // pageSize 上限与排序字段白名单
  const cappedPageSize = await productsList.main({ type: 'virtual', pageSize: 9999 })
  assert.strictEqual(cappedPageSize.data.pagination.pageSize, 50)
  const unknownSort = await productsList.main({ type: 'virtual', sortBy: 'dropDatabase' })
  assert.deepStrictEqual(unknownSort.data.products.map((item) => item._id), ['p_course', 'p_consult', 'p_https_cover'])

  // 图片服务异常时降级为原始 fileID，不影响列表返回
  const degradedDb = createDb({ products: PRODUCTS.map((item) => ({ ...item })) })
  const degraded = loadFunction(productsListPath, {
    db: degradedDb,
    async getTempFileURL() { throw new Error('temp url unavailable') }
  })
  const degradedResult = await degraded.main({ type: 'virtual' })
  assert.strictEqual(degradedResult.success, true)
  assert.strictEqual(degradedResult.data.products[0].coverImage, 'cloud://demo/course.png')

  // ========== virtual_categories ==========
  const categoriesDb = createDb({
    virtual_categories: [
      { _id: 'c1', name: ' 设计服务 ', sort: 10, isDelete: 0 },
      { _id: 'c2', name: '设计服务', sort: 20, isDelete: 0 },
      { _id: 'c3', name: '', sort: 30, isDelete: 0 },
      { _id: 'c4', name: '资料工具', sort: 40, isDelete: 0 },
      { _id: 'c5', name: '已删除分类', sort: 50, isDelete: 1 }
    ]
  })
  const categories = loadFunction(categoriesPath, { db: categoriesDb, async getTempFileURL() { return { fileList: [] } } })
  const listed = await categories.main({})
  assert.strictEqual(listed.success, true)
  assert.strictEqual(listed.source, 'database')
  assert.deepStrictEqual(listed.data.categories, ['设计服务', '资料工具'])

  // 集合为空时降级到默认分类，保证商城分类栏可用
  const emptyCategories = loadFunction(categoriesPath, {
    db: createDb({ virtual_categories: [] }),
    async getTempFileURL() { return { fileList: [] } }
  })
  const fallback = await emptyCategories.main({})
  assert.strictEqual(fallback.source, 'default')
  assert(fallback.data.categories.includes('设计服务'))

  console.log('mall backend specs passed')
})().catch((error) => { console.error(error); process.exit(1) })
