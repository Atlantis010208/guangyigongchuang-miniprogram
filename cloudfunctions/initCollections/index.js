const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const { requireRole } = require('./auth')

exports.main = async () => {
  const guard = await requireRole(0)
  if (!guard.ok) return { success: false, code: 'FORBIDDEN' }
  const db = cloud.database()
  const ensure = async (name) => {
    try {
      await db.collection(name).count()
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try { await db.createCollection(name) } catch (_) {}
      } else {
        throw e
      }
    }
  }
  const list = [
    'users',
    'designers',
    'orders',
    'requests',
    'products',
    'categories',
    'transactions',
    'notifications',
    'surveys',
    'appointments'
  ]
  for (const n of list) {
    await ensure(n)
  }
  return { success: true, created: list }
}
