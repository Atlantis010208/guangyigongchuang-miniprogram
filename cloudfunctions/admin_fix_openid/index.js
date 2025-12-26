// 云函数：为旧记录补充 _openid 字段（一次性修复脚本）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 修复单个集合
async function fixCollection(collectionName) {
  const res = await db.collection(collectionName)
    .where({
      _openid: _.exists(false)
    })
    .limit(200)
    .get()
  
  const docs = res.data || []
  console.log(`[admin_fix_openid] ${collectionName} 找到缺少 _openid 的记录数:`, docs.length)
  
  if (docs.length === 0) {
    return { collection: collectionName, total: 0, fixed: 0 }
  }
  
  let fixed = 0
  for (const doc of docs) {
    if (!doc.userId) continue
    
    let openidToSet = null
    
    // 判断 userId 格式：如果以 'o' 开头（微信 openid 格式），直接使用
    // openid 格式通常是：oXXXX开头，包含字母数字下划线和连字符
    if (doc.userId.startsWith('o') && doc.userId.length > 20) {
      // userId 本身就是 openid 格式
      openidToSet = doc.userId
    } else {
      // userId 可能是 users 表的 _id（32位hex），尝试从 users 表查找
      const userRes = await db.collection('users')
        .doc(doc.userId)
        .get()
        .catch(() => null)
      
      if (userRes && userRes.data && userRes.data._openid) {
        openidToSet = userRes.data._openid
      }
    }
    
    if (openidToSet) {
      await db.collection(collectionName)
        .doc(doc._id)
        .update({
          data: { _openid: openidToSet }
        })
      fixed++
      console.log(`[admin_fix_openid] ${collectionName} 修复:`, doc._id, '->', openidToSet.substring(0, 10) + '...')
    }
  }
  
  return { collection: collectionName, total: docs.length, fixed }
}

exports.main = async (event, context) => {
  try {
    // 需要修复的集合列表
    const collections = event.collections || ['requests', 'orders', 'appointments', 'deposits', 'refunds', 'cart', 'favorites']
    
    const results = []
    for (const col of collections) {
      const result = await fixCollection(col)
      results.push(result)
    }
    
    const totalFixed = results.reduce((sum, r) => sum + r.fixed, 0)
    
    return {
      success: true,
      message: `修复完成，共修复 ${totalFixed} 条记录`,
      results
    }
  } catch (err) {
    console.error('[admin_fix_openid] 错误:', err)
    return {
      success: false,
      message: err.message || '修复失败'
    }
  }
}

