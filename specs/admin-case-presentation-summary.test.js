const assert = require('assert')
const path = require('path')

const summary = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_cases',
  'presentation-summary'
))
const domain = require(path.join(
  __dirname,
  '..',
  'cloudfunctions',
  'admin_case_presentation',
  'presentation-domain'
))
const fixture = require('./fixtures/case-presentation/three-images.json')

function run() {
  assert.strictEqual(summary.computeSourceHash(fixture.case), domain.computeSourceHash(fixture.case))

  const shell = summary.createPresentationShell(fixture.case)
  assert.strictEqual(shell.schemaVersion, 1)
  assert.strictEqual(shell.theme, 'dark-gallery-v1')
  assert.strictEqual(shell.currentSourceHash, summary.computeSourceHash(fixture.case))

  const draft = { revision: 2, sourceHash: shell.currentSourceHash }
  const published = {
    version: 1,
    sourceDraftRevision: 1,
    sourceHash: shell.currentSourceHash,
    publishedAt: 100
  }
  const caseDoc = {
    ...fixture.case,
    presentation: { ...shell, draft, published }
  }
  assert.strictEqual(summary.derivePresentationStatus(caseDoc), 'draft')

  const listed = summary.mapCaseForAdminList(caseDoc)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(listed, 'presentation'), false)
  assert.deepStrictEqual(listed.presentationSummary, {
    status: 'draft',
    hasDraft: true,
    hasPublishedVersion: true,
    hasUnpublishedDraft: true,
    draftRevision: 2,
    publishedVersion: 1,
    publishedAt: 100
  })

  const changed = {
    ...fixture.case,
    title: '内容已经变化',
    presentation: summary.createPresentationShell({ ...fixture.case, title: '内容已经变化' }, caseDoc.presentation)
  }
  assert.strictEqual(summary.derivePresentationStatus(changed), 'stale')
  assert.strictEqual(changed.presentation.published.version, 1)
  assert.strictEqual(changed.presentation.draft.revision, 2)

  console.log('admin case presentation summary tests passed')
}

run()

