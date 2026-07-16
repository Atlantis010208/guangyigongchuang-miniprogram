const assert = require('assert')
const { isValidTemplate, normalizeTemplate, templateCacheKey } = require('../utils/collection-form-loader')
const valid = { spaceType: 'residential', modules: [{ id: 'm1', title: '模块', questions: [{ id: 'q1', type: 'upload', title: '上传', upload: { accept: 'file', maxCount: 3 } }] }] }
assert.equal(isValidTemplate(valid, 'residential'), true)
assert.equal(isValidTemplate(valid, 'office'), false)
const location = { spaceType: 'residential', modules: [{ id: 'm2', title: '位置', questions: [{ id: 'q2', type: 'location', title: '项目位置' }] }] }
assert.equal(isValidTemplate(location, 'residential'), true)
const table = { spaceType: 'residential', modules: [{ id: 'm3', title: '表格', questions: [{ id: 'q3', type: 'table', title: '成员', table: { minRows: 1, maxRows: 5, columns: [{ id: 'name', label: '姓名', type: 'shortText' }, { id: 'relation', label: '关系', type: 'single', options: [{ id: 'family', label: '家人' }, { id: 'friend', label: '朋友' }] }, { id: 'needs', label: '需求', type: 'multiple', options: [{ id: 'comfort', label: '舒适' }], validation: { minSelections: 1 } }] } }] }] }
assert.equal(isValidTemplate(table, 'residential'), true)
const invalidChoiceColumn = JSON.parse(JSON.stringify(table))
invalidChoiceColumn.modules[0].questions[0].table.columns[1].options = []
assert.equal(isValidTemplate(invalidChoiceColumn, 'residential'), false)
const normalized = normalizeTemplate(valid, 'residential')
assert.equal(normalized.modules[0].code, 'A')
assert.equal(normalized.modules[0].questions[0].code, 'A1')
assert.equal(normalized.modules[0].questions[0].validation.maxFiles, 3)
assert.equal(normalized.modules[0].questions[0].uploadType, 'file')
assert.equal(templateCacheKey('residential', 'v1'), 'collection_form_template_cache:residential:v1')
console.log('collection-form-loader tests passed')
