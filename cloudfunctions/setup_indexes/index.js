const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

const postJson = (url, body) => new Promise((resolve, reject) => {
  try {
    const u = new URL(url)
    const data = Buffer.from(JSON.stringify(body))
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { resolve({}) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  } catch (e) { reject(e) }
})

exports.main = async () => {
  const db = cloud.database()
  const ensure = async (name) => {
    try { await db.collection(name).count() } catch (e) {
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try { await db.createCollection(name) } catch (_) {}
      } else { throw e }
    }
  }
  await ensure('designers')
  await ensure('appointments')
  await ensure('users')
  await ensure('orders')
  await ensure('requests')
  await ensure('member_invitations')

  const token = process.env.CLOUDBASE_ACCESS_TOKEN || ''
  const envId = process.env.ENV_ID || 'cloud1-5gb9c5u2c58ad6d7'
  const host = 'api.weixin.qq.com'
  const endpoint = `/tcb/databaseupdateindex?access_token=${encodeURIComponent(token)}`
  const canUpdate = !!token && !!envId
  const intents = []
  if (canUpdate) {
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'designers',
      create_indexes: [
        { name: 'idx_rating_desc', unique: false, keys: [{ name: 'rating', direction: '-1' }] },
        { name: 'idx_projectCount_desc', unique: false, keys: [{ name: 'projectCount', direction: '-1' }] },
        { name: 'idx_pricePerSqm_asc', unique: false, keys: [{ name: 'pricePerSqm', direction: '1' }] }
      ],
      drop_indexes: []
    }))
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'appointments',
      create_indexes: [
        { name: 'idx_userId_createdAt', unique: false, keys: [{ name: 'userId', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
        { name: 'idx_designerId_createdAt', unique: false, keys: [{ name: 'designerId', direction: '1' }, { name: 'createdAt', direction: '-1' }] }
      ],
      drop_indexes: []
    }))
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'users',
      create_indexes: [
        { name: 'idx_openid', unique: false, keys: [{ name: '_openid', direction: '1' }] },
        { name: 'idx_updatedAt', unique: false, keys: [{ name: 'updatedAt', direction: '-1' }] },
        { name: 'idx_inviteCode_unique', unique: true, keys: [{ name: 'inviteCode', direction: '1' }] }
      ],
      drop_indexes: []
    }))
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'orders',
      create_indexes: [
        { name: 'idx_userId_createdAt', unique: false, keys: [{ name: 'userId', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
        { name: 'idx_orderNo', unique: true, keys: [{ name: 'orderNo', direction: '1' }] },
        { name: 'idx_isDelete_createdAt', unique: false, keys: [{ name: 'isDelete', direction: '1' }, { name: 'createdAt', direction: '-1' }] }
      ],
      drop_indexes: []
    }))
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'requests',
      create_indexes: [
        { name: 'idx_userId_createdAt', unique: false, keys: [{ name: 'userId', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
        { name: 'idx_isDelete_createdAt', unique: false, keys: [{ name: 'isDelete', direction: '1' }, { name: 'createdAt', direction: '-1' }] }
      ],
      drop_indexes: []
    }))
    intents.push(postJson(`https://${host}${endpoint}`, {
      env: envId,
      collection_name: 'member_invitations',
      create_indexes: [
        // 复合唯一索引：同一邀请人(inviterOpenid)不能重复绑定同一被邀请人(invitedOpenid)。
        // 替代旧的单字段唯一索引 idx_invitedOpenid_unique，解决 createShare 写入
        // invitedOpenid 缺失字段时被视为 null 导致不同邀请人之间冲突的问题。
        { name: 'idx_inviter_invited_unique', unique: true, keys: [{ name: 'inviterOpenid', direction: '1' }, { name: 'invitedOpenid', direction: '1' }] },
        { name: 'idx_inviter_createdAt', unique: false, keys: [{ name: 'inviterUserId', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
        { name: 'idx_createdAt_desc', unique: false, keys: [{ name: 'createdAt', direction: '-1' }] }
      ],
      drop_indexes: [
        { name: 'idx_invitedOpenid_unique' }
      ]
    }))
  }
  const results = canUpdate ? await Promise.all(intents) : []
  return { success: true, canUpdate, results }
}
