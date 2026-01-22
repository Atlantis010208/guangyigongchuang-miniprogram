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

  /**
   * 从微信获取收货地址
   * 调用 wx.chooseAddress API 获取用户在微信中保存的收货地址
   */
  getWxAddress() {
    const that = this
    
    // 先检查授权状态
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.address'] === false) {
          // 用户之前拒绝过授权，引导去设置页面开启
          wx.showModal({
            title: '授权提示',
            content: '需要您授权获取收货地址，是否前往设置？',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting({
                  success(settingRes) {
                    if (settingRes.authSetting['scope.address']) {
                      // 用户开启了授权，重新调用
                      that.callChooseAddress()
                    }
                  }
                })
              }
            }
          })
        } else {
          // 未拒绝过授权或已授权，直接调用
          that.callChooseAddress()
        }
      },
      fail() {
        // getSetting 失败，尝试直接调用
        that.callChooseAddress()
      }
    })
  },

  /**
   * 调用微信选择地址 API
   */
  callChooseAddress() {
    const that = this
    
    wx.chooseAddress({
      success(res) {
        console.log('微信地址获取成功:', res)
        
        // 将微信地址格式转换为本地地址格式
        const wxAddress = {
          id: 'wx_' + Date.now(), // 生成唯一 ID
          name: res.userName,
          phone: res.telNumber,
          region: [res.provinceName, res.cityName, res.countyName],
          town: '', // 微信地址没有乡镇字段
          detail: res.detailInfo,
          postalCode: res.postalCode,
          nationalCode: res.nationalCode,
          isDefault: that.data.addresses.length === 0, // 如果是第一个地址则设为默认
          source: 'wechat' // 标记来源为微信
        }
        
        // 检查是否已存在相同地址（根据姓名+手机号+详细地址判断）
        const existIndex = that.data.addresses.findIndex(addr => 
          addr.name === wxAddress.name && 
          addr.phone === wxAddress.phone &&
          addr.detail === wxAddress.detail
        )
        
        if (existIndex > -1) {
          wx.showToast({
            title: '该地址已存在',
            icon: 'none'
          })
          return
        }
        
        // 构建完整地址文本
        const region = wxAddress.region.filter(Boolean).join(' ')
        const full = [region, wxAddress.town, wxAddress.detail].filter(Boolean).join(' ')
        wxAddress.full = full
        
        // 添加到地址列表
        const addresses = [wxAddress, ...that.data.addresses]
        
        // 如果新地址是默认的，取消其他地址的默认状态
        if (wxAddress.isDefault) {
          addresses.forEach((addr, idx) => {
            if (idx > 0) addr.isDefault = false
          })
        }
        
        that.setData({ addresses })
        wx.setStorageSync('user_addresses', addresses)
        that.syncToCloud(addresses)
        
        wx.showToast({
          title: '地址添加成功',
          icon: 'success'
        })
      },
      fail(err) {
        // 用户取消选择，不做任何处理
        if (err.errMsg && err.errMsg.indexOf('cancel') > -1) {
          console.log('用户取消了地址选择')
          return
        }
        
        console.error('获取微信地址失败:', err)
        
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({
            title: '授权提示',
            content: '您拒绝了获取收货地址的授权，无法获取微信地址',
            showCancel: false,
            confirmText: '我知道了'
          })
        } else {
          // 可能是模拟器环境或其他原因
          wx.showModal({
            title: '获取失败',
            content: '无法获取微信地址。如果您在模拟器中测试，请使用真机预览；或者点击「新增地址」手动添加。',
            showCancel: false,
            confirmText: '我知道了'
          })
        }
      }
    })
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
