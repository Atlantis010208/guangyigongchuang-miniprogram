'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const current = { title: '虚拟发货信息', content: '后台更新后的发货内容', link: 'https://example.test/new', extractCode: '2580', altContact: '' }
const order = { orderNo: 'TEST', status: 'paid', category: 'toolkit', params: { items: [{ id: 'TK_DEFAULT_001', name: '灯光设计工具包', quantity: 1 }] } }
async function scenario(status = 'paid', result = { success: true, data: { deliveries: [current] } }) {
  let page
  const calls = []
  const oldQuery = { where() { return this }, field() { return this }, orderBy() { return this }, limit() { return this }, async get() { return { data: [{ title: '灯光设计工具包', driveLink: 'https://example.test/old', drivePassword: '1u1E' }] } } }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/order/detail/detail.js'), 'utf8'), {
    Page(config) { page = config }, console: { log() {}, warn() {}, error() {} },
    wx: { showToast() {} },
    require(name) {
      if (name.endsWith('/api')) return { dbInit() { return { collection() { return oldQuery } } }, getOrdersRepo() { return { async getByOrderNo() { return { ...order, status } } } } }
      if (name.endsWith('/util')) return { async callCf(name, params) { calls.push({ name, params }); return result } }
      throw new Error(name)
    }
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.fillMissingImages = async () => {}
  page.loadRefundInfo = async () => {}
  await page.loadOrderDetail('TEST')
  return { page, calls }
}
;(async () => {
  for (const status of ['paid', 'completed', 'shipped']) {
    const { page, calls } = await scenario(status)
    assert.equal(page.data.virtualDeliveryInfo && page.data.virtualDeliveryInfo.link, current.link, `${status}: order must show current admin product delivery, not legacy toolkit data`)
    assert.equal(page.data.showVirtualDelivery, true)
    assert(calls.some(c => c.name === 'orders_list' && c.params.action === 'virtual_delivery' && c.params.orderNo === 'TEST'))
  }
  for (const status of ['pending_payment', 'refunded', 'cancelled']) {
    const { page, calls } = await scenario(status)
    assert.equal(page.data.showVirtualDelivery, false)
    assert(!calls.some(c => c.name === 'orders_list' && c.params.action === 'virtual_delivery'))
  }
  const missing = await scenario('paid', { success: false, code: 'DELIVERY_NOT_CONFIGURED' })
  assert.equal(missing.page.data.showVirtualDelivery, false, 'Failure must not silently expose hardcoded stale delivery')
  console.log('order virtual delivery page: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
