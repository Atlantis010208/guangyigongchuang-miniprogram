/**
 * 清理无效头像云函数
 * 功能：检测并清理数据库中不存在于云存储的头像链接
 * 
 * 调用方式：
 * - dryRun: true  - 只检测，不修改（默认）
 * - dryRun: false - 检测并清理
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { dryRun = true, limit = 100 } = event
  
  console.log('开始检测无效头像，dryRun:', dryRun, ', limit:', limit)
  
  try {
    // 获取所有有头像的用户记录
    const usersRes = await db.collection('users')
      .where({
        avatarUrl: db.command.exists(true)
      })
      .limit(limit)
      .get()
    
    const users = usersRes.data || []
    console.log(`找到 ${users.length} 个有头像的用户记录`)
    
    const invalidUsers = []
    const validUsers = []
    const nonCloudUsers = []
    
    for (const user of users) {
      const { _id, avatarUrl, nickname } = user
      
      if (!avatarUrl) {
        continue
      }
      
      // 检查是否是云存储路径
      if (!avatarUrl.startsWith('cloud://')) {
        nonCloudUsers.push({
          _id,
          nickname,
          avatarUrl,
          reason: '非云存储路径'
        })
        continue
      }
      
      // 检测云存储文件是否存在
      try {
        const fileRes = await cloud.getTempFileURL({
          fileList: [avatarUrl]
        })
        
        const fileInfo = fileRes.fileList && fileRes.fileList[0]
        
        if (fileInfo && fileInfo.status === 0 && fileInfo.tempFileURL) {
          // 文件存在
          validUsers.push({
            _id,
            nickname,
            avatarUrl
          })
        } else {
          // 文件不存在或状态异常
          invalidUsers.push({
            _id,
            nickname,
            avatarUrl,
            status: fileInfo ? fileInfo.status : 'unknown',
            reason: '文件不存在或已被删除'
          })
        }
      } catch (err) {
        invalidUsers.push({
          _id,
          nickname,
          avatarUrl,
          reason: `检测失败: ${err.message}`
        })
      }
    }
    
    console.log(`检测结果：有效 ${validUsers.length}，无效 ${invalidUsers.length}，非云存储 ${nonCloudUsers.length}`)
    
    // 如果不是 dryRun，清理无效头像
    let cleanedCount = 0
    if (!dryRun && invalidUsers.length > 0) {
      for (const user of invalidUsers) {
        try {
          await db.collection('users').doc(user._id).update({
            data: {
              avatarUrl: '',
              avatarCleanedAt: new Date()
            }
          })
          cleanedCount++
          console.log(`已清理用户 ${user._id} 的无效头像`)
        } catch (err) {
          console.warn(`清理用户 ${user._id} 头像失败:`, err.message)
        }
      }
    }
    
    // 同样处理非云存储路径（临时路径）
    if (!dryRun && nonCloudUsers.length > 0) {
      for (const user of nonCloudUsers) {
        // 只清理明显是临时路径的
        if (user.avatarUrl.startsWith('http://tmp') || 
            user.avatarUrl.startsWith('wxfile://')) {
          try {
            await db.collection('users').doc(user._id).update({
              data: {
                avatarUrl: '',
                avatarCleanedAt: new Date()
              }
            })
            cleanedCount++
            console.log(`已清理用户 ${user._id} 的临时路径头像`)
          } catch (err) {
            console.warn(`清理用户 ${user._id} 头像失败:`, err.message)
          }
        }
      }
    }
    
    return {
      success: true,
      dryRun,
      summary: {
        total: users.length,
        valid: validUsers.length,
        invalid: invalidUsers.length,
        nonCloud: nonCloudUsers.length,
        cleaned: cleanedCount
      },
      invalidUsers: invalidUsers.map(u => ({
        _id: u._id,
        nickname: u.nickname,
        reason: u.reason
      })),
      nonCloudUsers: nonCloudUsers.map(u => ({
        _id: u._id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl.substring(0, 50) + '...'
      }))
    }
  } catch (err) {
    console.error('清理无效头像失败:', err)
    return {
      success: false,
      errorMessage: err.message
    }
  }
}

