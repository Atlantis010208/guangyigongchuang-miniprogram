// pages/color-temp/color-temp-result/color-temp-result.js

const membershipUtil = require('../../../utils/membership.js')

// 6 档可切换的色温场景档位（与静态托管 color-temp/scenes/{K}K.jpg 一一对应）
const SCENE_TEMPS = [2700, 3000, 3500, 4000, 5000, 6500]
// 注意：图片实际位于云开发静态网站托管（5b3a-static 桶），所以用 https 直链而非 cloud:// fileID
const SCENE_FILEID_PREFIX = 'https://cloud1-5gb9c5u2c58ad6d7-1378684587.tcloudbaseapp.com/color-temp/scenes/'

// 单个 slide 在 .scene-track 总宽（600%）中所占的百分比 = 100/6 ≈ 16.6667%
const STEP_PERCENT = 100 / SCENE_TEMPS.length
// 切档时启用 transition；跟手期间会被替换为 'none' 让 transform 立即响应
const TRACK_TRANSITION_ON = 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)'
// 横滑阈值：横向位移超过 slide 宽度的 18% 即触发切档（约 70px@375px 设备）
const SWIPE_RATIO = 0.18

// 各档位标签 + 完整描述：胶囊卡片渲染时拼接为「{K}K{tag}。{desc}」
const TEMP_INFO_MAP = {
  2700: {
    tag: '烛光暖光',
    desc: '视觉感受就像傍晚烛光，温暖柔和，最适合卧室放松与入眠场景。'
  },
  3000: {
    tag: '暖白光',
    desc: '视觉感受就像清晨或黄昏的自然光，能让人瞬间卸下疲惫，感觉温馨又放松。'
  },
  3500: {
    tag: '自然偏暖',
    desc: '视觉感受介于暖白与自然白之间，温馨中带着清晰，是客厅、餐厅最"百搭"的色温档位。'
  },
  4000: {
    tag: '自然白光',
    desc: '视觉感受就像晴朗午后的日光，明亮而不刺眼，最适合厨房、卫生间、书房等需要看清细节的空间。'
  },
  5000: {
    tag: '中性白光',
    desc: '视觉感受就像正午的天光，明亮通透、能让人保持清醒和专注，适合办公室、作业台面与商业空间。'
  },
  6500: {
    tag: '冷白日光',
    desc: '视觉感受就像阴天户外的标准光，纯净冷冽，常用于商业辨色场景，居家慎用以免过冷。'
  }
}

// 每个色温档位对应的底部主色（用作渐变底色，尽量贴近图底部的地板/墙角颜色，采用 r,g,b 格式）
const TEMP_BOTTOM_COLOR_MAP = {
  2700: '50, 35, 25',    // 深暖褐色
  3000: '45, 36, 28',    // 深咖色
  3500: '42, 38, 34',    // 偏暖深灰
  4000: '35, 36, 38',    // 中性深灰
  5000: '32, 36, 42',    // 偏冷深灰
  6500: '28, 34, 45'     // 冷暗蓝灰
}

Page({
  data: {
    result: {
      standardTemp: 0,
      desc: '',
      layers: [],
      tips: [],
      reasoning: ''
    },
    overallTemp: 0,                   // AI / 本地兜底推荐的整屋色温（用于初始化展示档位）

    // 顶部胶囊卡片 + 左右切换状态（参考图一布局）
    sceneTemps: SCENE_TEMPS,
    sceneList: [],                    // 6 张场景图的完整数据（供 wxml wx:for 渲染 .scene-track 下的 6 个 slide）
    // .scene-track 的完整 inline style：transform 控制平移位移，transition 跟手时关闭、松手时开启实现 snap
    trackStyle: 'transform: translate3d(0%, 0, 0); transition: ' + TRACK_TRANSITION_ON + ';',
    displayedIndex: 0,                // 当前展示的档位在 SCENE_TEMPS 中的索引
    displayedTemp: SCENE_TEMPS[0],    // 当前展示的色温值（K）
    displayedTag: '',                 // 当前档位标签（如「暖白光」）
    displayedDesc: '',                // 当前档位完整描述
    displayedSceneFileId: '',         // 当前档位场景图 https 直链（仅 wx.previewImage 使用）
    displayedScenePreviewUrl: '',     // 当前档位场景图 https 直链（wx.previewImage 用，与 displayedSceneFileId 同源）
    displayedBottomColor: '',         // 当前档位底色的 rgb 字符串（用于 wxml 渐变及底座色）
    canPrev: false,                   // 左箭头是否可点
    canNext: true,                    // 右箭头是否可点

    // 色温推荐输入参数（绘制 PDF 报告使用）
    params: {},

    // ====== 导出报告功能状态 ======
    membership: {
      effectiveLevel: 'free',
      vipLevel: null,
      vipExpireAt: null,
      remainingDays: 0,
      isLoggedIn: false
    },
    // 署名输入弹窗
    showSignatureModal: false,
    signatureName: '',
    signatureStudio: '',
    // 会员门槛 (paywall) 弹窗 —— 免费用户点「导出报告」时出现
    showPaywallModal: false,
    paywallInviteProgress: { inCycle: 0, needed: 2, percent: 0, nextRewardDays: 7 },
    paywallInvitedTotal: 0,
    paywallTrialGranted: 0,
    // 导出后预览弹窗状态
    showPreviewModal: false,
    exportedPdfPath: '',
    exportedPdfFileName: '',
    exportedPdfSizeText: '',
    // 导出过程 Loading
    exporting: false,
    exportingText: ''
  },

  // 6 档场景图 URL 缓存：{ 2700: 'https://.../2700K.jpg', ... }
  _sceneUrlMap: {},

  onLoad(options) {
    // 静态托管 https URL 同步可用，不依赖云端转 tempUrl
    this._buildSceneUrlMap()

    const app = getApp()
    if (app.globalData && app.globalData.colorTempResult) {
      const result = app.globalData.colorTempResult
      const overallTemp = this._computeOverallTemp(result)
      // 推荐档位索引（AI 推荐的色温落在 SCENE_TEMPS 中的最近档）
      const recommendedSceneIndex = this._findSceneIndex(overallTemp)
      const recommendedSceneTemp = SCENE_TEMPS[recommendedSceneIndex]
      this.setData({
        result: result,
        overallTemp: overallTemp,
        params: app.globalData.colorTempParams || {}
      })
      this._saveHistory(result, app.globalData.colorTempParams)
      // 仅推荐档位的 slide 填充 AI 生成的描述（result.desc = AI 返回的 tempDesc）
      // 其余 slide 只保留大字（小字描述为空，wxml 中 wx:if 不渲染）
      this._buildSceneList(recommendedSceneTemp, result.desc)
      // 默认展示档位 = 推荐档
      this._setDisplayedIndex(recommendedSceneIndex)
    } else {
      // 没有结果数据时防御性处理：所有 slide 都不显示小字描述
      this._buildSceneList(null, '')
      this._setDisplayedIndex(0)
    }
  },

  // 同步预生成 6 档场景图 URL 映射（静态托管直链不需要异步换取 tempUrl）
  _buildSceneUrlMap() {
    SCENE_TEMPS.forEach(k => {
      this._sceneUrlMap[k] = SCENE_FILEID_PREFIX + k + 'K.jpg'
    })
  },

  // 构建 sceneList：供 wxml wx:for 渲染 6 个 slide（每个 slide 自带 image + 胶囊文本 + 底色）
  // 仅 AI 推荐档位（recommendedSceneTemp）的 slide 填充 AI 生成的专业描述（aiDesc）作为胶囊小字；
  // 其余 slide 的 desc 留空，wxml 中凭 wx:if 不渲染 .temp-summary-desc，只显示大字色温。
  _buildSceneList(recommendedSceneTemp, aiDesc) {
    const desc = (aiDesc || '').trim()
    const list = SCENE_TEMPS.map(t => {
      const info = TEMP_INFO_MAP[t] || { tag: '' }
      return {
        temp: t,
        url: this._sceneUrlMap[t] || (SCENE_FILEID_PREFIX + t + 'K.jpg'),
        tag: info.tag,
        desc: (recommendedSceneTemp && t === recommendedSceneTemp) ? desc : '',
        color: TEMP_BOTTOM_COLOR_MAP[t] || '20, 20, 20'
      }
    })
    this.setData({ sceneList: list })
  },

  // 找到 SCENE_TEMPS 中离 temp 最近的档位索引
  _findSceneIndex(temp) {
    const t = Number(temp) || SCENE_TEMPS[0]
    let idx = 0
    let minDiff = Math.abs(t - SCENE_TEMPS[0])
    for (let i = 1; i < SCENE_TEMPS.length; i++) {
      const diff = Math.abs(t - SCENE_TEMPS[i])
      if (diff < minDiff) { minDiff = diff; idx = i }
    }
    return idx
  },

  // 工具：根据百分比和是否启用 transition 构造 .scene-track 的 inline style
  // translate3d 触发硬件加速合成层，避免 CPU 合成大尺寸 element 卡顿
  _buildTrackStyle(percent, withTransition) {
    const t = withTransition ? TRACK_TRANSITION_ON : 'none'
    return 'transform: translate3d(' + percent.toFixed(4) + '%, 0, 0); transition: ' + t + ';'
  },

  // 切换展示档位：同步更新大字 / 标签 / 描述 / 场景图 / 箭头可用状态
  // 位移动画交由 inline transition transform 实现（trackStyle），底色/蒙版同步调色交由 transition background 实现
  _setDisplayedIndex(index) {
    const safeIndex = Math.max(0, Math.min(SCENE_TEMPS.length - 1, index))
    const temp = SCENE_TEMPS[safeIndex]
    const info = TEMP_INFO_MAP[temp] || { tag: '', desc: '' }
    const sceneUrl = this._sceneUrlMap[temp] || (SCENE_FILEID_PREFIX + temp + 'K.jpg')
    const bottomColor = TEMP_BOTTOM_COLOR_MAP[temp] || '20, 20, 20' // 兜底色
    // 位移量：-safeIndex * STEP_PERCENT %，相对 .scene-track 自身宽度（6 张 slide 总宽 600%）
    const translatePercent = -(safeIndex * STEP_PERCENT)
    this.setData({
      displayedIndex: safeIndex,
      displayedTemp: temp,
      displayedTag: info.tag,
      displayedDesc: info.desc,
      displayedSceneFileId: sceneUrl,
      displayedScenePreviewUrl: sceneUrl,
      displayedBottomColor: bottomColor,
      // 切档时开启 transition，让 .scene-track 平滑过渡到目标百分比
      trackStyle: this._buildTrackStyle(translatePercent, true),
      canPrev: safeIndex > 0,
      canNext: safeIndex < SCENE_TEMPS.length - 1
    })
  },

  // 左箭头：切到上一档（更暖的色温）
  onPrevTemp() {
    if (!this.data.canPrev) return
    this._setDisplayedIndex(this.data.displayedIndex - 1)
  },

  // 右箭头：切到下一档（更冷的色温）
  onNextTemp() {
    if (!this.data.canNext) return
    this._setDisplayedIndex(this.data.displayedIndex + 1)
  },

  // 场景图触摸开始：记录起点 + 基准位移百分比，并缓存 slide 宽度
  onSceneTouchStart(e) {
    const t = e && e.touches && e.touches[0]
    if (!t) return
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    // 起手时的基准 transform 百分比（负数）—— 跟手时基于此叠加 dxPercent
    this._baseTranslatePercent = -(this.data.displayedIndex * STEP_PERCENT)
    // 缓存 slide 宽度（px）：.image-wrapper 宽度 ≈ windowWidth - 60rpx 的 page 横向 padding
    if (!this._slideWidthPx) {
      const sys = wx.getSystemInfoSync()
      const rpxToPx = sys.windowWidth / 750
      this._slideWidthPx = sys.windowWidth - 60 * rpxToPx
    }
    this._isDragging = true
  },

  // 场景图触摸移动：wxml 用 catch:touchmove 绑定本函数（阻止事件冒泡禁用页面纵向滚动）
  // 跟手实现：实时根据手指位移更新 .scene-track 的 transform，关闭 transition 让响应立即
  // 边界处（首/末张）越界后位移衰减到 30%，做出阻尼回弹手感
  onSceneTouchMove(e) {
    if (!this._isDragging) return
    const startX = this._touchStartX
    if (startX == null) return
    const t = e && e.touches && e.touches[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - this._touchStartY
    // 明显纵向手势（误触）—— 不更新跟手 transform，让 touchend 判定回弹
    if (Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dy) > 20) return
    // dx 占 slide 宽度的比例 × stepPercent = 在轨道总宽中的百分比变化
    const dxPercent = (dx / this._slideWidthPx) * STEP_PERCENT
    let nextPercent = this._baseTranslatePercent + dxPercent
    // 边界回弹阻尼：超出 [minPercent, maxPercent] 时位移衰减到 30%
    const minPercent = -((SCENE_TEMPS.length - 1) * STEP_PERCENT)
    const maxPercent = 0
    if (nextPercent > maxPercent) {
      nextPercent = maxPercent + (nextPercent - maxPercent) * 0.3
    } else if (nextPercent < minPercent) {
      nextPercent = minPercent + (nextPercent - minPercent) * 0.3
    }
    // 跟手时关闭 transition，让 transform 立即响应（不带过渡）
    this.setData({ trackStyle: this._buildTrackStyle(nextPercent, false) })
  },

  // 场景图触摸结束：根据位移决定切档（>SWIPE_RATIO 触发）或回弹到当前档（恢复 transition）
  onSceneTouchEnd(e) {
    const startX = this._touchStartX
    const startY = this._touchStartY
    const wasDragging = this._isDragging
    this._touchStartX = null
    this._touchStartY = null
    this._isDragging = false
    if (!wasDragging || startX == null) return
    const t = e && e.changedTouches && e.changedTouches[0]
    if (!t) {
      // 异常：仍把状态收回到当前档（重新 setData 带 transition 让 transform 平滑回到基准位）
      this._setDisplayedIndex(this.data.displayedIndex)
      return
    }
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const SWIPE_THRESHOLD_PX = this._slideWidthPx * SWIPE_RATIO
    // 判定为纵向手势 / 横向位移不够 → 回弹到当前档（_setDisplayedIndex 会带 transition 平滑收回）
    if (absDy > absDx || absDx < SWIPE_THRESHOLD_PX) {
      this._setDisplayedIndex(this.data.displayedIndex)
      return
    }
    // dx<0 用户左滑 → 下一档；dx>0 用户右滑 → 上一档；越界由 _setDisplayedIndex 内部 clamp 兜底
    const targetIdx = dx < 0 ? this.data.displayedIndex + 1 : this.data.displayedIndex - 1
    this._setDisplayedIndex(targetIdx)
  },

  // 点击当前色温场景图调起全屏预览（可双指缩放）
  onPreviewScaleImage() {
    const url = this.data.displayedScenePreviewUrl || this.data.displayedSceneFileId
    if (!url) return
    wx.previewImage({
      urls: [url],
      current: url,
      fail: (err) => {
        console.warn('[结果页] 预览色温场景图失败', err)
      }
    })
  },

  // 基于 layers 的算术平均吸附到 SCENE_TEMPS 标准档；无 layers 时退化为 standardTemp
  _computeOverallTemp(result) {
    if (!result) return 0
    const layers = Array.isArray(result.layers) ? result.layers.filter(l => l && Number(l.temp) > 0) : []
    if (layers.length === 0) return Number(result.standardTemp) || 0
    const avg = layers.reduce((sum, l) => sum + Number(l.temp), 0) / layers.length
    return this._snapToStandard(avg)
  },

  _snapToStandard(temp) {
    const standards = SCENE_TEMPS
    let closest = standards[0]
    let minDiff = Math.abs(temp - closest)
    for (let i = 1; i < standards.length; i++) {
      const diff = Math.abs(temp - standards[i])
      if (diff < minDiff) { minDiff = diff; closest = standards[i] }
    }
    return closest
  },

  _saveHistory(result, params) {
    if (!result || !params) return
    try {
      const record = {
        id: 'ct_' + Date.now(),
        timestamp: Date.now(),
        customName: '',
        params: params,
        result: result,
        summary: [params.spaceName, params.ageName, params.usageName].filter(Boolean).join(' · ') || '色温推荐',
        resultStr: '推荐 ' + result.standardTemp + 'K ' + (result.desc || '')
      }
      let history = []
      try { history = wx.getStorageSync('color_temp_history') || [] } catch (e) {}
      history.unshift(record)
      if (history.length > 20) history = history.slice(0, 20)
      wx.setStorageSync('color_temp_history', history)
      console.log('[色温结果页] 已保存历史记录')
    } catch (e) {
      console.warn('[色温结果页] 保存历史记录失败:', e)
    }
  },

  onRecalculate() {
    wx.navigateBack()
  },

  onShow() {
    // 进入页面时拉取会员状态（仅用于导出权限检查）
    this._fetchMembership()
  },

  // 防止点击弹窗卡片穿透到遮罩关闭弹窗
  noop() {},

  /** 拉取当前用户会员状态（仅用于导出权限检查） */
  _fetchMembership() {
    membershipUtil.fetchMembershipStatus().then(status => {
      this.setData({ membership: status })
      this._refreshPaywallInviteProgress()
    }).catch(err => {
      console.warn('[color-temp-result] 会员状态拉取失败:', err)
      this.setData({ membership: membershipUtil.getFallbackStatus(false) })
      this._refreshPaywallInviteProgress()
    })
  },

  /** 同步计算 paywall 弹窗内邀请进度（每次会员状态变化后调用） */
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
   * 点击「邀请好友」：button open-type=share 会自动调起微信转发面板，
   * 这里仅负责提示用户、允许在 onShareAppMessage 中读到 inviteCode。
   */
  onPaywallInviteTap() {
    if (!this.data.membership || !this.data.membership.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    console.log('[color-temp-result] 点击邀请好友，调起转发面板')
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
      ? `/pages/products/products?inviteCode=${encodeURIComponent(code)}`
      : '/pages/products/products'
    return {
      title: '光乙共创：邀你一起体验专业灯光设计工具',
      path: sharePath,
      imageUrl: ''
    }
  },

  // ============================================================
  // 导出报告功能（与照度计算器结果页逻辑一致）
  // ============================================================

  /**
   * 点击「导出报告」按钮
   * 流程：未登录 → 登录引导；免费用户 → 开通会员引导；会员 → ActionSheet 选择「署名 / 直接」
   */
  onExportReportTap() {
    const m = this.data.membership || {}

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

    if (m.effectiveLevel === 'free') {
      // 免费用户 → 弹 paywall弹窗（邀请好友 / 开通会员 二选一）
      this._refreshPaywallInviteProgress()
      this.setData({ showPaywallModal: true })
      return
    }

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

  onSignatureNameInput(e) {
    this.setData({ signatureName: (e.detail && e.detail.value) || '' })
  },

  onSignatureStudioInput(e) {
    this.setData({ signatureStudio: (e.detail && e.detail.value) || '' })
  },

  onCloseSignatureModal() {
    this.setData({ showSignatureModal: false })
  },

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

  onClosePreviewModal() {
    this.setData({ showPreviewModal: false })
  },

  /** 主入口：Canvas 绘制 PNG → 上传云存储 → 云函数包装 PDF → 下载 → 弹预览 */
  _exportReport({ signature }) {
    console.log('[color-temp-result] _exportReport 入参 signature =', JSON.stringify(signature))
    this.setData({ exporting: true, exportingText: '正在绘制报告...' })
    setTimeout(() => {
      this._renderReportCanvas({ signature })
        .then(pngTempPath => {
          this.setData({ exportingText: '正在生成 PDF...' })
          return this._convertPngToPdf(pngTempPath)
        })
        .then((pdfInfo) => {
          this.setData({
            exporting: false,
            exportingText: '',
            exportedPdfPath: pdfInfo.localPath,
            exportedPdfFileName: pdfInfo.fileName,
            exportedPdfSizeText: pdfInfo.sizeText,
            showPreviewModal: true
          })
        })
        .catch(err => {
          console.error('[color-temp-result] 导出报告失败:', err)
          this.setData({ exporting: false, exportingText: '' })
          wx.showToast({
            title: '导出失败：' + ((err && err.errMsg) || (err && err.message) || '未知错误'),
            icon: 'none',
            duration: 3000
          })
        })
    }, 60)
  },

  /** PNG 上传 → 调 calc_export_pdf 云函数 → 下载 PDF 临时文件 */
  _convertPngToPdf(pngLocalPath) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      return Promise.reject(new Error('当前环境不支持云开发'))
    }
    const dateStr = this._formatDateCompact(new Date())
    const baseName = `色温推荐报告_${dateStr}`
    const cloudPng = `calc-reports/png/${Date.now()}_${baseName}.png`

    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath: cloudPng,
        filePath: pngLocalPath,
        success: (uploadRes) => {
          const imageFileID = uploadRes.fileID
          wx.cloud.callFunction({
            name: 'calc_export_pdf',
            data: { imageFileID, fileName: baseName },
            success: (cfRes) => {
              const r = cfRes && cfRes.result
              if (!r || !r.success || !r.data || !r.data.pdfFileID) {
                reject(new Error((r && r.errorMessage) || 'PDF 生成失败'))
                return
              }
              wx.cloud.downloadFile({
                fileID: r.data.pdfFileID,
                success: (dlRes) => {
                  resolve({
                    localPath: dlRes.tempFilePath,
                    fileName: r.data.fileName || (baseName + '.pdf'),
                    sizeBytes: r.data.size || 0,
                    sizeText: this._formatFileSize(r.data.size || 0)
                  })
                },
                fail: reject
              })
            },
            fail: reject
          })
        },
        fail: reject
      })
    })
  },

  _formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 KB'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  },

  _formatDateCompact(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}${m}${d}_${h}${min}`
  },

  _formatToday() {
    const now = new Date()
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  },

  _formatTodayCN() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y} 年 ${m} 月 ${d} 日`
  },

  _getReportNo() {
    const now = new Date()
    const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    return 'CT-' + d + '-' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  },

  // ====== Canvas 渲染 ======

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
          const rawDpr = (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2
          const dpr = Math.min(rawDpr, 2)
          const designWidth = 1080
          const designHeight = 4500

          canvas.width = designWidth * dpr
          canvas.height = designHeight * dpr
          ctx.scale(dpr, dpr)
          console.log('[color-temp-result] canvas size:', canvas.width, 'x', canvas.height, ', dpr=', dpr, '(raw=', rawDpr, '), designHeight=', designHeight)

          let actualHeight
          try {
            actualHeight = this._drawReport(ctx, designWidth, signature)
          } catch (err) {
            console.error('[color-temp-result] _drawReport 异常:', err)
            reject(err)
            return
          }

          console.log('[color-temp-result] _drawReport 完成，actualHeight =', actualHeight)
          if (actualHeight > designHeight) {
            console.warn('[color-temp-result] ⚠️ actualHeight 超出 designHeight，底部会被截断')
          }

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

  // ====== 报告主绘制函数 ======

  _drawReport(ctx, W, signature) {
    const result = this.data.result || {}
    const params = this.data.params || {}
    let y = 0
    y = this._drawTopBrand(ctx, W, y)
    y = this._drawHeroTitle(ctx, W, y, params)
    y = this._drawCoreConclusion(ctx, W, y, result)
    y = this._drawInfoCard(ctx, W, y, params)
    y = this._drawReasoningCard(ctx, W, y, result)
    y = this._drawLayersCard(ctx, W, y, result)
    y = this._drawTipsCard(ctx, W, y, result)
    y = this._drawDisclaimer(ctx, W, y)
    y = this._drawSignature(ctx, W, y, signature)
    y = this._drawFooter(ctx, W, y)
    return Math.ceil(y + 40)
  },

  // ====== Canvas 工具方法 ======

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

  _wrapTextLines(ctx, text, maxWidth) {
    const lines = []
    let line = ''
    const str = String(text || '')
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line)
        line = ch
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    return lines
  },

  // ====== 各 section 绘制 ======

  _drawTopBrand(ctx, W, y) {
    const PADDING = 60
    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 32px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('光乙照明研究系统', PADDING, y + 30)

    ctx.fillStyle = '#94A3B8'
    ctx.font = '20px PingFang SC, system-ui, sans-serif'
    ctx.fillText('二哥灯光设计 · 专注长期居住的光环境研究', PADDING, y + 76)

    return y + 130
  },

  _drawHeroTitle(ctx, W, y, params) {
    const PADDING = 60
    y += 20
    const space = (params && params.spaceName) ? params.spaceName : '居住空间'

    ctx.fillStyle = '#0F172A'
    ctx.font = '36px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(space + '空间', PADDING, y)
    y += 50

    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 64px PingFang SC, system-ui, sans-serif'
    ctx.fillText('色温推荐报告', PADDING, y)
    y += 90

    ctx.fillStyle = '#64748B'
    ctx.font = '24px PingFang SC, system-ui, sans-serif'
    ctx.fillText('基于场景需求与人群特征智能推荐', PADDING, y)
    y += 60
    return y
  },

  _drawCoreConclusion(ctx, W, y, result) {
    const standardTemp = (result && result.standardTemp) || 0
    const desc = (result && result.desc) || ''
    if (!standardTemp) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const tempColor = standardTemp <= 3000 ? '#E6A23C' : (standardTemp >= 5000 ? '#409EFF' : '#0F172A')

    // 估算描述文本高度
    ctx.font = '26px PingFang SC, system-ui, sans-serif'
    const descLines = desc ? this._wrapTextLines(ctx, desc, cardW - 80) : []
    const descH = descLines.length * 38
    const cardH = 220 + (descLines.length > 0 ? (descH + 30) : 0)

    // 背景卡片
    ctx.fillStyle = '#FAFBFC'
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
    ctx.lineWidth = 2
    this._roundRect(ctx, cardX, y, cardW, cardH, 24)
    ctx.stroke()

    // 小标签
    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('推荐整体色温', cardX + 40, y + 36)

    // 大号色温数值
    ctx.fillStyle = tempColor
    ctx.font = 'bold 96px PingFang SC, system-ui, sans-serif'
    ctx.fillText(standardTemp + 'K', cardX + 40, y + 70)

    // 右侧档位特征标签
    let tag = ''
    if (standardTemp <= 2700) tag = '烛光暖光'
    else if (standardTemp <= 3000) tag = '暖白光'
    else if (standardTemp <= 3500) tag = '自然偏暖'
    else if (standardTemp <= 4000) tag = '自然白光'
    else if (standardTemp <= 5000) tag = '中性白光'
    else tag = '冷白日光'
    ctx.fillStyle = '#475569'
    ctx.font = '28px PingFang SC, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(tag, cardX + cardW - 40, y + 100)

    // 描述文本
    if (descLines.length > 0) {
      ctx.fillStyle = '#475569'
      ctx.font = '26px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      let dy = y + 200
      descLines.forEach(line => {
        ctx.fillText(line, cardX + 40, dy)
        dy += 38
      })
    }

    return y + cardH + 40
  },

  _drawInfoCard(ctx, W, y, params) {
    const items = []
    if (params.spaceName) items.push({ label: '空间类型', value: params.spaceName })
    if (params.area) items.push({ label: '空间面积', value: params.area + ' ㎡' })
    if (params.ageName) items.push({ label: '人群年龄', value: params.ageName })
    const usage = params.usageName || (Array.isArray(params.usageNames) ? params.usageNames.join('、') : '')
    if (usage) items.push({ label: '主要用途', value: usage })
    const fixtures = Array.isArray(params.fixtureNames) ? params.fixtureNames.join('、') : ''
    if (fixtures) items.push({ label: '主要灯具', value: fixtures })
    if (items.length === 0) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const rowH = 56
    const cardH = 60 + items.length * rowH + 24

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.lineWidth = 2
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.stroke()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('输入参数', cardX + 40, y + 30)

    let rowY = y + 88
    items.forEach(item => {
      ctx.fillStyle = '#94A3B8'
      ctx.font = '24px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(item.label, cardX + 40, rowY)

      ctx.fillStyle = '#1E293B'
      ctx.font = '500 26px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(String(item.value), cardX + cardW - 40, rowY)

      rowY += rowH
    })

    return y + cardH + 32
  },

  _drawReasoningCard(ctx, W, y, result) {
    const text = (result && result.reasoning) || ''
    if (!text) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING

    ctx.font = '26px PingFang SC, system-ui, sans-serif'
    const lines = this._wrapTextLines(ctx, text, cardW - 80)
    const cardH = 100 + lines.length * 40 + 30

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.lineWidth = 2
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.stroke()

    // 左侧装饰貖条
    ctx.fillStyle = '#0F172A'
    this._roundRect(ctx, cardX + 40, y + 36, 6, 28, 3)
    ctx.fill()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('推荐理由', cardX + 60, y + 32)

    ctx.fillStyle = '#475569'
    ctx.font = '26px PingFang SC, system-ui, sans-serif'
    let lineY = y + 100
    lines.forEach(line => {
      ctx.fillText(line, cardX + 40, lineY)
      lineY += 40
    })

    return y + cardH + 32
  },

  _drawLayersCard(ctx, W, y, result) {
    const layers = (result && Array.isArray(result.layers)) ? result.layers : []
    if (layers.length === 0) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING

    // 每一项预算高度：名称行 50 + label行 36 + desc（可能多行） + 间隔 24
    ctx.font = '24px PingFang SC, system-ui, sans-serif'
    const itemHeights = layers.map(l => {
      const desc = String((l && l.desc) || '')
      const descLines = desc ? this._wrapTextLines(ctx, desc, cardW - 80) : []
      return { lines: descLines, h: 50 + 36 + (descLines.length * 36) + 24 }
    })
    const itemsTotalH = itemHeights.reduce((s, x) => s + x.h, 0)
    const cardH = 100 + itemsTotalH + 16

    ctx.fillStyle = '#FFFFFF'
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
    ctx.lineWidth = 2
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.stroke()

    ctx.fillStyle = '#1E293B'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('分层色温建议', cardX + 40, y + 32)

    let rowY = y + 100
    layers.forEach((layer, idx) => {
      const tempVal = Number(layer.temp) || 0
      const tempColor = tempVal <= 3000 ? '#E6A23C' : (tempVal >= 5000 ? '#409EFF' : '#0F172A')

      // 名称行：名称（左）+ 色温值（右）
      ctx.fillStyle = '#1E293B'
      ctx.font = 'bold 30px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(String(layer.name || ''), cardX + 40, rowY)
      ctx.fillStyle = tempColor
      ctx.font = 'bold 32px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(tempVal + 'K', cardX + cardW - 40, rowY)

      // label 行
      if (layer.label) {
        ctx.fillStyle = '#94A3B8'
        ctx.font = '22px PingFang SC, system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(String(layer.label), cardX + 40, rowY + 50)
      }

      // desc 多行
      ctx.fillStyle = '#475569'
      ctx.font = '24px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      let descY = rowY + 86
      itemHeights[idx].lines.forEach(line => {
        ctx.fillText(line, cardX + 40, descY)
        descY += 36
      })

      rowY += itemHeights[idx].h
    })

    return y + cardH + 32
  },

  _drawTipsCard(ctx, W, y, result) {
    const tips = (result && Array.isArray(result.tips)) ? result.tips : []
    if (tips.length === 0) return y

    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING
    const innerW = cardW - 80 - 24 // 减掉左右边距与 dot 按位

    ctx.font = '26px PingFang SC, system-ui, sans-serif'
    const tipBlocks = tips.map(t => this._wrapTextLines(ctx, String(t || ''), innerW))
    const totalLines = tipBlocks.reduce((s, b) => s + b.length, 0)
    const cardH = 110 + totalLines * 40 + (tips.length - 1) * 12 + 24

    // 背景卡片：涺黄色调体现「设计师说」
    ctx.fillStyle = '#FFFBEB'
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.fill()
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)'
    ctx.lineWidth = 2
    this._roundRect(ctx, cardX, y, cardW, cardH, 20)
    ctx.stroke()

    // 标题
    ctx.fillStyle = '#92400E'
    ctx.font = 'bold 28px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('设计师说', cardX + 40, y + 32)

    let rowY = y + 96
    tips.forEach((tip, idx) => {
      // dot
      ctx.fillStyle = '#F59E0B'
      ctx.beginPath()
      ctx.arc(cardX + 50, rowY + 14, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#475569'
      ctx.font = '26px PingFang SC, system-ui, sans-serif'
      ctx.textAlign = 'left'
      let lineY = rowY
      tipBlocks[idx].forEach(line => {
        ctx.fillText(line, cardX + 70, lineY)
        lineY += 40
      })

      rowY += tipBlocks[idx].length * 40 + 12
    })

    return y + cardH + 32
  },

  _drawDisclaimer(ctx, W, y) {
    const items = [
      '本报告基于人群年龄、场景需求与灯具组合智能推荐，不代替专业现场勘察。',
      '色温选择需同时考虑灯具显色指数 Ra≥90、调光能力与防眺设计，建议在实际选型时补充验证。',
      '实际使用效果受墙面反射、家具颜色、灯具色容差等多重因素影响，存在一定偏差。',
      '本报告仅作为灯光设计与选型的参考依据，不作为任何法律与商业承诺。'
    ]
    const PADDING = 60
    const cardW = W - PADDING * 2
    const cardX = PADDING

    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    const allLines = items.map(t => this._wrapTextLines(ctx, t, cardW - 80))
    const total = allLines.reduce((s, b) => s + b.length, 0)
    const cardH = 80 + total * 34 + (items.length - 1) * 8 + 32

    ctx.fillStyle = '#F8FAFC'
    this._roundRect(ctx, cardX, y, cardW, cardH, 16)
    ctx.fill()

    ctx.fillStyle = '#64748B'
    ctx.font = 'bold 24px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText('免责声明', cardX + 40, y + 28)

    let rowY = y + 72
    allLines.forEach(lines => {
      ctx.fillStyle = '#94A3B8'
      ctx.font = '22px PingFang SC, system-ui, sans-serif'
      lines.forEach(line => {
        ctx.fillText('· ' + line, cardX + 40, rowY)
        rowY += 34
      })
      rowY += 8
    })

    return y + cardH + 32
  },

  _drawSignature(ctx, W, y, signature) {
    if (!signature || !signature.name) return y

    y += 40
    ctx.strokeStyle = '#CBD5E1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2 - 70, y)
    ctx.lineTo(W / 2 + 70, y)
    ctx.stroke()
    y += 56

    const mainText = signature.studio || signature.name
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 44px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillText('—— 报告出具：' + mainText, W / 2, y)
    y += 70

    if (signature.studio && signature.name) {
      ctx.fillStyle = '#64748B'
      ctx.font = '26px PingFang SC, system-ui, sans-serif'
      ctx.fillText('设计师 · ' + signature.name, W / 2, y)
      y += 50
    }

    ctx.fillStyle = '#475569'
    ctx.font = '28px PingFang SC, system-ui, sans-serif'
    ctx.fillText(this._formatTodayCN(), W / 2, y)
    y += 60
    return y
  },

  _drawFooter(ctx, W, y) {
    const PADDING = 60
    y += 30
    ctx.strokeStyle = '#E2E8F0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING, y)
    ctx.lineTo(W - PADDING, y)
    ctx.stroke()
    y += 36

    ctx.fillStyle = '#475569'
    ctx.font = 'bold 26px PingFang SC, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.fillText('光乙照明研究系统', W / 2, y)
    y += 40

    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.fillText('二哥灯光设计 · 专注长期居住的光环境研究', W / 2, y)
    y += 50

    ctx.fillStyle = '#94A3B8'
    ctx.font = '22px PingFang SC, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('报告编号：' + this._getReportNo(), PADDING, y)
    ctx.textAlign = 'right'
    ctx.fillText('生成时间：' + this._formatToday(), W - PADDING, y)
    y += 40

    return y
  },

  // ====== PDF 预览 / 分享 ======

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
        console.error('[color-temp-result] 打开 PDF 失败:', err)
        wx.showToast({ title: '打开失败：' + (err.errMsg || ''), icon: 'none', duration: 2500 })
      }
    })
  },

  onSharePdf() {
    const filePath = this.data.exportedPdfPath
    const fileName = this.data.exportedPdfFileName || '色温推荐报告.pdf'
    if (!filePath) return
    if (!wx.shareFileMessage) {
      wx.showToast({ title: '当前微信版本不支持文件分享，请升级', icon: 'none', duration: 2500 })
      return
    }
    wx.shareFileMessage({
      filePath: filePath,
      fileName: fileName,
      success: () => {
        this.setData({ showPreviewModal: false })
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('[color-temp-result] 分享 PDF 失败:', err)
          wx.showToast({ title: '分享失败：' + err.errMsg, icon: 'none', duration: 2500 })
        }
      }
    })
  }
})
