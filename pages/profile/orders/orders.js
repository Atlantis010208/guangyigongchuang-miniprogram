// pages/profile/orders/orders.js
/**
 * 我的订单页面
 * 功能：展示用户订单列表，支持重新支付
 */
const util = require('../../../utils/util')

// 订单超时时间（毫秒）: 30分钟
const ORDER_TIMEOUT_MS = 30 * 60 * 1000

Page({
  data: {
    orders: [],
    loading: false,
    // 倒计时定时器ID
    countdownTimer: null
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
    this.startCountdown()
  },

  onHide() {
    this.stopCountdown()
  },

  onUnload() {
    this.stopCountdown()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadOrders().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载订单列表
   */
  async loadOrders() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      // 从云端加载订单
      const res = await util.callCf('mall_orders_list', { 
        category: 'mall',
        limit: 50 
      })

      let cloudOrders = []
      if (res && res.success && res.data) {
        cloudOrders = res.data.map(o => this.formatOrder(o))
      }

      // 从本地加载订单（降级方案）
      const localOrders = (wx.getStorageSync('mall_orders') || []).map(o => this.formatLocalOrder(o))

      // 合并去重
      const allOrders = [...cloudOrders, ...localOrders]
      const seen = new Set()
      const deduped = allOrders.filter(o => {
        const key = o.orderNo || o.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // 按创建时间倒序排列
      deduped.sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0))

      // 添加示例订单（如果没有订单）
      if (deduped.length === 0) {
        deduped.push(
          { id: 'A001', title: '居住空间光环境方案', status: '进行中', statusType: 'processing', desc: '已完成勘测，概念方案评审中', time: '2025-08-10', _type: 'service' },
          { id: 'A002', title: '商业重点照明项目', status: '已完成', statusType: 'completed', desc: '已验收，等待结算', time: '2025-07-28', _type: 'service' }
        )
      }

      this.setData({ orders: deduped })

    } catch (err) {
      console.error('加载订单失败:', err)
      // 使用本地数据作为降级
      this.loadLocalOrders()
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载本地订单（降级方案）
   */
  loadLocalOrders() {
    const mallOrders = wx.getStorageSync('mall_orders') || []
    const mapped = mallOrders.map(o => this.formatLocalOrder(o))
    this.setData({ orders: mapped })
  },

  /**
   * 格式化云端订单
   */
  formatOrder(o) {
    const items = (o.params && o.params.items) || []
    const firstItem = items[0] || {}
    const itemCount = items.length

    // 计算订单状态
    const { statusText, statusType, canPay, remainingTime } = this.getOrderStatus(o)

    return {
      id: o._id,
      orderNo: o.orderNo,
      title: `商城订单 · ${firstItem.name || '商品'}${itemCount > 1 ? ` 等${itemCount}件` : ''}`,
      status: statusText,
      statusType: statusType,
      afterSaleStatus: o.afterSaleStatus || '无售后',
      desc: `金额 ¥${o.params?.totalAmount || 0}`,
      time: this.formatTime(o.createdAt),
      createdAtTs: new Date(o.createdAt).getTime(),
      canPay: canPay,
      remainingTime: remainingTime,
      priority: o.priority || false,
      _type: 'mall',
      _raw: o
    }
  },

  /**
   * 格式化本地订单
   */
  formatLocalOrder(o) {
    const items = o.items || []
    const firstItem = items[0] || {}

    return {
      id: o.id,
      orderNo: o.id,
      title: `商城订单 · ${firstItem.name || '商品'}`,
      status: o.status || '待支付',
      statusType: o.paid ? 'paid' : 'pending',
      desc: `共 ${items.length} 件 · 金额 ¥${o.total || 0}`,
      time: this.formatTime(o.createdAt),
      createdAtTs: Number(o.createdAt) || 0,
      canPay: !o.paid && o.status !== 'closed',
      _type: 'mall'
    }
  },

  /**
   * 获取订单状态信息
   */
  getOrderStatus(order) {
    const now = Date.now()
    const createdAt = new Date(order.createdAt).getTime()
    const expireAt = createdAt + ORDER_TIMEOUT_MS

    // 已支付
    if (order.paid === true || order.status === 'paid') {
      return {
        statusText: '已支付',
        statusType: 'paid',
        canPay: false,
        remainingTime: 0
      }
    }

    // 已关闭
    if (order.status === 'closed' || order.status === 'cancelled') {
      return {
        statusText: '已关闭',
        statusType: 'closed',
        canPay: false,
        remainingTime: 0
      }
    }

    // 待支付 - 检查是否超时
    if (order.status === 'pending_payment' || order.status === 'pending') {
      const remainingMs = expireAt - now

      if (remainingMs <= 0) {
        // 已超时
        return {
          statusText: '已关闭',
          statusType: 'closed',
          canPay: false,
          remainingTime: 0
        }
      }

      // 计算剩余时间
      const remainingMin = Math.ceil(remainingMs / 1000 / 60)

      return {
        statusText: `待支付 · ${remainingMin}分钟后关闭`,
        statusType: 'pending',
        canPay: true,
        remainingTime: remainingMs
      }
    }

    // 默认状态
    return {
      statusText: order.status || '未知',
      statusType: 'unknown',
      canPay: false,
      remainingTime: 0
    }
  },

  /**
   * 启动倒计时更新
   */
  startCountdown() {
    this.stopCountdown()
    this.data.countdownTimer = setInterval(() => {
      this.updateCountdown()
    }, 60000) // 每分钟更新一次
  },

  /**
   * 停止倒计时
   */
  stopCountdown() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer)
      this.data.countdownTimer = null
    }
  },

  /**
   * 更新倒计时显示
   */
  updateCountdown() {
    const orders = this.data.orders.map(o => {
      if (o._raw && (o.statusType === 'pending')) {
        const { statusText, statusType, canPay, remainingTime } = this.getOrderStatus(o._raw)
        return { ...o, status: statusText, statusType, canPay, remainingTime }
      }
      return o
    })
    this.setData({ orders })
  },

  /**
   * 格式化时间
   */
  formatTime(ts) {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    } catch (e) { return '' }
  },

  /**
   * 查看订单详情
   */
  onDetail(e) {
    const id = e.currentTarget.dataset.id
    const orderNo = e.currentTarget.dataset.orderno
    const type = e.currentTarget.dataset.type

    if (type === 'mall') {
      wx.navigateTo({ url: `/pages/order/detail/detail?id=${orderNo || id}` })
      return
    }

    wx.showModal({ 
      title: '订单详情', 
      content: `订单 ${id} 详情展示（演示）`, 
      showCancel: false 
    })
  },

  /**
   * 去支付
   */
  onPay(e) {
    const orderNo = e.currentTarget.dataset.orderno
    if (!orderNo) {
      wx.showToast({ title: '订单信息错误', icon: 'none' })
      return
    }

    // 跳转到订单确认页重新支付
    wx.navigateTo({
      url: `/pages/order/confirm/confirm?orderNo=${orderNo}`
    })
  }
})
