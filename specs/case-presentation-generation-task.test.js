const assert = require('assert')
const path = require('path')

const { createGenerationTaskService } = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-generation-task'
))
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

function valueAt(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value && value[key], object)
}

function createMemoryDb(initialDoc) {
  let value = clone(initialDoc)

  function facade() {
    return {
      collection(name) {
        assert.strictEqual(name, 'lighting_cases')
        return {
          limit() {
            return { async get() { return { data: value ? [clone(value)] : [] } } }
          },
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
          },
          where(query) {
            const matches = Object.entries(query).every(([key, expected]) => {
              const actual = valueAt(value, key)
              if (expected && Object.prototype.hasOwnProperty.call(expected, '$lt')) return actual < expected.$lt
              return actual === expected
            })
            return {
              limit() {
                return { async get() { return { data: matches ? [clone(value)] : [] } } }
              }
            }
          }
        }
      }
    }
  }

  const db = facade()
  db.runTransaction = async callback => callback(facade())
  db.snapshot = () => clone(value)
  return db
}

function generatedDraft(caseDoc) {
  const slides = clone(require('./fixtures/case-presentation/three-images.json').slides)
  return {
    revision: 0,
    sourceHash: domain.computeSourceHash(caseDoc),
    generatedAt: 10,
    updatedAt: 10,
    imageAnalyses: [],
    slides,
    generationMeta: { model: 'test', promptVersion: 'v1', warnings: [] }
  }
}

async function run() {
  let clock = 1000
  const db = createMemoryDb(fixture.case)
  const baseService = createPresentationService({ db, now: () => clock })
  const generationService = createPresentationService({
    db,
    now: () => clock,
    generator: {
      async generateDraft(caseDoc) {
        clock += 100
        return { draft: generatedDraft(caseDoc), warnings: ['自动补全 1 幕'] }
      }
    }
  })
  const tasks = createGenerationTaskService({
    db,
    command: { lt: value => ({ $lt: value }) },
    baseService,
    generationService,
    now: () => clock,
    randomId: () => 'task-1'
  })

  const queued = await tasks.enqueue({ caseId: fixture.case._id, force: false, requestedBy: 'admin-1' })
  assert.strictEqual(queued.ok, true)
  assert.strictEqual(queued.data.taskId, 'task-1')
  assert.strictEqual(queued.data.status, 'pending')

  const pending = await tasks.getStatus({ caseId: fixture.case._id, taskId: 'task-1' })
  assert.strictEqual(pending.ok, true)
  assert.strictEqual(pending.data.status, 'pending')

  const processed = await tasks.processNext()
  assert.strictEqual(processed.ok, true)
  assert.strictEqual(processed.data.status, 'succeeded')

  const completed = await tasks.getStatus({ caseId: fixture.case._id, taskId: 'task-1' })
  assert.strictEqual(completed.ok, true)
  assert.strictEqual(completed.data.status, 'succeeded')
  assert.strictEqual(completed.data.draft.revision, 1)
  assert.deepStrictEqual(completed.data.warnings, ['自动补全 1 幕'])

  console.log('case presentation generation task tests passed')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
