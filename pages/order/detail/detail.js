// pages/order/detail/detail.js
const api = require('../../../utils/api')
const util = require('../../../utils/util')

// 默认工具包发货信息（当数据库未配置时使用）
const DEFAULT_TOOLKIT_DELIVERY = {
  title: '虚拟发货信息',
  content: '【超级会员V4】通过百度网盘分享的文件：工具包-¥69｜...',
  linkLabel: '链接',
  link: 'https://pan.baidu.com/s/1oV8s8g1S6pvES5Vl9LWUhw?pwd=1u1E',
  codeLabel: '提取码',
  extractCode: '1u1E',
  altContact: '复制这段内容打开「百度网盘APP 即可获取」\n需要"夸克网盘"或"其他方式"下载，加vx：ceokpi'
}

// 默认课程发货信息（当数据库未配置时使用）
const DEFAULT_COURSE_DELIVERY = {
  title: '虚拟发货信息',
  content: '分享内容：灯光课程-¥999｜二哥十年经验的灯光课（正课）',
  linkLabel: '课程链接',
  link: 'http://ug.link/DXP8800PRO-D50E/filemgr/share-download/?id=fe4e5b0cde3440fe8a59ab56eb8ce49e',
  codeLabel: '访问密码',
  extractCode: '2580',
  altContact: '由于还在预售阶段，课程还在更新中，加V（ceokpi）后续课程更新会同步发送通知，同时添加后会发"课程赠送的内容"给你。'
}

Page({
  data:{
    order: null,
    orderTime: '',
    addressText: '',
    showRefundSheet: false,
    refundActions: [
      { name: '仅退款', subname: '适用于虚拟商品或无需退回商品', type: 'refund_only' },
      { name: '退货退款', subname: '需先寄回商品，商家确认后退款', type: 'return_refund' }
    ],
    canApplyRefund: false,
    canCancel: false,
    canModify: false,  // 是否可以修改订单
    refundInfo: null,  // 退款记录
    showVirtualDelivery: false,  // 是否显示虚拟发货信息（仅已支付的虚拟商品）
    virtualDeliveryInfo: null    // 虚拟发货信息
  },

  async onLoad(query){
    // 兼容多种参数名：orderNo, id
    const id = query && (query.orderNo || query.id)
    console.log('订单详情页参数:', query, '订单号:', id)
    await this.loadOrderDetail(id)
  },

  onShow() {
    // 每次显示时刷新数据
    if (this.data.order && this.data.order.id) {
      this.loadOrderDetail(this.data.order.id)
    }
  },

  async loadOrderDetail(id) {
    if (!id) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      return
    }

    try{
      const db = api.dbInit()
      if (db) {
        const Orders = api.getOrdersRepo(db)
        const doc = await Orders.getByOrderNo(id)
        if (doc){
          const itemsRaw = (doc.params && doc.params.items) || []
          // 处理商品列表，兼容多种图片字段名
          const items = itemsRaw.map(it => {
            const specs = it.specs || {}
            const quantity = Number(it.quantity || 1)
            const price = Number(it.amount || it.price || 0)
            const subtotal = Math.round(price * quantity * 100) / 100
            // 兼容多种图片字段名
            const image = it.image || it.img || it.thumb || it.thumbnail || it.cover || it.picture || it.pic || it.imageUrl || it.imgUrl || ''
            return {
              id: it.id || it.productId,
              name: it.name,
              quantity: quantity,
              price: price,
              amount: price,
              subtotal: subtotal,
              image: image,
              specs: specs,
              specsText: this.formatSpecs(specs),
              paramPairs: this.specsToPairs(specs)
            }
          })
          
          // 对于没有图片的商品，尝试从商品库获取
          await this.fillMissingImages(items)
          
          const address = (doc.params && doc.params.address) || null
          let addressText = ''
          if (address) {
            if (address.full) {
              addressText = address.full
            } else {
              const regionStr = Array.isArray(address.region) ? address.region.join(' ') : ''
              addressText = [regionStr, address.town, address.detail].filter(Boolean).join(' ')
            }
          }
          
          const rawStatus = doc.status || 'pending'
          const order = {
            id: String(doc.orderNo || doc._id || ''),
            status: rawStatus,
            statusText: this.formatStatus(rawStatus),  // 中文状态显示
            afterSaleStatus: doc.afterSaleStatus || '无售后',
            createdAt: doc.createdAt || Date.now(),
            addressSnapshot: address,
            items,
            note: (doc.params && doc.params.note) || '',
            total: Number((doc.params && doc.params.totalAmount) || 0),
            priority: doc.priority || false
          }
          
          // 判断是否可以申请退款（已支付状态，或退款失败时可以重新申请）
          const paidStatus = ['paid', '已支付']
          const refundFailedStatus = ['退款失败']
          const canApplyRefund = (
            (paidStatus.includes(order.status) && order.afterSaleStatus !== '待售后') ||
            refundFailedStatus.includes(order.afterSaleStatus)
          )
          
          // 判断是否可以撤销（未支付/待支付状态）
          const cancelableStatus = ['pending', 'pending_payment', '待支付', '待付款']
          const canCancel = cancelableStatus.includes(order.status)
          
          // 判断是否可以修改订单（已发货、已完成、已取消、已退款、已关闭状态不允许修改）
          const unmodifiableStatus = ['shipped', '已发货', 'completed', '已完成', 'cancelled', 'canceled', '已取消', 'refunded', '已退款', 'closed', '已关闭']
          const canModify = !unmodifiableStatus.includes(order.status)
          
          // 判断是否显示虚拟发货信息（虚拟商品：已支付即可查看，无需发货）
          const isPaidOrShipped = paidStatus.includes(order.status) || ['shipped', '已发货'].includes(order.status)
          const hasToolkit = items.some(item => 
            item.id === 'toolkit' || 
            (item.name && item.name.includes('灯光设计工具包'))
          )
          const hasCourse = items.some(item => 
            item.id === 'course01' || 
            (item.name && (item.name.includes('灯光设计课') || item.name.includes('十年经验二哥')))
          )
          
          // 根据商品类型设置虚拟发货信息（虚拟商品支付成功即可查看）
          let showVirtualDelivery = false
          let virtualDeliveryInfo = null
          
          if (isPaidOrShipped && hasToolkit) {
            // 工具包：优先从数据库获取，获取不到则使用默认配置
            try {
              const deliveryInfo = await this.fetchDriveLink(true, false)
              if (deliveryInfo && deliveryInfo.link) {
                virtualDeliveryInfo = deliveryInfo
              } else {
                // 使用默认工具包发货信息
                virtualDeliveryInfo = DEFAULT_TOOLKIT_DELIVERY
              }
            } catch (e) {
              console.warn('获取网盘链接失败，使用默认配置:', e)
              virtualDeliveryInfo = DEFAULT_TOOLKIT_DELIVERY
            }
            showVirtualDelivery = true
          } else if (isPaidOrShipped && hasCourse) {
            // 课程：优先从数据库获取，获取不到则使用默认配置
            try {
              const deliveryInfo = await this.fetchDriveLink(false, true)
              if (deliveryInfo && deliveryInfo.link) {
                virtualDeliveryInfo = deliveryInfo
              } else {
                // 使用默认课程发货信息
                virtualDeliveryInfo = DEFAULT_COURSE_DELIVERY
              }
            } catch (e) {
              console.warn('获取课程网盘链接失败，使用默认配置:', e)
              virtualDeliveryInfo = DEFAULT_COURSE_DELIVERY
            }
            showVirtualDelivery = true
          }
          
          this.setData({ 
            order, 
            orderTime: this.formatTime(order.createdAt),
            addressText,
            canApplyRefund,
            canCancel,
            canModify,
            showVirtualDelivery,
            virtualDeliveryInfo
          })
          
          // 查询退款记录
          this.loadRefundInfo(order.id)
          return
        }
      }
      wx.showToast({ title: '订单不存在', icon: 'none' })
    }catch(e){ 
      console.error('加载订单失败:', e)
      wx.showToast({ title: '订单不存在', icon: 'none' }) 
    }
  },

  // 加载退款记录
  async loadRefundInfo(orderNo) {
    try {
      const result = await util.callCf('refund_detail', { orderNo })
      if (result && result.success && result.data) {
        const refundStatus = result.data.status
        
        // 当退款失败时，允许重新申请
        if (refundStatus === '退款失败') {
          this.setData({
            canApplyRefund: true
          })
        }
        
        this.setData({
          refundInfo: {
            refundNo: result.data.refundNo,
            status: refundStatus,
            refundTypeLabel: result.data.refundTypeLabel
          }
        })
      } else {
        this.setData({ refundInfo: null })
      }
    } catch (e) {
      console.warn('查询退款记录失败:', e)
      this.setData({ refundInfo: null })
    }
  },

  formatTime(ts){
    if (!ts) return ''
    try{
      const d = new Date(Number(ts))
      const y = d.getFullYear()
      const m = String(d.getMonth()+1).padStart(2,'0')
      const day = String(d.getDate()).padStart(2,'0')
      const hh = String(d.getHours()).padStart(2,'0')
      const mm = String(d.getMinutes()).padStart(2,'0')
      return `${y}-${m}-${day} ${hh}:${mm}`
    }catch(e){ return '' }
  },

  // 将订单状态转换为中文显示
  formatStatus(status) {
    const statusMap = {
      'pending': '待支付',
      'pending_payment': '待支付',
      'paid': '已支付',
      'shipped': '已发货',
      'delivered': '已送达',
      'completed': '已完成',
      'canceled': '已取消',
      'cancelled': '已取消',
      'closed': '已关闭',
      'refunding': '退款中',
      'refunded': '已退款',
      'failed': '支付失败',
      'payment_failed': '支付失败',
      'processing': '处理中',
      'confirmed': '已确认'
    }
    return statusMap[status] || status
  },

  formatSpecs(specs){
    if (!specs) return ''
    try{
      const labelMap = {
        size: '尺寸', cct: '色温', dimming: '调光', color: '颜色', combo:'组合', power:'功率', beam:'光束角', track:'轨道', kit:'套装', rail:'导轨长度', length:'长度', finish:'表面处理', switch:'开关', height:'高度', ip:'防护等级', adjust:'色温可调', type:'类型', control:'控制', sensor:'传感器'
      }
      return Object.keys(specs).map(k=>`${labelMap[k]||k}：${specs[k]}`).join('  ')
    }catch(e){ return '' }
  },

  specsToPairs(specs){
    if (!specs) return []
    const labelMap = { size:'尺寸', cct:'色温', dimming:'调光', color:'颜色', combo:'组合', power:'功率', beam:'光束角', track:'轨道', kit:'套装', rail:'导轨长度', length:'长度', finish:'表面处理', switch:'开关', height:'高度', ip:'防护等级', adjust:'色温可调', type:'类型', control:'控制', sensor:'传感器' }
    try{
      return Object.keys(specs).map(k=>({ key: k, label: labelMap[k] || k, value: specs[k] }))
    }catch(e){ return [] }
  },

  // 获取虚拟商品的网盘链接
  async fetchDriveLink(hasToolkit, hasCourse) {
    try {
      const db = api.dbInit()
      if (!db) return null
      
      if (hasToolkit) {
        // 查询工具包的网盘链接和完整发货信息
        const toolkitRes = await db.collection('toolkits')
          .where({ status: 'active', isDelete: 0 })
          .field({ driveLink: true, drivePassword: true, driveContent: true, driveAltContact: true, title: true })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
        
        if (toolkitRes.data && toolkitRes.data.length > 0) {
          const toolkit = toolkitRes.data[0]
          if (toolkit.driveLink) {
            return {
              title: '虚拟发货信息',
              // 优先使用数据库配置的内容描述，否则使用默认值
              content: toolkit.driveContent || `分享内容：${toolkit.title}`,
              linkLabel: '链接',
              link: toolkit.driveLink,
              codeLabel: '提取码',
              extractCode: toolkit.drivePassword || '无',
              // 优先使用数据库配置的备用说明，否则使用默认值
              altContact: toolkit.driveAltContact || '如有问题，请联系客服微信：ceokpi'
            }
          }
        }
      }
      
      if (hasCourse) {
        // 查询课程的网盘链接和完整发货信息
        const courseRes = await db.collection('courses')
          .where({ status: 'published', isDelete: 0 })
          .field({ driveLink: true, drivePassword: true, driveContent: true, driveAltContact: true, title: true })
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
        
        if (courseRes.data && courseRes.data.length > 0) {
          const course = courseRes.data[0]
          if (course.driveLink) {
            return {
              title: '虚拟发货信息',
              // 优先使用数据库配置的内容描述，否则使用默认值
              content: course.driveContent || `分享内容：${course.title}`,
              linkLabel: '课程链接',
              link: course.driveLink,
              codeLabel: '访问密码',
              extractCode: course.drivePassword || '无',
              // 优先使用数据库配置的备用说明，否则使用默认值
              altContact: course.driveAltContact || '课程更新通知请添加客服微信：ceokpi'
            }
          }
        }
      }
      
      return null
    } catch (e) {
      console.error('获取网盘链接失败:', e)
      return null
    }
  },

  // 填充缺失的商品图片（从商品库获取）
  async fillMissingImages(items) {
    if (!items || items.length === 0) return
    
    // 筛选出没有图片的商品
    const missingImageItems = items.filter(it => !it.image && it.id)
    if (missingImageItems.length === 0) return
    
    try {
      const db = api.dbInit()
      if (!db) return
      
      // 批量查询商品信息
      const productIds = missingImageItems.map(it => it.id)
      const productsRes = await db.collection('products').where({
        productId: db.command.in(productIds)
      }).field({ productId: true, images: true, image: true, img: true, thumb: true, cover: true }).get()
      
      if (productsRes && productsRes.data && productsRes.data.length > 0) {
        const productMap = {}
        productsRes.data.forEach(p => {
          // 获取商品图片，优先取 images 数组的第一张
          let img = ''
          if (p.images && Array.isArray(p.images) && p.images.length > 0) {
            img = p.images[0]
          } else {
            img = p.image || p.img || p.thumb || p.cover || ''
          }
          productMap[p.productId] = img
        })
        
        // 更新 items 中的图片
        items.forEach(it => {
          if (!it.image && it.id && productMap[it.id]) {
            it.image = productMap[it.id]
          }
        })
      }
    } catch (e) {
      console.warn('获取商品图片失败:', e)
    }
  },

  // 点击申请退货按钮
  onApplyRefund() {
    if (!this.data.order) return
    this.setData({ showRefundSheet: true })
  },

  // 关闭退款类型选择
  onCloseRefundSheet() {
    this.setData({ showRefundSheet: false })
  },

  // 选择退款类型
  onSelectRefundType(e) {
    const { type } = e.detail
    this.setData({ showRefundSheet: false })
    
    // 跳转到退款申请页面
    wx.navigateTo({
      url: `/pages/refund/apply/apply?orderNo=${this.data.order.id}&type=${type}`
    })
  },

  // 查看退款详情
  onViewRefund() {
    if (!this.data.refundInfo) return
    wx.navigateTo({
      url: `/pages/refund/detail/detail?refundNo=${this.data.refundInfo.refundNo}`
    })
  },

  onCancel(){
    if(!this.data.order) return
    wx.showModal({
      title:'撤销确认',
      content:'确定要撤销该订单吗？',
      success: async (res)=>{
        if(res.confirm){
          try{
            const r1 = await util.callCf('orders_update', { orderNo: this.data.order.id, patch: { status: 'canceled' } })
            const r2 = await util.callCf('requests_update', { orderNo: this.data.order.id, patch: { status: 'canceled' } })
            if ((r1 && r1.success) || (r2 && r2.success)) {
              this.setData({ 
                'order.status': 'canceled',
                'order.statusText': '已取消',
                canApplyRefund: false,
                canCancel: false
              })
              wx.showToast({ title:'已撤销', icon:'none' })
            } else {
              wx.showToast({ title:'撤销失败', icon:'none' })
            }
          }catch(err){ wx.showToast({ title:'撤销失败', icon:'none' }) }
        }
      }
    })
  },

  onDelete(){
    if(!this.data.order) return
    // 允许删除的状态：已完成、已取消、已退款、支付失败、已关闭
    const deletableStatus = ['canceled', 'cancelled', '已取消', 'completed', '已完成', 'refunded', '已退款', 'failed', 'payment_failed', '支付失败', 'closed', '已关闭']
    if(!deletableStatus.includes(this.data.order.status)){
      wx.showToast({ title:'当前状态不允许删除', icon:'none' })
      return
    }
    wx.showModal({
      title:'删除订单',
      content:'删除后将无法恢复，确认删除？',
      success: async (res)=>{
        if(res.confirm){
          const orderId = this.data.order.id
          try{
            await util.callCf('orders_remove', { orderNo: orderId })
            await util.callCf('requests_remove', { orderNo: orderId })
          }catch(err){ }
          wx.showToast({ title:'已删除', icon:'none' })
          setTimeout(()=>{ wx.navigateBack({}) }, 300)
        }
      }
    })
  },

  onModify(){
    if(!this.data.order) return
    
    // 检查订单状态是否允许修改
    if (!this.data.canModify) {
      wx.showToast({ 
        title: '当前订单状态不允许修改', 
        icon: 'none',
        duration: 2000
      })
      return
    }
    
    wx.navigateTo({ url: `/pages/order/edit/edit?id=${this.data.order.id}` })
  },

  onContact(){
    wx.showToast({ title:'联系客服', icon:'none' })
  },

  // 确认收货（已发货订单）
  onConfirmReceive() {
    if (!this.data.order) return
    
    // 只有已发货状态才能确认收货
    const shippedStatus = ['shipped', '已发货']
    if (!shippedStatus.includes(this.data.order.status)) {
      wx.showToast({ title: '当前状态不支持此操作', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '确认收货',
      content: '请确认您已收到商品，确认后订单将完成。',
      confirmText: '确认收货',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            const orderId = this.data.order.id
            const result = await util.callCf('orders_update', { 
              orderNo: orderId, 
              patch: { 
                status: 'completed',
                completedAt: new Date().toISOString()
              } 
            })
            
            wx.hideLoading()
            
            if (result && result.success) {
              this.setData({
                'order.status': 'completed',
                'order.statusText': '已完成',
                canApplyRefund: false,
                canCancel: false
              })
              wx.showToast({ title: '已确认收货', icon: 'success' })
            } else {
              wx.showToast({ title: result.errorMessage || '操作失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            console.error('确认收货失败:', err)
            wx.showToast({ title: '操作失败，请重试', icon: 'none' })
          }
        }
      }
    })
  },

  // 复制虚拟发货信息
  onCopyVirtualDelivery() {
    const info = this.data.virtualDeliveryInfo
    if (!info) return
    const linkLabel = info.linkLabel || '链接'
    const codeLabel = info.codeLabel || '提取码'
    const copyText = `${info.content}\n${linkLabel}：${info.link}\n${codeLabel}：${info.extractCode}\n${info.altContact}`
    wx.setClipboardData({
      data: copyText,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  },

  onMoreTap(){
    const items = ['联系客服']
    
    // 根据状态添加不同选项
    if (this.data.canCancel) {
      items.unshift('撤销订单')
    }
    if (this.data.canApplyRefund) {
      // 根据退款状态显示不同文字
      const refundBtnText = (this.data.refundInfo && this.data.refundInfo.status === '退款失败') 
        ? '重新申请退款' 
        : '申请退货'
      items.unshift(refundBtnText)
    }
    // 仅在允许修改时显示"修改订单"选项
    if (this.data.canModify) {
      items.unshift('修改订单')
    }
    // 允许删除的状态：已完成、已取消、已退款、支付失败、已关闭
    const deletableStatus = ['canceled', 'cancelled', '已取消', 'completed', '已完成', 'refunded', '已退款', 'failed', 'payment_failed', '支付失败', 'closed', '已关闭']
    if (this.data.order && deletableStatus.includes(this.data.order.status)) {
      items.push('删除订单')
    }
    
    wx.showActionSheet({
      itemList: items,
      success:(res)=>{
        if(typeof res.tapIndex !== 'number') return
        const action = items[res.tapIndex]
        switch(action) {
          case '申请退货':
          case '重新申请退款':
            this.onApplyRefund()
            break
          case '撤销订单':
            this.onCancel()
            break
          case '修改订单':
            this.onModify()
            break
          case '联系客服':
            this.onContact()
            break
          case '删除订单':
            this.onDelete()
            break
        }
      }
    })
  }
})
