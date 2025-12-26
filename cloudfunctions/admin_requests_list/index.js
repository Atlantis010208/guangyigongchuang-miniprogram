/**
 * 云函数：admin_requests_list
 * 功能：设计请求列表查询
 * 权限：管理员（roles=0）或设计师（roles=1）
 * 
 * 权限说明：
 * - 管理员：查看全部请求
 * - 设计师：仅查看分配给自己的请求
 * 
 * 支持两种调用来源：
 * 1. 微信小程序：通过 getWXContext() 获取 OPENID
 * 2. Web 后台（自定义登录）：通过 @cloudbase/node-sdk 获取 customUserId
 */
const cloud = require('wx-server-sdk')
const { requireBackendAuth, getErrorMessage } = require('./admin_auth')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    // 权限验证（支持管理员和设计师）
    const authResult = await requireBackendAuth(db, _)
    
    if (!authResult.ok) {
      console.log('[admin_requests_list] 权限验证失败:', authResult.errorCode)
      return { 
        success: false, 
        code: authResult.errorCode, 
        errorMessage: getErrorMessage(authResult.errorCode)
      }
    }
    
    const {
      limit = 20,
      offset = 0,
      orderNo = '',
      space,
      stage,
      status,
      designerId,
      source,  // 来源筛选 'appointment' | 'direct' | 'all'
      orderBy = 'createdAt',
      order = 'desc',
      // 前端传递的设计师模式标识（可选，用于前端主动请求过滤）
      _designerMode,
      _designerId
    } = event
    
    // 构建查询条件
    let query = { 
      isDelete: _.neq(1)
    }
    
    // ========== 设计师数据过滤 ==========
    // 如果是设计师登录（roles=1），强制只查看自己的请求
    if (authResult.roles === 1 && authResult.designerId) {
      query.designerId = authResult.designerId
      console.log('[admin_requests_list] 设计师模式，筛选 designerId:', authResult.designerId)
    } 
    // 管理员可以按 designerId 筛选
    else if (designerId) {
      query.designerId = designerId
    }
    
    // 订单号搜索
    if (orderNo) {
      query.orderNo = db.RegExp({ regexp: orderNo, options: 'i' })
    }
    
    // 空间类型筛选（数据库中字段名是 category）
    if (space) {
      query.category = space
    } else {
      // 默认排除商城订单
      query.category = _.neq('mall')
    }
    
    // 工作流阶段筛选
    if (stage) {
      query.stage = stage
    }
    
    // 状态筛选
    if (status) {
      query.status = status
    }
    
    // 关联预约筛选
    if (source === 'appointment') {
      query.appointmentId = _.exists(true).and(_.neq(''))
    } else if (source === 'direct') {
      query.appointmentId = _.exists(false).or(_.eq(''))
    }
    
    // 获取总数
    const countRes = await db.collection('requests').where(query).count()
    
    // 获取数据
    const dataRes = await db.collection('requests')
      .where(query)
      .orderBy(orderBy, order)
      .skip(offset)
      .limit(Math.min(limit, 100))
      .get()
    
    // 获取关联的用户和设计师信息
    const userIds = [...new Set(dataRes.data.map(r => r.userId).filter(Boolean))]
    const designerIds = [...new Set(dataRes.data.map(r => r.designerId).filter(Boolean))]
    
    let usersMap = {}
    let designersMap = {}
    
    if (userIds.length > 0) {
      const usersRes = await db.collection('users')
        .where({ _id: _.in(userIds) })
        .field({ _id: true, nickname: true, phoneNumber: true, purePhoneNumber: true, avatarUrl: true })
        .get()
      usersRes.data.forEach(u => { usersMap[u._id] = u })
      
      const unmatchedIds = userIds.filter(id => !usersMap[id])
      if (unmatchedIds.length > 0) {
        const usersRes2 = await db.collection('users')
          .where({ _openid: _.in(unmatchedIds) })
          .field({ _openid: true, nickname: true, phoneNumber: true, purePhoneNumber: true, avatarUrl: true })
          .get()
        usersRes2.data.forEach(u => { usersMap[u._openid] = u })
      }
    }
    
    if (designerIds.length > 0) {
      const designersRes = await db.collection('designers')
        .where({ _id: _.in(designerIds) })
        .field({ _id: true, name: true, avatar: true })
        .get()
      designersRes.data.forEach(d => { designersMap[d._id] = d })
    }
    
    // 空间类型映射
    const spaceTypeMap = {
      residential: '住宅照明',
      commercial: '商业照明',
      office: '办公照明',
      hotel: '酒店照明',
      publish: '发布需求',
      selection: '选配服务',
      optimize: '方案优化',
      custom: '个性需求'
    }
    
    // 工作流阶段映射
    const stageMap = {
      publish: '需求发布',
      survey: '现场勘测',
      concept: '概念设计',
      calc: '照度计算',
      selection: '器具选型',
      optimize: '方案优化',
      construction: '施工支持',
      commission: '调试验收',
      completed: '已完成'
    }
    
    // 收集所有需要转换的云存储 URL
    const cloudFileIds = []
    dataRes.data.forEach(request => {
      const avatarUrl = request.userAvatar || (usersMap[request.userId] || {}).avatarUrl || ''
      if (avatarUrl && avatarUrl.startsWith('cloud://')) {
        cloudFileIds.push(avatarUrl)
      }
    })
    
    // 批量获取临时访问链接
    let fileUrlMap = {}
    if (cloudFileIds.length > 0) {
      try {
        const tempUrlRes = await cloud.getTempFileURL({
          fileList: [...new Set(cloudFileIds)]
        })
        if (tempUrlRes && tempUrlRes.fileList) {
          tempUrlRes.fileList.forEach(item => {
            if (item.fileID && item.tempFileURL) {
              fileUrlMap[item.fileID] = item.tempFileURL
            }
          })
        }
      } catch (urlErr) {
        console.log('[admin_requests_list] 获取临时URL失败（非致命）:', urlErr.message)
      }
    }
    
    // 格式化返回数据
    const requests = dataRes.data.map(request => {
      const params = request.params || {}
      const category = request.category || ''
      
      let area = ''
      let budget = ''
      let contact = ''
      let service = ''
      
      if (['residential', 'commercial', 'office', 'hotel'].includes(category)) {
        area = params.areaBucketText || ''
        budget = params.estTotal ? `¥${params.estTotal}` : ''
        service = params.renovationTypeText || params.style || ''
        contact = params.contact || ''
      } else if (category === 'publish') {
        area = params.area || ''
        budget = params.budget || ''
        service = params.service || ''
        contact = params.contact || ''
      } else {
        area = params.area || params.areaBucketText || ''
        budget = params.budget || (params.estTotal ? `¥${params.estTotal}` : '')
        service = params.service || ''
        contact = params.contact || ''
      }
      
      const dbUser = usersMap[request.userId] || {}
      const originalAvatarUrl = request.userAvatar || dbUser.avatarUrl || ''
      const avatarUrl = originalAvatarUrl.startsWith('cloud://') 
        ? (fileUrlMap[originalAvatarUrl] || '') 
        : originalAvatarUrl
      
      const userInfo = {
        nickname: request.userNickname || dbUser.nickname || '',
        phoneNumber: request.userPhone || dbUser.phoneNumber || dbUser.purePhoneNumber || '',
        avatarUrl: avatarUrl
      }
      
      return {
        ...request,
        space: category,
        area: area,
        budget: budget,
        service: service,
        contact: contact,
        stage: request.stage || 'publish',
        priority: request.priority || false,
        userInfo: userInfo.nickname || userInfo.phoneNumber ? userInfo : null,
        designerInfo: designersMap[request.designerId] || null,
        spaceLabel: spaceTypeMap[category] || category,
        stageLabel: stageMap[request.stage] || stageMap['publish'],
        source: request.source || 'direct',
        sourceLabel: request.source === 'appointment' ? '预约转化' : '直接提交',
        appointmentId: request.appointmentId || null,
        hasAppointment: !!request.appointmentId
      }
    })
    
    return {
      success: true,
      code: 'OK',
      data: requests,
      total: countRes.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + dataRes.data.length < countRes.total
      },
      // 返回当前用户角色信息，前端可据此调整UI
      userRoles: authResult.roles,
      designerId: authResult.designerId,
      message: '获取设计请求列表成功'
    }
    
  } catch (err) {
    console.error('[admin_requests_list] Error:', err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      errorMessage: err.message || '服务器错误'
    }
  }
}
