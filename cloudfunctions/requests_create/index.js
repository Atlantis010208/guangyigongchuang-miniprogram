const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const { requireRole } = require('./auth')

exports.main = async (event) => {
  try {
    const guard = await requireRole([0,1,2])
    if (!guard.ok) return { success: false, code: 'FORBIDDEN' }
    const ctx = cloud.getWXContext()
    const openid = ctx && (ctx.OPENID || ctx.openid) || ''
    if (!openid) return { success: false, code: 'MISSING_OPENID', errorMessage: 'missing openid' }

    const db = cloud.database()
    const req = event && event.request ? event.request : {}
    const now = Date.now()
    const orderNo = String(req.orderNo || `R${now}`)
    
    // 查询当前用户信息，获取昵称、电话号码和头像
    let userNickname = ''
    let userPhone = ''
    let userAvatar = ''
    try {
      // 优先通过 _openid 查询
      let userRes = await db.collection('users')
        .where({ _openid: openid })
        .field({ nickname: true, phoneNumber: true, purePhoneNumber: true, avatarUrl: true })
        .limit(1)
        .get()
      
      // 如果没找到，尝试通过 _id 查询（兼容旧逻辑）
      if (!userRes.data || userRes.data.length === 0) {
        userRes = await db.collection('users')
          .doc(openid)
          .get()
          .then(res => ({ data: res.data ? [res.data] : [] }))
          .catch(() => ({ data: [] }))
      }
      
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        userNickname = user.nickname || ''
        userPhone = user.phoneNumber || user.purePhoneNumber || ''
        userAvatar = user.avatarUrl || ''
      }
    } catch (userErr) {
      console.log('[requests_create] 获取用户信息失败（非致命）:', userErr.message)
    }
    
    // 构建文档，包含用户信息快照
    const doc = {
      ...req,
      orderNo,
      userId: req.userId || openid,
      // 存储用户信息快照（发布时的联系方式和头像）
      userNickname: req.userNickname || userNickname,
      userPhone: req.userPhone || userPhone,
      userAvatar: req.userAvatar || userAvatar,
      // 工作流状态：初始为 publish（需求发布）阶段
      stage: req.stage || 'publish',
      status: req.status || 'submitted',
      isDelete: 0,
      createdAt: now,
      updatedAt: now
    }
    
    const col = db.collection('requests')
    try { await col.count() } catch (e) { if (e && (e.errCode === -502005 || (e.message || '').includes('collection not exists'))) { try { await db.createCollection('requests') } catch (_) {} } else { throw e } }
    const addRes = await col.add({ data: doc })
    const id = addRes && addRes._id ? addRes._id : ''
    const saved = id ? (await col.doc(id).get()).data : doc
    return { success: true, code: 'OK', data: saved }
  } catch (err) {
    return { success: false, code: 'REQUESTS_CREATE_FAILED', errorMessage: err && err.message ? err.message : 'unknown error' }
  }
}

