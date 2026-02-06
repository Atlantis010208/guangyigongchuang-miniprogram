/**
 * 照度计算结果页面
 * 用于展示计算结果的详细信息，支持 CSV 导出
 */

Page({
  data: {
    // 计算模式
    mode: 'count', // 'count' | 'quantity' | 'lux'
    
    // 主要结果
    mainValue: 0,
    mainUnit: '',
    mainLabel: '',
    
    // 头部次要结果（最多三个）
    headerLeft: { label: '', value: '' },
    headerMiddle: null, // 中间项（可选，仅部分模式有）
    headerRight: { label: '', value: '' },
    
    // 详细参数列表
    details: [],

    // 灯具明细（仅 lux 模式使用，用于 CSV 导出完整灯具参数）
    bottomTable: []
  },

  onLoad(options) {
    console.log('[calc-result] onLoad, options:', options)
    
    // 从上一页传递的数据或全局数据中获取结果
    const pages = getCurrentPages()
    const prevPage = pages[pages.length - 2]
    
    if (prevPage && prevPage.data.resultData) {
      const resultData = prevPage.data.resultData
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
    }
  },

  onShow() {
    // 设置导航栏样式
    wx.setNavigationBarTitle({ title: '计算结果' })
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#F5F7FA'
    })
  },

  // ========== CSV 导出功能 ==========

  /**
   * 导出计算结果为 CSV 文件
   * 支持两种导出方式：发送给微信好友、复制到剪贴板
   */
  onExportCSV() {
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
  }
})
