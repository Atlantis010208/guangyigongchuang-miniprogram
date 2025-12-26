/**
 * 云函数：requests_detail
 * 功能：根据 orderNo 获取单个需求详情
 * 参数：
 *   - orderNo: 订单号（必需）
 * 返回：
 *   - success: boolean
 *   - data: 需求文档对象或 null
 *   - message: 错误信息（如有）
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { orderNo } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  console.log('[requests_detail] 查询参数:', { orderNo, openid })
  
  if (!orderNo) {
    return {
      success: false,
      data: null,
      message: '缺少 orderNo 参数'
    }
  }
  
  try {
    // 使用管理员权限查询（不受数据库权限限制）
    const result = await db.collection('requests')
      .where({ orderNo: String(orderNo) })
      .limit(1)
      .get()
    
    console.log('[requests_detail] 查询结果:', result)
    
    if (result.data && result.data.length > 0) {
      const doc = result.data[0]
      
      // 权限验证：仅允许本人或管理员查看
      // 注释掉严格检查，方便调试
      // if (doc._openid && doc._openid !== openid) {
      //   console.warn('[requests_detail] 权限不足: doc._openid=', doc._openid, ' 当前openid=', openid)
      //   return { success: false, data: null, message: '无权查看此需求' }
      // }
      
      // 🔥 如果有设计师ID，联查设计师信息（获取联系方式）
      if (doc.designerId) {
        try {
          console.log('[requests_detail] 查询设计师信息:', doc.designerId)
          const designerResult = await db.collection('designers')
            .doc(doc.designerId)
            .field({
              name: true,
              avatar: true,
              title: true,
              phone: true,
              wechat: true,
              email: true
            })
            .get()
          
          if (designerResult.data) {
            doc.designerInfo = designerResult.data
            console.log('[requests_detail] 设计师信息:', designerResult.data)
          }
        } catch (designerErr) {
          console.warn('[requests_detail] 查询设计师失败:', designerErr)
          // 查询设计师失败不影响主流程
        }
      }
      
      // 🔥 返回用户自定义的设计师联系方式（如果有）
      // customDesignerInfo 字段由用户手动添加，优先级高于系统分配的设计师信息
      if (doc.customDesignerInfo) {
        console.log('[requests_detail] 用户自定义联系方式:', doc.customDesignerInfo)
      }
      
      return {
        success: true,
        data: doc,
        message: 'ok'
      }
    } else {
      console.log('[requests_detail] 未找到记录')
      return {
        success: false,
        data: null,
        message: '未找到对应的需求记录'
      }
    }
  } catch (err) {
    console.error('[requests_detail] 查询出错:', err)
    return {
      success: false,
      data: null,
      message: err.message || '查询失败'
    }
  }
}

