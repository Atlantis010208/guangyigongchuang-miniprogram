const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const { requireRole } = require('./auth')

exports.main = async (event) => {
  const guard = await requireRole(0)
  if (!guard.ok) return { success: false, code: 'FORBIDDEN' }
  const userId = event && event.userId ? event.userId : ''
  const role = event && typeof event.roles === 'number' ? event.roles : null
  if (!userId || role === null) return { success: false, code: 'INVALID_ARGUMENT' }
  if ([0,1,2].indexOf(role) === -1) return { success: false, code: 'INVALID_ROLE' }
  const db = cloud.database()
  const col = db.collection('users')
  await col.doc(userId).update({ data: { roles: role, updatedAt: Date.now() } })
  const d = await col.doc(userId).get()
  return { success: true, user: d && d.data ? d.data : { _id: userId, roles: role } }
}
