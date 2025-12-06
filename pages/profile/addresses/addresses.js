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
    try {
      const cached = wx.getStorageSync('userDoc') || {}
      const userId = (cached && cached._id) ? cached._id : ''
      const openid = wx.getStorageSync('openid') || ''
      this.setData({ userId, openid })

      if (wx.cloud && (userId || openid)) {
        const db = wx.cloud.database()
        let userData = null

        // 方法1：通过 _id 查询
        if (userId) {
          try {
            const doc = await db.collection('users').doc(userId).get()
            userData = doc && doc.data ? doc.data : null
          } catch (docErr) {
            console.warn('通过 _id 查询失败，尝试 _openid', docErr.message)
          }
        }

        // 方法2：如果 _id 失败，通过 _openid 查询
        if (!userData && openid) {
          try {
            const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
            userData = (q && q.data && q.data[0]) || null
            // 更新本地缓存的 userId
            if (userData && userData._id) {
              this.setData({ userId: userData._id })
            }
          } catch (queryErr) {
            console.warn('通过 _openid 查询失败', queryErr.message)
          }
        }

        if (userData) {
          list = Array.isArray(userData.addresses) ? userData.addresses : []
          try { wx.setStorageSync('user_addresses', list) } catch (e) {}
        } else {
          list = wx.getStorageSync('user_addresses') || []
        }
      } else {
        list = wx.getStorageSync('user_addresses') || []
      }
    } catch (err) {
      console.error('加载地址失败', err)
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