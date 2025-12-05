const express = require('express')
const app = express()
app.use(express.json())

app.get('/api/recommend/designers', (req, res) => {
  const q = String(req.query.q || '').trim()
  const tags = (req.query.tags && Array.isArray(req.query.tags)) ? req.query.tags : []
  const items = []
  res.json({ ok: true, version: 'v1', ts: Date.now(), query: { q, tags }, items })
})

app.post('/api/pay/callback', (req, res) => {
  const body = req.body || {}
  const transactionId = body.transaction_id || body.transactionId || ''
  const outTradeNo = body.out_trade_no || body.outTradeNo || ''
  const status = body.result_code || body.status || ''
  res.json({ ok: true, ts: Date.now(), transactionId, outTradeNo, status })
})

app.get('/api/admin/collections', (req, res) => {
  res.json({ ok: true, items: ['users','designers','orders','requests','products','categories','transactions','notifications','surveys','appointments'] })
})

app.get('/api/admin/models', (req, res) => {
  const models = {
    users: ['_openid','nickname','avatarUrl','phoneNumber','addresses','createdAt','updatedAt'],
    orders: ['orderNo','type','category','items','totalAmount','status','paid','userId','isDelete','createdAt','updatedAt'],
    requests: ['orderNo','category','params','status','userId','isDelete','createdAt','updatedAt'],
    designers: ['name','specialties','rating','projectCount','pricePerSqm','hasCalcExperience','createdAt','updatedAt'],
    appointments: ['userId','designerId','schedule','notes','createdAt','updatedAt']
  }
  res.json({ ok: true, models })
})

const parsePaging = (req) => {
  const page = Math.max(1, Number(req.query.page || 1))
  const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize || 20)))
  return { page, pageSize }
}

app.get('/api/admin/users', (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const items = []
  res.json({ ok: true, version: 'v1', ts: Date.now(), page, pageSize, items })
})

app.get('/api/admin/orders', (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const items = []
  res.json({ ok: true, version: 'v1', ts: Date.now(), page, pageSize, items })
})

app.get('/api/admin/requests', (req, res) => {
  const { page, pageSize } = parsePaging(req)
  const items = []
  res.json({ ok: true, version: 'v1', ts: Date.now(), page, pageSize, items })
})

const port = process.env.PORT || 8080
app.listen(port, () => {})
