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

  // ========== TODO: chooseAddress 接口暂未开通，后续开放时取消注释 ==========
  getWxAddress() {
    const that = this
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.address'] === false) {
          wx.showModal({
            title: '授权提示',
            content: '需要您授权获取收货地址，是否前往设置？',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting({
                  success(settingRes) {
                    if (settingRes.authSetting['scope.address']) {
                      that.callChooseAddress()
                    }
                  }
                })
              }
            }
          })
        } else {
          that.callChooseAddress()
        }
      },
      fail() {
        that.callChooseAddress()
      }
    })
  },
  callChooseAddress() {
    const that = this
    wx.chooseAddress({
      success(res) {
        const wxAddress = {
          id: 'wx_' + Date.now(),
          name: res.userName,
          phone: res.telNumber,
          region: [res.provinceName, res.cityName, res.countyName],
          town: '',
          detail: res.detailInfo,
          postalCode: res.postalCode,
          nationalCode: res.nationalCode,
          isDefault: that.data.addresses.length === 0,
          source: 'wechat'
        }
        const existIndex = that.data.addresses.findIndex(addr =>
          addr.name === wxAddress.name &&
          addr.phone === wxAddress.phone &&
          addr.detail === wxAddress.detail
        )
        if (existIndex > -1) {
          wx.showToast({ title: '该地址已存在', icon: 'none' })
          return
        }
        const region = wxAddress.region.filter(Boolean).join(' ')
        wxAddress.full = [region, wxAddress.town, wxAddress.detail].filter(Boolean).join(' ')
        const addresses = [wxAddress, ...that.data.addresses]
        if (wxAddress.isDefault) {
          addresses.forEach((addr, idx) => { if (idx > 0) addr.isDefault = false })
        }
        that.setData({ addresses })
        wx.setStorageSync('user_addresses', addresses)
        that.syncToCloud(addresses)
        wx.showToast({ title: '地址添加成功', icon: 'success' })
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') > -1) return
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({ title: '授权提示', content: '您拒绝了获取收货地址的授权', showCancel: false })
        } else {
          wx.showModal({ title: '获取失败', content: '无法获取微信地址，请手动添加', showCancel: false })
        }
      }
    })
  },
  // ========== 微信地址功能 - 结束 ==========

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
      content: '确定要删除吗？',
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
