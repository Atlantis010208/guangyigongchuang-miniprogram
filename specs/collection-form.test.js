const assert = require('assert')
const fs = require('fs')

global.Page = (definition) => { global.collectionFormPage = definition }

const {
  getVisibleQuestions,
  isVisible,
  validateQuestion,
} = require('../pages/flows/collection-form/collection-form')
const { getFormTemplate } = require('../pages/flows/collection-form/form-template')

const form = getFormTemplate('residential')

assert.deepStrictEqual(form.modules.map((module) => module.questions.length), [4, 5, 6, 5])
assert.deepStrictEqual(
  new Set(form.modules.flatMap((module) => module.questions.map((question) => question.type))),
  new Set(['single', 'multiple', 'shortText', 'longText', 'number', 'upload', 'ranking'])
)

assert.strictEqual(isVisible(
  { visibleWhen: { questionId: 'source', operator: 'equals', value: 'yes' } },
  { source: 'yes' }
), true)
assert.strictEqual(isVisible(
  { visibleWhen: { questionId: 'source', operator: 'includes', value: 'night' } },
  { source: ['night', 'reading'] }
), true)

const specialQuestions = getVisibleQuestions(form.modules[2], { c1_elderly: 'no' })
assert.strictEqual(specialQuestions.some((question) => question.code === 'C2'), false)

const redlineQuestion = form.modules[1].questions.find((question) => question.code === 'B2')
assert.strictEqual(validateQuestion(redlineQuestion, ['glare', 'flat', 'waste', 'complex']), '最多选择 3 项')

const areaQuestion = form.modules[0].questions.find((question) => question.code === 'A3')
assert.notStrictEqual(validateQuestion(areaQuestion, '0'), '')
assert.strictEqual(validateQuestion(areaQuestion, '168'), '')

const rankingQuestion = form.modules[1].questions.find((question) => question.code === 'B3')
assert.notStrictEqual(validateQuestion(rankingQuestion, rankingQuestion.options.slice(0, 3).map((item) => item.id)), '')
assert.strictEqual(validateQuestion(rankingQuestion, rankingQuestion.options.map((item) => item.id)), '')

const uploadQuestion = form.modules[2].questions.find((question) => question.code === 'C5')
assert.strictEqual(validateQuestion(uploadQuestion, [{ tempPath: 'expired', valid: false }]), '')

const typePageSource = fs.readFileSync('pages/flows/collection-type/collection-type.js', 'utf8')
assert.match(typePageSource, /collection-form\?spaceType=\$\{selected\.id\}/)

console.log('collection-form tests passed')
