const assert = require('assert')

let definition
let toastTitle = ''
global.wx = { showToast({ title }) { toastTitle = title } }
global.Component = (componentDefinition) => { definition = componentDefinition }

require('../components/form-question-renderer/form-question-renderer')

const context = {
  data: JSON.parse(JSON.stringify(definition.data)),
  setData(patch) { Object.assign(this.data, patch) },
}
context.buildTableRenderedRows = definition.methods.buildTableRenderedRows.bind(context)
const refresh = definition.observers['question, answer'].bind(context)

refresh({ type: 'longText', validation: { maxLength: 300 } }, '灯光需求')
assert.strictEqual(context.data.answerLength, 4)
assert.strictEqual(context.data.maxLength, 300)

refresh({ type: 'shortText' }, '')
assert.strictEqual(context.data.answerLength, 0)
assert.strictEqual(context.data.maxLength, 140)

let locationTriggered = false
const locationContext = { triggerEvent(name) { if (name === 'location') locationTriggered = true } }
definition.methods.onLocationTap.call(locationContext)
assert.strictEqual(locationTriggered, true)
const tableQuestion = { type: 'table', table: { minRows: 1, maxRows: 2, columns: [{ id: 'name', label: '姓名', type: 'shortText' }] } }
refresh(tableQuestion, null)
assert.deepStrictEqual(context.data.tableRows, [{}])
let tableAnswer
const tableContext = {
  data: { question: tableQuestion, tableRows: [{}] },
  emitChange(value) { tableAnswer = value },
}
tableContext.updateTableCell = definition.methods.updateTableCell.bind(tableContext)
definition.methods.onTableCellInput.call(tableContext, { currentTarget: { dataset: { rowIndex: 0, columnId: 'name' } }, detail: { value: '张三' } })
assert.deepStrictEqual(tableAnswer, [{ name: '张三' }])
const choiceQuestion = { type: 'table', table: { columns: [{ id: 'relation', type: 'single', options: [{ id: 'family', label: '家人' }, { id: 'friend', label: '朋友' }] }, { id: 'needs', type: 'multiple', validation: { maxSelections: 2 }, options: [{ id: 'comfort', label: '舒适' }, { id: 'budget', label: '预算' }] }] } }
tableContext.data.question = choiceQuestion
tableContext.data.tableRows = [{}]
tableContext.normalizeOptionId = definition.methods.normalizeOptionId.bind(tableContext)
definition.methods.onTableOptionTap.call(tableContext, { currentTarget: { dataset: { rowIndex: 0, columnId: 'relation', optionId: 'family' } } })
assert.deepStrictEqual(tableAnswer, [{ relation: 'family' }])
tableContext.data.tableRows = tableAnswer
definition.methods.onTableOptionTap.call(tableContext, { currentTarget: { dataset: { rowIndex: 0, columnId: 'needs', optionId: '舒适' } } })
assert.deepStrictEqual(tableAnswer, [{ relation: 'family', needs: ['comfort'] }])
let choiceAnswer
const optionContext = {
  data: {
    question: { type: 'multiple', options: [{ id: 'soft', label: '柔和放松' }, { id: 'clean', label: '干净清爽' }] },
    answer: [],
  },
  triggerEvent(name, detail) { choiceAnswer = { name, detail } },
}
for (const key of ['choiceState', 'choiceAnswer', 'normalizeOptionId', 'emitChange']) {
  optionContext[key] = definition.methods[key].bind(optionContext)
}
definition.methods.onOptionTap.call(optionContext, { currentTarget: { dataset: { id: '柔和放松' } } })
assert.deepStrictEqual(choiceAnswer, { name: 'change', detail: { value: ['soft'], confirmed: false } })
tableContext.data.question = tableQuestion
tableAnswer = [{ name: '张三' }]
tableContext.data.tableRows = tableAnswer
definition.methods.onAddTableRow.call(tableContext)
assert.deepStrictEqual(tableAnswer, [{ name: '张三' }, {}])
const cappedRows = Array.from({ length: 100 }, () => ({}))
const cappedContext = { data: { question: { type: 'table', table: {} }, tableRows: cappedRows, tableMaxRows: 100 }, emitChange() { throw new Error('超过上限时不应新增行') } }
definition.methods.onAddTableRow.call(cappedContext)
assert.strictEqual(toastTitle, '最多添加 100 行')
console.log('form-question-renderer tests passed')
