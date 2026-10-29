'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const clone = value => JSON.parse(JSON.stringify(value))
const operations = Object.fromEntries(['and', 'or', 'in', 'neq'].map(op => [op, value => ({ op, value })]))
function matches(row, query) {
  if (query.op === 'and') return query.value.every(q => matches(row, q))
  if (query.op === 'or') return query.value.some(q => matches(row, q))
  return Object.entries(query).every(([key, val]) => val && val.op ? val.op === 'in' ? val.value.includes(row[key]) : row[key] !== val.value : row[key] === val)
}
function harness() {
  const state = {
    openid: 'buyer', admin: true, failLegacy: false,
    records: {
      orders: [{ _id: 'order', orderNo: 'ORDER', userId: 'buyer', status: 'paid', params: { items: [{ id: 'TK_DEFAULT_001', name: '灯光设计工具包' }] } }],
      products: [{ _id: 'product', productId: 'VP_TK_DEFAULT_001', _migratedFrom: 'toolkits', _originalToolkitId: 'legacy', type: 'virtual', name: '灯光设计工具包', deliveryType: 'download', virtualContent: { driveLink: 'https://new.test', drivePassword: '2580', driveContent: 'new', driveAltContact: '' } }],
      toolkits: [{ _id: 'legacy', toolkitId: 'TK_DEFAULT_001', driveLink: 'https://old.test', drivePassword: '1u1E', driveContent: 'old', driveAltContact: 'old contact' }],
      courses: []
    }
  }
  function collection(name) {
    let query = null, id
    const api = {
      where(value) { query = value; return api }, limit() { return api },
      doc(value) { id = value; return api },
      async get() {
        const rows = state.records[name] || []
        return { data: clone(id ? rows.find(row => row._id === id) || null : rows.filter(row => !query || matches(row, query))) }
      },
      async update({ data }) {
        if (name === 'toolkits' && state.failLegacy) throw new Error('legacy update failed')
        const row = state.records[name].find(row => row._id === id)
        if (!row) throw new Error('not found')
        Object.assign(row, clone(data))
        return { stats: { updated: 1 } }
      }
    }
    return api
  }
  const db = { command: operations, collection, async runTransaction(fn) {
    const before = clone(state.records)
    try { return await fn({ collection }) } catch (e) { state.records = before; throw e }
  } }
  function load(relative) {
    const exports = {}
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
      exports, console: { log() {}, warn() {}, error() {} },
      require(name) {
        if (name === 'wx-server-sdk') return { init() {}, database() { return db }, getWXContext() { return { OPENID: state.openid } } }
        if (name === './virtual-delivery') return { main: load('cloudfunctions/orders_list/virtual-delivery.js') }
        if (name === './common/identity') return { async resolveIdentity() { throw new Error('Delivery dispatch must use its ownership check') } }
        if (name === './common/permissions') return {}
        if (name === './common/response') return { fromError(error) { throw error } }
        if (name === './admin_auth') return { async requireAdmin() { return state.admin ? { ok: true, user: { _id: 'admin' } } : { ok: false, errorCode: 'FORBIDDEN' } }, getErrorMessage(code) { return code } }
        throw new Error(name)
      }
    })
    return exports.main
  }
  const route = load('cloudfunctions/orders_list/index.js')
  return { state, delivery: params => route({ ...params, action: 'virtual_delivery' }), admin: load('cloudfunctions/admin_virtual_products_update/index.js') }
}
;(async () => {
  const { state, delivery, admin } = harness()
  const get = () => delivery({ orderNo: 'ORDER', productId: 'unrelated', openid: 'buyer' })
  for (const status of ['paid', 'completed', 'shipped']) {
    state.records.orders[0].status = status
    const res = await get()
    assert.equal(res.data.deliveries[0].link, 'https://new.test')
    assert.equal(res.data.deliveries[0].extractCode, '2580')
  }
  state.records.products[0].virtualContent.driveLink = 'https://updated.test'
  assert.equal((await get()).data.deliveries[0].link, 'https://updated.test', 'Must re-read the current admin configuration')
  state.records.products[0].virtualContent = {}
  assert.equal((await get()).data.deliveries.length, 0, 'Explicit empty delivery must not resurrect legacy content')
  state.openid = 'other'
  assert.equal((await get()).code, 'ORDER_NOT_FOUND', 'Request body must not override ownership')
  state.openid = ''
  assert.equal((await get()).code, 'UNAUTHORIZED')
  state.openid = 'buyer'
  for (const status of ['pending_payment', 'refunded', 'cancelled']) {
    state.records.orders[0].status = status
    assert.equal((await get()).code, 'ORDER_NOT_PAID')
  }
  state.records.orders[0].status = 'paid'
  state.records.orders[0].params.items = [{ id: 'unrelated', name: '灯光设计工具包' }]
  assert.equal((await get()).data.deliveries.length, 0, 'Never infer purchased product from its display name')
  state.records.orders[0].params.items = [{ id: 'legacy' }]
  assert.equal((await get()).data.deliveries.length, 0, 'A migrated record with cleared content stays cleared')
  state.records.orders[0].params.items = [{ id: 'TK_DEFAULT_001' }]
  state.records.products[0].virtualContent = { driveLink: 'https://new.test', drivePassword: '2580' }
  state.records.products.push({ _id: 'service-doc', productId: 'SERVICE', type: 'virtual', deliveryType: 'service', name: '咨询', virtualContent: { contactWechat: 'support', serviceDescription: '预约咨询' } })
  state.records.orders[0].params.items.push({ productId: 'SERVICE' })
  let mixed = (await get()).data.deliveries
  assert.equal(mixed.length, 2)
  assert.equal(mixed[1].deliveryType, 'service')
  assert.equal(mixed[1].link, 'support')
  state.records.orders[0].params.items = [{ id: 'TK_DEFAULT_001' }]
  const legacyOnly = harness()
  legacyOnly.state.records.products = []
  assert.equal((await legacyOnly.delivery({ orderNo: 'ORDER' })).data.deliveries[0].link, 'https://old.test', 'Unmigrated purchases retain exact legacy delivery')
  const vc = { driveLink: 'https://saved.test', drivePassword: 'new-code', driveContent: 'latest', driveAltContact: '' }
  assert.equal((await admin({ id: 'product', data: { virtualContent: vc } })).success, true)
  assert.equal(state.records.toolkits[0].driveLink, vc.driveLink, 'Admin save must also update the compatibility record used by released clients')
  assert.equal(state.records.toolkits[0].driveAltContact, '', 'Clearing a field must propagate')
  assert.equal((await get()).data.deliveries[0].link, vc.driveLink)
  state.failLegacy = true
  assert.equal((await admin({ id: 'product', data: { virtualContent: { driveLink: 'https://must-rollback.test' } } })).success, false)
  assert.equal(state.records.products[0].virtualContent.driveLink, vc.driveLink, 'Compatibility failure must roll back product update')
  state.admin = false
  assert.equal((await admin({ id: 'product', data: { virtualContent: vc } })).success, false)
  console.log('order virtual delivery backend + admin sync: PASS')
})().catch(error => { console.error(error); process.exitCode = 1 })
