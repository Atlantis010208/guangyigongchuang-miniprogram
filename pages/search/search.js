/**
 * 照度计算器页面（统一版）
 * 
 * 功能：
 * 1. 根据用户权限动态渲染不同 UI
 *    - 免费版：简洁列表式，基础计算功能
 *    - 付费版：现代卡片式，高级功能（结果页、空间选择等）
 * 2. 权限检查（基于工具包购买状态）
 * 3. 升级引导弹窗（免费版）
 */

// 引入共享计算工具
import { 
  calcAvgLux, 
  calcLampCount, 
  calcTotalFlux, 
  calcAvgPowerPerArea,
  getDefaultLampTypes,
  updateDownlightTitles
} from '../../utils/calc-helper'

// 权限缓存配置
const CACHE_KEY = 'toolkit_purchase_cache'
const CACHE_DURATION = 5 * 60 * 1000  // 5 分钟

// 表单草稿配置：用户参数自动暂存，避免跳转购买/激活流程后丢失
const DRAFT_KEY = 'calc_form_draft'
const DRAFT_TTL = 24 * 60 * 60 * 1000  // 草稿有效期 24 小时

// 购买后待复查权限标记：跳转购买前置位，onShow 时检测到则强制重查权限
const PENDING_CHECK_KEY = 'calc_pending_purchase_check'

Page({
  data: {
    // ========== 权限状态 ==========
    isPro: false,                  // 是否为付费用户（控制UI渲染）
    checkingPermission: true,      // 是否正在检查权限
    showUpgradeModal: false,       // 是否显示升级弹窗（免费版）

    // ========== 通用字段 ==========
    activeTab: 'count',            // 当前标签: 'lux' | 'count'
    lampFlux: '',                  // 单灯光通量（lm）= lampPower × lampEfficacy
    lampPower: '',                 // 单灯功率（W）
    lampEfficacy: 80,              // 发光效率（lm/W），默认80
    area: '',                      // 面积（㎡）
    utilFactor: '',               // 利用系数
    maintenanceFactor: 0.8,        // 维护系数
    targetLux: '',                 // 目标照度
    lampCount: '',                 // 灯具数量（手动输入）
    
    // 计算结果
    avgLux: 0,                     // 平均照度
    calcLampCount: 0,              // 计算的灯具数量
    avgPowerPerArea: 0,            // 单位面积平均功率
    totalFluxCalc: 0,              // 总光通量

    // ========== 免费版专用 ==========
    lampTypeRows: [],              // 灯具类型列表（固定7种）
    showLampParams: false,         // 灯具参数弹窗
    showUtilFactorModal: false,    // 利用系数说明弹窗
    showMntFactorModal: false,     // 维护系数说明弹窗
    showSourceUtilModal: false,    // 光源利用率说明弹窗
    showLampFluxModal: false,      // 单灯光通量说明弹窗
    showTargetLuxModal: false,     // 目标照度说明弹窗

    // ========== 付费版专用 ==========
    selectedLamps: [],             // 用户已选灯具列表（动态添加）
    focusedLampId: '',
    lampAddOptions: ['请选择灯具'], // 兼容字段（旧 picker 已替换为多选弹窗，仍保留以防异常）
    lampAddValue: 0,

    // 灯具多选弹窗
    showLampSelectModal: false,    // 是否显示弹窗
    lampSelectChecked: {},         // 当前勾选状态：{ [lampTypeRows 的 index]: true }
    lampSelectExisting: {},        // 当前已加入数量：{ [index]: 已添加的同类型数量 }，用于显示"已有 N 个"
    lampSelectCount: 0,            // 当前勾选项数量（驱动按钮启用状态）

    headerBgFileId: '',
    headerBgLoaded: false,
    headerBgReady: false,
    pageConfig: null,             // 云端页面配置
    editingLamp: null,             // 正在编辑的灯具
    showResult: false,             // 是否显示结果页
    resultData: null,              // 结果页数据
    
    // 空间类型选择器
    roomTypes: [
      { name: '客厅', lux: 200 },
      { name: '餐厅', lux: 150 },
      { name: '卫生间', lux: 100 },
      { name: '主卧', lux: 100 },
      { name: '次卧', lux: 100 },
      { name: '衣帽间', lux: 150 },
      { name: '阳台', lux: 75 },
      { name: '厨房', lux: 150 },
      { name: '自定义', lux: 0 }
    ],
    roomTypeIndex: -1,
    
    // 层高输入（用户自行输入，根据范围计算系数）
    floorHeight: '',
    
    // 色彩选择器（参考利用系数说明表）
    colorOptions: [
      { name: '浅色', factor: 0.9 },
      { name: '木质类', factor: 0.8 },
      { name: '细腻深色', factor: 0.5 },
      { name: '粗糙深色', factor: 0.2 }
    ],
    colorIndex: 0,

    // 维护系数选择器
    maintenanceOptions: [
      { name: '干净', value: 0.8 },
      { name: '一般', value: 0.7 },
      { name: '污染', value: 0.6 }
    ],
    maintenanceIndex: 0,
  },

  // ========== 生命周期 ==========
  
  async onLoad(options) {
    console.log('[search] onLoad, options:', options)
    
    // 0. 加载云端页面配置
    const pageConfig = await this.loadPageConfig()
    
    // 1. 初始化灯具参数（优先使用云端配置，否则使用默认值）
    const lampTypeRows = (pageConfig && pageConfig.lampTypes) 
      ? this.convertLampTypesFromConfig(pageConfig.lampTypes)
      : getDefaultLampTypes()
    
    console.log('[search] 灯具类型已加载:', lampTypeRows.map(l => l.name))
    
    this.setData({
      lampTypeRows,
      lampAddOptions: this.buildLampAddOptions(lampTypeRows),
      lampAddValue: 0
    })
    this._updateGroupedLampTypes(lampTypeRows)
    
    // 2. 检查权限
    const isPurchased = await this.checkPurchaseStatus()
    console.log('[search] 权限检查结果:', isPurchased)
    
    // 3. 设置 UI 模式
    this.setData({ 
      isPro: isPurchased, 
      checkingPermission: false 
    })

    // 4. 恢复本地草稿（用户可能上次填到一半就跳去购买了）
    //   注意：onShow 中的历史记录回填优先级更高，会覆盖草稿
    const draft = this._loadDraft()
    if (draft && this._hasMeaningfulDraft(draft)) {
      console.log('[search] 恢复本地草稿:', draft)
      this._applyDraft(draft)
    }

    // 5. 如果是免费版且带有 showUpgrade 参数，显示升级弹窗
    if (!isPurchased && options.showUpgrade === '1') {
      console.log('[search] 显示升级弹窗')
      setTimeout(() => {
        this.showUpgradeDialog()
      }, 300)
    }
  },

  onShow() {
    // 更新自定义 tabBar 的选中状态和角色
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateRole()
      this.getTabBar().setData({ selected: 2 })
    }
    console.log('[search] onShow')

    // 用户可能刚走完购买流程返回，强制复查权限并提示
    this._refreshPermissionIfPending()
    
    // 检查是否有历史记录回填
    const selectedHistory = wx.getStorageSync('calc_history_selected')
    if (selectedHistory) {
      wx.removeStorageSync('calc_history_selected')
      const params = selectedHistory.params
      if (params) {
        console.log('[search] 回填历史记录:', params)

        // 兼容旧记录：旧记录里没有 lampPower / lampEfficacy 字段，
        // 但能通过公式 光通量 = 功率 × 发光效率 反推出功率
        const lampEfficacy = params.lampEfficacy != null && params.lampEfficacy !== ''
          ? params.lampEfficacy
          : 80
        let lampPower = params.lampPower
        if (lampPower == null || lampPower === '') {
          const fluxNum = parseFloat(params.lampFlux)
          const efficacyNum = parseFloat(lampEfficacy)
          if (Number.isFinite(fluxNum) && fluxNum > 0
              && Number.isFinite(efficacyNum) && efficacyNum > 0) {
            // 反推单灯功率，四舍五入到整数（与界面录入习惯一致）
            lampPower = Math.round(fluxNum / efficacyNum)
          } else {
            lampPower = ''
          }
        }

        // 恢复参数
        this.setData({
           activeTab: params.activeTab || 'count',
           area: params.area,
           roomTypeIndex: params.roomTypeIndex,
           targetLux: params.targetLux,
           floorHeight: params.floorHeight,
           colorIndex: params.colorIndex,
           maintenanceIndex: params.maintenanceIndex,
           maintenanceFactor: params.maintenanceFactor,
           utilFactor: params.utilFactor,
           lampFlux: params.lampFlux,
           lampPower,
           lampEfficacy,
           lampCount: params.lampCount,
           selectedLamps: params.selectedLamps || []
        }, () => {
          // 根据 activeTab 重新获取背景图（如果有配置）
          const { pageConfig } = this.data
          if (pageConfig && pageConfig.modes && pageConfig.modes[params.activeTab]) {
            const modeBg = pageConfig.modes[params.activeTab].bgImage
            if (modeBg && modeBg !== this.data.headerBgFileId) {
               this.setData({ headerBgFileId: modeBg, headerBgReady: false })
            }
          }
          this.recalc()
        })
      }
    }
    
    // 设置导航栏样式
    wx.setNavigationBarTitle({ title: '照明计算' })
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#f2f2f7'
    })

    // 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    
    // 更新筒射灯标题（免费版）
    if (!this.data.isPro) {
      this.updateDownlightTitles()
    }
  },

  onHide() {
    console.log('[search] onHide，保存当前表单草稿')
    // 用户离开页面（被 navigateTo 覆盖、tabBar 切走等）时自动暂存
    // 防止跳转购买/激活流程或被 switchTab 销毁后参数丢失
    this._saveDraft()
  },

  onUnload() {
    console.log('[search] onUnload，保存当前表单草稿')
    // 页面被销毁前再保存一次（switchTab 触发的销毁也会走这里）
    this._saveDraft()
  },

  /**
   * 跳转购买/激活相关页面前调用：保存草稿 + 标记权限待复查
   * 配合 onShow 中的 _refreshPermissionIfPending，实现"购买完回来直接计算"
   */
  _markPendingPurchaseCheck() {
    try {
      this._saveDraft()
      wx.setStorageSync(PENDING_CHECK_KEY, true)
    } catch (e) {
      console.warn('[search] 标记购买待检查失败:', e)
    }
  },

  /**
   * 如果用户刚跳转过购买/激活流程，回到页面时强制复查权限
   * 避免因权限缓存（5 分钟）导致激活后仍被判断为非 Pro
   */
  async _refreshPermissionIfPending() {
    let pending = false
    try {
      pending = !!wx.getStorageSync(PENDING_CHECK_KEY)
    } catch (e) {}
    if (!pending) return

    try {
      wx.removeStorageSync(PENDING_CHECK_KEY)
      // 清除权限缓存，强制走云函数最新结果
      wx.removeStorageSync(CACHE_KEY)
    } catch (e) {}

    const wasPro = this.data.isPro
    try {
      const isPurchased = await this.checkPurchaseStatus()
      if (this.data.isPro !== isPurchased) {
        this.setData({ isPro: isPurchased })
      }
      if (!wasPro && isPurchased) {
        // 由非 Pro 变 Pro：用户刚激活成功，提示并保留参数
        wx.showToast({
          title: '已激活，可直接计算',
          icon: 'success',
          duration: 2000
        })
      }
    } catch (err) {
      console.warn('[search] 复查权限失败:', err)
    }
  },

  onHeaderBgLoad() {
    if (!this.data.headerBgReady) {
      this.setData({ headerBgReady: true })
    }
  },

  validateCalculateInputs() {
    const toNum = (v) => {
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }

    const need = (title) => {
      wx.showToast({ title, icon: 'none' })
      return false
    }

    const { activeTab } = this.data

    if (this.data.roomTypeIndex < 0) return need('请选择空间类型')
    if (toNum(this.data.targetLux) <= 0) return need('请输入目标照度')
    if (toNum(this.data.area) <= 0) return need('请输入房间面积')
    if (toNum(this.data.floorHeight) <= 0) return need('请输入层高')
    if (this.data.colorIndex < 0) return need('请选择色彩')
    if (toNum(this.data.maintenanceFactor) <= 0) return need('请输入维护系数')

    if (activeTab === 'count') {
      if (toNum(this.data.lampPower) <= 0) return need('请输入单灯功率')
      if (toNum(this.data.lampFlux) <= 0) return need('单灯光通量计算异常，请检查功率和发光效率')
    }

    if (activeTab === 'quantity') {
      if (toNum(this.data.lampCount) <= 0) return need('请输入灯具数量')
    }

    if (activeTab === 'lux') {
      const lamps = Array.isArray(this.data.selectedLamps) ? this.data.selectedLamps : []
      if (lamps.length === 0) return need('请添加灯具')

      for (let i = 0; i < lamps.length; i += 1) {
        const lamp = lamps[i] || {}
        const name = lamp.displayName || lamp.name || `灯具${i + 1}`
        if (toNum(lamp.powerW) <= 0) return need(`请填写「${name}」功率`)
        if (toNum(lamp.efficacy) <= 0) return need(`请填写「${name}」光效`)
        if (toNum(lamp.sourceUtil) <= 0) return need(`请填写「${name}」利用率`)
        if (toNum(lamp.lengthQty) <= 0) return need(`请填写「${name}」数量`)
      }
    }

    return true
  },

  resetFormData(keepTab = false) {
    // 优先使用云端配置，否则使用默认值
    const { pageConfig, activeTab: currentTab } = this.data
    const lampTypeRows = (pageConfig && pageConfig.lampTypes) 
      ? this.convertLampTypesFromConfig(pageConfig.lampTypes)
      : getDefaultLampTypes()
    
    // 决定使用哪个 Tab
    const activeTab = keepTab ? currentTab : 'count'
    
    // 获取对应 Tab 的背景图
    let headerBgFileId = this.data.headerBgFileId
    if (pageConfig && pageConfig.modes && pageConfig.modes[activeTab]) {
      const modeBg = pageConfig.modes[activeTab].bgImage
      if (modeBg && modeBg !== headerBgFileId) {
        headerBgFileId = modeBg
      }
    }

    this.setData({
      activeTab,
      area: '',
      roomTypeIndex: -1,
      targetLux: '',
      floorHeight: '',
      colorIndex: -1,
      maintenanceIndex: 0,
      maintenanceFactor: 0.8,
      utilFactor: '',
      lampFlux: '',
      lampPower: '',
      lampEfficacy: 80,
      lampCount: '',

      avgLux: 0,
      calcLampCount: 0,
      avgPowerPerArea: 0,
      totalFluxCalc: 0,

      lampTypeRows,
      showLampParams: false,

      selectedLamps: [],
      focusedLampId: '',
      lampAddOptions: this.buildLampAddOptions(lampTypeRows),
      lampAddValue: 0,
      editingLamp: null,
      showResult: false,
      resultData: null,
      headerBgFileId
    })
    
    this._updateGroupedLampTypes(lampTypeRows)
  },

  buildLampAddOptions(rows) {
    const list = Array.isArray(rows) ? rows : []
    return ['请选择灯具', ...list.map((it) => it.displayName || it.name || '灯具')]
  },

  // ========== 表单草稿（防止跳转购买流程后参数丢失） ==========

  /**
   * 保存当前表单参数到本地草稿
   * 在 onHide / 跳转购买流程前调用，确保用户回来后能恢复
   */
  _saveDraft() {
    try {
      const draft = {
        activeTab: this.data.activeTab,
        area: this.data.area,
        roomTypeIndex: this.data.roomTypeIndex,
        targetLux: this.data.targetLux,
        floorHeight: this.data.floorHeight,
        colorIndex: this.data.colorIndex,
        maintenanceIndex: this.data.maintenanceIndex,
        maintenanceFactor: this.data.maintenanceFactor,
        utilFactor: this.data.utilFactor,
        lampFlux: this.data.lampFlux,
        lampPower: this.data.lampPower,
        lampEfficacy: this.data.lampEfficacy,
        lampCount: this.data.lampCount,
        selectedLamps: this.data.selectedLamps || [],
        savedAt: Date.now()
      }
      wx.setStorageSync(DRAFT_KEY, draft)
    } catch (e) {
      console.warn('[search] 保存草稿失败:', e)
    }
  },

  /**
   * 读取本地草稿（自动过滤过期数据）
   * @returns {object|null}
   */
  _loadDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      if (!draft || typeof draft !== 'object' || !draft.savedAt) return null
      if (Date.now() - draft.savedAt > DRAFT_TTL) {
        wx.removeStorageSync(DRAFT_KEY)
        return null
      }
      return draft
    } catch (e) {
      return null
    }
  },

  /**
   * 清除本地草稿
   */
  _clearDraft() {
    try {
      wx.removeStorageSync(DRAFT_KEY)
    } catch (e) {}
  },

  /**
   * 判断草稿是否包含有意义的输入（避免拿空草稿覆盖默认值）
   */
  _hasMeaningfulDraft(draft) {
    if (!draft) return false
    const nonEmpty = (v) => v !== '' && v !== null && v !== undefined
    if (nonEmpty(draft.area) && parseFloat(draft.area) > 0) return true
    if (nonEmpty(draft.targetLux) && parseFloat(draft.targetLux) > 0) return true
    if (nonEmpty(draft.floorHeight) && parseFloat(draft.floorHeight) > 0) return true
    if (nonEmpty(draft.lampPower) && parseFloat(draft.lampPower) > 0) return true
    if (nonEmpty(draft.lampFlux) && parseFloat(draft.lampFlux) > 0) return true
    if (nonEmpty(draft.lampCount) && parseFloat(draft.lampCount) > 0) return true
    if (Array.isArray(draft.selectedLamps) && draft.selectedLamps.length > 0) return true
    if (Number(draft.roomTypeIndex) >= 0) return true
    if (Number(draft.colorIndex) >= 0) return true
    if (Number(draft.maintenanceIndex) >= 0) return true
    return false
  },

  /**
   * 将草稿应用到当前页面 data，并触发联动计算
   */
  _applyDraft(draft) {
    if (!this._hasMeaningfulDraft(draft)) return false

    const { pageConfig } = this.data
    const activeTab = draft.activeTab || 'count'

    // 草稿带的 Tab 可能与初始 Tab 不同，同步切换对应背景图
    let headerBgFileId = this.data.headerBgFileId
    let headerBgReady = this.data.headerBgReady
    if (pageConfig && pageConfig.modes && pageConfig.modes[activeTab]) {
      const modeBg = pageConfig.modes[activeTab].bgImage
      if (modeBg && modeBg !== headerBgFileId) {
        headerBgFileId = modeBg
        headerBgReady = false
      }
    }

    const updates = {
      activeTab,
      headerBgFileId,
      headerBgReady,
      area: draft.area != null ? draft.area : '',
      roomTypeIndex: Number.isFinite(Number(draft.roomTypeIndex)) ? Number(draft.roomTypeIndex) : -1,
      targetLux: draft.targetLux != null ? draft.targetLux : '',
      floorHeight: draft.floorHeight != null ? draft.floorHeight : '',
      colorIndex: Number.isFinite(Number(draft.colorIndex)) ? Number(draft.colorIndex) : -1,
      maintenanceIndex: Number.isFinite(Number(draft.maintenanceIndex)) ? Number(draft.maintenanceIndex) : -1,
      maintenanceFactor: draft.maintenanceFactor != null ? draft.maintenanceFactor : 0.8,
      utilFactor: draft.utilFactor != null ? draft.utilFactor : '',
      lampFlux: draft.lampFlux != null ? draft.lampFlux : '',
      lampPower: draft.lampPower != null ? draft.lampPower : '',
      lampEfficacy: draft.lampEfficacy != null && draft.lampEfficacy !== '' ? draft.lampEfficacy : 80,
      lampCount: draft.lampCount != null ? draft.lampCount : '',
      selectedLamps: Array.isArray(draft.selectedLamps) ? draft.selectedLamps : []
    }

    this.setData(updates, () => {
      this.recalc()
    })
    return true
  },

  /**
   * 下拉刷新处理
   * 清除缓存并重新检查权限状态
   */
  async onPullDownRefresh() {
    console.log('[search] 🔄 下拉刷新开始')
    
    try {
      // 1. 清除权限缓存 + 表单草稿 + 购买待检查标记
      //    用户下拉刷新视为主动重置，避免清空后又被旧草稿覆盖
      wx.removeStorageSync(CACHE_KEY)
      this._clearDraft()
      try { wx.removeStorageSync(PENDING_CHECK_KEY) } catch (e) {}
      console.log('[search] 缓存与草稿已清除')
      
      // 2. 显示加载状态
      this.setData({ checkingPermission: true })
      
      // 3. 重新加载云端配置
      await this.loadPageConfig()
      console.log('[search] 云端配置已刷新')
      
      // 4. 重新检查权限
      const isPurchased = await this.checkPurchaseStatus()
      console.log('[search] 刷新后权限状态:', isPurchased)
      
      // 5. 重置数据并更新权限（保持当前 Tab，使用最新的云端配置）
      this.resetFormData(true)  // keepTab = true，保持当前选中的 Tab
      this.setData({ 
        isPro: isPurchased,
        checkingPermission: false
      })
      
    } catch (err) {
      console.error('[search] 刷新失败:', err)
      this.setData({ checkingPermission: false })
      wx.showToast({
        title: '刷新失败，请重试',
        icon: 'none'
      })
    } finally {
      // 6. 停止下拉刷新动画
      wx.stopPullDownRefresh()
    }
  },

  // ========== 权限检查 ==========
  
  async checkPurchaseStatus() {
    try {
      // 0. 检查登录状态
      const app = getApp()
      const isLoggedIn = app.isLoggedIn()
      console.log('[search] 登录状态:', isLoggedIn)
      
      if (!isLoggedIn) {
        console.log('[search] 未登录，显示免费版')
        wx.removeStorageSync(CACHE_KEY)
        return false
      }
      
      // 1. 检查本地缓存
      const cached = wx.getStorageSync(CACHE_KEY)
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('[search] 使用缓存的权限状态:', cached.isPurchased)
        return cached.isPurchased
      }
      
      // 2. 调用云函数检查权限
      console.log('[search] 调用云函数检查权限...')
      const res = await wx.cloud.callFunction({
        name: 'toolkit_purchase_check',
        data: { toolkitId: 'toolkit' }
      })
      
      console.log('[search] 云函数返回:', res)
      const isPurchased = res.result?.data?.isPurchased || false
      console.log('[search] 解析后的购买状态:', isPurchased)
      
      // 3. 更新缓存
      wx.setStorageSync(CACHE_KEY, {
        isPurchased,
        timestamp: Date.now()
      })
      
      return isPurchased
      
    } catch (err) {
      console.error('[search] 检查权限失败:', err)
      wx.showToast({
        title: '权限检查失败',
        icon: 'none',
        duration: 2000
      })
      return false
    }
  },

  // ========== 升级弹窗（免费版） ==========
  
  showUpgradeDialog() {
    this.setData({ showUpgradeModal: true })
  },

  onUpgradeCancel() {
    this.setData({ showUpgradeModal: false })
  },

  onUpgradeConfirm() {
    this.setData({ showUpgradeModal: false })

    const app = getApp()
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再购买',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/auth/login/login' })
          }
        }
      })
      return
    }

    // 直接跳转到订单确认页，跳过工具包详情页
    const item = {
      id: 'TK_DEFAULT_001',
      name: '灯光设计工具包',
      price: 69,
      image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg',
      quantity: 1,
      specs: { version: '标准版' }
    }
    const query = encodeURIComponent(JSON.stringify(item))
    // 跳转购买前：保存草稿 + 标记权限待复查（购买完回来自动恢复参数并刷新权限）
    this._markPendingPurchaseCheck()
    wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
  },

  stopPropagation() {},

  // ========== 配置加载 ==========

  /**
   * 从云端加载页面配置
   * @returns {object|null} 配置对象，失败时返回 null
   */
  async loadPageConfig() {
    try {
      console.log('[search] 开始加载云端配置')
      const res = await wx.cloud.callFunction({
        name: 'get_calc_config'
      })
      
      if (res.result && res.result.success && res.result.data) {
        const config = res.result.data
        console.log('[search] 云端配置加载成功:', config)
        
        // 保存配置（同步方式，确保后续代码能立即使用）
        this.data.pageConfig = config
        this.setData({ pageConfig: config })
        
        // 应用配置（背景图、空间类型等）
        this.applyPageConfig(config)
        
        return config
      } else {
        console.warn('[search] 云端配置加载失败，使用默认配置')
        this.setData({
          headerBgFileId: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/主页/照度计算背景图.png',
          headerBgLoaded: true
        })
        return null
      }
    } catch (err) {
      console.warn('[search] 获取配置失败，使用默认配置:', err)
      this.setData({
        headerBgFileId: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/主页/照度计算背景图.png',
        headerBgLoaded: true
      })
      return null
    }
  },

  /**
   * 应用页面配置
   */
  applyPageConfig(config) {
    if (!config) return
    
    const { activeTab } = this.data
    const updates = {}
    
    // 应用当前 Tab 的背景图
    if (config.modes && config.modes[activeTab] && config.modes[activeTab].bgImage) {
      updates.headerBgFileId = config.modes[activeTab].bgImage
    } else {
      updates.headerBgFileId = 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/主页/照度计算背景图.png'
    }
    updates.headerBgLoaded = true
    
    // 应用空间类型
    if (config.roomTypes && config.roomTypes.length > 0) {
      updates.roomTypes = config.roomTypes
    }
    
    // 应用利用系数选项
    if (config.colorOptions && config.colorOptions.length > 0) {
      updates.colorOptions = config.colorOptions
    }
    
    // 应用维护系数选项
    if (config.maintenanceOptions && config.maintenanceOptions.length > 0) {
      updates.maintenanceOptions = config.maintenanceOptions
    }
    
    if (Object.keys(updates).length > 0) {
      this.setData(updates)
      console.log('[search] 配置已应用:', Object.keys(updates))
    }
  },

  /**
   * 将云端灯具配置转换为页面使用的格式
   */
  convertLampTypesFromConfig(lampTypes) {
    if (!Array.isArray(lampTypes)) return getDefaultLampTypes()
    
    // 精确名称映射（涵盖云端数据库中的所有实际灯具名称及变体）
    const exactMap = {
      // 直射重点照明
      '射灯': '直射重点照明', '磁吸射灯': '直射重点照明',
      '格栅灯': '直射重点照明', '磁吸格栅': '直射重点照明',
      // 直接基础照明
      '筒灯': '直接基础照明', '吸顶灯': '直接基础照明',
      '平板灯': '直接基础照明', '面板灯': '直接基础照明',
      // 间接基础照明
      '正灯槽': '间接基础照明', '正灯槽灯带': '间接基础照明',
      '下发光灯槽': '间接基础照明', '双眼皮灯带': '间接基础照明',
      '线性灯': '间接基础照明',
      // 间接氛围照明
      '反灯槽': '间接氛围照明', '反灯槽灯带': '间接氛围照明',
      '悬浮灯带': '间接氛围照明', '窗帘灯带': '间接氛围照明',
      '踢脚线灯带': '间接氛围照明',
      // 近距离任务照明
      '柜体灯': '近距离任务照明', '层板灯': '近距离任务照明', '书桌灯': '近距离任务照明',
      // 装饰类直接照明
      '长条吊灯': '装饰类直接照明', '小吊灯': '装饰类直接照明',
      '吊灯': '装饰类直接照明', '装饰灯': '装饰类直接照明',
      '壁灯': '装饰类直接照明', '镜前灯': '装饰类直接照明',
      // 柔光漫射照明
      '软膜天花': '柔光漫射照明', '洗墙射灯': '柔光漫射照明',
      '线性洗墙灯': '柔光漫射照明', '磁吸泛光': '柔光漫射照明'
    }

    // 关键词模糊匹配兜底：精确匹配失败时按名字中的关键词推断分类
    const keywordRules = [
      { keywords: ['射灯', '格栅'], category: '直射重点照明' },
      { keywords: ['筒灯', '吸顶', '平板', '面板'], category: '直接基础照明' },
      { keywords: ['正灯槽', '下发光', '双眼皮', '线性灯'], category: '间接基础照明' },
      { keywords: ['反灯槽', '悬浮', '窗帘', '踢脚'], category: '间接氛围照明' },
      { keywords: ['柜体', '层板', '书桌', '书台'], category: '近距离任务照明' },
      { keywords: ['吊灯', '壁灯', '镜前', '装饰灯'], category: '装饰类直接照明' },
      { keywords: ['软膜', '洗墙', '泛光'], category: '柔光漫射照明' }
    ]

    const resolveCategory = (name) => {
      if (!name) return '其他'
      // 精确匹配
      if (exactMap[name]) return exactMap[name]
      // 关键词模糊匹配
      for (const rule of keywordRules) {
        if (rule.keywords.some(kw => name.indexOf(kw) !== -1)) {
          return rule.category
        }
      }
      return '其他'
    }

    // 各照明类型的默认光源利用率（与图片标准对应）
    const categoryDefaultUtil = {
      '直射重点照明': 0.75,
      '直接基础照明': 0.70,
      '间接基础照明': 0.35,
      '间接氛围照明': 0.20,
      '近距离任务照明': 0.85,
      '装饰类直接照明': 0.75,
      '柔光漫射照明': 0.60
    }

    return lampTypes
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(item => {
        const category = item.category || resolveCategory(item.name)
        const defaultUtil = categoryDefaultUtil[category] || 0.7
        return {
          category,
          name: item.name,
          displayName: item.displayName || item.name,
          powerW: item.powerW || 10,
          efficacy: item.efficacy || 80,
          lengthQty: '',
          sourceUtil: item.sourceUtil != null ? item.sourceUtil : defaultUtil,
          flux: 0
        }
      })
  },

  // ========== 通用方法 ==========
  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    const { pageConfig } = this.data
    
    // 根据配置更新背景图
    let headerBgFileId = this.data.headerBgFileId
    if (pageConfig && pageConfig.modes && pageConfig.modes[tab]) {
      const modeBg = pageConfig.modes[tab].bgImage
      if (modeBg) {
        headerBgFileId = modeBg
      }
    }
    
    const updates = { activeTab: tab, headerBgFileId }
    if (headerBgFileId !== this.data.headerBgFileId) {
      updates.headerBgReady = false
    }
    this.setData(updates)
    this.recalc()
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [field]: value })
  },

  onOpenUtilFactorInfo() {
    this.setData({ showUtilFactorModal: true })
  },

  closeUtilFactorModal() {
    this.setData({ showUtilFactorModal: false })
  },

  onOpenMntFactorInfo() {
    this.setData({ showMntFactorModal: true })
  },

  closeMntFactorModal() {
    this.setData({ showMntFactorModal: false })
  },

  onOpenSourceUtilInfo() {
    this.setData({ showSourceUtilModal: true })
  },

  closeSourceUtilModal() {
    this.setData({ showSourceUtilModal: false })
  },

  onOpenLampFluxInfo() {
    this.setData({ showLampFluxModal: true })
  },

  closeLampFluxModal() {
    this.setData({ showLampFluxModal: false })
  },

  onOpenTargetLuxInfo() {
    this.setData({ showTargetLuxModal: true })
  },

  closeTargetLuxInfo() {
    this.setData({ showTargetLuxModal: false })
  },

  onOpenRules() {
    // 根据当前 Tab 动态跳转到对应的帮助页面
    const { activeTab } = this.data
    const helpPageMap = {
      'count': '/pages/search/help/help-lux-to-params/help-lux-to-params',
      'quantity': '/pages/search/help/help-lux-to-count/help-lux-to-count',
      'lux': '/pages/search/help/help-lamp-to-lux/help-lamp-to-lux'
    }
    const url = helpPageMap[activeTab] || '/pages/search/help/help'
    wx.navigateTo({ url })
  },

  noop() {},

  // ========== 免费版方法 ==========
  
  // 灯具米数/数量输入
  onLampLenInput(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const rows = [...this.data.lampTypeRows]
    rows[idx].lengthQty = e.detail.value
    this.setData({ lampTypeRows: rows }, () => { 
      this.updateDownlightTitles()
      this.recalc() 
    })
  },

  // 灯具参数输入
  onLampMetaInput(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const rows = [...this.data.lampTypeRows]
    rows[idx][field] = e.detail.value
    this.setData({ lampTypeRows: rows }, () => { 
      this.updateDownlightTitles()
      this.recalc() 
    })
  },

  openLampParamsFree() { 
    this.setData({ showLampParams: true }) 
  },
  
  closeLampParams() { 
    this.setData({ showLampParams: false }) 
  },

  resetLampParams() {
    const lampTypeRows = getDefaultLampTypes()
    this.setData({
      lampTypeRows,
      lampAddOptions: this.buildLampAddOptions(lampTypeRows),
      lampAddValue: 0
    })
    this._updateGroupedLampTypes(lampTypeRows)
    this.recalc()
  },
  
  saveLampParamsFree() {
    this.setData({ showLampParams: false })
    this.recalc()
  },

  updateDownlightTitles() {
    const rows = updateDownlightTitles(this.data.lampTypeRows)
    if (rows.length > 0) {
      this.setData({
        lampTypeRows: rows,
        lampAddOptions: this.buildLampAddOptions(rows)
      })
    }
  },

  // ========== 付费版方法 ==========
  
  // 房间类型选择
  onRoomTypeChange(e) {
    const index = Number(e.detail.value)
    const roomTypes = this.data.roomTypes || []
    const roomType = roomTypes[index]
    if (!roomType) {
      this.setData({ roomTypeIndex: -1, targetLux: '' })
      this.recalc()
      return
    }
    const updates = { roomTypeIndex: index }
    
    if (roomType.name !== '自定义') {
      updates.targetLux = roomType.lux.toString()
    } else {
      updates.targetLux = ''
    }
    
    this.setData(updates)
    this.recalc()
  },

  // 单灯功率输入 → 自动计算光通量
  onLampPowerInput(e) {
    const value = e.detail.value
    const efficacy = parseFloat(this.data.lampEfficacy) || 80
    const power = parseFloat(value) || 0
    const flux = Math.round(power * efficacy)
    this.setData({ lampPower: value, lampFlux: flux > 0 ? flux : '' })
    this.recalc()
  },

  // 发光效率输入 → 自动计算光通量
  onLampEfficacyInput(e) {
    const value = e.detail.value
    const power = parseFloat(this.data.lampPower) || 0
    const efficacy = parseFloat(value) || 0
    const flux = Math.round(power * efficacy)
    this.setData({ lampEfficacy: value, lampFlux: flux > 0 ? flux : '' })
    this.recalc()
  },

  // 直接修改光通量结果
  onLampFluxInput(e) {
    const value = e.detail.value
    this.setData({ lampFlux: value })
    this.recalc()
  },

  // 层高输入
  onFloorHeightInput(e) {
    const value = e.detail.value
    this.setData({ floorHeight: value }, () => {
      this.calcUtilFactor()
    })
  },

  // 色彩选择
  onColorChange(e) {
    const index = Number(e.detail.value)
    
    this.setData({ colorIndex: index }, () => {
      this.calcUtilFactor()
    })
  },

  // 根据层高计算对应的系数(线性插值)
  calcFloorHeightFactor(height) {
    if (!height || height <= 0) return 0
    
    // 层高范围与系数对照表(根据利用系数说明)
    const ranges = [
      { min: 0, max: 2.4, minFactor: 0.90, maxFactor: 0.95 },
      { min: 2.4, max: 2.7, minFactor: 0.85, maxFactor: 0.90 },
      { min: 2.7, max: 3.0, minFactor: 0.80, maxFactor: 0.85 },
      { min: 3.0, max: 3.5, minFactor: 0.75, maxFactor: 0.80 },
      { min: 3.5, max: 4.0, minFactor: 0.65, maxFactor: 0.75 },
      { min: 4.0, max: 5.0, minFactor: 0.50, maxFactor: 0.65 },
      { min: 5.0, max: 6.0, minFactor: 0.40, maxFactor: 0.50 },
      { min: 6.0, max: 999, minFactor: 0.30, maxFactor: 0.40 }
    ]
    
    // 找到层高所在的区间
    for (let range of ranges) {
      if (height >= range.min && height <= range.max) {
        // 线性插值计算系数
        const ratio = (height - range.min) / (range.max - range.min)
        const factor = range.minFactor + (range.maxFactor - range.minFactor) * ratio
        return factor
      }
    }
    
    // 如果层高超出范围,返回最小值
    return 0.30
  },

  // 计算利用系数 = 层高系数 × 色彩系数
  calcUtilFactor() {
    const { floorHeight, colorIndex, colorOptions } = this.data
    const height = parseFloat(floorHeight)
    
    // 只有层高和色彩都有值才计算
    if (height > 0 && colorIndex >= 0) {
      const floorFactor = this.calcFloorHeightFactor(height)
      const colorFactor = colorOptions[colorIndex].factor || 1
      const utilFactor = (floorFactor * colorFactor).toFixed(2)
      
      this.setData({ utilFactor })
    }
    
    this.recalc()
  },

  // 维护系数选择
  onMaintenanceChange(e) {
    const index = Number(e.detail.value)
    const option = this.data.maintenanceOptions[index]
    
    this.setData({ 
      maintenanceIndex: index,
      maintenanceFactor: option.value
    })
    this.recalc()
  },

  onAddLampChange(e) {
    const pickIndex = Number(e && e.detail && e.detail.value)
    if (!Number.isFinite(pickIndex) || pickIndex <= 0) {
      this.setData({ lampAddValue: 0 })
      return
    }
    this.addLampByIndex(pickIndex - 1)
    this.setData({ lampAddValue: 0 })
  },

  addLampByIndex(index) {
    if (!Number.isFinite(index) || index < 0) return
    const baseLamp = (this.data.lampTypeRows || [])[index]
    if (!baseLamp) return
    let newName = baseLamp.displayName || baseLamp.name
    
    // 检查重名并自动编号 (例如: 线性灯 -> 线性灯1 -> 线性灯2)
    const existingNames = this.data.selectedLamps.map(l => l.displayName || l.name)
    
    // 正则匹配：名称完全一样，或者 "名称+数字"
    // 注意：需要转义正则中的特殊字符
    const escapedName = newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedName}(\\d*)$`)
    
    let maxSuffix = -1
    let hasMatch = false
    
    existingNames.forEach(name => {
      const match = name.match(regex)
      if (match) {
        hasMatch = true
        const suffix = match[1]
        const num = suffix ? parseInt(suffix) : 0
        if (num > maxSuffix) maxSuffix = num
      }
    })
    
    if (hasMatch) {
      newName = newName + (maxSuffix + 1)
    }
    
    const lampId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const selectedLamp = { 
      ...baseLamp, 
      lampId,
      displayName: newName,
      lengthQty: '' 
    }
    
    const newSelectedLamps = [...this.data.selectedLamps, selectedLamp]
    this.setData({ 
      selectedLamps: newSelectedLamps,
      lampAddValue: 0
    })
    this.recalc()
  },

  // ========== 灯具多选弹窗 ==========

  /**
   * 计算每种 lampTypeRows 当前已加入 selectedLamps 的数量
   * 用于多选弹窗显示"已有 N 个"标签
   */
  _calcLampExistingMap() {
    const map = {}
    const types = this.data.lampTypeRows || []
    const selected = this.data.selectedLamps || []
    types.forEach((type, index) => {
      const baseName = type.displayName || type.name
      if (!baseName) return
      const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 匹配同名或同名+数字后缀
      const regex = new RegExp(`^${escaped}\\d*$`)
      let count = 0
      selected.forEach((lamp) => {
        const lampName = lamp.displayName || lamp.name
        if (lampName && regex.test(lampName)) count += 1
      })
      if (count > 0) map[index] = count
    })
    return map
  },

  /**
   * 打开多选弹窗：重置勾选状态，统计已加入数量
   */
  openLampSelectModal() {
    // 每次打开弹窗时都实时重算分组数据，确保分类始终最新
    this._updateGroupedLampTypes(this.data.lampTypeRows || [])
    this.setData({
      showLampSelectModal: true,
      lampSelectChecked: {},
      lampSelectExisting: this._calcLampExistingMap(),
      lampSelectCount: 0
    })
  },

  closeLampSelectModal() {
    this.setData({
      showLampSelectModal: false,
      lampSelectChecked: {},
      lampSelectCount: 0
    })
  },

  // 监听数据变化时，更新分组的灯具类型供弹窗使用
  _updateGroupedLampTypes(lampTypeRows) {
    const groupedMap = {}
    lampTypeRows.forEach((lamp, index) => {
      const category = lamp.category || '其他'
      if (!groupedMap[category]) {
        groupedMap[category] = []
      }
      groupedMap[category].push({ ...lamp, originalIndex: index })
    })

    const order = [
      '直射重点照明',
      '直接基础照明',
      '间接基础照明',
      '间接氛围照明',
      '近距离任务照明',
      '装饰类直接照明',
      '柔光漫射照明',
      '其他'
    ]

    const groupedLampTypes = []
    order.forEach(cate => {
      if (groupedMap[cate] && groupedMap[cate].length > 0) {
        groupedLampTypes.push({
          categoryName: cate,
          lamps: groupedMap[cate]
        })
      }
    })

    Object.keys(groupedMap).forEach(cate => {
      if (!order.includes(cate) && groupedMap[cate].length > 0) {
        groupedLampTypes.push({
          categoryName: cate,
          lamps: groupedMap[cate]
        })
      }
    })

    this.setData({ groupedLampTypes })
  },

  /**
   * 切换某项勾选状态
   */
  onToggleLampSelect(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isFinite(index) || index < 0) return
    const prev = this.data.lampSelectChecked || {}
    const next = { ...prev }
    if (next[index]) {
      delete next[index]
    } else {
      next[index] = true
    }
    this.setData({
      lampSelectChecked: next,
      lampSelectCount: Object.keys(next).length
    })
  },

  /**
   * 确认选择：批量添加灯具到 selectedLamps（一次 setData 完成）
   */
  onConfirmLampSelect() {
    const checked = this.data.lampSelectChecked || {}
    const indices = Object.keys(checked)
      .filter((k) => checked[k])
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && n >= 0)

    if (indices.length === 0) {
      this.closeLampSelectModal()
      return
    }

    const types = this.data.lampTypeRows || []
    const newList = [...(this.data.selectedLamps || [])]
    const seenIds = new Set(newList.map((l) => l.lampId).filter(Boolean))

    indices.forEach((idx) => {
      const baseLamp = types[idx]
      if (!baseLamp) return

      // 基于"持续累积"的 newList 做重名编号，确保多次同种类型勾选时也能正确编号
      let newName = baseLamp.displayName || baseLamp.name
      const existingNames = newList.map((l) => l.displayName || l.name)
      const escapedName = newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`^${escapedName}(\\d*)$`)
      let maxSuffix = -1
      let hasMatch = false
      existingNames.forEach((name) => {
        const match = name && name.match(regex)
        if (match) {
          hasMatch = true
          const suffix = match[1]
          const num = suffix ? parseInt(suffix) : 0
          if (num > maxSuffix) maxSuffix = num
        }
      })
      if (hasMatch) newName = newName + (maxSuffix + 1)

      // 生成不重复 lampId（极端情况下毫秒级冲突）
      let lampId
      do {
        lampId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      } while (seenIds.has(lampId))
      seenIds.add(lampId)

      newList.push({
        ...baseLamp,
        lampId,
        displayName: newName,
        lengthQty: ''
      })
    })

    this.setData({
      selectedLamps: newList,
      showLampSelectModal: false,
      lampSelectChecked: {},
      lampSelectExisting: {},
      lampSelectCount: 0
    })
    this.recalc()
  },

  onSelectedLampFocus(e) {
    const lampId = e.currentTarget.dataset.lampid
    if (!lampId) return
    this.setData({ focusedLampId: lampId })
  },

  onSelectedLampBlur() {
    if (this.data.focusedLampId) {
      this.setData({ focusedLampId: '' })
    }
  },

  onRenameLamp(e) {
    const lampId = e.currentTarget.dataset.lampid
    const index = (this.data.selectedLamps || []).findIndex(l => l.lampId === lampId)
    if (index < 0) return
    const lamp = this.data.selectedLamps[index]
    const oldName = lamp.displayName || lamp.name

    wx.showModal({
      title: '重命名灯具',
      content: oldName,
      editable: true,
      placeholderText: '请输入新的灯具名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim()
          if (!newName) return
          
          const newSelectedLamps = [...this.data.selectedLamps]
          newSelectedLamps[index].displayName = newName
          
          this.setData({ selectedLamps: newSelectedLamps })
          this.recalc()
        }
      }
    })
  },

  onRemoveLamp(e) {
    const lampId = e.currentTarget.dataset.lampid
    const index = (this.data.selectedLamps || []).findIndex(l => l.lampId === lampId)
    if (index < 0) return
    const newSelectedLamps = [...this.data.selectedLamps]
    newSelectedLamps.splice(index, 1)
    const nextFocus = this.data.focusedLampId === lampId ? '' : this.data.focusedLampId
    this.setData({ selectedLamps: newSelectedLamps, focusedLampId: nextFocus })
    this.recalc()
  },

  onSelectedLampInput(e) {
    const lampId = e.currentTarget.dataset.lampid
    const index = (this.data.selectedLamps || []).findIndex(l => l.lampId === lampId)
    if (index < 0) return
    const value = e.detail.value
    const field = e.currentTarget.dataset.field || 'lengthQty'
    
    const newSelectedLamps = [...this.data.selectedLamps]
    newSelectedLamps[index][field] = value
    this.setData({ selectedLamps: newSelectedLamps })
    this.recalc()
  },

  onSelectedLampPowerInput(e) {
    const lampId = e.currentTarget.dataset.lampid
    const index = (this.data.selectedLamps || []).findIndex(l => l.lampId === lampId)
    if (index < 0) return
    const value = e.detail.value
    const newSelectedLamps = [...this.data.selectedLamps]
    newSelectedLamps[index].powerW = value
    this.setData({ selectedLamps: newSelectedLamps })
    this.recalc()
  },

  // 灯具参数弹窗（付费版 - 单个灯具编辑）
  currentEditIndex: -1,

  openLampParams(e) {
    const lampId = e.currentTarget.dataset.lampid
    const index = (this.data.selectedLamps || []).findIndex(l => l.lampId === lampId)
    if (index < 0) return
    
    this.currentEditIndex = index
    this.setData({ 
      showLampParams: true,
      editingLamp: { ...this.data.selectedLamps[index] }
    })
  },

  saveLampParams() {
    if (this.currentEditIndex > -1 && this.data.editingLamp) {
      const newSelectedLamps = [...this.data.selectedLamps]
      newSelectedLamps[this.currentEditIndex] = this.data.editingLamp
      this.setData({ 
        selectedLamps: newSelectedLamps, 
        showLampParams: false,
        editingLamp: null
      })
      this.currentEditIndex = -1
      this.recalc()
    } else {
      this.setData({ showLampParams: false })
    }
  },

  onEditingLampInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      ['editingLamp.' + field]: value
    })
  },

  // ========== 计算逻辑 ==========
  
  recalc() {
    const toNum = (v) => {
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }

    const { activeTab, selectedLamps } = this.data
    const lampFlux = toNum(this.data.lampFlux)
    const area = toNum(this.data.area)
    const util = toNum(this.data.utilFactor) || 0
    const mnt = toNum(this.data.maintenanceFactor) || 0
    const targetLux = toNum(this.data.targetLux)
    const lampCountInput = toNum(this.data.lampCount)

    // 统一使用 selectedLamps 计算总光通量（现在所有用户都使用付费版UI）
    let totalFlux = (selectedLamps || []).reduce((sum, it) => {
      const phi = toNum(it.powerW) * toNum(it.efficacy) * toNum(it.lengthQty) * toNum(it.sourceUtil)
      return sum + phi
    }, 0)

    // 平均照度
    const avgLux = calcAvgLux(totalFlux, area, util, mnt)

    // 灯具数量
    const calcLampCountResult = calcLampCount(targetLux, area, util, mnt, lampFlux)

    // 单位面积平均功率（使用用户输入的单灯功率）
    const lampPowerNum = parseFloat(this.data.lampPower) || 0
    const avgPowerPerArea = calcAvgPowerPerArea(calcLampCountResult, lampPowerNum, area)

    this.setData({ 
      avgLux, 
      calcLampCount: calcLampCountResult, 
      avgPowerPerArea, 
      totalFluxCalc: Math.round(totalFlux)
    })
  },

  // ========== 付费版结果页 ==========
  
  onCalculate() {
    const { activeTab, area, utilFactor, maintenanceFactor, isPro } = this.data
    
    // 权限检查：未付费用户不能使用"按灯具算照度"功能
    if (activeTab === 'lux' && !isPro) {
      wx.showModal({
        title: '提示',
        content: '这是 Pro 版照度计算工具，仅对已购买「二哥灯光工具包」的用户开放。\n\n未购买请先购买工具包，已购买用户可联系客服开通。',
        confirmText: '去购买',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 直接跳转到订单确认页，跳过工具包详情页
            const item = {
              id: 'TK_DEFAULT_001',
              name: '灯光设计工具包',
              price: 69,
              image: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/工具包主图/工具包-主图1.jpg',
              quantity: 1,
              specs: { version: '标准版' }
            }
            const query = encodeURIComponent(JSON.stringify(item))
            // 跳转购买前：保存当前已填参数 + 标记权限待复查
            // 这样用户购买/激活完成回到本页，参数会自动恢复且能直接计算
            this._markPendingPurchaseCheck()
            wx.navigateTo({ url: `/pages/order/confirm/confirm?item=${query}` })
          }
        }
      })
      return
    }
    
    if (!this.validateCalculateInputs()) return

    wx.showLoading({ title: '计算中...' })

    // 构建云函数参数
    const { roomTypes, roomTypeIndex } = this.data
    const cloudParams = {
      mode: activeTab,
      area: parseFloat(area),
      utilFactor: parseFloat(utilFactor),
      maintenanceFactor: parseFloat(maintenanceFactor),
      spaceType: roomTypes[roomTypeIndex] ? roomTypes[roomTypeIndex].name : '自定义',
      roomTypeIndex: roomTypeIndex
    }

    if (activeTab === 'count') {
      cloudParams.targetLux = parseFloat(this.data.targetLux)
      cloudParams.lampFlux = parseFloat(this.data.lampFlux)
      cloudParams.lampPower = parseFloat(this.data.lampPower) || 0
      cloudParams.lampEfficacy = parseFloat(this.data.lampEfficacy) || 80
    } else if (activeTab === 'quantity') {
      cloudParams.targetLux = parseFloat(this.data.targetLux)
      cloudParams.lampCount = parseFloat(this.data.lampCount)
      cloudParams.lampEfficacy = parseFloat(this.data.lampEfficacy) || 80
    } else {
      cloudParams.selectedLamps = this.data.selectedLamps
    }

    // 调用云函数生成报告
    wx.cloud.callFunction({
      name: 'calc_report',
      data: { action: 'generate', params: cloudParams },
      timeout: 5000
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.success && result.data) {
        console.log('[search] 云函数计算成功, calcId:', result.data.calcId)
        // 保存历史记录（含 calcId）
        this.saveHistory(result.data.resultData, result.data.calcId)
        // 通过 _cloudReportData 传递完整后端数据给结果页
        this.setData({ _cloudReportData: result.data }, () => {
          wx.navigateTo({ url: '/pages/search/calc-result/calc-result' })
        })
      } else {
        console.warn('[search] 云函数返回失败，回退本地计算:', result)
        this._fallbackLocalCalculate()
      }
    }).catch(err => {
      wx.hideLoading()
      console.warn('[search] 云函数调用失败，回退本地计算:', err)
      this._fallbackLocalCalculate()
    })
  },

  /**
   * 前端本地计算兜底（云函数失败时调用）
   */
  _fallbackLocalCalculate() {
    const { activeTab, area, utilFactor, maintenanceFactor } = this.data
    let resultData = {}

    if (activeTab === 'count' || activeTab === 'quantity') {
      const { targetLux, lampFlux, roomTypes, roomTypeIndex, lampCount } = this.data

      if (activeTab === 'count') {
        if (!targetLux || !lampFlux) {
          wx.showToast({ title: '请补全参数', icon: 'none' })
          return
        }

        const fluxNeeded = parseFloat(targetLux) * parseFloat(area)
        const effectiveFlux = parseFloat(lampFlux) * parseFloat(utilFactor) * parseFloat(maintenanceFactor)
        const count = Math.ceil(fluxNeeded / effectiveFlux)
        const lampPowerNum = parseFloat(this.data.lampPower) || 0
        const powerDensity = (count * lampPowerNum) / parseFloat(area)
        const powerDensityStr = powerDensity.toFixed(2) + 'W/㎡'

        resultData = {
          mode: 'count',
          mainValue: count,
          mainUnit: '盏',
          mainLabel: '建议灯具数量',
          headerLeft: { label: '功率密度', value: powerDensityStr },
          headerRight: { label: '目标照度', value: targetLux + 'Lx' },
          details: [
            { label: '房间面积', value: area + ' ㎡' },
            { label: '空间类型', value: roomTypes[roomTypeIndex] ? roomTypes[roomTypeIndex].name : '自定义' },
            { label: '总光通量', value: Math.round(fluxNeeded) + ' Lm' },
            { label: '单灯功率', value: this.data.lampPower + 'W' },
            { label: '发光效率', value: this.data.lampEfficacy + ' lm/W' },
            { label: '单灯光通量', value: lampFlux + ' Lm' },
            { label: '利用系数', value: utilFactor },
            { label: '维护系数', value: maintenanceFactor }
          ]
        }
      } else {
        if (!targetLux || !lampCount) {
          wx.showToast({ title: '请补全参数', icon: 'none' })
          return
        }

        const fluxNeeded = parseFloat(targetLux) * parseFloat(area)
        const singleFlux = fluxNeeded / (parseFloat(lampCount) * parseFloat(utilFactor) * parseFloat(maintenanceFactor))
        const efficacyVal = parseFloat(this.data.lampEfficacy) || 80
        const requiredWattage = Math.round(singleFlux / efficacyVal)
        const powerDensity = (parseFloat(lampCount) * requiredWattage) / parseFloat(area)
        const powerDensityStr = powerDensity.toFixed(2) + 'W/㎡'

        resultData = {
          mode: 'quantity',
          mainValue: Math.round(singleFlux),
          mainUnit: 'Lm',
          mainLabel: '建议单灯光通量',
          headerLeft: { label: '灯具数量', value: lampCount + '盏' },
          headerMiddle: { label: '需购买瓦数', value: requiredWattage + 'W' },
          headerRight: { label: '目标照度', value: targetLux + 'Lx' },
          details: [
            { label: '房间面积', value: area + ' ㎡' },
            { label: '空间类型', value: roomTypes[roomTypeIndex] ? roomTypes[roomTypeIndex].name : '自定义' },
            { label: '功率密度', value: powerDensityStr },
            { label: '利用系数', value: utilFactor },
            { label: '维护系数', value: maintenanceFactor },
            { label: '总光通量需求', value: Math.round(fluxNeeded) + ' Lm' }
          ]
        }
      }

    } else {
      if (this.data.selectedLamps.length === 0) {
        wx.showToast({ title: '请添加灯具', icon: 'none' })
        return
      }

      const totalFlux = this.data.selectedLamps.reduce((sum, lamp) => {
        return sum + (parseFloat(lamp.powerW || 0) * parseFloat(lamp.efficacy || 0) * parseFloat(lamp.lengthQty || 0) * parseFloat(lamp.sourceUtil || 1))
      }, 0)

      const totalPower = this.data.selectedLamps.reduce((sum, lamp) => {
        return sum + (parseFloat(lamp.powerW || 0) * parseFloat(lamp.lengthQty || 0))
      }, 0)

      const avgLux = calcAvgLux(totalFlux, area, utilFactor, maintenanceFactor)
      const powerDensity = totalPower / parseFloat(area)

      const lampDetails = this.data.selectedLamps.map(lamp => {
        const lampFlux = parseFloat(lamp.powerW || 0) * parseFloat(lamp.efficacy || 0) * parseFloat(lamp.lengthQty || 0) * parseFloat(lamp.sourceUtil || 1)
        return {
          label: lamp.displayName || lamp.name || '未知灯具',
          value: Math.round(lampFlux) + ' Lm'
        }
      })

      resultData = {
        mode: 'lux',
        mainValue: Math.round(avgLux),
        mainUnit: 'Lx',
        mainLabel: '平均照度',
        headerLeft: { label: '总光通量', value: Math.round(totalFlux) + 'Lm' },
        headerRight: { label: '功率密度', value: powerDensity.toFixed(2) + 'W/㎡' },
        details: lampDetails,
        bottomTable: this.data.selectedLamps
      }
    }

    // 本地兜底：保存历史记录并跳转
    this.saveHistory(resultData)
    this.setData({ resultData }, () => {
      wx.navigateTo({ url: '/pages/search/calc-result/calc-result' })
    })
  },

  /**
   * 保存计算历史
   */
  saveHistory(resultData, calcId) {
    try {
      const { activeTab, area, roomTypes, roomTypeIndex, targetLux } = this.data
      const roomName = roomTypes[roomTypeIndex] ? roomTypes[roomTypeIndex].name : '自定义'
      
      let summary = `${roomName} · ${area}㎡`
      let resultStr = ''
      let defaultTitle = '计算记录'
      
      if (activeTab === 'count') {
        defaultTitle = '按照度算数量'
        summary += ` · 目标${targetLux}Lx`
        resultStr = `${resultData.mainValue}盏灯具`
      } else if (activeTab === 'quantity') {
        defaultTitle = '按数量算照度'
        summary += ` · ${this.data.lampCount}盏灯`
        resultStr = `建议单灯${resultData.mainValue}Lm`
      } else if (activeTab === 'lux') {
        defaultTitle = '按灯具算照度'
        const lampCount = this.data.selectedLamps.reduce((sum, l) => sum + Number(l.lengthQty || 0), 0)
        summary += ` · ${lampCount}盏灯`
        resultStr = `平均照度${resultData.mainValue}Lx`
      }

      const historyItem = {
        id: Date.now(),
        calcId: calcId || '',
        customName: defaultTitle,
        timestamp: Date.now(),
        mode: activeTab,
        summary,
        resultStr,
        params: {
           activeTab,
           area: this.data.area,
           roomTypeIndex: this.data.roomTypeIndex,
           targetLux: this.data.targetLux,
           floorHeight: this.data.floorHeight,
           colorIndex: this.data.colorIndex,
           maintenanceIndex: this.data.maintenanceIndex,
           maintenanceFactor: this.data.maintenanceFactor,
           utilFactor: this.data.utilFactor,
           
           // count mode
           lampFlux: this.data.lampFlux,
           lampPower: this.data.lampPower,
           lampEfficacy: this.data.lampEfficacy,

           // quantity mode
           lampCount: this.data.lampCount,
           
           // lux mode
           selectedLamps: this.data.selectedLamps
        },
        result: resultData
      }

      let history = wx.getStorageSync('calc_history') || []
      history.unshift(historyItem)
      if (history.length > 20) {
        history = history.slice(0, 20)
      }
      wx.setStorageSync('calc_history', history)
      
    } catch (e) {
      console.error('保存历史记录失败', e)
    }
  },

  /**
   * 点击"进一步了解"跳转到帮助中心
   */
  onDisclaimerTap() {
    wx.navigateTo({
      url: '/pages/search/help/help'
    })
  },

  /**
   * 点击历史记录
   */
  onHistoryTap() {
    wx.navigateTo({
      url: '/pages/search/history/history'
    })
  },

  /**
   * 返回上一页
   */
  onBackTap() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        // 如果没有上一页（比如从分享点进来的），则跳转到首页
        wx.switchTab({
          url: '/pages/toolbox/toolbox'
        })
      }
    })
  }
})
