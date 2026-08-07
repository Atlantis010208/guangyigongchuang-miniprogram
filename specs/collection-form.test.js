const assert = require('assert')
const fs = require('fs')

global.Page = (definition) => { global.collectionFormPage = definition }

const {
  getVisibleQuestions,
  isVisible,
  validateQuestion,
  getModuleTagTitle,
} = require('../pages/flows/collection-form/collection-form')
const { getFormTemplate } = require('../pages/flows/collection-form/form-template')

const form = getFormTemplate('residential')

assert.strictEqual(getModuleTagTitle({ code: 'A', title: '空间愿景与长期生活状态' }), '长期生活状态')
assert.strictEqual(getModuleTagTitle({ code: 'B', title: '基础信息与家庭结构' }), '家庭结构')
assert.strictEqual(getModuleTagTitle({ code: 'C', title: '装修、施工与资料条件' }), '施工与资料')
assert.strictEqual(getModuleTagTitle({ code: 'D', title: '风格、亮度与灯光感受' }), '灯光感受')
assert.strictEqual(getModuleTagTitle({ code: 'E', title: '时间线、重点空间与生活场景' }), '重点空间场景')
assert.strictEqual(getModuleTagTitle({ code: 'F', title: '柜体、展示、智能与预算' }), '智能与预算')
assert.strictEqual(getModuleTagTitle({ code: 'A', title: '项目概况' }), '项目概况')
assert.strictEqual(getModuleTagTitle({ code: 'A', title: '项目概况', tagTitle: '自定义标题' }), '自定义标题')

assert.deepStrictEqual(form.modules.map((module) => module.questions.length), [4, 5, 6, 5])
assert.deepStrictEqual(
  new Set(form.modules.flatMap((module) => module.questions.map((question) => question.type))),
  new Set(['single', 'multiple', 'shortText', 'longText', 'number', 'location', 'upload', 'ranking'])
)
const multipleQuestions = form.modules.flatMap((module) => module.questions).filter((question) => question.type === 'multiple')
assert(multipleQuestions.every((question) => question.validation.minSelections === 2))
assert(multipleQuestions.every((question) => question.validation.maxSelections === undefined))

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
assert.strictEqual(validateQuestion(redlineQuestion, ['glare']), '请至少选择 2 项')
assert.strictEqual(validateQuestion(redlineQuestion, ['glare', 'flat', 'waste', 'complex']), '')

const locationQuestion = form.modules[0].questions.find((question) => question.code === 'A2')
assert.strictEqual(validateQuestion(locationQuestion, { name: '项目位置', address: '深圳市', latitude: 22.5431, longitude: 114.0579 }), '')
assert.strictEqual(validateQuestion(locationQuestion, { name: '无效位置', latitude: 200, longitude: 114.0579 }), '请选择有效位置')
const areaQuestion = form.modules[0].questions.find((question) => question.code === 'A3')
assert.notStrictEqual(validateQuestion(areaQuestion, '0'), '')
assert.strictEqual(validateQuestion(areaQuestion, '168'), '')

const rankingQuestion = form.modules[1].questions.find((question) => question.code === 'B3')
assert.notStrictEqual(validateQuestion(rankingQuestion, rankingQuestion.options.slice(0, 3).map((item) => item.id)), '')
assert.strictEqual(validateQuestion(rankingQuestion, rankingQuestion.options.map((item) => item.id)), '')

const tableQuestion = {
  id: 'table_demo', type: 'table', required: true,
  table: { minRows: 1, maxRows: 3, columns: [
    { id: 'name', label: '姓名', type: 'shortText', required: true },
    { id: 'age', label: '年龄', type: 'number', required: true },
    { id: 'relation', label: '关系', type: 'single', required: true, options: [{ id: 'family', label: '家人' }] },
    { id: 'needs', label: '需求', type: 'multiple', required: true, options: [{ id: 'comfort', label: '舒适' }, { id: 'budget', label: '预算' }], validation: { minSelections: 1, maxSelections: 2 } },
  ] },
}
assert.strictEqual(validateQuestion(tableQuestion, [{ name: '张三', age: '30', relation: 'family', needs: ['comfort'] }]), '')
assert.strictEqual(validateQuestion(tableQuestion, [{ name: '张三', age: '', relation: 'family', needs: ['comfort'] }]), '请填写第 1 行的年龄')
assert.strictEqual(validateQuestion(tableQuestion, [{ name: '张三', age: '三十', relation: 'family', needs: ['comfort'] }]), '第 1 行的年龄须为数字')
assert.strictEqual(validateQuestion(tableQuestion, [{ name: '张三', age: 30, relation: 'unknown', needs: ['comfort'] }]), '第 1 行的关系请选择有效选项')
const uploadQuestion = form.modules[2].questions.find((question) => question.code === 'C5')
assert.strictEqual(validateQuestion(uploadQuestion, [{ tempPath: 'expired', valid: false }]), '')

const typePageSource = fs.readFileSync('pages/flows/collection-type/collection-type.js', 'utf8')
assert.match(typePageSource, /collection-form\?spaceType=\$\{selected\.id\}/)

console.log('collection-form tests passed')
