Page({
  data: {
    user: {
      name: '',
      phone: '',
      avatar: ''
    },
    userId: '',
    openid: '',
    saving: false
  },

  onLoad() {
    this.bootstrap()
  },

  async bootstrap() {
    const cached = wx.getStorageSync('userDoc') || {}
    const openid = wx.getStorageSync('openid') || ''
    const userId = cached && cached._id ? cached._id : ''
    this.setData({ userId, openid })
    await this.loadUserData()
  },

  async loadUserData() {
    try {
      if (wx.cloud) {
        const db = wx.cloud.database()
        let uid = this.data.userId
        if (!uid) {
          const openid = this.data.openid
          if (openid) {
            const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
            if (q && q.data && q.data.length) {
              uid = q.data[0]._id
              this.setData({ userId: uid })
              try { wx.setStorageSync('userDoc', q.data[0]) } catch (e) {}
            }
          }
        }
        if (uid) {
          const doc = await db.collection('users').doc(uid).get()
          const u = doc.data || {}
          this.setData({
            user: {
              name: u.nickname || '',
              phone: u.phoneNumber || '',
              avatar: u.avatarUrl || ''
            }
          })
          return
        }
      }
      // fallback 本地
    const userData = wx.getStorageSync('user_profile') || {}
    this.setData({
      user: {
          name: userData.name || '',
          phone: userData.phone || '',
        avatar: userData.avatar || ''
      }
    })
    } catch (err) {
      console.error('加载用户资料失败', err)
    }
  },

  async chooseAvatar() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
      if (!res || !res.tempFiles || !res.tempFiles.length) return
        const tempFilePath = res.tempFiles[0].tempFilePath
      if (wx.cloud && this.data.openid) {
        const cloudPath = `avatars/${this.data.openid}-${Date.now()}.jpg`
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
        if (up && up.fileID) {
          this.setData({ 'user.avatar': up.fileID })
          return
        }
      }
      this.setData({ 'user.avatar': tempFilePath })
    } catch (err) {
      console.error('选择头像失败:', err)
      wx.showToast({ title: '选择头像失败', icon: 'none' })
    }
  },

  onNameInput(e) {
    this.setData({ 'user.name': e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ 'user.phone': e.detail.value })
  },

  async saveProfile() {
    const { name, phone, avatar } = this.data.user
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!phone || !phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      if (wx.cloud && this.data.userId) {
        const db = wx.cloud.database()
        await db.collection('users').doc(this.data.userId).update({ data: {
          nickname: name,
          phoneNumber: phone,
          avatarUrl: avatar
        } })
        // 同步本地 userDoc
        const userDoc = wx.getStorageSync('userDoc') || {}
        const newDoc = Object.assign({}, userDoc, { nickname: name, phoneNumber: phone, avatarUrl: avatar })
        try { wx.setStorageSync('userDoc', newDoc) } catch (e) {}
      } else {
    wx.setStorageSync('user_profile', this.data.user)
      }
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      console.error('保存资料失败', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})