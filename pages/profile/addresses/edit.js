Page({
  data: {
    id: null,
    form: {
      name: '',
      phone: '',
      region: [],
      town: '',
      detail: ''
    },
    regionText: ''
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadAddress(options.id)
      wx.setNavigationBarTitle({ title: '编辑地址' })
    } else {
      wx.setNavigationBarTitle({ title: '新增地址' })
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
          detail: addr.detail || ''
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


