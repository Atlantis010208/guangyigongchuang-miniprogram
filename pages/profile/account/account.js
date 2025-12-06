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
        const openid = this.data.openid
        let userData = null

        // 方法1：通过 _id 查询
        if (uid) {
          try {
            const doc = await db.collection('users').doc(uid).get()
            userData = doc && doc.data ? doc.data : null
          } catch (docErr) {
            console.warn('通过 _id 查询失败，尝试 _openid', docErr.message)
          }
        }

        // 方法2：如果 _id 失败，通过 _openid 查询
        if (!userData && openid) {
          try {
            const q = await db.collection('users').where({ _openid: openid }).limit(1).get()
            if (q && q.data && q.data.length) {
              userData = q.data[0]
              uid = userData._id
              this.setData({ userId: uid })
              try { wx.setStorageSync('userDoc', userData) } catch (e) {}
            }
          } catch (queryErr) {
            console.warn('通过 _openid 查询失败', queryErr.message)
          }
        }

        // 成功获取用户数据
        if (userData) {
          this.setData({
            user: {
              name: userData.nickname || '',
              phone: userData.phoneNumber || '',
              avatar: userData.avatarUrl || ''
            }
          })
          return
        }
      }

      // fallback 本地
      const localProfile = wx.getStorageSync('user_profile') || {}
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      this.setData({
        user: {
          name: localProfile.name || cachedDoc.nickname || '',
          phone: localProfile.phone || cachedDoc.phoneNumber || '',
          avatar: localProfile.avatar || cachedDoc.avatarUrl || ''
        }
      })
    } catch (err) {
      console.error('加载用户资料失败', err)
      // 发生错误时使用本地缓存
      const localProfile = wx.getStorageSync('user_profile') || {}
      const cachedDoc = wx.getStorageSync('userDoc') || {}
      this.setData({
        user: {
          name: localProfile.name || cachedDoc.nickname || '',
          phone: localProfile.phone || cachedDoc.phoneNumber || '',
          avatar: localProfile.avatar || cachedDoc.avatarUrl || ''
        }
      })
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