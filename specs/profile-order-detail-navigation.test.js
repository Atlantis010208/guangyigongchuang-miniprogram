'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
let page
const routes = []
const notices = []
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/profile/orders/orders.js'), 'utf8'), {
  Page(config) { page = config },
  require() { return {} },
  wx: { navigateTo({ url }) { routes.push(url) }, showToast({ title }) { notices.push(title) } }
})

const raw = {
  _id: 'document-id', orderNo: 'TKTEST1793096339184', status: 'paid',
  params: { items: [{ id: 'TK_DEFAULT_001', name: '灯光设计工具包' }] }
}
const formatted = page.formatToolkitOrder(raw)
page.data.orders = [formatted]
page.onDetail({ currentTarget: { dataset: { id: formatted.id, orderno: formatted.orderNo, type: formatted._type } } })
assert.equal(routes.pop(), `/pages/order/detail/detail?id=${raw.orderNo}`, 'Toolkit details must use the order number, not the toolkit product ID')

for (const type of ['toolkit', 'mall']) {
  page.data.orders = []
  page.onDetail({ currentTarget: { dataset: { id: 'fallback-order', type } } })
  assert.equal(routes.pop(), '/pages/order/detail/detail?id=fallback-order', 'Missing product data must not redirect to the catalogue')
  page.onDetail({ currentTarget: { dataset: { type } } })
  assert.equal(routes.length, 0, 'Missing identifiers must not open an invalid detail page')
}
assert.equal(notices.length, 2)
console.log('profile order detail navigation: PASS')
