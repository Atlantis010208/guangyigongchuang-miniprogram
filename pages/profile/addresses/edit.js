Page({
  data: {
    id: null,
    form: {
      name: '',
      phone: '',
      region: [],
      town: '',
      detail: '',
      isDefault: false
    },
    regionText: ''
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadAddress(options.id)
      wx.setNavigationBarTitle({ title: '编辑地址' })
    } else {
      wx.setNavigationBarTitle({ title: '创建新地址' })
    }
  },

  loadAddress(id) {
    const addresses = wx.getStorageSync('user_addresses') || []
    const addr = addresses.find(item => item.id === id)
    if (addr) {
      this.setData({
        form: {
          name: addr.name || '',
          phone: addr.phone || '',
          region: addr.region || [],
          town: addr.town || '',
          detail: addr.detail || '',
          isDefault: !!addr.isDefault
        },
        regionText: (addr.region && addr.region.join(' ')) || ''
      })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      form: { ...this.data.form, [field]: value }
    })
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    this.setData({
      form: { ...this.data.form, region },
      regionText: region.join(' ')
    })
  },

  // 默认地址开关
  onDefaultChange(e) {
    this.setData({
      form: { ...this.data.form, isDefault: e.detail.value }
    })
  },

  // 粘贴并识别地址或手动识别
  onParseInput(e) {
    this.setData({
      parseText: e.detail.value
    })
  },

  onRecognize() {
    if (this.data.parseText) {
      this.doRecognize(this.data.parseText)
    } else {
      this.onPasteRecognize()
    }
  },

  onPasteRecognize() {
    wx.getClipboardData({
      success: (res) => {
        const text = (res.data || '').trim()
        if (!text) {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
          return
        }
        this.setData({ parseText: text })
        this.doRecognize(text)
      },
      fail: () => {
        wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
      }
    })
  },

  doRecognize(text) {
    wx.showLoading({ title: '识别中...' })
    wx.cloud.callFunction({
      name: 'parse_address',
      data: { text },
      success: (result) => {
        wx.hideLoading()
        const raw = (result && result.result) || {}
        // 兼容新旧返回结构：新版直接返回字段，旧版包在 data 里
        const data = raw.data || raw
        const updates = {}
        if (data.name) updates['form.name'] = data.name
        if (data.phone) updates['form.phone'] = data.phone
        if (data.province && data.city) {
          updates['form.region'] = [data.province, data.city, data.district || '']
          updates.regionText = [data.province, data.city, data.district].filter(Boolean).join(' ')
        }
        if (data.town) updates['form.town'] = data.town
        if (data.detail) updates['form.detail'] = data.detail
        
        if (Object.keys(updates).length > 0) {
          // 识别成功后清空输入框
          updates.parseText = ''
          this.setData(updates)
          // 提示用户识别了哪些字段
          const fields = []
          if (data.name) fields.push('姓名')
          if (data.phone) fields.push('电话')
          if (data.province) fields.push('地区')
          if (data.detail) fields.push('地址')
          wx.showToast({ title: fields.length > 0 ? '已识别 ' + fields.join('、') : '识别成功', icon: 'success', duration: 2000 })
        } else {
          wx.showToast({ title: '未能识别地址，请检查格式', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('地址识别失败', err)
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      }
    })
  },

  // 从通讯录选择联系人
  onChooseContact() {
    wx.chooseContact({
      success: (res) => {
        const updates = {}
        if (res.displayName) updates['form.name'] = res.displayName
        if (res.phoneNumber) {
          const phone = res.phoneNumber.replace(/[^0-9]/g, '')
          updates['form.phone'] = phone
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates)
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '无法访问通讯录', icon: 'none' })
        }
      }
    })
  },

  // 地图选择位置
  openLocationPicker() {
    wx.chooseLocation({
      success: (res) => {
        if (!res.address && !res.name) return
        const address = res.address || ''
        const poiName = res.name || ''

        // 解析省市区
        const parsed = this._parseLocationAddress(address)
        let { province, city, district, remain } = parsed

        // 组合详细地址：剩余地址部分 + POI名称
        let detail = ''
        if (remain && poiName && !remain.includes(poiName)) {
          detail = (remain + ' ' + poiName).trim()
        } else if (remain) {
          detail = remain
        } else if (poiName) {
          detail = poiName
        }

        const updates = {}
        if (province && city) {
          updates['form.region'] = [province, city, district || '']
          updates.regionText = [province, city, district].filter(Boolean).join(' ')
        }
        if (detail) {
          updates['form.detail'] = detail.trim()
        }
        // 保存经纬度（后续可用于配送距离计算等）
        if (res.latitude && res.longitude) {
          updates['form.latitude'] = res.latitude
          updates['form.longitude'] = res.longitude
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates)
          wx.showToast({ title: '地址已填入', icon: 'success' })
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '无法打开地图', icon: 'none' })
        }
      }
    })
  },

  // 解析地图返回的地址字符串为省市区+剩余部分
  _parseLocationAddress(address) {
    if (!address) return { province: '', city: '', district: '', remain: '' }

    const municipalities = ['北京市', '天津市', '上海市', '重庆市']
    let province = '', city = '', district = '', remain = ''

    // 模式1：标准省+市+区/县 格式
    // 支持：XX省XX市XX区、XX自治区XX市XX县、XX省XX自治州XX县 等
    const fullMatch = address.match(
      /^((?:内蒙古|黑龙江|新疆维吾尔|宁夏回族|广西壮族|西藏)(?:自治区)|.+?省|.+?(?:特别行政区))(.+?(?:市|自治州|地区|盟))(.+?(?:区|县|自治县|市|旗))(.*)/
    )
    if (fullMatch) {
      province = fullMatch[1]
      city = fullMatch[2]
      district = fullMatch[3]
      remain = fullMatch[4] || ''
      return { province, city, district, remain }
    }

    // 模式2：直辖市 格式（北京市XX区XX路）
    for (const m of municipalities) {
      const shortName = m.replace('市', '')
      if (address.startsWith(m) || address.startsWith(shortName)) {
        province = m
        city = m
        const rest = address.startsWith(m) ? address.substring(m.length) : address.substring(shortName.length)
        const distMatch = rest.match(/^(.+?(?:区|县|自治县))(.*)/)
        if (distMatch) {
          district = distMatch[1]
          remain = distMatch[2] || ''
        } else {
          remain = rest
        }
        return { province, city, district, remain }
      }
    }

    // 模式3：无法解析，整体作为详细地址
    return { province: '', city: '', district: '', remain: address }
  },

  validateForm() {
    const { name, phone, region, detail } = this.data.form
    if (!name) {
      wx.showToast({ title: '请输入收件人', icon: 'none' })
      return false
    }
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return false
    }
    if (phone && !/^(1[3-9])\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return false
    }
    if (!region || region.length === 0) {
      wx.showToast({ title: '请选择省/市/区', icon: 'none' })
      return false
    }
    if (!detail) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' })
      return false
    }
    return true
  },

  async onSave() {
    if (!this.validateForm()) return

    const addresses = wx.getStorageSync('user_addresses') || []
    const { id, form } = this.data
    let finalAddresses = addresses

    // 如果设为默认，先取消其他默认
    if (form.isDefault) {
      finalAddresses = finalAddresses.map(item => ({ ...item, isDefault: false }))
    }

    if (id) {
      const index = finalAddresses.findIndex(item => item.id === id)
      if (index > -1) {
        finalAddresses[index] = { ...finalAddresses[index], ...form, id }
      }
    } else {
      const newId = `${Date.now()}`
      finalAddresses.push({ ...form, id: newId })
    }
    // 默认地址置顶排序
    try{
      finalAddresses = (finalAddresses||[]).slice().sort((a,b)=> (b.isDefault?1:0) - (a.isDefault?1:0))
    }catch(e){}
    wx.setStorageSync('user_addresses', finalAddresses)
    try{
      // 同步到 users.addresses
      const cached = wx.getStorageSync('userDoc') || {}
      const userId = cached && cached._id
      if(wx.cloud && userId){
        const db = wx.cloud.database()
        await db.collection('users').doc(userId).update({ data: { addresses: finalAddresses } })
      }
    }catch(err){ console.warn('地址同步云端失败', err) }
    wx.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => { wx.navigateBack() }, 300)
  }
})


