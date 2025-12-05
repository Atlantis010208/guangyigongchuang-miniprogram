const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  const id = event && event.id ? String(event.id) : ''
  if (!id) return { success: false, errorMessage: 'missing id' }
  const db = cloud.database()
  const col = db.collection('designers')
  try {
    const r = await col.doc(id).get()
    const item = r && r.data ? r.data : null
    if (!item) return { success: false, errorMessage: 'not found' }
    return { success: true, item }
  } catch (e) {
    return { success: false, errorMessage: e && e.message ? e.message : 'error' }
  }
}
