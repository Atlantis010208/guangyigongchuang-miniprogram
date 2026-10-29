const assert = require('assert')
const path = require('path')
const Module = require('module')

const functionPath = path.resolve(__dirname, '..', 'cloudfunctions', 'collection_form_export_pdf', 'index.js')
const emptyDoc = { async get() { return { data: null } }, async update() { return {} } }
const emptyCollection = {
  doc() { return emptyDoc },
  where() { return { limit() { return { async get() { return { data: [] } } } } } },
}
const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return { collection() { return emptyCollection } } },
  getWXContext() { return { OPENID: 'openid-test' } },
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock
  return originalLoad.call(this, request, parent, isMain)
}
const pdfExport = require(functionPath)
Module._load = originalLoad

const { PDF_RENDER_VERSION, buildPdfFileName, buildPdfCloudPath } = pdfExport.__private__

assert.strictEqual(PDF_RENDER_VERSION, 6)
assert.strictEqual(buildPdfFileName({
  userNickname: '张三',
  template: { title: '灯光设计需求收集' },
}), '张三+灯光设计需求收集.pdf')

assert.strictEqual(buildPdfFileName({
  userNickname: ' 张/三 ',
  template: { title: '住宅:需求*收集' },
}), '张_三+住宅_需求_收集.pdf')

assert.strictEqual(buildPdfFileName({ spaceType: 'residential' }, '李四'), '李四+住宅空间需求收集.pdf')
assert.strictEqual(buildPdfFileName({ template: { title: '项目收集表' } }, ''), '微信用户+项目收集表.pdf')

const cloudPath = buildPdfCloudPath({
  _id: 'cfs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  requestId: 'cfr_mtjjdiof_mye6sq8xtk',
  spaceType: 'residential',
}, '张三+灯光设计需求收集.pdf')
assert.match(cloudPath, /^collection-form-pdf\/residential\/cfr_mtjjdiof_mye6sq8xtk\/v6-[a-f0-9]{12}\.pdf$/)
assert(!/[^\x00-\x7F]/.test(cloudPath), 'cloud storage path should stay ASCII to avoid upload signing issues')

console.log('collection form PDF export naming tests passed')
