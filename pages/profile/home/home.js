const auth = require('../../../utils/auth.js')

Page({
  data: {
    user: { name: '', phone: '', avatar: '' },
    userId: '',
    openid: ''
  },

  onShow() {
    this.loadUserData()
  },

  async loadUserData() {
    try {
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      const userId = cachedDoc && cachedDoc._id ? cachedDoc._id : ''
      const openid = wx.getStorageSync('openid') || ''
      this.setData({ userId, openid })

      if (wx.cloud && (userId || openid)) {
        const db = wx.cloud.database()
        let doc
        if (userId) {
          const d = await db.collection('users').doc(userId).get()
          doc = d && d.data
        } else if (openid) {
          const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
          doc = (q && q.data && q.data[0]) || null
        }

        if (doc) {
          // 更新本地缓存
          try { wx.setStorageSync('userDoc', doc) } catch (e) {}
          this.setData({
            user: {
              name: doc.nickname || '',
              phone: doc.phoneNumber || '',
              avatar: doc.avatarUrl || ''
            },
            userId: doc._id || userId,
            isAdmin: auth.isAdmin(doc),
            isDesigner: auth.isDesigner(doc)
          })
          return
        }
      }

      // fallback 本地存储
      const local = wx.getStorageSync('user_profile') || {}
      this.setData({
        user: {
          name: local.name || '',
          phone: local.phone || '',
          avatar: local.avatar || ''
        }
      })
    } catch (err) {
      console.error('加载个人中心用户资料失败', err)
    }
  },
  
  editProfile() {
    wx.navigateTo({ url: '/pages/profile/account/account' })
  },
  
  go(e){
    const url = e.currentTarget.dataset.url
    if (!url) return
    // 订单跳转到购物车tab页
    if (url === '/pages/cart/cart') {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  },
  
  callPhone(e){
    e.stopPropagation() // 阻止冒泡到profile-card
    const phone = this.data.user.phone
    if(phone) wx.makePhoneCall({ phoneNumber: phone })
  }
  ,onContact(){ wx.navigateTo({ url: '/pages/support/contact/contact' }) }
})
