const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'cloudfunctions', 'lighting_cases_list', 'index.js')
const source = fs.readFileSync(sourcePath, 'utf8')
const fixture = require('./fixtures/case-presentation/three-images.json')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function publishedFromFixture() {
  const slides = clone(fixture.slides)
  slides[1].title = '线上理念标题'
  return { version: 2, sourceDraftRevision: 3, sourceHash: 'published-hash', publishedAt: 10, slides }
}

function draftFromFixture() {
  const slides = clone(fixture.slides)
  slides[1].title = '草稿机密标题'
  return { revision: 4, sourceHash: 'draft-hash', slides, imageAnalyses: [{ description: '不应公开的 AI 原始分析' }] }
}

function loadFunction({ active = true, expiresAt = Date.now() + 60000 } = {}) {
  const token = 'p_preview-token'
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const caseDoc = {
    ...clone(fixture.case),
    status: active ? 'active' : 'inactive',
    presentation: {
      theme: 'dark-gallery-v1',
      draft: draftFromFixture(),
      published: publishedFromFixture()
    }
  }
  const tokenRecord = {
    _id: 'preview-1',
    tokenHash,
    caseId: caseDoc._id,
    draftRevision: 4,
    expiresAt
  }

  function collection(name) {
    if (name === 'lighting_cases') {
      const query = {
        _docId: '',
        where() { return query },
        orderBy() { return query },
        limit() { return query },
        doc(id) { query._docId = id; return query },
        async get() {
          if (query._docId) return { data: query._docId === caseDoc._id ? clone(caseDoc) : null }
          return { data: [clone(caseDoc)] }
        },
        async update() { return { stats: { updated: 1 } } }
      }
      return query
    }
    if (name === 'case_presentation_preview_tokens') {
      const query = {
        _docId: '',
        where(condition) { query._condition = condition; return query },
        limit() { return query },
        doc(id) { query._docId = id; return query },
        async get() {
          return { data: query._condition && query._condition.tokenHash === tokenHash ? [clone(tokenRecord)] : [] }
        },
        async update() { return { stats: { updated: 1 } } }
      }
      return query
    }
    throw new Error(name)
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => ({ collection }),
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: `https://temp.example/${encodeURIComponent(fileID)}` }))
    })
  }
  const context = {
    require(name) {
      if (name === 'wx-server-sdk') return cloud
      if (name === 'crypto') return crypto
      if (name === './country-geography') {
        return require(path.join(root, 'cloudfunctions', 'lighting_cases_list', 'country-geography.js'))
      }
      throw new Error(name)
    },
    exports: {},
    console,
    Date,
    Map,
    Set,
    Promise
  }
  vm.runInNewContext(source, context, { filename: sourcePath })
  return { main: context.exports.main, token }
}

async function run() {
  const { main, token } = loadFunction()
  const detail = await main({ action: 'detail', id: fixture.case._id })
  assert.strictEqual(detail.success, true)
  assert.strictEqual(detail.data.item.presentationAvailable, true)

  const published = await main({ action: 'presentation', id: fixture.case._id })
  assert.strictEqual(published.success, true)
  assert.strictEqual(published.data.version, 2)
  assert.strictEqual(published.data.preview, false)
  assert.strictEqual(published.data.slides[1].title, '线上理念标题')
  const publicJson = JSON.stringify(published)
  assert.strictEqual(publicJson.includes('草稿机密标题'), false)
  assert.strictEqual(publicJson.includes('不应公开的 AI 原始分析'), false)
  assert.strictEqual(published.data.slides[0].imageUrls[0].startsWith('https://temp.example/'), true)

  const preview = await main({ action: 'presentationPreview', token })
  assert.strictEqual(preview.success, true)
  assert.strictEqual(preview.data.preview, true)
  assert.strictEqual(preview.data.draftRevision, 4)
  assert.strictEqual(preview.data.slides[1].title, '草稿机密标题')
  assert.strictEqual(JSON.stringify(preview).includes('不应公开的 AI 原始分析'), false)

  const expiredLoader = loadFunction({ expiresAt: Date.now() - 1 })
  const expired = await expiredLoader.main({ action: 'presentationPreview', token: expiredLoader.token })
  assert.strictEqual(expired.code, 'PREVIEW_EXPIRED')

  const inactiveLoader = loadFunction({ active: false })
  const inactive = await inactiveLoader.main({ action: 'presentation', id: fixture.case._id })
  assert.strictEqual(inactive.code, 'NOT_FOUND')

  console.log('case presentation public boundary tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})

