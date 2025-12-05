Page({
  data: {
    addresses: [],
    userId: '',
    openid: '',
    syncing: false
  },

  onLoad(query) {
    this.fromConfirm = query && (query.select === '1' || query.select === 1)
    this.loadAddresses()
  },

  onShow() {
    this.loadAddresses()
  },

  async loadAddresses() {
    // 优先从云端 users.addresses 读取
    let list = []
    try{
      const cached = wx.getStorageSync('userDoc') || {}
      const userId = (cached && cached._id) ? cached._id : ''
      this.setData({ userId, openid: wx.getStorageSync('openid') || '' })
      if (wx.cloud && userId) {
        const db = wx.cloud.database()
        const doc = await db.collection('users').doc(userId).get()
        const u = doc && doc.data ? doc.data : {}
        list = Array.isArray(u.addresses) ? u.addresses : []
        try{ wx.setStorageSync('user_addresses', list) }catch(e){}
      } else {
        list = wx.getStorageSync('user_addresses') || []
      }
    }catch(err){
      list = wx.getStorageSync('user_addresses') || []
    }
    const sorted = (list || []).slice().sort((a,b)=> (b && b.isDefault ? 1:0) - (a && a.isDefault ? 1:0))
    const addresses = (sorted || []).map(addr => {
      let regionArr = []
      if (Array.isArray(addr.region)) {
        regionArr = addr.region.map(r => typeof r === 'string' ? r : (r && (r.name || r.label || r.value)) || '').filter(Boolean)
      } else if (typeof addr.region === 'string') {
        regionArr = addr.region.split(/\s+/).filter(Boolean)
      }
      const region = regionArr.join(' ')
      const town = addr.town || addr.street || ''
      const detail = addr.detail || addr.address || ''
      const full = [region, town, detail].filter(Boolean).join(' ')
      return Object.assign({}, addr, { full })
    })
    this.setData({ addresses })
  },

  addAddress() {
    wx.navigateTo({ url: '/pages/profile/addresses/edit' })
  },

  editAddress(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/profile/addresses/edit?id=${id}` })
  },

  setDefault(e) {
    const id = e.currentTarget.dataset.id
    
    const addresses = this.data.addresses.map(addr => ({
      ...addr,
      isDefault: addr.id === id
    })).sort((a,b)=> (b.isDefault?1:0) - (a.isDefault?1:0))
    
    this.setData({ addresses })
    wx.setStorageSync('user_addresses', addresses)
    this.syncToCloud(addresses)
    
    wx.showToast({
      title: '已设为默认地址',
      icon: 'success'
    })
  },

  deleteAddress(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '删除地址',
      content: '确定要删除这个地址吗？',
      success: (res) => {
        if (res.confirm) {
          const addresses = this.data.addresses.filter(addr => addr.id !== id)
          this.setData({ addresses })
          wx.setStorageSync('user_addresses', addresses)
          this.syncToCloud(addresses)
          
          wx.showToast({
            title: '地址已删除',
            icon: 'success'
          })
        }
      }
    })
  }
  ,onCopy(e){
    const id = e.currentTarget.dataset.id
    const addr = (this.data.addresses||[]).find(a=>a.id===id)
    if(!addr) return
    const text = `${(addr.region||[]).join(' ')} ${addr.town||''} ${addr.detail||addr.address||''}`.trim()
    wx.setClipboardData({ data: text, success:()=> wx.showToast({ title:'已复制', icon:'none' }) })
  }
  ,onSelectAddress(e){
    const id = e.currentTarget.dataset.id
    if(this.fromConfirm){
      const addr = (this.data.addresses||[]).find(a=>a.id===id)
      if(!addr) return
      try{
        const addresses = (this.data.addresses||[]).map(a=> ({...a, isDefault: a.id===id}))
        wx.setStorageSync('user_addresses', addresses)
        this.syncToCloud(addresses)
      }catch(err){}
      wx.navigateBack({ delta: 1 })
    } else {
      wx.navigateTo({ url: `/pages/profile/addresses/edit?id=${id}` })
    }
  }
  ,async syncToCloud(addresses){
    try{
      if(!wx.cloud || !this.data.userId) return
      const db = wx.cloud.database()
      await db.collection('users').doc(this.data.userId).update({ data: { addresses } })
    }catch(err){ console.warn('地址同步云端失败', err) }
  }
})