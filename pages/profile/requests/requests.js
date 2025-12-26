/**
 * 我的设计请求页面
 * 功能：展示用户提交的设计请求列表，查看进度
 */
const util = require('../../../utils/util')

// 工作流阶段映射
const STAGE_MAP = {
  publish: { text: '需求发布', color: '#007aff' },
  survey: { text: '现场勘测', color: '#5856d6' },
  concept: { text: '概念设计', color: '#34c759' },
  calc: { text: '照度计算', color: '#ff9500' },
  selection: { text: '器具选型', color: '#ff2d55' },
  optimize: { text: '方案优化', color: '#af52de' },
  construction: { text: '施工支持', color: '#ffcc00' },
  commission: { text: '调试验收', color: '#00c7be' },
  completed: { text: '已完成', color: '#30d158' }
}

// 空间类型映射
const SPACE_MAP = {
  residential: '住宅照明',
  commercial: '商业照明',
  office: '办公照明',
  hotel: '酒店照明'
}

Page({
  data: {
    requests: [],        // 设计请求列表
    loading: false,      // 加载状态
    refreshing: false,   // 下拉刷新状态
    page: 1,             // 当前页码
    pageSize: 20,        // 每页数量
    hasMore: true,       // 是否有更多数据
    total: 0,            // 总数量
    isEmpty: false       // 是否为空
  },

  onLoad() {
    this.loadRequests()
  },

  onShow() {
    // 页面显示时刷新数据
    this.refreshData()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshData()
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    this.setData({
      page: 1,
      hasMore: true,
      refreshing: true
    })
    await this.loadRequests()
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  /**
   * 加载更多数据
   */
  async loadMore() {
    if (!this.data.hasMore || this.data.loading) return
    
    this.setData({
      page: this.data.page + 1
    })
    await this.loadRequests(true)
  },

  /**
   * 加载设计请求列表
   * @param {boolean} append - 是否追加数据（加载更多时为true）
   */
  async loadRequests(append = false) {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 获取当前用户的 openid
      const { result: loginResult } = await wx.cloud.callFunction({ name: 'login' })
      const openid = loginResult && loginResult.openid
      
      if (!openid) {
        console.error('获取用户身份失败')
        this.setData({ loading: false, isEmpty: true })
        return
      }
      
      // 构建查询条件：用户自己的设计请求（非商城订单）
      const query = {
        isDelete: _.neq(1),
        category: _.neq('mall')  // 排除商城订单
      }
      
      // 查询总数
      const countRes = await db.collection('requests')
        .where(query)
        .count()
      const total = countRes.total || 0
      
      // 分页查询
      const skip = (this.data.page - 1) * this.data.pageSize
      const res = await db.collection('requests')
        .where(query)
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(this.data.pageSize)
        .get()
      
      // 处理数据
      const requests = (res.data || []).map(item => {
        const stage = item.stage || 'publish'
        const stageInfo = STAGE_MAP[stage] || STAGE_MAP.publish
        const params = item.params || {}
        
        return {
          id: item._id,
          orderNo: item.orderNo || '',
          // 名称：使用空间类型或类别
          name: SPACE_MAP[item.category] || item.category || '设计需求',
          // 状态
          stage: stage,
          status: stageInfo.text,
          statusColor: stageInfo.color,
          // 描述
          desc: this.getStageDesc(stage, item),
          // 面积和预算
          area: params.areaBucketText || params.area || '',
          budget: params.estTotal ? `¥${params.estTotal}` : (params.budget || ''),
          // 设计师
          designerId: item.designerId || '',
          designerName: item.designerName || '',
          // 时间
          time: this.formatTime(item.createdAt),
          createdAt: item.createdAt,
          // 原始数据
          raw: item
        }
      })
      
      this.setData({
        requests: append ? [...this.data.requests, ...requests] : requests,
        total,
        hasMore: skip + requests.length < total,
        isEmpty: !append && requests.length === 0
      })
      
    } catch (err) {
      console.error('加载设计请求失败:', err)
      util.showToast('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 获取阶段描述
   */
  getStageDesc(stage, item) {
    const descMap = {
      publish: '需求已发布，等待设计师接单',
      survey: '设计师正在进行现场勘测',
      concept: '正在进行概念设计',
      calc: '正在进行照度计算',
      selection: '正在进行灯具选型',
      optimize: '正在优化设计方案',
      construction: '施工支持进行中',
      commission: '正在进行调试验收',
      completed: '设计服务已完成'
    }
    
    let desc = descMap[stage] || '需求处理中'
    
    // 如果有设计师，添加设计师信息
    if (item.designerName) {
      desc = `设计师: ${item.designerName} - ${desc}`
    }
    
    return desc
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 查看进度
   */
  onView(e) {
    const id = e.currentTarget.dataset.id
    const request = this.data.requests.find(item => item.id === id)
    
    if (!request) {
      util.showToast('请求不存在')
      return
    }
    
    // 跳转到进度详情页
    wx.navigateTo({
      url: `/pages/request/progress/progress?id=${id}`
    })
  },

  /**
   * 发布新需求
   */
  onPublish() {
    wx.navigateTo({
      url: '/pages/flows/publish/publish'
    })
  },

  /**
   * 联系客服
   */
  onContact() {
    wx.navigateTo({
      url: '/pages/support/contact/contact'
    })
  }
})
