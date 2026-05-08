/**
 * 照度计算结果页面 - 8页全屏报告
 * 用于展示计算结果的详细信息，支持 CSV 导出
 */

const membershipUtil = require('../../../utils/membership.js')

// 5 张照度参考图的云存储 fileID（与 illustrationList 顺序一一对应）
const ILLUSTRATION_FILE_IDS = [
  'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/lighting-ref/lux-50.jpg',
  'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/lighting-ref/lux-100.jpg',
  'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/lighting-ref/lux-150.jpg',
  'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/lighting-ref/lux-200.jpg',
  'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/lighting-ref/lux-300.jpg'
]

Page({
  data: {
    // 计算模式
    mode: 'count', // 'count' | 'quantity' | 'lux'
    
    // 云端记录ID
    calcId: '',
    // 后端生成的CSV数据
    csvData: null,
    // 加载状态
    loading: false,

    // 主要结果（原始数据，保留用于 CSV 导出）
    mainValue: 0,
    mainUnit: '',
    mainLabel: '',
    headerLeft: { label: '', value: '' },
    headerMiddle: null,
    headerRight: { label: '', value: '' },
    details: [],
    bottomTable: [],

    // ====== 报告页面数据 ======
    currentPage: 0,

    // P1: 封面（动态参数列表，根据计算模式变化）
    coverParams: [],

    // P2: 核心结论
    coreResult: {
      luxValue: 0,
      isQualified: true,
      statusText: '达标（处于舒适区间）',
      standardText: '住宅客厅建议照度：150–300 lx',
      tipText: '当前照度处于国家建议区间内，适合日常生活使用。'
    },

    // P3: 照度区间
    animatedMarkerLeft: 0,
    rangeData: {
      luxValue: 0,
      markerLeft: 38,
      currentBrightness: 1.0,
      activeIndex: 2,
      ranges: [
        { range: '0–80 lx', state: '昏暗区', scene: '酒吧 / 情绪氛围', colorClass: 'dot-dark', active: false },
        { range: '80–150 lx', state: '偏暗区', scene: '夜间休闲', colorClass: 'dot-dim', active: false },
        { range: '150–300 lx', state: '舒适区', scene: '客厅日常活动', colorClass: 'dot-comfort', active: true },
        { range: '300–500 lx', state: '偏亮区', scene: '酒吧 / 精细活动', colorClass: 'dot-bright', active: false },
        { range: '>500 lx', state: '过亮区', scene: '商业空间', colorClass: 'dot-over', active: false }
      ]
    },

    // P3: 5 张照度参考图（与 ranges 一一对应，顺序与索引一致）
    // 图片存放在云存储 lighting-ref/ 目录下，src 初始为云 fileID，
    // 在 onLoad 中通过 wx.cloud.getTempFileURL 转换为 https 临时链接以确保兼容性
    illustrationIndex: 2,
    illustrationList: [
      { key: 'dark', src: ILLUSTRATION_FILE_IDS[0], state: '昏暗区', range: '0–80 lx', colorClass: 'dot-dark' },
      { key: 'dim', src: ILLUSTRATION_FILE_IDS[1], state: '偏暗区', range: '80–150 lx', colorClass: 'dot-dim' },
      { key: 'comfort', src: ILLUSTRATION_FILE_IDS[2], state: '舒适区', range: '150–300 lx', colorClass: 'dot-comfort' },
      { key: 'bright', src: ILLUSTRATION_FILE_IDS[3], state: '偏亮区', range: '300–500 lx', colorClass: 'dot-bright' },
      { key: 'over', src: ILLUSTRATION_FILE_IDS[4], state: '过亮区', range: '>500 lx', colorClass: 'dot-over' }
    ],

    // P4: 详细数据
    detailData: {
      inputParams: [],
      calcResults: []
    },

    // P5: 风险与舒适度
    riskData: {
      isQualified: true,
      statusLabel: '舒适达标',
      impacts: [
        '光线柔和适中，满足日常起居需求',
        '长时间阅读或看电视不易产生视觉疲劳',
        '空间氛围自然放松，适合长期居住'
      ],
      suggestions: [
        '当前基础照明已达标，无需增减主灯',
        '若有精细阅读需求，建议在沙发旁补充落地灯',
        '可增加少量低色温氛围灯带提升层次感'
      ]
    },

    // P6: 舒适指数
    animatedScoreWidth: false,
    comfortData: {
      score: 92,
      levelText: 'A级：适合长期居住',
      scores: [
        { label: '照度合理性', score: 38, max: 40 },
        { label: '能耗效率', score: 18, max: 20 },
        { label: '舒适区间匹配度', score: 18, max: 20 },
        { label: '优化空间', score: 18, max: 20 }
      ]
    },

    // P7: 节能
    energyData: {
      currentDensity: '3.4',
      standardDensity: '6.0',
      assessTitle: '节能评估优秀',
      assessDesc: '当前方案功率密度远低于国家标准上限，在保证照度舒适的前提下，实现了优秀的节能效果。',
      currentWatt: 96,
      currentCost: 84,
      standardWatt: 168,
      standardCost: 147,
      costPercent: 56
    },

    // P8: 免责声明
    disclaimerItems: [
      '本报告基于平均照度估算，数据通过理论公式推导得出。',
      '计算过程未考虑墙面反射率、家具遮挡、灯具实际光衰等复杂物理因素。',
      '评估结果不代表最终实际落地效果，可能存在一定偏差。',
      '本报告仅作为灯光设计与选型的参考依据，不作为任何法律或商业承诺。'
    ],

    // ====== 导出报告功能状态 ======
    // 会员状态（用户点击导出按钮时验证）
    membership: {
      effectiveLevel: 'free',
      vipLevel: null,
      vipExpireAt: null,
      remainingDays: 0,
      isLoggedIn: false
    },
    // 署名输入弹窗
    showSignatureModal: false,
    signatureName: '',      // 设计师姓名
    signatureStudio: '',    // 工作室 / 公司（可选）
    // 会员门槛 (paywall) 弹窗 —— 免费用户点「导出报告」时出现
    showPaywallModal: false,
    paywallInviteProgress: { inCycle: 0, needed: 2, percent: 0, nextRewardDays: 7 },
    paywallInvitedTotal: 0,
    paywallTrialGranted: 0,
    // 导出后预览弹窗状态
    showPreviewModal: false,
    // PDF 临时文件路径（本地，wx.env.USER_DATA_PATH 下）
    exportedPdfPath: '',
    // PDF 文件名（含后缀，用于分享消息中显示）
    exportedPdfFileName: '',
    // PDF 文件大小的可读文本（如 "512 KB"）
    exportedPdfSizeText: '',
    // 导出进行中 Loading
    exporting: false,
    exportingText: ''
  },

  onLoad(options) {
    console.log('[calc-result] onLoad, options:', options)

    // 异步加载云存储照度参考图的临时 https URL（与下方业务数据加载并行，不阻塞主流程）
    this._loadIllustrationUrls()

    // 方式1：从页面栈读取后端返回的完整报告数据（正常计算流程）
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]

    if (prevPage && prevPage.data._cloudReportData) {
      // 后端云函数返回的完整数据
      const cloudData = prevPage.data._cloudReportData
      this._applyCloudReportData(cloudData)
      return
    }

    // 方式2：通过 calcId 参数从云端加载（历史记录/分享场景）
    if (options && options.calcId) {
      this._loadFromCloud(options.calcId)
      return
    }

    // 方式3：兜底 - 从页面栈读取 resultData 并在前端本地生成报告
    if (prevPage && prevPage.data.resultData) {
      const resultData = prevPage.data.resultData
      this._applyResultData(resultData)
      this._buildReportData(resultData)
      return
    }

    // 无数据可用
    wx.showToast({ title: '无法加载报告数据', icon: 'none' })
  },

  /**
   * 把照度参考图的云存储 fileID 批量转换为 https 临时 URL，并写回 illustrationList.src
   * - 临时链接默认 2 小时有效，每次进入页面拉取一次足够使用
   * - 失败时保留 fileID，原生 image 组件在云开发已 init 的情况下也能加载
   */
  _loadIllustrationUrls() {
    if (!wx.cloud || typeof wx.cloud.getTempFileURL !== 'function') return
    wx.cloud.getTempFileURL({
      fileList: ILLUSTRATION_FILE_IDS,
      success: (res) => {
        const urlMap = {}
        ;(res.fileList || []).forEach(f => {
          if (f && f.fileID && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
        })
        const list = (this.data.illustrationList || []).map((item, idx) => {
          const fileID = ILLUSTRATION_FILE_IDS[idx]
          const url = urlMap[fileID]
          return url ? Object.assign({}, item, { src: url }) : item
        })
        this.setData({ illustrationList: list })
      },
      fail: (err) => {
        console.error('[calc-result] 获取云存储照度参考图 URL 失败:', err)
      }
    })
  },

  /**
   * 应用后端云函数返回的完整报告数据
   */
  _applyCloudReportData(cloudData) {
    const { calcId, reportData, csvData, resultData } = cloudData

    // 设置原始结果数据（用于CSV兜底导出）
    if (resultData) {
      this._applyResultData(resultData)
    }

    // 兼容老版本云函数没有返回 activeIndex 的情况，按 ranges 找出当前激活的索引
    const incomingRangeData = (reportData && reportData.rangeData) ? reportData.rangeData : this.data.rangeData
    const normalizedRangeData = this._normalizeRangeData(incomingRangeData)

    // 直接使用后端生成的报告数据渲染
    this.setData({
      calcId: calcId || '',
      csvData: csvData || null,
      coverParams: (reportData && reportData.coverParams) || [],
      coreResult: (reportData && reportData.coreResult) || this.data.coreResult,
      rangeData: normalizedRangeData,
      illustrationIndex: normalizedRangeData.activeIndex,
      detailData: (reportData && reportData.detailData) || this.data.detailData,
      riskData: (reportData && reportData.riskData) || this.data.riskData,
      comfortData: (reportData && reportData.comfortData) || this.data.comfortData,
      energyData: (reportData && reportData.energyData) || this.data.energyData,
      disclaimerItems: (reportData && reportData.disclaimerItems) || this.data.disclaimerItems
    }, () => {
      // 页面初始加载时如果就在 P3 (currentPage === 2)，也需要触发一下动效
      if (this.data.currentPage === 2) {
        setTimeout(() => {
          this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
        }, 50)
      }
      if (this.data.currentPage === 5) {
        setTimeout(() => {
          this.setData({ animatedScoreWidth: true })
        }, 50)
      }
    })
  },

  /**
   * 标准化 rangeData：保证 activeIndex 字段存在
   * 兼容老版本云函数返回的数据中没有 activeIndex 的情况
   */
  _normalizeRangeData(rangeData) {
    if (!rangeData) return this.data.rangeData
    const cloned = Object.assign({}, rangeData)
    if (typeof cloned.activeIndex !== 'number') {
      const ranges = cloned.ranges || []
      const idx = ranges.findIndex(r => r && r.active)
      cloned.activeIndex = idx >= 0 ? idx : 2
    }
    return cloned
  },

  /**
   * 设置原始结果数据字段
   */
  _applyResultData(resultData) {
    this.setData({
      mode: resultData.mode || 'count',
      mainValue: resultData.mainValue || 0,
      mainUnit: resultData.mainUnit || '',
      mainLabel: resultData.mainLabel || '',
      headerLeft: resultData.headerLeft || { label: '', value: '' },
      headerMiddle: resultData.headerMiddle || null,
      headerRight: resultData.headerRight || { label: '', value: '' },
      details: resultData.details || [],
      bottomTable: resultData.bottomTable || []
    })
  },

  /**
   * 通过 calcId 从云端加载完整报告
   */
  _loadFromCloud(calcId) {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载报告中...' })

    wx.cloud.callFunction({
      name: 'calc_report',
      data: { action: 'get', calcId }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.success && result.data) {
        this._applyCloudReportData(result.data)
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
      }
      this.setData({ loading: false })
    }).catch(err => {
      wx.hideLoading()
      console.error('[calc-result] 云端加载失败:', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  onShow() {
    wx.setNavigationBarTitle({ title: '照度评估报告' })
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#F8FAFC'
    })
    // 拉取会员状态（用于导出报告验证）。不阻塞主流程，只需点击时该字段已准备好
    this._fetchMembership()
  },

  /**
   * 拉取当前用户会员状态（仅用于导出权限检查）
   */
  _fetchMembership() {
    membershipUtil.fetchMembershipStatus().then(status => {
      this.setData({ membership: status })
      this._refreshPaywallInviteProgress()
    }).catch(err => {
      console.warn('[calc-result] 会员状态拉取失败:', err)
      this.setData({ membership: membershipUtil.getFallbackStatus(false) })
      this._refreshPaywallInviteProgress()
    })
  },

  /**
   * 同步计算 paywall 弹窗内邀请进度（每次会员状态变化后调用）
   */
  _refreshPaywallInviteProgress() {
    const stats = (this.data.membership && this.data.membership.inviteStats) || {}
    const invitedCount = Number(stats.invitedCount) || 0
    this.setData({
      paywallInviteProgress: membershipUtil.getInviteProgress(invitedCount),
      paywallInvitedTotal: invitedCount,
      paywallTrialGranted: Number(stats.trialDaysGranted) || 0
    })
  },

  /** 关闭 paywall 弹窗 */
  onClosePaywall() {
    this.setData({ showPaywallModal: false })
  },

  /**
   * 点击「邀请好友」：button open-type=share 会自动调起微信转发面板，这里仅负责封闭弹窗、提示用户。
   * 实际分享内容由 onShareAppMessage 返回。
   */
  onPaywallInviteTap() {
    // 需要登录才能获得邀请码，未登录不应出现在这里（但双保险）
    if (!this.data.membership || !this.data.membership.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    // open-type=share 由微信原生接管，这里不需要 navigateTo。
    // 仅在弹窗关闭后让用户看到当前页面（不主动关闭，避免遮住转发面板）
    console.log('[calc-result] 点击邀请好友，调起转发面板')
  },

  /** 点击「开通会员」：关闭弹窗 + 跳转升级页 */
  onPaywallUpgradeTap() {
    this.setData({ showPaywallModal: false })
    wx.navigateTo({ url: '/pages/profile/membership/upgrade/upgrade' })
  },

  /**
   * 微信转发面板内容（右上角胶囊菜单 / button open-type=share 都会调这里）
   * 包含当前用户邀请码参数，好友点击后能被识别为被邀请用户
   */
  onShareAppMessage() {
    const code = (this.data.membership && this.data.membership.inviteCode) || ''
    const sharePath = code
      ? `/pages/index/index?inviteCode=${encodeURIComponent(code)}`
      : '/pages/index/index'
    return {
      title: '光乙共创：邀你一起体验专业灯光设计工具',
      path: sharePath,
      imageUrl: ''
    }
  },

  // ========== Swiper 切换 ==========
  onSwiperChange(e) {
    const current = e.detail.current
    this.setData({ currentPage: current })

    // 处理 P3 照度区间分布页的进度条滑动动效
    if (current === 2) {
      setTimeout(() => {
        this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
      }, 50)
      // 进入 P3 时把照度参考图重置回用户实际所在区间
      const targetIdx = (this.data.rangeData && typeof this.data.rangeData.activeIndex === 'number')
        ? this.data.rangeData.activeIndex
        : 2
      if (this.data.illustrationIndex !== targetIdx) {
        this.setData({ illustrationIndex: targetIdx })
      }
    } else {
      if (this.data.animatedMarkerLeft !== 0) {
        this.setData({ animatedMarkerLeft: 0 })
      }
    }

    // 处理 P6 舒适指数页的分数条生长动效
    if (current === 5) {
      setTimeout(() => {
        this.setData({ animatedScoreWidth: true })
      }, 50)
    } else {
      if (this.data.animatedScoreWidth) {
        this.setData({ animatedScoreWidth: false })
      }
    }
  },

  /**
   * 照度参考图水平 swiper 切换事件
   */
  onIllustrationChange(e) {
    const idx = e.detail.current
    if (idx !== this.data.illustrationIndex) {
      this.setData({ illustrationIndex: idx })
    }
  },

  /**
   * 点击区间列表项：切换上方图片 swiper 到对应区间的参考图
   */
  onRangeTap(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    if (isNaN(idx) || idx < 0 || idx > 4) return
    if (idx !== this.data.illustrationIndex) {
      this.setData({ illustrationIndex: idx })
    }
  },

  // ========== 报告数据生成 ==========

  /**
   * 根据原始计算数据生成8页报告所需的各项数据
   */
  _buildReportData(resultData) {
    const mode = resultData.mode || 'count'
    const details = resultData.details || []
    const mainValue = parseFloat(resultData.mainValue) || 0

    // --- 从 details 中提取关键参数 ---
    const getDetailVal = (label) => {
      const item = details.find(d => d.label && d.label.indexOf(label) !== -1)
      return item ? item.value : ''
    }

    const area = parseFloat(getDetailVal('面积')) || 28
    const lampCount = parseInt(getDetailVal('灯具数量') || getDetailVal('数量')) || 12
    const singleFlux = parseFloat(getDetailVal('单灯流明') || getDetailVal('光通量')) || 850
    const totalFlux = parseFloat(getDetailVal('总流明')) || (singleFlux * lampCount)
    const totalPower = parseFloat(getDetailVal('总功率') || getDetailVal('功率')) || 96
    const powerDensity = totalPower > 0 && area > 0 ? (totalPower / area).toFixed(1) : '3.4'
    const lampModel = getDetailVal('灯具') || getDetailVal('型号') || 'XXX 型号'

    // 计算照度值（根据模式取不同值）
    let luxValue = 0
    if (mode === 'lux') {
      luxValue = mainValue
    } else {
      // count/quantity 模式主值可能不是照度，尝试从 details 中取
      const luxFromDetail = parseFloat(getDetailVal('照度') || getDetailVal('Eavg'))
      luxValue = luxFromDetail || mainValue
    }

    // --- P1: 封面 ---
    const now = new Date()
    const calcTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
    const reportNo = `REP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`

    // --- P2: 核心结论 ---
    const isQualified = luxValue >= 150 && luxValue <= 300
    const isLow = luxValue < 150
    const isHigh = luxValue > 300
    let statusText = '达标（处于舒适区间）'
    let tipText = '当前照度处于国家建议区间内，适合日常生活使用。'
    if (isLow) {
      statusText = '偏低（低于舒适区间）'
      tipText = '当前照度偏低，建议增加灯具数量或提升单灯亮度以改善照明效果。'
    } else if (isHigh) {
      statusText = '偏高（高于舒适区间）'
      tipText = '当前照度偏高，长时间可能造成视觉疲劳，建议适当降低亮度。'
    }

    // --- P3: 照度区间标记位置 ---
    let markerLeft = 0
    if (luxValue <= 0) markerLeft = 0
    else if (luxValue <= 80) markerLeft = (luxValue / 80) * 16
    else if (luxValue <= 150) markerLeft = 16 + ((luxValue - 80) / 70) * 14
    else if (luxValue <= 300) markerLeft = 30 + ((luxValue - 150) / 150) * 30

    // 确定当前所在区间
    let activeIndex = 2
    if (luxValue < 80) activeIndex = 0
    else if (luxValue < 150) activeIndex = 1
    else if (luxValue <= 300) activeIndex = 2
    else if (luxValue <= 500) activeIndex = 3
    else activeIndex = 4

    const ranges = [
      { range: '0–80 lx', state: '昏暗区', scene: '酒吧 / 情绪氛围', colorClass: 'dot-dark', active: false },
      { range: '80–150 lx', state: '偏暗区', scene: '夜间休闲', colorClass: 'dot-dim', active: false },
      { range: '150–300 lx', state: '舒适区', scene: '客厅日常活动', colorClass: 'dot-comfort', active: false },
      { range: '300–500 lx', state: '偏亮区', scene: '阅读 / 精细活动', colorClass: 'dot-bright', active: false },
      { range: '>500 lx', state: '过亮区', scene: '商业空间', colorClass: 'dot-over', active: false }
    ]
    ranges[activeIndex].active = true

    // --- P4: 详细数据 ---
    const inputParams = [
      { label: '空间面积', value: area + ' ㎡' },
      { label: '灯具数量', value: lampCount + ' 盏' },
      { label: '单灯流明', value: singleFlux + ' lm' },
      { label: '总流明', value: Math.round(totalFlux) + ' lm' },
      { label: '总功率', value: Math.round(totalPower) + ' W' },
      { label: '功率密度', value: powerDensity + ' W/㎡' }
    ]

    const diffLow = luxValue - 150
    const diffHigh = luxValue - 300
    const calcResults = [
      { label: '平均照度', value: Math.round(luxValue) + ' lx', highlight: false },
      { label: '目标建议区间', value: '150–300 lx', highlight: false },
      { label: '与下限差值', value: (diffLow >= 0 ? '+' : '') + Math.round(diffLow) + ' lx', highlight: diffLow >= 0 },
      { label: '与上限差值', value: (diffHigh >= 0 ? '+' : '') + Math.round(diffHigh) + ' lx', highlight: false }
    ]

    // --- P5: 风险评估 ---
    let riskStatusLabel = '舒适达标'
    let impacts = [
      '光线柔和适中，满足日常起居需求',
      '长时间阅读或看电视不易产生视觉疲劳',
      '空间氛围自然放松，适合长期居住'
    ]
    let suggestions = [
      '当前基础照明已达标，无需增减主灯',
      '若有精细阅读需求，建议在沙发旁补充落地灯',
      '可增加少量低色温氛围灯带提升层次感'
    ]
    if (isLow) {
      riskStatusLabel = '照度偏低'
      impacts = [
        '光线不足可能导致长期视觉疲劳',
        '阅读和精细工作时容易眼睛酸涩',
        '空间整体偏暗，可能影响日常活动效率'
      ]
      suggestions = [
        '建议增加灯具数量或更换更高流明灯具',
        '在主要活动区域增加补充照明',
        '考虑增加台灯或落地灯提升局部照度'
      ]
    } else if (isHigh) {
      riskStatusLabel = '照度偏高'
      impacts = [
        '过亮的环境可能造成眩光不适',
        '长时间处于高照度下容易产生视觉疲劳',
        '不利于放松和休息的氛围营造'
      ]
      suggestions = [
        '建议减少灯具数量或降低单灯亮度',
        '可考虑增加调光功能以适应不同场景',
        '使用间接照明方式降低直射光线'
      ]
    }

    // --- P6: 舒适指数 ---
    let comfortScore = 92
    let levelText = 'A级：适合长期居住'
    let scoreReason = 38
    let scoreEfficiency = 18
    let scoreMatch = 18
    let scoreOptimize = 18

    if (isLow) {
      comfortScore = 58
      levelText = 'C级：建议优化提升'
      scoreReason = 20
      scoreEfficiency = 15
      scoreMatch = 10
      scoreOptimize = 13
    } else if (isHigh) {
      comfortScore = 65
      levelText = 'B级：基本满足需求'
      scoreReason = 22
      scoreEfficiency = 12
      scoreMatch = 15
      scoreOptimize = 16
    }

    // --- P7: 节能 ---
    const stdDensity = 6.0
    const currentDensityNum = parseFloat(powerDensity)
    const stdWatt = Math.round(stdDensity * area)
    const currentCost = Math.round(totalPower * 4 * 365 * 0.6 / 1000)
    const stdCost = Math.round(stdWatt * 4 * 365 * 0.6 / 1000)
    const costPercent = stdCost > 0 ? Math.round((currentCost / stdCost) * 100) : 56

    let assessTitle = '节能评估优秀'
    let assessDesc = '当前方案功率密度远低于国家标准上限，在保证照度舒适的前提下，实现了优秀的节能效果。'
    if (currentDensityNum > stdDensity) {
      assessTitle = '能耗偏高'
      assessDesc = '当前方案功率密度超出国家标准上限，建议优化灯具选型以降低能耗。'
    } else if (currentDensityNum > stdDensity * 0.7) {
      assessTitle = '节能评估良好'
      assessDesc = '当前方案功率密度接近国家标准上限，照明效果良好，仍有一定节能优化空间。'
    }

    // --- P1: 根据模式动态生成封面参数 ---
    const coverParams = []
    coverParams.push({ label: '空间类型', value: '客厅' })
    coverParams.push({ label: '建筑面积', value: area + ' ㎡' })
    coverParams.push({ label: '计算时间', value: calcTime })

    if (mode === 'count') {
      // 按照度算数量：显示计算结果
      coverParams.push({ label: '建议灯具数量', value: lampCount + ' 盏' })
      coverParams.push({ label: '功率密度', value: powerDensity + ' W/㎡' })
      const targetLuxVal = getDetailVal('目标') || getDetailVal('照度')
      if (targetLuxVal) coverParams.push({ label: '目标照度', value: targetLuxVal })
    } else if (mode === 'quantity') {
      // 按数量算照度：显示计算结果
      coverParams.push({ label: '建议单灯光通量', value: singleFlux + ' Lm' })
      const reqWattage = getDetailVal('购买') || getDetailVal('瓦数')
      if (reqWattage) coverParams.push({ label: '需购买瓦数', value: reqWattage })
      coverParams.push({ label: '灯具数量', value: lampCount + ' 盏' })
      const targetLuxVal = getDetailVal('目标') || getDetailVal('照度')
      if (targetLuxVal) coverParams.push({ label: '目标照度', value: targetLuxVal })
    } else {
      // lux 模式：显示总光通量 + 灯具明细
      coverParams.push({ label: '总光通量', value: Math.round(totalFlux) + ' Lm' })
      const bottomTable = this.data.bottomTable || []
      bottomTable.forEach(lamp => {
        const name = lamp.displayName || lamp.name || '未知灯具'
        const qty = parseFloat(lamp.lengthQty) || 0
        const pw = parseFloat(lamp.powerW) || 0
        const unit = (name.indexOf('灯带') !== -1) ? ' 米' : ' 盏'
        coverParams.push({ label: name, value: qty + unit + ' / ' + pw + 'W' })
      })
    }
    coverParams.push({ label: '报告编号', value: reportNo })

    // --- 统一 setData ---
    this.setData({
      coverParams: coverParams,
      coreResult: {
        luxValue: Math.round(luxValue),
        isQualified: isQualified,
        statusText: statusText,
        standardText: '住宅客厅建议照度：150–300 lx',
        tipText: tipText
      },
      rangeData: {
        luxValue: Math.round(luxValue),
        markerLeft: Math.round(markerLeft),
        currentBrightness: currentBrightness,
        activeIndex: activeIndex,
        ranges: ranges
      },
      illustrationIndex: activeIndex,
      detailData: {
        inputParams: inputParams,
        calcResults: calcResults
      },
      riskData: {
        isQualified: isQualified,
        statusLabel: riskStatusLabel,
        impacts: impacts,
        suggestions: suggestions
      },
      comfortData: {
        score: comfortScore,
        levelText: levelText,
        scores: [
          { label: '照度合理性', score: scoreReason, max: 40 },
          { label: '能耗效率', score: scoreEfficiency, max: 20 },
          { label: '舒适区间匹配度', score: scoreMatch, max: 20 },
          { label: '优化空间', score: scoreOptimize, max: 20 }
        ]
      },
      energyData: {
        currentDensity: powerDensity,
        standardDensity: stdDensity.toFixed(1),
        assessTitle: assessTitle,
        assessDesc: assessDesc,
        currentWatt: Math.round(totalPower),
        currentCost: currentCost,
        standardWatt: stdWatt,
        standardCost: stdCost,
        costPercent: Math.min(costPercent, 100)
      }
    }, () => {
      if (this.data.currentPage === 2) {
        setTimeout(() => {
          this.setData({ animatedMarkerLeft: this.data.rangeData.markerLeft })
        }, 50)
      }
      if (this.data.currentPage === 5) {
        setTimeout(() => {
          this.setData({ animatedScoreWidth: true })
        }, 50)
      }
    })
  },

  // ========== CSV 导出功能 ==========

  /**
   * 导出计算结果为 CSV 文件
   * 支持两种导出方式：发送给微信好友、复制到剪贴板
   */
  onExportCSV() {
    // 优先使用后端生成的 CSV 数据
    if (this.data.csvData && this.data.csvData.length > 0) {
      this._exportCsvFromRows(this.data.csvData)
      return
    }

    // 兜底：使用前端本地生成的 CSV 数据
    const { mode, mainValue, mainUnit, mainLabel, headerLeft, headerMiddle, headerRight, details, bottomTable } = this.data

    // 计算模式中文名
    const modeNames = {
      count: '按照度算灯具',
      quantity: '按数量算灯具',
      lux: '按灯具算照度'
    }
    const modeName = modeNames[mode] || '计算结果'

    // 构建 CSV 行数据（每行是一个数组）
    const csvRows = []

    // 报告标题
    csvRows.push(['照明计算报告'])
    csvRows.push([])

    // 计算模式
    csvRows.push(['计算模式', modeName])
    csvRows.push([])

    // === 主要结果 ===
    csvRows.push(['【主要结果】'])
    csvRows.push([mainLabel, mainValue + ' ' + mainUnit])

    if (headerLeft && headerLeft.label) {
      csvRows.push([headerLeft.label, headerLeft.value])
    }
    if (headerMiddle && headerMiddle.label) {
      csvRows.push([headerMiddle.label, headerMiddle.value])
    }
    if (headerRight && headerRight.label) {
      csvRows.push([headerRight.label, headerRight.value])
    }

    csvRows.push([])

    // === 详细参数 ===
    if (mode === 'lux') {
      // lux 模式：details 内容是各灯具的光通量，标题改为"灯具光通量"
      csvRows.push(['【灯具光通量明细】'])
    } else {
      csvRows.push(['【计算参数】'])
    }

    if (details && details.length > 0) {
      details.forEach(item => {
        csvRows.push([item.label, item.value])
      })
    }

    // === lux 模式额外灯具参数明细 ===
    if (mode === 'lux' && bottomTable && bottomTable.length > 0) {
      csvRows.push([])
      csvRows.push(['【灯具参数明细】'])
      csvRows.push(['灯具名称', '功率(W)', '光效(lm/W)', '数量', '光源利用率', '单灯总光通量(Lm)'])

      bottomTable.forEach(lamp => {
        const name = lamp.displayName || lamp.name || '未知灯具'
        const powerW = parseFloat(lamp.powerW) || 0
        const efficacy = parseFloat(lamp.efficacy) || 0
        const lengthQty = parseFloat(lamp.lengthQty) || 0
        const sourceUtil = parseFloat(lamp.sourceUtil) || 0
        const lampFlux = Math.round(powerW * efficacy * lengthQty * sourceUtil)
        csvRows.push([name, powerW, efficacy, lengthQty, sourceUtil, lampFlux])
      })
    }

    csvRows.push([])

    // === 导出信息 ===
    csvRows.push(['【导出信息】'])
    csvRows.push(['导出时间', this._formatDateTime(new Date())])
    csvRows.push(['计算工具', '二哥灯光照明计算'])

    // 生成 CSV 字符串（加 UTF-8 BOM 头，确保 Excel 正确显示中文）
    const csvContent = '\uFEFF' + csvRows.map(row => {
      return row.map(cell => {
        const str = String(cell != null ? cell : '')
        // 包含逗号、引号、换行符时用双引号包裹并转义
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }).join(',')
    }).join('\n')

    // 生成文件名
    const dateStr = this._formatDateCompact(new Date())
    const fileName = `照明计算_${modeName}_${dateStr}.csv`

    // 写入临时文件
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    try {
      fs.writeFileSync(filePath, csvContent, 'utf8')
      console.log('[calc-result] CSV 文件已写入:', filePath)
    } catch (err) {
      console.error('[calc-result] 写入 CSV 文件失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
      return
    }

    // 直接发送文件给朋友
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => {
        wx.showToast({ title: '发送成功', icon: 'success' })
      },
      fail: (err) => {
        console.error('[calc-result] 分享文件失败:', err)
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '发送失败，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 从后端返回的 CSV 行数据导出文件
   * @param {Array} rows - 二维数组，每项为一行
   */
  _exportCsvFromRows(rows) {
    const modeNames = {
      count: '按照度算灯具',
      quantity: '按数量算灯具',
      lux: '按灯具算照度'
    }
    const modeName = modeNames[this.data.mode] || '计算结果'

    const csvContent = '\uFEFF' + rows.map(row => {
      return (row || []).map(cell => {
        const str = String(cell != null ? cell : '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }).join(',')
    }).join('\n')

    const dateStr = this._formatDateCompact(new Date())
    const fileName = `照明计算_${modeName}_${dateStr}.csv`
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    try {
      fs.writeFileSync(filePath, csvContent, 'utf8')
    } catch (err) {
      console.error('[calc-result] 写入 CSV 文件失败:', err)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
      return
    }

    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => { wx.showToast({ title: '发送成功', icon: 'success' }) },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '发送失败，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 格式化日期时间（用于显示）
   * @param {Date} date
   * @returns {string} 如 "2026-02-06 17:13:00"
   */
  _formatDateTime(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}:${s}`
  },

  /**
   * 格式化日期（紧凑格式，用于文件名）
   * @param {Date} date
   * @returns {string} 如 "20260206_1713"
   */
  _formatDateCompact(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}${m}${d}_${h}${min}`
  },

  // ========== 页面操作 ==========

  // 重新计算（返回上一页）
  onRecalculate() {
    wx.navigateBack({
      delta: 1
    })
  },

  // ============================================================
  // 导出报告功能
  // ============================================================

  /**
   * 点击右上角「导出报告」按钮
   * 流程：未登录 → 登录引导；免费用户 → 开通会员引导；会员 → ActionSheet 选择「署名 / 直接」
   */
  onExportReportTap() {
    const m = this.data.membership || {}

    // 1. 未登录
    if (!m.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '导出报告需要先登录账号',
        confirmText: '去登录',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' })
          }
        }
      })
      return
    }

    // 2. 免费用户 → 弹 paywall弹窗（邀请好友 / 开通会员 二选一）
    if (m.effectiveLevel === 'free') {
      this._refreshPaywallInviteProgress()
      this.setData({ showPaywallModal: true })
      return
    }

    // 3. 会员 → 选择导出方式
    wx.showActionSheet({
      itemList: ['添加署名导出', '直接导出（无署名）'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({ showSignatureModal: true })
        } else if (res.tapIndex === 1) {
          this._exportReport({ signature: null })
        }
      }
    })
  },

  /** 署名输入：姓名 */
  onSignatureNameInput(e) {
    this.setData({ signatureName: (e.detail && e.detail.value) || '' })
  },

  /** 署名输入：工作室/公司 */
  onSignatureStudioInput(e) {
    this.setData({ signatureStudio: (e.detail && e.detail.value) || '' })
  },

  /** 关闭署名弹窗 */
  onCloseSignatureModal() {
    this.setData({ showSignatureModal: false })
  },

  /** 确认署名导出 */
  onConfirmSignature() {
    const name = (this.data.signatureName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入设计师姓名', icon: 'none' })
      return
    }
    const studio = (this.data.signatureStudio || '').trim()
    this.setData({ showSignatureModal: false })
    this._exportReport({ signature: { name, studio } })
  },

  /** 防止点击卡片穿透关闭遮罩 */
  noop() {},

  /** 关闭预览弹窗 */
  onClosePreviewModal() {
    this.setData({ showPreviewModal: false })
  },

  /**
   * 主入口：
   * 流程完整是「Canvas 绘制 PNG → 上传云存储 → 调用云函数包装为 PDF → 下载 PDF 临时文件」
   * 最终弹出预览弹窗（包含「打开预览」/「分享给好友」两个动作）
   */
  _exportReport({ signature }) {
    console.log('[calc-result] _exportReport 入参 signature =', JSON.stringify(signature))
    this.setData({ exporting: true, exportingText: '正在绘制报告...' })
    // 等下一帧确保 Loading 渲染出来
    setTimeout(() => {
      this._renderReportCanvas({ signature })
        .then(pngTempPath => {
          this.setData({ exportingText: '正在生成 PDF...' })
          return this._convertPngToPdf(pngTempPath)
        })
        .then((pdfInfo) => {
          this.setData({
            exporting: false,
            exportedPdfPath: pdfInfo.localPath,
            exportedPdfFileName: pdfInfo.fileName,
            exportedPdfSizeText: pdfInfo.sizeText,
            showPreviewModal: true
          })
        })
        .catch(err => {
          console.error('[calc-result] 导出报告失败:', err)
          this.setData({ exporting: false })
          const msg = (err && (err.errMsg || err.message)) || '未知错误'
          wx.showToast({
            title: '导出失败：' + msg,
            icon: 'none',
            duration: 3000
          })
        })
    }, 80)
  },

  /**
   * PNG 临时文件 → 上传云存储 → 调用 calc_export_pdf 云函数 → 下载 PDF 临时文件
   * 返回 { localPath, fileName, sizeText, sizeBytes }
   */
  _convertPngToPdf(pngLocalPath) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      return Promise.reject(new Error('当前环境不支持云开发'))
    }

    const dateStr = this._formatDateCompact(new Date())
    const baseName = `照度评估报告_${dateStr}`
    const cloudPng = `calc-reports/png/${Date.now()}_${baseName}.png`

    return new Promise((resolve, reject) => {
      // 1. 上传 PNG 到云存储
      wx.cloud.uploadFile({
        cloudPath: cloudPng,
        filePath: pngLocalPath,
        success: (uploadRes) => {
          const imageFileID = uploadRes.fileID
          // 2. 调用云函数包装为 PDF
          wx.cloud.callFunction({
            name: 'calc_export_pdf',
            data: {
              imageFileID: imageFileID,
              fileName: baseName
            },
            success: (cfRes) => {
              const r = cfRes && cfRes.result
              if (!r || !r.success || !r.data || !r.data.pdfFileID) {
                reject(new Error((r && r.errorMessage) || 'PDF 生成失败'))
                return
              }
              // 3. 下载 PDF 到本地临时文件
              wx.cloud.downloadFile({
                fileID: r.data.pdfFileID,
                success: (dlRes) => {
                  const localPath = dlRes.tempFilePath
                  resolve({
                    localPath: localPath,
                    fileName: r.data.fileName || (baseName + '.pdf'),
                    sizeBytes: r.data.size || 0,
                    sizeText: this._formatFileSize(r.data.size || 0)
                  })
                },
                fail: (err) => reject(err)
              })
            },
            fail: (err) => reject(err)
          })
        },
        fail: (err) => reject(err)
      })
    })
  },

  /** 将字节数转为可读文本（KB / MB） */
  _formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 KB'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  },

  /**
   * 调用 SelectorQuery 拿到 canvas 节点 → 绘制 → 输出临时图片
   */
  _renderReportCanvas({ signature }) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery()
      query.select('#reportCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('canvas 节点获取失败'))
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          // 关键：限制 dpr 最大为 2，避免高端 iPhone（dpr=3）导致 native buffer 超过 ~100MB 限制
          // 1080 * 2 * 4500 * 2 * 4 ≈ 78MB（安全）
          const rawDpr = (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2
          const dpr = Math.min(rawDpr, 2)
          const designWidth = 1080
          // 足够大的缓冲高度（实测含署名版本 actualHeight 可达 ~3930），4500 留 ~570 余量
          const designHeight = 4500

          canvas.width = designWidth * dpr
          canvas.height = designHeight * dpr
          ctx.scale(dpr, dpr)
          console.log('[calc-result] canvas size:', canvas.width, 'x', canvas.height, ', dpr=', dpr, '(raw=', rawDpr, '), designHeight=', designHeight)

          let actualHeight
          try {
            actualHeight = this._drawReport(ctx, designWidth, signature)
          } catch (err) {
            console.error('[calc-result] _drawReport 异常:', err)
            reject(err)
            return
          }

          console.log('[calc-result] _drawReport 完成，actualHeight =', actualHeight)
          if (actualHeight > designHeight) {
            console.warn('[calc-result] ⚠️ actualHeight(', actualHeight, ') 超出 designHeight(', designHeight, ')，底部内容会被截断！')
          }

          // 输出 PNG 临时文件：仅截取实际绘制的高度
          // 后续会被 _convertPngToPdf 上传到云存储 → 云函数包装为 PDF
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: designWidth,
            height: actualHeight,
            destWidth: designWidth * dpr,
            destHeight: actualHeight * dpr,
            fileType: 'png',
            quality: 1,
            success: (r) => resolve(r.tempFilePath),
            fail: (err) => reject(err)
          })
        })
    })
  },

  /**
   * 主绘制函数：按段落逐步绘制，返回最终 y 坐标（即图片实际高度）
   */
  _drawReport(ctx, W, signature) {
    const {
      coverParams,
      coreResult,
      detailData,
      riskData,
      energyData,
      disclaimerItems
    } = this.data

    // 背景
    ctx.fillStyle = '#F8FAFC'
    ctx.fillRect(0, 0, W, 3500)

    let y = 80

    y = this._drawTopBrand(ctx, W, y)
    y = this._drawHeroTitle(ctx, W, y)
    y = this._drawCoreConclusion(ctx, W, y, coreResult)
    y = this._drawInfoCard(ctx, W, y, coverParams)
    y = this._drawDetailData(ctx, W, y, detailData)
    y = this._drawRiskSection(ctx, W, y, riskData)
    y = this._drawEnergySection(ctx, W, y, energyData)
    y = this._drawDisclaimer(ctx, W, y, disclaimerItems)
    y = this._drawSignature(ctx, W, y, signature)
    y = this._drawFooter(ctx, W, y)

    return Math.ceil(y + 40) // 底部留白
  },

  // ====== Canvas 工具方法 ======

  /** 圆角矩形路径（不 fill / stroke，调用方自决） */
  _roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  /** 简单换行：按容器宽度切分中文 / 英文混合文本 */
  _wrapTextLines(ctx, text, maxWidth) {
    const lines = []
    let line = ''
    const str = String(text || '')
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      const test = line + ch
      const w = ctx.measureText(test).width
      if (w > maxWidth && line) {
        lines.push(line)
        line = ch
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    return lines
  },

  // ====== 各 section 绘制（返回新的 y 坐标） ======

  _drawTopBrand(ctx, W, y) {
    const PADDING = 60
    // 左侧：品牌名
    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 32px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('光乙照明', PADDING, y + 16)
    // 副标
    ctx.fillStyle = '#94A3B8'
    ctx.font = '20px PingFang SC, system-ui, sans-serif'
    ctx.fillText('GUANGYI · 长期居住光环境研究', PADDING, y + 50)

    // 右侧：报告类型 tag
    const tagText = '照度评估'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    const tagW = ctx.measureText(tagText).width + 32
    const tagX = W - PADDING - tagW
    const tagY = y + 4
    ctx.fillStyle = '#1E293B'
    this._roundRect(ctx, tagX, tagY, tagW, 36, 18)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.fillText(tagText, tagX + tagW / 2, tagY + 18)

    return y + 90
  },

  _drawHeroTitle(ctx, W, y) {
    const PADDING = 60
    y += 30
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 84px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('住宅空间', PADDING, y)
    y += 100
    ctx.fillText('照度评估报告', PADDING, y)
    y += 110

    ctx.fillStyle = '#64748B'
    ctx.font = '28px PingFang SC, system-ui, sans-serif'
    ctx.fillText('基于国家建筑照明设计标准自动生成', PADDING, y)
    y += 60
    return y
  },

  _drawCoreConclusion(ctx, W, y, coreResult) {
    if (!coreResult) return y
    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardH = 320
    const cardX = PADDING

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.fill()

    const isQualified = !!coreResult.isQualified
    const accentColor = isQualified ? '#10B981' : '#F59E0B'

    // 左侧状态条
    ctx.fillStyle = accentColor
    this._roundRect(ctx, cardX, y, 8, cardH, 4)
    ctx.fill()

    // 标题（左上）
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('核心结论', cardX + 50, y + 36)

    // 大数字 + 单位
    const luxValue = coreResult.luxValue || 0
    const luxText = String(luxValue)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 130px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const luxX = cardX + 50
    const luxY = y + 130
    ctx.fillText(luxText, luxX, luxY)
    const luxW = ctx.measureText(luxText).width

    ctx.fillStyle = '#64748B'
    ctx.font = '36px PingFang SC, system-ui, sans-serif'
    ctx.fillText('lx', luxX + luxW + 12, luxY + 28)

    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText('平均照度 (Eavg)', luxX, y + 200)

    // 状态标签
    const statusText = coreResult.statusText || ''
    if (statusText) {
      const tagY = y + 240
      ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
      const tagW = ctx.measureText(statusText).width + 56
      ctx.fillStyle = isQualified ? 'rgba(16, 185, 129, 0.10)' : 'rgba(245, 158, 11, 0.12)'
      this._roundRect(ctx, luxX, tagY, tagW, 56, 28)
      ctx.fill()
      ctx.fillStyle = accentColor
      ctx.textBaseline = 'middle'
      ctx.fillText(statusText, luxX + 28, tagY + 28)
    }

    // 国标区间（右上）
    const stdText = coreResult.standardText || ''
    if (stdText) {
      ctx.fillStyle = '#94A3B8'
      ctx.font = '22px PingFang SC, system-ui, sans-serif'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'right'
      ctx.fillText('国家建议标准', cardX + cardW - 40, y + 36)
      ctx.fillStyle = '#1E293B'
      ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
      ctx.fillText(stdText, cardX + cardW - 40, y + 70)
    }

    return y + cardH + 40
  },

  _drawInfoCard(ctx, W, y, coverParams) {
    if (!coverParams || coverParams.length === 0) return y
    const PADDING = 60
    const cardW = W - PADDING * 2
    const rowH = 70
    const headerH = 70
    const cardH = headerH + coverParams.length * rowH + 30
    const cardX = PADDING

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.fill()

    // 标题
    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('项目信息', cardX + 40, y + 38)

    // 行
    let rowY = y + headerH
    coverParams.forEach((item, idx) => {
      if (idx > 0) {
        ctx.strokeStyle = '#F1F5F9'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cardX + 40, rowY)
        ctx.lineTo(cardX + cardW - 40, rowY)
        ctx.stroke()
      }
      // label
      ctx.fillStyle = '#64748B'
      ctx.font = '26px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(item.label || '', cardX + 40, rowY + rowH / 2)
      // value
      ctx.fillStyle = '#0F172A'
      ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(item.value || '', cardX + cardW - 40, rowY + rowH / 2)
      rowY += rowH
    })

    return y + cardH + 40
  },

  _drawDetailData(ctx, W, y, detailData) {
    if (!detailData) return y
    const inputs = detailData.inputParams || []
    const calcs = detailData.calcResults || []
    if (!inputs.length && !calcs.length) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const headerH = 70
    const subTitleH = 40
    const rowH = 64
    const innerPad = 30
    const cardH = headerH +
      (inputs.length > 0 ? (subTitleH + inputs.length * rowH) : 0) +
      (calcs.length > 0 ? (subTitleH + calcs.length * rowH) : 0) +
      innerPad

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.fill()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('详细计算数据', cardX + 40, y + 38)

    let rowY = y + headerH

    if (inputs.length > 0) {
      ctx.fillStyle = '#3B82F6'
      ctx.font = 'bold 22px PingFang SC, system-ui, sans-serif'
      ctx.fillText('● 输入参数', cardX + 40, rowY + 16)
      rowY += subTitleH

      inputs.forEach((item) => {
        ctx.fillStyle = '#64748B'
        ctx.font = '26px PingFang SC, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(item.label || '', cardX + 60, rowY + rowH / 2)
        ctx.fillStyle = '#0F172A'
        ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(item.value || '', cardX + cardW - 40, rowY + rowH / 2)
        rowY += rowH
      })
    }

    if (calcs.length > 0) {
      ctx.fillStyle = '#10B981'
      ctx.font = 'bold 22px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('● 计算结果', cardX + 40, rowY + 16)
      rowY += subTitleH

      calcs.forEach((item) => {
        ctx.fillStyle = '#64748B'
        ctx.font = '26px PingFang SC, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(item.label || '', cardX + 60, rowY + rowH / 2)
        ctx.fillStyle = item.highlight ? '#10B981' : '#0F172A'
        ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(item.value || '', cardX + cardW - 40, rowY + rowH / 2)
        rowY += rowH
      })
    }

    return y + cardH + 40
  },

  _drawRiskSection(ctx, W, y, riskData) {
    if (!riskData) return y
    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const headerH = 110
    const subTitleH = 40
    const itemLineH = 36
    const itemGap = 12
    const lineMaxWidth = cardW - 100

    const impacts = riskData.impacts || []
    const suggestions = riskData.suggestions || []

    // 估算高度
    ctx.font = '24px PingFang SC, system-ui, sans-serif'
    let estH = headerH
    estH += subTitleH
    impacts.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      estH += lines.length * itemLineH + itemGap
    })
    estH += subTitleH
    suggestions.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      estH += lines.length * itemLineH + itemGap
    })
    estH += 30

    // 卡片
    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, estH, 24)
    ctx.fill()

    const isQualified = !!riskData.isQualified
    const accentColor = isQualified ? '#10B981' : '#F59E0B'
    ctx.fillStyle = accentColor
    this._roundRect(ctx, cardX, y, 8, estH, 4)
    ctx.fill()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('风险与舒适度分析', cardX + 40, y + 38)

    const statusLabel = riskData.statusLabel || ''
    if (statusLabel) {
      ctx.fillStyle = accentColor
      ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
      ctx.fillText('状态：' + statusLabel, cardX + 40, y + 80)
    }

    let rowY = y + headerH

    // 长期影响
    ctx.fillStyle = '#3B82F6'
    ctx.font = 'bold 22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('● 长期影响', cardX + 40, rowY + 16)
    rowY += subTitleH

    impacts.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      lines.forEach(line => {
        ctx.fillStyle = '#475569'
        ctx.font = '24px PingFang SC, system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(line, cardX + 60, rowY)
        rowY += itemLineH
      })
      rowY += itemGap
    })

    // 优化建议
    ctx.fillStyle = '#10B981'
    ctx.font = 'bold 22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('● 优化建议', cardX + 40, rowY + 16)
    rowY += subTitleH

    suggestions.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      lines.forEach(line => {
        ctx.fillStyle = '#475569'
        ctx.font = '24px PingFang SC, system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(line, cardX + 60, rowY)
        rowY += itemLineH
      })
      rowY += itemGap
    })

    return y + estH + 40
  },

  _drawEnergySection(ctx, W, y, energyData) {
    if (!energyData) return y
    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const cardH = 280

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.fill()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('节能与能耗参考', cardX + 40, y + 38)

    // 当前 vs 国标
    const halfW = (cardW - 80) / 2
    const dataY = y + 100

    // 当前
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('当前功率密度', cardX + 40, dataY)

    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 56px PingFang SC, system-ui, sans-serif'
    const curText = String(energyData.currentDensity || '0')
    ctx.fillText(curText, cardX + 40, dataY + 36)
    const curW = ctx.measureText(curText).width
    ctx.fillStyle = '#94A3B8'
    ctx.font = '24px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('W/㎡', cardX + 40 + curW + 12, dataY + 36 + 50)

    // 国标
    const stdX = cardX + 40 + halfW
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText('国家标准上限', stdX, dataY)

    ctx.fillStyle = '#10B981'
    ctx.font = 'bold 56px PingFang SC, system-ui, sans-serif'
    const stdLabel = '≤ ' + (energyData.standardDensity || '0')
    ctx.fillText(stdLabel, stdX, dataY + 36)

    // 评估描述
    if (energyData.assessTitle) {
      ctx.fillStyle = '#475569'
      ctx.font = 'bold 24px PingFang SC, system-ui, sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(energyData.assessTitle, cardX + 40, y + cardH - 60)
    }

    return y + cardH + 40
  },

  _drawDisclaimer(ctx, W, y, items) {
    if (!items || items.length === 0) return y
    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const headerH = 60
    const lineH = 32
    const itemGap = 8
    const lineMaxWidth = cardW - 80

    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    let estH = headerH
    items.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      estH += lines.length * lineH + itemGap
    })
    estH += 20

    ctx.fillStyle = '#F1F5F9'
    this._roundRect(ctx, cardX, y, cardW, estH, 16)
    ctx.fill()

    ctx.fillStyle = '#94A3B8'
    ctx.font = 'bold 24px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('免责声明', cardX + 40, y + 30)

    let rowY = y + headerH
    items.forEach(item => {
      const lines = this._wrapTextLines(ctx, '· ' + item, lineMaxWidth)
      lines.forEach(line => {
        ctx.fillStyle = '#94A3B8'
        ctx.font = '22px PingFang SC, system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(line, cardX + 40, rowY)
        rowY += lineH
      })
      rowY += itemGap
    })

    return y + estH + 40
  },

  /**
   * 署名区域：居中、专业、大号
   * 有署名时输出：
   *   ── 装饰短线 ──
   *   —— 报告出具：xxx 工作室   （大号粗体居中）
   *   设计师 · 张三              （可选，仅当同时有 name 和 studio）
   *   2026 年 05 月 07 日        （中文日期居中）
   * 无署名时直接跳过此区域，由 _drawFooter 统一展示「报告编号 / 生成时间」
   */
  _drawSignature(ctx, W, y, signature) {
    console.log('[calc-result] _drawSignature 调用，signature =', JSON.stringify(signature), ', 当前 y =', y)
    if (!signature || !signature.name) {
      console.log('[calc-result] _drawSignature 跳过（无署名）')
      return y
    }

    // 顶部留白
    y += 40

    // 装饰短线（居中、细线，模拟「——」分隔感）
    ctx.strokeStyle = '#CBD5E1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2 - 70, y)
    ctx.lineTo(W / 2 + 70, y)
    ctx.stroke()
    y += 56

    // 主标题：「—— 报告出具：xxx」
    // 显示优先级：studio > name（用户给的样例「张先生工作室」是 studio）
    const mainText = signature.studio || signature.name
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 44px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillText('—— 报告出具：' + mainText, W / 2, y)
    y += 70

    // 副标题：如果同时有 name 和 studio，附带显示「设计师 · 张三」
    if (signature.studio && signature.name) {
      ctx.fillStyle = '#64748B'
      ctx.font = '26px PingFang SC, system-ui, sans-serif'
      ctx.fillText('设计师 · ' + signature.name, W / 2, y)
      y += 50
    }

    // 日期（中文格式：2026 年 05 月 07 日）
    ctx.fillStyle = '#475569'
    ctx.font = '28px PingFang SC, system-ui, sans-serif'
    ctx.fillText(this._formatTodayCN(), W / 2, y)
    y += 60

    return y
  },

  /**
   * 页脚：品牌讯 + 报告编号 + 生成时间
   * 不论是否有署名，统一在底部展示这块信息（视觉一致性）
   */
  _drawFooter(ctx, W, y) {
    const PADDING = 60
    y += 30

    // 长分割线
    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING, y)
    ctx.lineTo(W - PADDING, y)
    ctx.stroke()
    y += 36

    // 品牌名（中等字号、居中）
    ctx.fillStyle = '#475569'
    ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillText('光乙照明研究系统', W / 2, y)
    y += 40

    // 副标（小字、居中）
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.fillText('二哥灯光设计 · 专注长期居住的光环境研究', W / 2, y)
    y += 50

    // 报告编号（左）+ 生成时间（右）—— 小字、灰色
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('报告编号：' + this._getReportNo(), PADDING, y)
    ctx.textAlign = 'right'
    ctx.fillText('生成时间：' + this._formatToday(), W - PADDING, y)
    y += 40

    return y
  },

  /** 取报告号（优先取 coverParams 里现成的，否则按当前时间生成） */
  _getReportNo() {
    const cps = this.data.coverParams || []
    const hit = cps.find(c => c && c.label && c.label.indexOf('报告') !== -1)
    if (hit && hit.value) return hit.value
    const now = new Date()
    const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return 'REP-' + d + '-' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  },

  /** 取当日日期 'YYYY.MM.DD' */
  _formatToday() {
    const now = new Date()
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  },

  /** 取当日日期中文格式 '2026 年 05 月 07 日' */
  _formatTodayCN() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y} 年 ${m} 月 ${d} 日`
  },

  // ========== PDF 预览 / 分享 ==========

  /**
   * 打开 PDF 预览（调起微信内置 PDF 查看器）
   */
  onOpenPdf() {
    const filePath = this.data.exportedPdfPath
    if (!filePath) return
    wx.showLoading({ title: '打开中...' })
    wx.openDocument({
      filePath: filePath,
      fileType: 'pdf',
      showMenu: true,
      success: () => {
        wx.hideLoading()
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[calc-result] 打开 PDF 失败:', err)
        wx.showToast({ title: '打开失败，请重试', icon: 'none' })
      }
    })
  },

  /**
   * 分享 PDF 给好友（作为文件发送，接收方可保存到聊天/邮箱/电脑）
   */
  onSharePdf() {
    const filePath = this.data.exportedPdfPath
    const fileName = this.data.exportedPdfFileName || '照度评估报告.pdf'
    if (!filePath) return

    wx.shareFileMessage({
      filePath: filePath,
      fileName: fileName,
      success: () => {
        wx.showToast({ title: '已发送', icon: 'success' })
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return
        console.error('[calc-result] 分享文件失败:', err)
        wx.showToast({ title: '分享失败，请重试', icon: 'none' })
      }
    })
  }
})
