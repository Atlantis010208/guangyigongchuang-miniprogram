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

Page({
  data: {
    // ========== 权限状态 ==========
    isPro: false,                  // 是否为付费用户（控制UI渲染）
    checkingPermission: true,      // 是否正在检查权限
    showUpgradeModal: false,       // 是否显示升级弹窗（免费版）

    // ========== 通用字段 ==========
    activeTab: 'count',            // 当前标签: 'lux' | 'count'
    lampFlux: '',                  // 单灯光通量（lm）
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

    // ========== 付费版专用 ==========
    selectedLamps: [],             // 用户已选灯具列表（动态添加）
    focusedLampId: '',
    lampAddOptions: ['请选择灯具'],
    lampAddValue: 0,
    headerBgFileId: 'cloud://cloud1-5gb9c5u2c58ad6d7.636c-cloud1-5gb9c5u2c58ad6d7-1378684587/主页/照度计算背景图.png',
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
    
    // 层高选择器（参考利用系数说明表）
    floorHeights: [
      { name: '2.3米', height: 2.3, factor: 0.925 },
      { name: '2.6米', height: 2.6, factor: 0.875 },
      { name: '2.9米', height: 2.9, factor: 0.825 },
      { name: '3.3米', height: 3.3, factor: 0.775 },
      { name: '3.8米', height: 3.8, factor: 0.70 },
      { name: '4.5米', height: 4.5, factor: 0.575 },
      { name: '5.5米', height: 5.5, factor: 0.45 },
      { name: '6.0米', height: 6.5, factor: 0.35 }
    ],
    floorHeightIndex: -1,
    floorHeight: '',
    
    // 色彩选择器（参考利用系数说明表）
    colorOptions: [
      { name: '浅色', factor: 0.8 },
      { name: '木质类', factor: 0.6 },
      { name: '细腻深色', factor: 0.3 },
      { name: '粗糙深色', factor: 0.15 }
    ],
    colorIndex: -1,

    // 维护系数选择器
    maintenanceOptions: [
      { name: '干净', value: 0.8 },
      { name: '一般', value: 0.7 },
      { name: '污染', value: 0.6 }
    ],
    maintenanceIndex: -1,
  },

  // ========== 生命周期 ==========
  
  async onLoad(options) {
    console.log('[search] onLoad, options:', options)
    
    // 1. 初始化灯具参数（免费版使用）
    const lampTypeRows = getDefaultLampTypes()
    this.setData({
      lampTypeRows,
      lampAddOptions: this.buildLampAddOptions(lampTypeRows),
      lampAddValue: 0
    })
    
    // 2. 检查权限
    const isPurchased = await this.checkPurchaseStatus()
    console.log('[search] 权限检查结果:', isPurchased)
    
    // 3. 设置 UI 模式
    this.setData({ 
      isPro: isPurchased, 
      checkingPermission: false 
    })
    
    // 4. 如果是免费版且带有 showUpgrade 参数，显示升级弹窗
    if (!isPurchased && options.showUpgrade === '1') {
      console.log('[search] 显示升级弹窗')
      setTimeout(() => {
        this.showUpgradeDialog()
      }, 300)
    }
  },

  onShow() {
    console.log('[search] onShow')
    
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
    console.log('[search] onHide')
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
    if (this.data.floorHeightIndex < 0) return need('请选择层高')
    if (this.data.colorIndex < 0) return need('请选择色彩')
    if (toNum(this.data.maintenanceFactor) <= 0) return need('请输入维护系数')

    if (activeTab === 'count') {
      if (toNum(this.data.lampFlux) <= 0) return need('请输入单灯光通量')
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

  resetFormData() {
    const lampTypeRows = getDefaultLampTypes()
    this.setData({
      activeTab: 'count',
      lampFlux: '',
      area: '',
      utilFactor: '',
      maintenanceFactor: 0.8,
      maintenanceIndex: -1,
      targetLux: '',
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

    roomTypeIndex: -1,
      floorHeightIndex: -1,
      floorHeight: '',
      colorIndex: -1
    })
  },

  buildLampAddOptions(rows) {
    const list = Array.isArray(rows) ? rows : []
    return ['请选择灯具', ...list.map((it) => it.displayName || it.name || '灯具')]
  },

  /**
   * 下拉刷新处理
   * 清除缓存并重新检查权限状态
   */
  async onPullDownRefresh() {
    console.log('[search] 🔄 下拉刷新开始')
    
    try {
      // 1. 清除权限缓存
      wx.removeStorageSync(CACHE_KEY)
      console.log('[search] 缓存已清除')
      
      // 2. 显示加载状态
      this.setData({ checkingPermission: true })
      
      // 3. 重新检查权限
      const isPurchased = await this.checkPurchaseStatus()
      console.log('[search] 刷新后权限状态:', isPurchased)
      
      // 4. 重置数据并更新权限
      this.resetFormData()
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
    wx.navigateTo({ 
      url: '/pages/toolkit/toolkit-detail/toolkit-detail?id=TK_DEFAULT_001' 
    })
  },

  stopPropagation() {},

  // ========== 通用方法 ==========
  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.recalc()
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [field]: value })
    
    // 付费版：层高输入时切换到自定义模式
    if (this.data.isPro && field === 'floorHeight') {
      this.setData({ floorHeightIndex: 4 })
    }
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

  onOpenRules() {
    wx.navigateTo({
      url: '/pages/search/help/help'
    })
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

  // 层高选择
  onFloorHeightChange(e) {
    const index = Number(e.detail.value)
    const floorHeightOption = this.data.floorHeights[index]
    const updates = { floorHeightIndex: index }
    
    updates.floorHeight = floorHeightOption.height.toString()
    
    // 计算利用系数 = 层高系数 × 色彩系数
    this.setData(updates, () => {
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

  // 计算利用系数 = 层高系数 × 色彩系数
  calcUtilFactor() {
    const { floorHeightIndex, colorIndex, floorHeights, colorOptions } = this.data
    
    // 只有两者都选择了才计算
    if (floorHeightIndex >= 0 && colorIndex >= 0) {
      const floorFactor = floorHeights[floorHeightIndex].factor || 1
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

    // 单位面积平均功率
    const avgPowerPerArea = calcAvgPowerPerArea(calcLampCountResult, 7, area)

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
        content: '请购买工具包后使用此功能',
        confirmText: '去购买',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/toolkit/toolkit-detail/toolkit-detail?id=TK_DEFAULT_001'
            })
          }
        }
      })
      return
    }
    
    if (!this.validateCalculateInputs()) return

    wx.showLoading({ title: '计算中...' })

    if (this._calcTimer) {
      clearTimeout(this._calcTimer)
      this._calcTimer = null
    }

    this._calcTimer = setTimeout(() => {
      this._calcTimer = null
      wx.hideLoading()
      
      let resultData = {}

      if (activeTab === 'count' || activeTab === 'quantity') {
        const { targetLux, lampFlux, roomTypes, roomTypeIndex, lampCount } = this.data
        
        if (activeTab === 'count') {
          if (!targetLux || !lampFlux) {
            wx.showToast({ title: '请补全参数', icon: 'none' })
            this.applyNavBarStyle(false)
            return
          }

          const fluxNeeded = parseFloat(targetLux) * parseFloat(area)
          const effectiveFlux = parseFloat(lampFlux) * parseFloat(utilFactor) * parseFloat(maintenanceFactor)
          const count = Math.ceil(fluxNeeded / effectiveFlux)
          
          // 计算功率密度：功率密度 = (灯具数量 * 7) / 面积
          const powerDensity = (count * 7) / parseFloat(area)
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
              { label: '单灯光通量', value: lampFlux + ' Lm' },
              { label: '利用系数', value: utilFactor },
              { label: '维护系数', value: maintenanceFactor }
            ]
          }
        } else {
          // Quantity mode: TargetLux + Count -> Required Flux per Lamp
          if (!targetLux || !lampCount) {
            wx.showToast({ title: '请补全参数', icon: 'none' })
            this.applyNavBarStyle(false)
            return
          }
          
          const fluxNeeded = parseFloat(targetLux) * parseFloat(area)
          // Total Effective Flux = Count * SingleFlux * UF * MF
          // => SingleFlux = Total Effective Flux / (Count * UF * MF)
          // Wait, FluxNeeded (Total) = E * A
          // FluxNeeded = Count * SingleFlux * UF * MF
          // => SingleFlux = (E * A) / (Count * UF * MF)
          
          const singleFlux = fluxNeeded / (parseFloat(lampCount) * parseFloat(utilFactor) * parseFloat(maintenanceFactor))
          
          // 计算功率密度：功率密度 = (灯具数量 * 7) / 面积
          const powerDensity = (parseFloat(lampCount) * 7) / parseFloat(area)
          const powerDensityStr = powerDensity.toFixed(2) + 'W/㎡'
          
          resultData = {
            mode: 'quantity',
            mainValue: Math.round(singleFlux),
            mainUnit: 'Lm',
            mainLabel: '建议单灯光通量',
            headerLeft: { label: '灯具数量', value: lampCount + '盏' },
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
        // Lux mode
        if (this.data.selectedLamps.length === 0) {
          wx.showToast({ title: '请添加灯具', icon: 'none' })
          this.applyNavBarStyle(false)
          return
        }
        
        // 计算总光通量：灯具总光通量 = 功率 × 发光效率 × 数量 × 光源利用率
        const totalFlux = this.data.selectedLamps.reduce((sum, lamp) => {
          return sum + (parseFloat(lamp.powerW || 0) * parseFloat(lamp.efficacy || 0) * parseFloat(lamp.lengthQty || 0) * parseFloat(lamp.sourceUtil || 1))
        }, 0)
        
        const totalPower = this.data.selectedLamps.reduce((sum, lamp) => {
          return sum + (parseFloat(lamp.powerW || 0) * parseFloat(lamp.lengthQty || 0))
        }, 0)

        // 平均照度 = (总光通量 × 利用系数 × 维护系数) / 面积
        const avgLux = calcAvgLux(totalFlux, area, utilFactor, maintenanceFactor)
        const powerDensity = totalPower / parseFloat(area)

        // 构造灯具明细列表：单灯总光通量 = 功率 × 发光效率 × 数量 × 光源利用率
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

      // 将结果数据保存到页面实例，供结果页读取
      this.setData({ resultData })
      
      // 跳转到独立的结果页面
      wx.navigateTo({
        url: '/pages/search/calc-result/calc-result'
      })

    }, 300)
  },

})
