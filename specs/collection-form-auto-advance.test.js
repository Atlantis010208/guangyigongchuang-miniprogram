const assert = require('assert')
const fs = require('fs')

let componentDefinition
global.Component = (definition) => { componentDefinition = definition }
require('../components/form-question-renderer/form-question-renderer')

function createRenderer(question, answer) {
  const events = []
  const renderer = {
    data: { question, answer },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() },
    triggerEvent(name, detail) { events.push({ name, detail }) },
  }
  Object.keys(componentDefinition.methods).forEach((name) => {
    renderer[name] = componentDefinition.methods[name].bind(renderer)
  })
  return { renderer, events }
}

const single = createRenderer({ type: 'single' }, null)
single.renderer.onOptionTap({ currentTarget: { dataset: { id: 'selected' } } })
assert.deepStrictEqual(single.events[0].detail, { value: 'selected', confirmed: true })

const otherSingle = createRenderer({
  type: 'single',
  options: [{ id: 'standard', label: '标准' }, { id: 'other', label: '其他', isOther: true, otherRequired: true, otherMaxLength: 20 }],
}, null)
otherSingle.renderer.onOptionTap({ currentTarget: { dataset: { id: 'other' } } })
assert.deepStrictEqual(otherSingle.events[0].detail, { value: { selected: 'other', otherText: '' }, confirmed: false })
otherSingle.renderer.data.answer = { selected: 'other', otherText: '' }
otherSingle.renderer.onOtherConfirm({ detail: { value: '自定义需求' } })
assert.deepStrictEqual(otherSingle.events[1].detail, { value: { selected: 'other', otherText: '自定义需求' }, confirmed: true })
const text = createRenderer({ type: 'shortText' }, '')
text.renderer.onInputConfirm({ detail: { value: '项目名称' } })
assert.deepStrictEqual(text.events[0].detail, { value: '项目名称', confirmed: true })

const multiple = createRenderer({ type: 'multiple', validation: {} }, [])
multiple.renderer.onOptionTap({ currentTarget: { dataset: { id: 'first' } } })
assert.deepStrictEqual(multiple.events[0].detail, { value: ['first'], confirmed: false })

let pageDefinition
global.Page = (definition) => { pageDefinition = definition }
require('../pages/flows/collection-form/collection-form')

function answerQuestion(type, confirmed) {
  let scheduled = 0
  const context = {
    data: {
      answers: {},
      currentQuestion: { id: 'question', type },
      currentAnswer: null,
      submitted: false,
    },
    setData(patch) { Object.assign(this.data, patch) },
    saveDraft() {},
    scheduleAutoAdvance() { scheduled += 1 },
  }
  pageDefinition.onAnswerChange.call(context, { detail: { value: 'answer', confirmed } })
  return scheduled
}

assert.strictEqual(answerQuestion('single', true), 1)
assert.strictEqual(answerQuestion('shortText', true), 1)
assert.strictEqual(answerQuestion('longText', true), 1)
assert.strictEqual(answerQuestion('multiple', true), 0)
assert.strictEqual(answerQuestion('single', false), 0)

const template = fs.readFileSync('components/form-question-renderer/form-question-renderer.wxml', 'utf8')
assert.strictEqual((template.match(/bindconfirm="onInputConfirm"/g) || []).length, 2)
assert.doesNotMatch(template, /class="text-input number-input"[\s\S]*?bindconfirm="onInputConfirm"/)

console.log('collection-form auto-advance tests passed')
