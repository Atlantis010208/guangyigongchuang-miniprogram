const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  const db = cloud.database()
  const col = db.collection('designers')
  const filters = (event && event.filters) || {}
  const sortBy = (event && event.sortBy) || 'rating'
  const page = (event && event.page) || 1
  const pageSize = (event && event.pageSize) || 20
  const skip = Math.max(0, (page - 1) * pageSize)
  let q = col
  const spaceType = String(filters.spaceType || '').trim()
  const minRating = Number(filters.minRating || 0)
  const hasCalcExp = !!filters.hasCalcExp
  if (spaceType) {
    q = q.where({ specialties: db.command.all([spaceType]) })
  }
  if (minRating > 0) {
    q = q.where({ rating: db.command.gte(minRating) })
  }
  if (hasCalcExp) {
    q = q.where({ hasCalcExperience: true })
  }
  const orderField = ['rating','projects','price'].includes(sortBy) ? (sortBy === 'projects' ? 'projectCount' : (sortBy === 'price' ? 'pricePerSqm' : 'rating')) : 'rating'
  const order = orderField === 'pricePerSqm' ? 'asc' : 'desc'
  const res = await q.orderBy(orderField, order).skip(skip).limit(pageSize).get()
  const items = (res && res.data) ? res.data : []
  return { success: true, items }
}
