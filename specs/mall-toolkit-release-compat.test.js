'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const quiet = { log() {}, warn() {}, error() {} }
const clone = value => JSON.parse(JSON.stringify(value))
const fixtures = [
  { _id: 'toolkit', orderNo: 'TKTEST1793096339184', userId: 'buyer', category: 'toolkit', status: 'paid', isDelete: 0, createdAt: 200, params: { items: [{ id: 'TK_DEFAULT_001', name: '灯光设计工具包' }] } },
  { _id: 'mall', orderNo: 'M1', userId: 'buyer', category: 'mall', status: 'paid', isDelete: 0, createdAt: 100 },
  { _id: 'course', orderNo: 'C1', userId: 'buyer', category: 'course', status: 'paid', isDelete: 0, createdAt: 100 },
  { _id: 'other', orderNo: 'OTHER', userId: 'someone-else', category: 'toolkit', status: 'paid', isDelete: 0, createdAt: 300 },
  { _id: 'deleted', orderNo: 'DELETED', userId: 'buyer', category: 'toolkit', status: 'paid', isDelete: 1, createdAt: 300 }
]
const command = {
  eq: value => actual => actual === value,
  exists: value => actual => (actual !== undefined) === value,
  or: (...args) => actual => args.flat().some(test => typeof test === 'function' ? test(actual) : matches(actual, test)),
  and: args => actual => args.every(test => typeof test === 'function' ? test(actual) : matches(actual, test)),
  in: values => actual => values.includes(actual)
}
function matches(row, query) {
  return typeof query === 'function' ? query(row) : Object.entries(query).every(([key, value]) => typeof value === 'function' ? value(row[key]) : row[key] === value)
}
function collection() {
  let query = {}, offset = 0, size = 100
  const rows = () => fixtures.filter(row => matches(row, query)).sort((a, b) => b.createdAt - a.createdAt)
  const api = {
    where(value) { query = value; return api }, orderBy() { return api },
    skip(value) { offset = value; return api }, limit(value) { size = value; return api },
    async count() { return { total: rows().length } },
    async get() { return { data: clone(rows().slice(offset, offset + size)) } }
  }
  return api
}
const backend = {}
vm.runInNewContext(fs.readFileSync(path.join(root, 'cloudfunctions/mall_orders_list/index.js'), 'utf8'), {
  exports: backend, console: quiet,
  require() { return { init() {}, getWXContext() { return { OPENID: 'buyer' } }, database() { return { command, collection } } } }
})
let page
const routes = []
vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/profile/orders/orders.js'), 'utf8'), {
  Page(config) { page = config }, console: quiet,
  wx: { getStorageSync() { return [] }, navigateTo({ url }) { routes.push(url) }, showModal() {} },
  require() { return { callCf(name, event) { assert.equal(name, 'mall_orders_list'); return backend.main(event) } } }
})
// Run the released handler, not the locally fixed frontend.
const released = require('./fixtures/profile-orders-released-detail-handler.json')
page.onDetail = vm.runInNewContext(`({ ${released.handler} }).onDetail`, { wx: { navigateTo({ url }) { routes.push(url) }, showModal() {} } })
page.setData = (patch, done) => { Object.assign(page.data, patch); if (done) done() }
;(async () => {
  await page.loadOrders()
  const toolkitOrders = page.data.orders.filter(order => order.orderNo === 'TKTEST1793096339184')
  assert.equal(toolkitOrders.length, 1, 'The same toolkit returned by both queries must appear once')
  assert.equal(toolkitOrders[0]._type, 'mall', 'Released frontend must select its existing order-detail branch')
  page.onDetail({ currentTarget: { dataset: { id: toolkitOrders[0].id, orderno: toolkitOrders[0].orderNo, type: toolkitOrders[0]._type } } })
  assert.equal(routes.pop(), '/pages/order/detail/detail?id=TKTEST1793096339184')
  const mall = await backend.main({ category: 'mall', limit: 50 })
  assert.deepEqual(Array.from(mall.data, order => order.orderNo), ['TKTEST1793096339184', 'M1'])
  assert.equal((await backend.main({ category: 'course' })).data[0].orderNo, 'C1')
  assert.equal((await backend.main({ orderNo: 'OTHER' })).success, false)
  assert.equal((await backend.main({ orderNo: 'TKTEST1793096339184' })).data[0].category, 'toolkit', 'Stored category must remain intact')
  // Toolkit orders can fall outside the combined mall page while still appearing
  // in the released client's separate toolkit query. They must keep the mall route.
  for (let i = 0; i < 25; i++) fixtures.push({ _id: `recent-${i}`, orderNo: `RECENT-${i}`, userId: 'buyer', type: 'mall', category: 'mall', status: 'paid', isDelete: 0, createdAt: 1000 + i })
  await page.loadOrders()
  const olderToolkit = page.data.orders.find(order => order.orderNo === 'TKTEST1793096339184')
  assert.equal(olderToolkit._type, 'mall', 'Pagination must not send older toolkit orders back to their product page')
  console.log('mall toolkit compatibility with released frontend: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
