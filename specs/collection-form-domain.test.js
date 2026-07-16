const assert = require('assert')

const {
  createEmptyTemplate,
  normalizeTemplate,
  validateTemplate,
  sanitizeSubmission,
  validateFileReferences,
} = require('../cloudfunctions/common/collection_form_domain')

const empty = createEmptyTemplate('residential')
assert.strictEqual(empty.spaceType, 'residential')
assert.strictEqual(empty.modules.length, 0)
assert.ok(validateTemplate(empty, { forPublish: true }).length > 0)
assert.deepStrictEqual(validateTemplate(empty, { forPublish: false }), [])

const draft = normalizeTemplate({
  id: 'lighting-residential',
  title: '住宅灯光需求',
  modules: [
    {
      id: 'module_a',
      title: '项目概况',
      description: '',
      estimatedMinutes: 1,
      questions: [
        {
          id: 'has_children',
          type: 'single',
          title: '是否有儿童？',
          shortTitle: '儿童居住',
          required: true,
          options: [
            { id: 'yes', label: '有' },
            { id: 'no', label: '没有' },
          ],
        },
        {
          id: 'children_needs',
          type: 'multiple',
          title: '儿童照明需求',
          shortTitle: '儿童需求',
          required: true,
          options: [
            { id: 'study', label: '学习照明' },
            { id: 'night', label: '夜间照明' },
          ],
          validation: { minSelections: 1, maxSelections: 2 },
          visibleWhen: { questionId: 'has_children', operator: 'equals', value: 'yes' },
        },
        {
          id: 'priorities',
          type: 'ranking',
          title: '请排序',
          shortTitle: '优先级',
          required: true,
          options: [
            { id: 'comfort', label: '舒适' },
            { id: 'budget', label: '预算' },
          ],
        },
      ],
    },
  ],
}, 'residential')

assert.strictEqual(draft.modules[0].code, 'A')
assert.deepStrictEqual(draft.modules[0].questions.map((q) => q.code), ['A1', 'A2', 'A3'])
assert.deepStrictEqual(validateTemplate(draft, { forPublish: true }), [])

const draftWithoutShortTitle = JSON.parse(JSON.stringify(draft))
draftWithoutShortTitle.modules[0].questions[0].shortTitle = ''
assert.deepStrictEqual(validateTemplate(draftWithoutShortTitle, { forPublish: true }), [])

const hidden = sanitizeSubmission(draft, {
  has_children: 'no',
  children_needs: ['study'],
  priorities: ['comfort', 'budget'],
  unknown: 'discard me',
})
assert.deepStrictEqual(hidden.errors, [])
assert.deepStrictEqual(hidden.answers, {
  has_children: 'no',
  priorities: ['comfort', 'budget'],
})

const missingConditional = sanitizeSubmission(draft, {
  has_children: 'yes',
  priorities: ['comfort', 'budget'],
})
assert.strictEqual(missingConditional.errors[0].questionId, 'children_needs')

const brokenRanking = sanitizeSubmission(draft, {
  has_children: 'no',
  priorities: ['comfort'],
})
assert.strictEqual(brokenRanking.errors[0].questionId, 'priorities')


const locationTemplate = normalizeTemplate({
  id: 'location-form', spaceType: 'residential', title: '位置测试', modules: [{ id: 'lm', title: '项目', questions: [{
    id: 'lq', type: 'location', title: '项目位置', shortTitle: '项目位置', required: true,
  }] }],
}, 'residential')
assert.deepStrictEqual(validateTemplate(locationTemplate, { forPublish: true }), [])
assert.strictEqual(sanitizeSubmission(locationTemplate, { lq: { name: '无效', address: '', latitude: 91, longitude: 114 } }).errors[0].message, '请选择有效位置')
assert.deepStrictEqual(sanitizeSubmission(locationTemplate, { lq: { name: '  项目现场  ', address: ' 深圳市南山区 ', latitude: '22.5431', longitude: '114.0579' } }), {
  answers: { lq: { name: '项目现场', address: '深圳市南山区', latitude: 22.5431, longitude: 114.0579 } }, errors: [],
})
const tableTemplate = normalizeTemplate({
  id: 'table-form', spaceType: 'residential', title: '表格测试', modules: [{ id: 'tm', title: '同行人', questions: [{
    id: 'tq', type: 'table', title: '同行人信息', shortTitle: '同行人', required: true,
    table: { minRows: 1, maxRows: 5, columns: [
      { id: 'name', label: '姓名', type: 'shortText', required: true },
      { id: 'age', label: '年龄', type: 'number', required: true, unit: '岁' },
      { id: 'relation', label: '关系', type: 'single', required: true, options: [{ id: 'family', label: '家人' }, { id: 'friend', label: '朋友' }] },
      { id: 'needs', label: '关注点', type: 'multiple', required: true, options: [{ id: 'comfort', label: '舒适' }, { id: 'budget', label: '预算' }], validation: { minSelections: 1, maxSelections: 2 } },
      { id: 'note', label: '备注', type: 'longText', required: false, validation: { maxLength: 20 } },
    ] },
  }] }],
}, 'residential')
assert.deepStrictEqual(validateTemplate(tableTemplate, { forPublish: true }), [])
assert.strictEqual(sanitizeSubmission(tableTemplate, { tq: [{ name: '张三', age: '' }] }).errors[0].message, '请填写第 1 行的年龄')
assert.deepStrictEqual(sanitizeSubmission(tableTemplate, { tq: [{ name: '  张三  ', age: '30', relation: 'family', needs: ['comfort', 'budget'], note: '  靠窗  ', ignored: 'discard' }] }), {
  answers: { tq: [{ name: '张三', age: 30, relation: 'family', needs: ['comfort', 'budget'], note: '靠窗' }] }, errors: [],
})
assert.strictEqual(sanitizeSubmission(tableTemplate, { tq: [{ name: '张三', age: 30, relation: 'unknown', needs: ['comfort'] }] }).errors[0].message, '第 1 行的关系请选择有效选项')
assert.strictEqual(sanitizeSubmission(tableTemplate, { tq: [{ name: '张三', age: 30, relation: 'family', needs: [] }] }).errors[0].message, '请填写第 1 行的关注点')
const invalidTableTemplate = JSON.parse(JSON.stringify(tableTemplate))
invalidTableTemplate.modules[0].questions[0].table.columns[0].type = 'upload'
assert(validateTemplate(invalidTableTemplate, { forPublish: true }).some((error) => error.path.includes('.table.columns[0].type')))
const uploadTemplate = normalizeTemplate({
  id: 'upload-form', spaceType: 'residential', title: '上传测试', modules: [{ id: 'um', title: '资料', questions: [{
    id: 'uq', type: 'upload', title: '上传图纸', required: true, uploadType: 'file', validation: { maxFiles: 1 },
  }] }],
}, 'residential')
const ownedFile = { fileID: 'cloud://env.bucket/collection-form-submissions/residential/request_123/file.pdf', name: 'file.pdf' }
assert.deepStrictEqual(validateFileReferences(uploadTemplate, { uq: [ownedFile] }, 'request_123'), [])
assert.strictEqual(validateFileReferences(uploadTemplate, { uq: [{ ...ownedFile, fileID: 'cloud://env.bucket/other/file.pdf' }] }, 'request_123').length, 1)
const invalidEnumTemplate = JSON.parse(JSON.stringify(draft))
invalidEnumTemplate.modules[0].questions[0].type = 'mystery'
assert(validateTemplate(invalidEnumTemplate, { forPublish: true }).some((error) => error.path.endsWith('.type')))
const invalidLimitsTemplate = JSON.parse(JSON.stringify(draft))
invalidLimitsTemplate.modules[0].questions[1].validation = { maxSelections: -1 }
assert(validateTemplate(invalidLimitsTemplate, { forPublish: true }).some((error) => error.path.includes('maxSelections')))
const otherTemplate = normalizeTemplate({
  id: 'other-form', spaceType: 'residential', title: '其他选项测试', modules: [{ id: 'om', title: '目标', questions: [{
    id: 'oq', type: 'single', title: '其他需求', shortTitle: '其他需求', required: true,
    options: [
      { id: 'standard', label: '标准需求' },
      { id: 'other', label: '其他', isOther: true, otherPlaceholder: '请补充', otherRequired: true, otherMaxLength: 20 },
    ],
  }] }],
}, 'residential')
assert.deepStrictEqual(validateTemplate(otherTemplate, { forPublish: true }), [])
assert.strictEqual(sanitizeSubmission(otherTemplate, { oq: { selected: 'other', otherText: '' } }).errors[0].message, '请填写其他内容')
assert.deepStrictEqual(sanitizeSubmission(otherTemplate, { oq: { selected: 'other', otherText: '  特殊灯光  ' } }), {
  answers: { oq: { selected: 'other', otherText: '特殊灯光' } }, errors: [],
})
const invalidOtherTemplate = JSON.parse(JSON.stringify(otherTemplate))
invalidOtherTemplate.modules[0].questions[0].options.push({ id: 'other_2', label: '其他二', isOther: true, otherMaxLength: 20 })
assert(validateTemplate(invalidOtherTemplate, { forPublish: true }).some((error) => error.message.includes('最多只能配置一个')))
console.log('collection form domain tests passed')
