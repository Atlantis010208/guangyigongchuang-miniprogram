const assert = require('assert')
const path = require('path')
const Module = require('module')

const functionPath = path.resolve(__dirname, '..', 'cloudfunctions', 'collection_form_public', 'index.js')

function createDb() {
  const collections = new Map()
  const ensure = (name) => {
    if (!collections.has(name)) collections.set(name, new Map())
    return collections.get(name)
  }
  function api(name) {
    const store = ensure(name)
    return {
      doc(id) {
        return {
          async get() { return { data: store.get(id) || null } },
          async set({ data }) { store.set(id, { _id: id, ...data }); return {} },
          async update({ data }) { store.set(id, { ...(store.get(id) || { _id: id }), ...data }); return {} },
          async remove() { store.delete(id); return {} },
        }
      },
      where(query) {
        return {
          orderBy() { return this },
          limit(n) {
            return {
              async get() {
                const rows = [...store.entries()].map(([id, value]) => ({ _id: id, ...value }))
                  .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))
                  .slice(0, n)
                return { data: rows }
              },
            }
          },
        }
      },
    }
  }
  return {
    collections,
    collection: api,
    async runTransaction(fn) { return fn({ collection: api }) },
  }
}

const db = createDb()
const mockCloud = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return db },
  getWXContext() { return { OPENID: 'openid-test' } },
}
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return mockCloud
  return originalLoad.call(this, request, parent, isMain)
}
const fn = require(functionPath)
Module._load = originalLoad

assert.strictEqual(fn.__private__.PDF_RENDER_VERSION, 6)

;(async () => {
  const published = await fn.main({ action: 'getPublished', spaceType: 'residential' })
  assert.strictEqual(published.success, true)
  assert.strictEqual(published.data.template.source, 'builtin')
  assert.match(published.data.template.versionId, /^collection_form_fallback_residential_v1$/)

  const template = published.data.template
  const answers = {}
  template.modules.forEach((module) => module.questions.forEach((question) => {
    if (!question.required) return
    if (question.code === 'C1' || question.code === 'C3') answers[question.id] = 'no'
    else if (question.code === 'D1') answers[question.id] = 'switch'
    else if (question.type === 'single') answers[question.id] = question.options[0].id
    else if (question.type === 'multiple') answers[question.id] = question.options.slice(0, question.validation && question.validation.minSelections || 1).map((option) => option.id)
    else if (question.type === 'ranking') answers[question.id] = question.options.map((option) => option.id)
    else if (question.type === 'number') answers[question.id] = String(Math.max(10, question.validation && question.validation.min || 0))
    else if (question.type === 'location') answers[question.id] = { name: '????', address: '???', latitude: 22.5431, longitude: 114.0579 }
    else answers[question.id] = '??????'
  }))

  const draft = await fn.main({
    action: 'saveDraft',
    spaceType: 'residential',
    versionId: published.data.template.versionId,
    requestId: 'cfr_test_1234567890',
    answers: { a1_project_name: '测试住宅灯光' },
    position: { view: 'question', moduleIndex: 0, questionIndex: 1 },
  })
  assert.strictEqual(draft.success, true)
  const loadedDraft = await fn.main({ action: 'getDraft', spaceType: 'residential', versionId: published.data.template.versionId })
  assert.strictEqual(loadedDraft.success, true)
  assert.strictEqual(loadedDraft.data.draft.answers.a1_project_name, '测试住宅灯光')
  assert.deepStrictEqual(loadedDraft.data.draft.position, { view: 'question', moduleIndex: 0, questionIndex: 1 })

  const submitted = await fn.main({
    action: 'submit',
    spaceType: 'residential',
    versionId: published.data.template.versionId,
    requestId: 'cfr_test_1234567890',
    answers,
  })
  assert.strictEqual(submitted.success, true)
  assert.strictEqual(submitted.data.duplicate, false)
  assert.match(submitted.data.id, /^cfs_[a-f0-9]{32}$/)

  const pdfStatus = await fn.main({ action: 'getPdfStatus', id: submitted.data.id })
  assert.strictEqual(pdfStatus.success, true)
  assert.strictEqual(pdfStatus.data.submission.pdfStatus, 'pending')

  const requestedPdf = await fn.main({ action: 'requestPdf', id: submitted.data.id })
  assert.strictEqual(requestedPdf.success, true)
  assert.strictEqual(requestedPdf.data.submission.pdfStatus, 'pending')

  const duplicate = await fn.main({
    action: 'submit',
    spaceType: 'residential',
    versionId: published.data.template.versionId,
    requestId: 'cfr_test_1234567890',
    answers,
  })
  assert.strictEqual(duplicate.success, true)
  assert.strictEqual(duplicate.data.duplicate, true)

  const afterSubmitDraft = await fn.main({ action: 'getDraft', spaceType: 'residential', versionId: published.data.template.versionId })
  assert.strictEqual(afterSubmitDraft.data.draft, null)

  const listed = await fn.main({ action: 'listSubmissions' })
  assert.strictEqual(listed.success, true)
  assert.strictEqual(listed.data.submissions.length, 1)

  console.log('collection_form_public backend tests passed')
})().catch((error) => { console.error(error); process.exit(1) })
