const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async (event) => {
  try {
    const db = cloud.database()
    const { collectionName = 'lighting_collections', limit = 20, offset = 0 } = event

    const col = db.collection(collectionName)
    const countResult = await col.count()
    const total = countResult.total

    const listResult = await col
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get()

    // 关联查询用户昵称
    let records = listResult.data || []
    const userIds = [...new Set(records.map(r => r.userId).filter(Boolean))]
    if (userIds.length > 0) {
      try {
        const usersRes = await db.collection('users')
          .where({ _id: db.command.in(userIds) })
          .field({ _id: true, nickname: true })
          .limit(100)
          .get()
        const nickMap = {}
        ;(usersRes.data || []).forEach(u => { nickMap[u._id] = u.nickname || '' })
        records = records.map(r => ({ ...r, userNickname: nickMap[r.userId] || '' }))
      } catch (_) {}
    }

    return {
      success: true,
      code: 'OK',
      data: records,
      total,
    }
  } catch (err) {
    return {
      success: false,
      code: 'COLLECTIONS_LIST_FAILED',
      errorMessage: (err && err.message) ? err.message : 'unknown error',
    }
  }
}
