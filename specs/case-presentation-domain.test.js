const assert = require('assert')
const path = require('path')

const domain = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-domain'
))

function fixture(name) {
  return require(path.join(__dirname, 'fixtures', 'case-presentation', `${name}.json`))
}

function draftFromFixture(data, overrides = {}) {
  return {
    revision: 1,
    sourceHash: domain.computeSourceHash(data.case),
    generatedAt: 1,
    updatedAt: 1,
    imageAnalyses: [],
    slides: data.slides,
    generationMeta: { model: 'fixture', promptVersion: 'test', warnings: [] },
    ...overrides
  }
}

function run() {
  const three = fixture('three-images')
  const five = fixture('five-images')
  const nine = fixture('nine-images')

  assert.deepStrictEqual(
    [2, 3, 4, 5, 6, 9].map(domain.getTargetSlideCount),
    [0, 5, 6, 7, 7, 10]
  )

  const reorderedSource = {
    desc: three.case.desc,
    services: three.case.services,
    spaceType: three.case.spaceType,
    city: three.case.city,
    title: ` ${three.case.title} `,
    imageFileIds: three.case.imageFileIds
  }
  assert.strictEqual(domain.computeSourceHash(three.case), domain.computeSourceHash(reorderedSource))
  assert.notStrictEqual(domain.computeSourceHash(three.case), domain.computeSourceHash({ ...three.case, title: '新标题' }))

  assert.deepStrictEqual(domain.validateDraft(draftFromFixture(three), three.case), [])
  assert.deepStrictEqual(domain.validateDraft(draftFromFixture(five), five.case), [])
  assert.deepStrictEqual(domain.validateDraft(draftFromFixture(nine), nine.case), [])

  const published = {
    ...draftFromFixture(three),
    version: 1,
    sourceDraftRevision: 1,
    publishedAt: 2
  }
  const currentCase = {
    ...three.case,
    presentation: {
      currentSourceHash: domain.computeSourceHash(three.case),
      draft: draftFromFixture(three),
      published
    }
  }
  assert.strictEqual(domain.derivePresentationStatus({ ...three.case }), 'none')
  assert.strictEqual(domain.derivePresentationStatus({ ...three.case, presentation: { draft: draftFromFixture(three) } }), 'draft')
  assert.strictEqual(domain.derivePresentationStatus(currentCase), 'published')
  assert.strictEqual(domain.derivePresentationStatus({ ...currentCase, title: '源内容变化', presentation: { ...currentCase.presentation, currentSourceHash: domain.computeSourceHash({ ...three.case, title: '源内容变化' }) } }), 'stale')
  assert.strictEqual(domain.derivePresentationStatus({ ...currentCase, presentation: { ...currentCase.presentation, draft: { ...currentCase.presentation.draft, revision: 2 } } }), 'draft')

  const foreignImageDraft = draftFromFixture(three)
  foreignImageDraft.slides = JSON.parse(JSON.stringify(three.slides))
  foreignImageDraft.slides[1].imageFileIds = ['cloud://foreign/image.jpg']
  foreignImageDraft.slides[1].imageFocals = { 'cloud://foreign/image.jpg': { x: 0.5, y: 0.5 } }
  assert(domain.validateDraft(foreignImageDraft, three.case).some(issue => issue.code === 'FOREIGN_IMAGE'))

  const oversizedDraft = draftFromFixture(three)
  oversizedDraft.slides = JSON.parse(JSON.stringify(three.slides))
  oversizedDraft.slides[1].body = '长'.repeat(domain.BODY_MAX + 1)
  assert(domain.validateDraft(oversizedDraft, three.case).some(issue => issue.code === 'TEXT_TOO_LONG'))

  const invalidFocalDraft = draftFromFixture(three)
  invalidFocalDraft.slides = JSON.parse(JSON.stringify(three.slides))
  invalidFocalDraft.slides[2].imageFocals['cloud://case/three-03.jpg'] = { x: 1.2, y: 0.4 }
  assert(domain.validateDraft(invalidFocalDraft, three.case).some(issue => issue.code === 'INVALID_FOCAL'))

  const repeatedDraft = draftFromFixture(three)
  repeatedDraft.slides = JSON.parse(JSON.stringify(three.slides))
  repeatedDraft.slides[2].imageFileIds = repeatedDraft.slides[1].imageFileIds.slice()
  repeatedDraft.slides[2].imageFocals = { [repeatedDraft.slides[2].imageFileIds[0]]: { x: 0.5, y: 0.5 } }
  assert(domain.validateDraft(repeatedDraft, three.case).some(issue => issue.code === 'ADJACENT_REPEAT'))

  assert.deepStrictEqual(domain.parseAiJson('```json\n{"ok":true}\n```'), { ok: true })
  assert.throws(() => domain.parseAiJson('not-json'))

  const sanitized = domain.sanitizeSlide({
    id: 'unsafe',
    type: 'strategy',
    layout: 'cover-full',
    imageFileIds: [three.case.imageFileIds[0]],
    imageFocals: { [three.case.imageFileIds[0]]: { x: 9, y: -2 } },
    unknown: 'drop-me'
  })
  assert.strictEqual(sanitized.layout, 'strategy-image70')
  assert.deepStrictEqual(sanitized.imageFocals[three.case.imageFileIds[0]], { x: 1, y: 0 })
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'unknown'), false)

  console.log('case-presentation-domain tests passed')
}

run()

