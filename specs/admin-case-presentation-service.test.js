const assert = require('assert')
const path = require('path')

const { createPresentationService } = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-service'
))
const domain = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-domain'
))
const fixture = require('./fixtures/case-presentation/three-images.json')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createMemoryDb(initialDoc) {
  let value = clone(initialDoc)

  function databaseFacade() {
    return {
      collection() {
        return {
          doc(id) {
            return {
              async get() {
                if (!value || value._id !== id) throw new Error('not found')
                return { data: clone(value) }
              },
              async update({ data }) {
                if (!value || value._id !== id) return { stats: { updated: 0 } }
                value = { ...value, ...clone(data) }
                return { stats: { updated: 1 } }
              }
            }
          }
        }
      }
    }
  }

  const db = databaseFacade()
  db.runTransaction = async callback => callback(databaseFacade())
  db.snapshot = () => clone(value)
  return db
}

function draftFor(caseDoc) {
  return {
    revision: 0,
    sourceHash: domain.computeSourceHash(caseDoc),
    generatedAt: 10,
    updatedAt: 10,
    imageAnalyses: [],
    slides: clone(fixture.slides),
    generationMeta: { model: 'test', promptVersion: 'v1', warnings: [] }
  }
}

async function run() {
  const db = createMemoryDb(fixture.case)
  const service = createPresentationService({ db, now: () => 100 })

  const before = await service.getPresentation(fixture.case._id)
  assert.strictEqual(before.ok, true)
  assert.strictEqual(before.data.presentationSummary.status, 'none')

  const saved = await service.saveDraft({
    caseId: fixture.case._id,
    draft: draftFor(fixture.case),
    expectedRevision: 0
  })
  assert.strictEqual(saved.ok, true)
  assert.strictEqual(saved.data.draft.revision, 1)
  assert.strictEqual(db.snapshot().presentation.published, undefined)

  const conflict = await service.saveDraft({
    caseId: fixture.case._id,
    draft: saved.data.draft,
    expectedRevision: 0
  })
  assert.strictEqual(conflict.code, 'DRAFT_CONFLICT')

  const published = await service.publish({ caseId: fixture.case._id, expectedRevision: 1 })
  assert.strictEqual(published.ok, true)
  assert.strictEqual(published.data.version, 1)
  assert.strictEqual(published.data.presentationSummary.status, 'published')
  const onlineBeforeFailure = clone(db.snapshot().presentation.published)

  const draftWithForeignImage = clone(db.snapshot().presentation.draft)
  draftWithForeignImage.slides[1].imageFileIds = ['cloud://foreign.jpg']
  draftWithForeignImage.slides[1].imageFocals = { 'cloud://foreign.jpg': { x: 0.5, y: 0.5 } }
  const invalidSave = await service.saveDraft({
    caseId: fixture.case._id,
    draft: draftWithForeignImage,
    expectedRevision: 1
  })
  assert.strictEqual(invalidSave.code, 'VALIDATION_FAILED')
  assert.deepStrictEqual(db.snapshot().presentation.published, onlineBeforeFailure)

  const staleDb = createMemoryDb({
    ...db.snapshot(),
    title: '案例资料变化后',
    presentation: db.snapshot().presentation
  })
  const staleService = createPresentationService({ db: staleDb, now: () => 200 })
  const stalePublish = await staleService.publish({ caseId: fixture.case._id, expectedRevision: 1 })
  assert.strictEqual(stalePublish.code, 'VALIDATION_FAILED')
  assert(stalePublish.data.issues.some(issue => issue.code === 'SOURCE_CHANGED'))
  assert.deepStrictEqual(staleDb.snapshot().presentation.published, onlineBeforeFailure)

  const generatedDb = createMemoryDb(fixture.case)
  const generatedDraft = draftFor(fixture.case)
  const generator = {
    async generateDraft() {
      return { draft: generatedDraft, warnings: ['mock warning'] }
    }
  }
  const generatedService = createPresentationService({ db: generatedDb, now: () => 300, generator })
  const generated = await generatedService.generate({ caseId: fixture.case._id })
  assert.strictEqual(generated.ok, true)
  assert.strictEqual(generated.data.draft.revision, 1)
  assert.deepStrictEqual(generated.data.warnings, ['mock warning'])
  const requiresConfirmation = await generatedService.generate({ caseId: fixture.case._id })
  assert.strictEqual(requiresConfirmation.code, 'DRAFT_EXISTS_CONFIRM_REQUIRED')

  const failedDb = createMemoryDb(fixture.case)
  const failedService = createPresentationService({
    db: failedDb,
    generator: { async generateDraft() { throw Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' }) } }
  })
  const failedGeneration = await failedService.generate({ caseId: fixture.case._id })
  assert.strictEqual(failedGeneration.code, 'AI_TIMEOUT')
  assert.strictEqual(failedDb.snapshot().presentation, undefined)

  console.log('admin case presentation service tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
