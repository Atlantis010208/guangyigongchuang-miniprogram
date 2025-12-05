const makeLRU = (limit = 100) => {
  const m = new Map()
  return {
    get(k) { if (!m.has(k)) return null; const v = m.get(k); m.delete(k); m.set(k, v); if (v && v.exp && v.exp < Date.now()) return null; return v ? v.val : null },
    set(k, val, ttlMs = 300000) { const exp = ttlMs ? Date.now() + ttlMs : 0; if (m.has(k)) m.delete(k); m.set(k, { val, exp }); if (m.size > limit) { const fk = m.keys().next().value; m.delete(fk) } },
    invalidate(pattern) { if (!pattern) return; const arr = Array.isArray(pattern) ? pattern : [pattern]; for (const key of m.keys()) { if (arr.some(p => key.indexOf(p) !== -1)) m.delete(key) } }
  }
}

const dbInit = () => {
  const db = wx.cloud && wx.cloud.database ? wx.cloud.database() : null
  return db
}

const getUsersRepo = (db) => {
  const col = db.collection('users')
  return {
    getById(id) { return col.doc(id).get().then(res => res.data) },
    getByOpenId(openid) { return col.where({ _openid: openid }).limit(1).get().then(res => (res.data && res.data[0]) || null) },
    create(data) { return col.add({ data: { ...data, createdAt: Date.now(), updatedAt: Date.now() } }).then(r => col.doc(r._id).get()).then(res => res.data) },
    update(id, patch) { return col.doc(id).update({ data: { ...patch, updatedAt: Date.now() } }) },
    watchById(id, handler) { return col.doc(id).watch({ onChange: handler, onError: () => {} }) }
  }
}

const getOrdersRepo = (db) => {
  const col = db.collection('orders')
  return {
    create(order) { return col.add({ data: { ...order, createdAt: Date.now(), updatedAt: Date.now(), isDelete: 0 } }).then(r => col.doc(r._id).get()).then(res => res.data) },
    getByOrderNo(orderNo) { return col.where({ orderNo }).limit(1).get().then(res => (res.data && res.data[0]) || null) },
    // 使用 _openid 查询（自动注入），无需传入 userId，更安全
    listByUser(userId, opts = {}) {
      const { status, category, limit = 20, offset = 0 } = opts
      // 使用 _ 前缀的方式让云开发自动填充 openid
      let q = col.where({ isDelete: 0 })
      if (status) q = q.where({ status })
      if (category) q = q.where({ category })
      return q.orderBy('createdAt', 'desc').skip(offset).limit(limit).get().then(res => res.data || [])
    },
    updateByOrderNo(orderNo, patch) { return col.where({ orderNo }).update({ data: { ...patch, updatedAt: Date.now() } }) },
    removeByOrderNo(orderNo) { return col.where({ orderNo }).update({ data: { isDelete: 1, updatedAt: Date.now() } }) },
    // 使用 _openid 监听（自动注入）
    watchByUser(userId, onChange, onError) {
      return col.where({ isDelete: 0 }).orderBy('createdAt', 'desc').limit(200).watch({ onChange, onError: onError || (()=>{}) })
    }
  }
}

const getRequestsRepo = (db) => {
  const col = db.collection('requests')
  return {
    create(req) { return col.add({ data: { ...req, createdAt: Date.now(), updatedAt: Date.now(), isDelete: 0 } }).then(r => col.doc(r._id).get()).then(res => res.data) },
    // 使用 _openid 查询（自动注入），无需传入 userId，更安全
    listByUser(userId, opts = {}) {
      const { status, limit = 20, offset = 0 } = opts
      let q = col.where({ isDelete: 0 })
      if (status) q = q.where({ status })
      return q.orderBy('createdAt', 'desc').skip(offset).limit(limit).get().then(res => res.data || [])
    },
    update(id, patch) { return col.doc(id).update({ data: { ...patch, updatedAt: Date.now() } }) },
    remove(id) { return col.doc(id).update({ data: { isDelete: 1, updatedAt: Date.now() } }) },
    // 使用 _openid 监听（自动注入）
    watchByUser(userId, onChange, onError) {
      return col.where({ isDelete: 0 }).orderBy('createdAt', 'desc').limit(200).watch({ onChange, onError: onError || (()=>{}) })
    }
  }
}

const getDesignersRepo = (db) => {
  const col = db.collection('designers')
  return {
    list(filters = {}, opts = {}) { const { sortBy = 'rating', page = 1, pageSize = 20 } = opts; let q = col; const spaceType = String(filters.spaceType || '').trim(); const minRating = Number(filters.minRating || 0); const hasCalcExp = !!filters.hasCalcExp; if (spaceType) q = q.where({ specialties: db.command.all([spaceType]) }); if (minRating > 0) q = q.where({ rating: db.command.gte(minRating) }); if (hasCalcExp) q = q.where({ hasCalcExperience: true }); const orderField = sortBy === 'projects' ? 'projectCount' : (sortBy === 'price' ? 'pricePerSqm' : 'rating'); const order = orderField === 'pricePerSqm' ? 'asc' : 'desc'; const skip = Math.max(0, (page - 1) * pageSize); return q.orderBy(orderField, order).skip(skip).limit(pageSize).get().then(res => res.data || []) },
    getById(id) { return col.doc(id).get().then(res => res.data) }
  }
}

const getAppointmentsRepo = (db) => {
  const col = db.collection('appointments')
  return {
    create(doc) { return col.add({ data: { ...doc, createdAt: Date.now(), updatedAt: Date.now() } }).then(r => col.doc(r._id).get()).then(res => res.data) },
    listByUser(userId, opts = {}) { const { limit = 20, offset = 0 } = opts; return col.where({ userId }).orderBy('createdAt','desc').skip(offset).limit(limit).get().then(res => res.data || []) }
  }
}

module.exports = { dbInit, makeLRU, getUsersRepo, getOrdersRepo, getRequestsRepo, getDesignersRepo, getAppointmentsRepo }
