// pages/color-temp/color-temp-result/color-temp-result.js

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
    canNext: true                     // 右箭头是否可点
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
      this.setData({ result: result, overallTemp: overallTemp })
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
  }
})
