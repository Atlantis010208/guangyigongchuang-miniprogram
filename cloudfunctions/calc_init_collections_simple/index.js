const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-5gb9c5u2c58ad6d7' })

exports.main = async () => {
  const db = cloud.database()
  const ensure = async (name) => {
    try {
      await db.collection(name).count()
      console.log(`✓ 集合 "${name}" 已存在`)
      return true
    } catch (e) {
      if (e && (e.errCode === -502005 || (e.message && e.message.indexOf('collection not exists') !== -1))) {
        try {
          await db.createCollection(name)
          console.log(`✓ 成功创建集合 "${name}"`)
          return true
        } catch (createErr) {
          console.error(`✗ 创建集合 "${name}" 失败:`, createErr)
          return false
        }
      } else {
        console.error(`✗ 检查集合 "${name}" 时发生错误:`, e)
        return false
      }
    }
  }

  // 照明计算模块需要的数据库集合
  const collections = [
    'calculations',      // 照明计算记录
    'calc_templates',    // 照明计算模板
    'template_favorites' // 模板收藏记录
  ]

  const results = []
  for (const name of collections) {
    const success = await ensure(name)
    results.push({
      name,
      success: success ? 'created' : 'failed'
    })
  }

  // 创建索引优化查询性能
  console.log('\n=== 开始创建数据库索引 ===')

  // 为 calculations 集合创建索引
  try {
    // 用户计算查询索引
    await db.collection('calculations').createIndex({
      index_name: 'user_calculations',
      keys: [{
        name: 'userId',
        direction: 1
      }, {
        name: 'isDelete',
        direction: 1
      }, {
        name: 'updatedAt',
        direction: -1
      }]
    })
    console.log('✓ 创建 calculations 用户查询索引成功')
  } catch (e) {
    console.log('- calculations 用户查询索引已存在或创建失败:', e.message)
  }

  try {
    // 计算分享查询索引
    await db.collection('calculations').createIndex({
      index_name: 'share_code',
      keys: [{
        name: 'shareCode',
        direction: 1
      }, {
        name: 'isShared',
        direction: 1
      }, {
        name: 'isDelete',
        direction: 1
      }]
    })
    console.log('✓ 创建 calculations 分享码索引成功')
  } catch (e) {
    console.log('- calculations 分享码索引已存在或创建失败:', e.message)
  }

  // 为 calc_templates 集合创建索引
  try {
    // 模板查询索引
    await db.collection('calc_templates').createIndex({
      index_name: 'template_search',
      keys: [{
        name: 'spaceType',
        direction: 1
      }, {
        name: 'type',
        direction: 1
      }, {
        name: 'isDelete',
        direction: 1
      }, {
        name: 'usageCount',
        direction: -1
      }]
    })
    console.log('✓ 创建 calc_templates 查询索引成功')
  } catch (e) {
    console.log('- calc_templates 查询索引已存在或创建失败:', e.message)
  }

  try {
    // 用户模板索引
    await db.collection('calc_templates').createIndex({
      index_name: 'user_templates',
      keys: [{
        name: 'userId',
        direction: 1
      }, {
        name: 'type',
        direction: 1
      }, {
        name: 'isDelete',
        direction: 1
      }, {
        name: 'createdAt',
        direction: -1
      }]
    })
    console.log('✓ 创建 calc_templates 用户模板索引成功')
  } catch (e) {
    console.log('- calc_templates 用户模板索引已存在或创建失败:', e.message)
  }

  // 为 template_favorites 集合创建索引
  try {
    await db.collection('template_favorites').createIndex({
      index_name: 'user_favorites',
      keys: [{
        name: 'userId',
        direction: 1
      }, {
        name: 'templateId',
        direction: 1
      }, {
        name: 'createdAt',
        direction: -1
      }]
    })
    console.log('✓ 创建 template_favorites 用户收藏索引成功')
  } catch (e) {
    console.log('- template_favorites 用户收藏索引已存在或创建失败:', e.message)
  }

  return {
    success: true,
    code: 'OK',
    created: results,
    message: '照明计算模块数据库集合和索引初始化完成'
  }
}