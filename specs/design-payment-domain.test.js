'use strict'

const assert = require('assert')
const {
  normalizeAmountFen,
  amountFenToYuan,
  publicPaymentView,
  resolveCustomerIdentity,
  syncDesignPaymentSuccess
} = require('../cloudfunctions/common/design_payment_domain')

function createDb(seed) {
  const store = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map(row => ({ ...row }))]))
  const command = {
    in(values) {
      return { __op: 'in', values }
    }
  }

  function matches(doc, query) {
    return Object.entries(query || {}).every(([key, expected]) => {
      if (expected && expected.__op === 'in') return expected.values.includes(doc[key])
      return doc[key] === expected
    })
  }

  function collection(name) {
    if (!store.has(name)) store.set(name, [])
    const rows = store.get(name)
    const chain = (query = {}, limitCount) => ({
      where(nextQuery) {
        return chain(nextQuery, limitCount)
      },
      limit(nextLimit) {
        return chain(query, nextLimit)
      },
      orderBy() {
        return chain(query, limitCount)
      },
      async get() {
        let result = rows.filter(row => matches(row, query))
        if (limitCount !== undefined) result = result.slice(0, limitCount)
        return { data: result.map(row => ({ ...row })) }
      },
      async update({ data }) {
        let updated = 0
        for (const row of rows) {
          if (matches(row, query)) {
            Object.assign(row, data)
            updated += 1
          }
        }
        return { stats: { updated } }
      }
    })

    return {
      where(query) {
        return chain(query)
      },
      doc(id) {
        return {
          async get() {
            const row = rows.find(item => item._id === id)
            if (!row) throw new Error('document not found')
            return { data: { ...row } }
          },
          async update({ data }) {
            const row = rows.find(item => item._id === id)
            if (!row) throw new Error('document not found')
            Object.assign(row, data)
            return { stats: { updated: 1 } }
          }
        }
      },
      async add({ data }) {
        const row = { _id: `${name}_${rows.length + 1}`, ...data }
        rows.push(row)
        return { _id: row._id }
      }
    }
  }

  return {
    db: {
      command,
      collection,
      async createCollection(name) {
        if (!store.has(name)) store.set(name, [])
      }
    },
    store
  }
}

;(async () => {
  assert.strictEqual(normalizeAmountFen('1280.35'), 128035)
  assert.strictEqual(normalizeAmountFen(0.01), 1)
  assert.strictEqual(amountFenToYuan(128035), 1280.35)
  assert.throws(() => normalizeAmountFen('12.345'), /金额格式/)

  const { db, store } = createDb({
    users: [{ _id: 'user-1', _openid: 'openid-customer' }],
    requests: [{ _id: 'request-1', userId: 'user-1', orderNo: 'REQ001' }],
    design_payment_requests: [{
      _id: 'payment-1',
      paymentRequestNo: 'DRP001',
      requestId: 'request-1',
      requestOrderNo: 'REQ001',
      customerUserId: 'user-1',
      customerOpenid: 'openid-customer',
      amountFen: 9900,
      description: '设计服务费',
      status: 'paying',
      channel: 'wechat_jsapi',
      expiresAt: new Date(Date.now() + 3600000)
    }],
    orders: [{
      _id: 'order-1',
      orderNo: 'DRP001',
      type: 'design_request_payment',
      category: 'design_request_payment',
      userId: 'openid-customer',
      paid: false,
      status: 'pending'
    }],
    design_payment_logs: []
  })

  const request = store.get('requests')[0]
  const identity = await resolveCustomerIdentity(db, request)
  assert.strictEqual(identity.customerOpenid, 'openid-customer')
  assert.strictEqual(identity.customerUserId, 'user-1')

  const paymentView = publicPaymentView(store.get('design_payment_requests')[0], request)
  assert.strictEqual(paymentView.canPay, true)
  assert.strictEqual(paymentView.amountYuan, 99)

  const success = await syncDesignPaymentSuccess(db, db.command, store.get('orders')[0], {
    transactionId: '420000-test',
    successTime: new Date().toISOString(),
    tradeState: 'SUCCESS',
    amount: { total: 9900 },
    payer: { openid: 'openid-customer' }
  }, 'unit_test')

  assert.strictEqual(success.success, true)
  assert.strictEqual(store.get('design_payment_requests')[0].status, 'paid')
  assert.strictEqual(store.get('orders')[0].paid, true)
  assert.strictEqual(store.get('requests')[0].paymentSummary.status, 'paid')
  assert.strictEqual(store.get('requests')[0].paymentSummary.paidAmountFen, 9900)

  store.get('design_payment_requests')[0].status = 'paying'
  store.get('design_payment_requests')[0].transactionId = ''
  store.get('orders')[0].paid = false
  const abnormal = await syncDesignPaymentSuccess(db, db.command, store.get('orders')[0], {
    transactionId: '420000-test-2',
    tradeState: 'SUCCESS',
    amount: { total: 9800 },
    payer: { openid: 'openid-customer' }
  }, 'unit_test')

  assert.strictEqual(abnormal.success, false)
  assert.strictEqual(store.get('design_payment_requests')[0].status, 'abnormal')
  assert.match(store.get('design_payment_requests')[0].abnormalReason, /金额/)

  console.log('design payment domain checks passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
