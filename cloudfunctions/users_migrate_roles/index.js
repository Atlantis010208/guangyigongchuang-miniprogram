const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const { requireRole } = require('./auth')

exports.main = async () => {
  const guard = await requireRole(0)
  if (!guard.ok) return { success: false, code: 'FORBIDDEN' }
  const db = cloud.database()
  const col = db.collection('users')
  const adminId = 'cc84495d691d142a0416de0b11fe05d7'
  try { await col.doc(adminId).update({ data: { roles: 0, updatedAt: Date.now() } }) } catch (_) {}
  let total = 0
  let offset = 0
  const limit = 100
  while (true) {
    const res = await col.skip(offset).limit(limit).get()
    const list = res && res.data ? res.data : []
    if (!list.length) break
    for (const u of list) {
      const v = typeof u.roles === 'number' ? u.roles : null
      if (v === null) {
        try { await col.doc(u._id).update({ data: { roles: 1, updatedAt: Date.now() } }) } catch (_) {}
        total += 1
      }
    }
    offset += list.length
  }
  return { success: true, updatedMissingRoles: total, adminSet: adminId }
}
