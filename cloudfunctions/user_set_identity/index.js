const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, code: 'UNAUTHORIZED', message: '未授权访问' }
  }

  const { role } = event
  if (role !== 1 && role !== 2) {
    return { success: false, code: 'INVALID_ROLE', message: '无效的角色值' }
  }

  try {
    const col = db.collection('users')
    
    // 查找用户
    const userRes = await col.where({ _openid: openid }).limit(1).get()
    
    let user = null
    const now = Date.now()

    if (!userRes.data || userRes.data.length === 0) {
      // 用户不存在，创建新用户
      const newUserData = {
        _openid: openid,
        nickname: '',
        avatarUrl: '',
        phoneNumber: '',
        unionId: '',
        roles: role,
        identitySelected: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        loginExpireAt: now + 24 * 60 * 60 * 1000 // 默认1天
      }
      const addRes = await col.add({ data: newUserData })
      const docId = addRes && addRes._id ? addRes._id : ''
      const docRes = await col.doc(docId).get()
      user = docRes && docRes.data ? { ...docRes.data, _id: docId } : { _id: docId, _openid: openid, ...newUserData }
    } else {
      user = userRes.data[0]
      
      // 构建更新数据
      const updateData = {
        identitySelected: true,
        updatedAt: now
      }
      
      // 管理员(roles=0)不覆盖角色，保持管理员权限
      if (user.roles !== 0) {
        updateData.roles = role
      }
      
      await col.doc(user._id).update({ data: updateData })
      const updatedUserRes = await col.doc(user._id).get()
      user = updatedUserRes.data
    }
    
    return {
      success: true,
      code: 'OK',
      user: user
    }
  } catch (err) {
    console.error('设置身份失败:', err)
    return { success: false, code: 'SERVER_ERROR', message: err.message }
  }
}
