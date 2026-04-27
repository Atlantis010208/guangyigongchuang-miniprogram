/**
 * rag.js — 色温知识库检索模块
 *
 * 流程：
 *   1. 从用户参数提取标签（空间/灯具/色温档位）
 *   2. 构造查询文本并调用智谱 embedding-3 生成查询向量
 *   3. 按标签过滤候选切片（≤ 100），候选为空时兜底全量
 *   4. 应用层计算余弦相似度，取 top-k 且 score >= minScore
 *   5. 整体超时 / 异常 / 无 API Key 时直接返回 []（降级）
 */

const COLLECTION = 'color_temp_knowledge'
const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/embeddings'

// 灯具关键词表：用于从用户选的"吸顶灯/筒灯/面板灯"组合里提取单标签
const FIXTURE_KEYWORDS = [
  '吸顶灯', '筒灯', '射灯', '灯带', '吊灯', '壁灯', '落地灯',
  '台灯', '轨道灯', '无主灯', '面板灯', '磁吸灯', '镜前灯', '阅读壁灯'
]

/**
 * 从云函数入参提取标签过滤条件
 * @param {object} params { spaceName, fixtureNames?, suggestedTemp? }
 * @returns {string[]} 去重后的标签列表
 */
function extractTagFilters(params) {
  const { spaceName, fixtureNames = [], suggestedTemp } = params || {}
  const tags = []

  if (spaceName) {
    tags.push(`space:${spaceName}`)
    // 客厅/起居视为"家居整体"的近义空间
    if (/客厅|起居/.test(spaceName)) tags.push('space:家居整体')
  }

  const fxs = Array.isArray(fixtureNames) ? fixtureNames : [fixtureNames].filter(Boolean)
  for (const name of fxs) {
    if (!name) continue
    for (const kw of FIXTURE_KEYWORDS) {
      if (name.includes(kw)) tags.push(`fixture:${kw}`)
    }
  }

  if (suggestedTemp) {
    const t = String(suggestedTemp)
    tags.push(/[Kk]/.test(t) ? `temp:${t}` : `temp:${t}K`)
  }

  return Array.from(new Set(tags))
}

/**
 * 构造查询文本（供 embedding 用）
 */
function buildQueryText(params) {
  const { spaceName, ageName, usageName, fixtureNames = [], suggestedTemp } = params || {}
  const parts = []
  if (spaceName) parts.push(`空间：${spaceName}`)
  if (usageName) parts.push(`用途：${usageName}`)
  if (ageName) parts.push(`人群：${ageName}`)
  if (fixtureNames && fixtureNames.length > 0) parts.push(`灯具：${fixtureNames.join('、')}`)
  if (suggestedTemp) {
    const t = String(suggestedTemp)
    parts.push(/[Kk]/.test(t) ? `色温：${t}` : `色温：${t}K`)
  }
  return parts.join('，') || '色温选择建议'
}

/**
 * 调用智谱 embedding-3 为单条查询生成向量
 */
async function embedQuery(text, apiKey) {
  const res = await fetch(ZHIPU_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'embedding-3', input: [text], dimensions: 1024 })
  })
  const raw = await res.text()
  let json
  try { json = JSON.parse(raw) } catch {
    throw new Error(`embed resp not JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`)
  }
  if (!res.ok || !json.data) {
    const msg = json.error?.message || json.msg || raw.slice(0, 120)
    throw new Error(`embed failed (HTTP ${res.status}): ${msg}`)
  }
  return json.data[0].embedding
}

/**
 * 拉取候选切片（带标签过滤）
 */
async function fetchCandidates(db, tags, limit = 100) {
  const _ = db.command
  const coll = db.collection(COLLECTION)
  if (!tags || tags.length === 0) {
    const { data } = await coll.limit(limit).get()
    return data || []
  }
  const { data } = await coll.where({ tags: _.in(tags) }).limit(limit).get()
  return data || []
}

/** 余弦相似度 */
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

/**
 * RAG 检索主入口
 * @param {object} db     云函数内 tcb.init().database() 实例
 * @param {object} params 云函数入参（spaceName / fixtureNames / suggestedTemp 等）
 * @param {string} apiKey 智谱 API Key
 * @param {object} options { topK=3, minScore=0.3, timeoutMs=2000 }
 * @returns {Promise<Array>} 命中切片（失败或空时返回 []）
 */
async function retrieve(db, params, apiKey, options = {}) {
  const { topK = 3, minScore = 0.3, timeoutMs = 2000 } = options

  if (!apiKey) {
    console.log('[RAG] 未配置 ZHIPU_API_KEY，跳过检索（降级）')
    return []
  }

  const tags = extractTagFilters(params)
  const queryText = buildQueryText(params)
  console.log(`[RAG] 标签过滤: ${JSON.stringify(tags)}`)
  console.log(`[RAG] 查询文本: ${queryText}`)

  const startedAt = Date.now()

  const task = (async () => {
    // 并行：生成查询向量 + 按标签拉候选
    const [queryVec, initialCandidates] = await Promise.all([
      embedQuery(queryText, apiKey),
      fetchCandidates(db, tags)
    ])
    console.log(`[RAG] 候选 ${initialCandidates.length} 条（embed 耗时 ${Date.now() - startedAt}ms）`)

    let pool = initialCandidates
    if (pool.length === 0) {
      pool = await fetchCandidates(db, [])
      console.log(`[RAG] 兜底全量拉取 ${pool.length} 条`)
    }

    const scored = pool
      .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
      .map(c => ({ item: c, score: cosine(queryVec, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .filter(x => x.score >= minScore)
      .slice(0, topK)

    console.log(`[RAG] 命中 top-${scored.length} score: ${scored.map(x => x.score.toFixed(3)).join(', ')}`)

    return scored.map(x => ({
      docId: x.item.docId,
      title: x.item.title,
      text: x.item.text,
      score: Number(x.score.toFixed(4)),
      tags: x.item.tags || [],
      chunkIndex: x.item.chunkIndex
    }))
  })()

  const timer = new Promise(resolve => setTimeout(() => resolve('__TIMEOUT__'), timeoutMs))

  try {
    const result = await Promise.race([task, timer])
    if (result === '__TIMEOUT__') {
      console.warn(`[RAG] 超时 ${timeoutMs}ms，降级返回空`)
      return []
    }
    return result
  } catch (err) {
    console.warn(`[RAG] 检索异常，降级: ${err.message}`)
    return []
  }
}

module.exports = { retrieve, extractTagFilters, buildQueryText, cosine, COLLECTION }
